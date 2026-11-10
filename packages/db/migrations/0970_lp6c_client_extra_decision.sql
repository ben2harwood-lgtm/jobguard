BEGIN;
-- LP-6C-CLIENT-EXTRA-DECISION. Ben's typed approval: 9 Nov 2026.
-- Reuse the existing session/grant validator; no person-facing binder grant.
GRANT SELECT ON app.extra_client_session,app.extra_client_link TO jobguard_binding_owner;
CREATE POLICY lp6_client_binding_read ON app.extra_client_session FOR SELECT TO jobguard_binding_owner
 USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY lp6_client_binding_read ON app.extra_client_link FOR SELECT TO jobguard_binding_owner
 USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT EXECUTE ON FUNCTION identity.extra_customer_use(uuid,uuid,uuid,text,text,text) TO jobguard_binding_owner;
GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;
CREATE FUNCTION app.lp6_bind_client_approver(t uuid,j uuid,c uuid,token_hash text,recipient text) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE s app.extra_client_session; k app.extra_client_link;
 environment_key text:=extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database());
 request_xid xid8:=pg_current_xact_id();
BEGIN
 IF EXISTS(SELECT 1 FROM control_plane.request_binding b
  WHERE b.environment_id IS NOT DISTINCT FROM environment_key AND b.transaction_id IS NOT DISTINCT FROM request_xid) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 -- Tenant context permits only the lookup. The existing validator supplies authority
 -- and retains the decide path's shared tenant/job locks through completion.
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT * INTO k FROM app.extra_client_link l
  WHERE l.tenant_id=t AND l.job_id=j AND l.approver_membership_id=c
   AND l.token_hash=lp6_bind_client_approver.token_hash AND lower(l.recipient)=lower(lp6_bind_client_approver.recipient);
 SELECT * INTO s FROM app.extra_client_session x WHERE x.tenant_id=t AND x.link_id=k.id;
 IF s.id IS NULL OR identity.extra_customer_use(t,j,c,s.token_digest,NULL,'resolve') IS NULL THEN
  RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501';
 END IF;
 INSERT INTO control_plane.request_binding(environment_id,transaction_id,credential_kind,session_ref,tenant_id,actor_id,expires_at,scope_job_id,scope_command_type)
 VALUES(environment_key,request_xid,'customer_portal_delegated',s.id::text,t,c,
  least(s.expires_at,clock_timestamp()+interval '1 minute'),j,'ClientDecideExtra');
 RETURN c;
END $$;
ALTER FUNCTION app.lp6_bind_client_approver(uuid,uuid,uuid,text,text) OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.lp6_bind_client_approver(uuid,uuid,uuid,text,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_command_writer;
GRANT EXECUTE ON FUNCTION app.lp6_bind_client_approver(uuid,uuid,uuid,text,text) TO jobguard_migration;
DO $$ DECLARE login record; BEGIN
 FOR login IN SELECT rolname FROM pg_roles WHERE rolcanlogin LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION app.lp6_bind_client_approver(uuid,uuid,uuid,text,text) FROM %I',login.rolname);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;

CREATE OR REPLACE FUNCTION identity.extra_customer_approval(t uuid,j uuid,c uuid,digest text,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.extra_client_session; k app.extra_client_link; q app.extra_approval_request; result jsonb; content jsonb; legacy jsonb; claim jsonb; prior record; items jsonb:='[]';
BEGIN
 IF identity.extra_customer_use(t,j,c,digest,NULL,'resolve') IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM app.extra_client_session WHERE tenant_id=t AND token_digest=digest;
 SELECT * INTO k FROM app.extra_client_link WHERE tenant_id=t AND id=s.link_id;
 IF input->>'version' IS DISTINCT FROM 'extra-customer.v1' OR input->>'jobId' IS DISTINCT FROM j::text
  OR input->>'action' IS NULL OR input->>'action' NOT IN('queue','view','decide','history')
  OR (input-ARRAY['version','jobId','action','requestId','commandId','revisionHash','netPence','decision'])<>'{}'::jsonb THEN
  RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 IF input->>'action'='history' THEN
  FOR prior IN SELECT f.request_id,f.approved_hash,f.approved_net_pence,f.server_recorded_at FROM app.extra_approval_step_fact f
   WHERE f.tenant_id=t AND f.job_id=j AND f.actor_membership_id=c AND f.actor_kind='client_approver' LOOP
   -- Read authority remains current for each returned request, never the sponsor's.
   PERFORM app.xa_client_view_authority(j,prior.request_id,c,k.recipient);
   items:=items||jsonb_build_array(jsonb_build_object('requestId',prior.request_id,'revisionHash',prior.approved_hash,'netPence',prior.approved_net_pence,'decision','approve','recordedAt',prior.server_recorded_at));
  END LOOP;
  FOR prior IN SELECT o.request_id,o.kind,o.server_recorded_at FROM app.extra_approval_outcome o
   WHERE o.tenant_id=t AND o.job_id=j AND o.actor_membership_id=c AND o.actor_kind='client_approver' AND o.kind='rejected' LOOP
   PERFORM app.xa_client_view_authority(j,prior.request_id,c,k.recipient);
   items:=items||jsonb_build_array(jsonb_build_object('requestId',prior.request_id,'decision','reject','recordedAt',prior.server_recorded_at));
  END LOOP;
  RETURN jsonb_build_object('items',items);
 END IF;
 IF input->>'action'<>'queue' AND input->>'requestId' IS DISTINCT FROM k.request_id::text THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT * INTO q FROM app.extra_approval_request WHERE tenant_id=t AND id=k.request_id AND job_id=j;
 -- Retry uses the same semantic input and current authority even after consumption.
 IF input->>'action'='decide' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(input))<>8 OR input->>'decision' IS NULL OR input->>'decision' NOT IN('approve','reject')
   OR input->>'revisionHash' IS NULL OR input->>'revisionHash' !~ '^[a-f0-9]{64}$' OR (input->>'netPence')::bigint NOT BETWEEN 1 AND 1000000000000 THEN
   RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
  PERFORM app.lp6_bind_client_approver(t,j,c,k.token_hash,k.recipient);
  content:=jsonb_build_object('jobId',j,'requestId',q.id,'token',k.token_hash,'email',lower(k.recipient),'hash',input->>'revisionHash','net',(input->>'netPence')::bigint,
   'decision',input->>'decision','reason',CASE WHEN input->>'decision'='reject' THEN 'not_agreed' ELSE NULL END,'role','Named fictional client approver','tester','customer-session:'||s.id::text);
  legacy:=jsonb_build_object('type','ClientDecideExtra','actor',c,'content',content);
  INSERT INTO app.extra_client_command_session VALUES(t,(input->>'commandId')::uuid,s.id) ON CONFLICT DO NOTHING;
  claim:=app.begin_command('repository-command.v1',(input->>'commandId')::uuid,'ClientDecideExtra','extra-client-decide:'||q.id::text||':'||(input->>'commandId'),
   jsonb_build_object('tenantId',t,'actorMembershipId',c,'subjectType','job','subjectRef',j),'{}',
   jsonb_build_object('version','repository-command.v1','actorMembershipId',c,'input',legacy,'legacyJson',app.final_lock_canonical(legacy)));
  IF claim->>'kind'='replay' THEN RETURN claim->'result'; END IF;
  result:=app.xa_client_decide(j,q.id,(input->>'commandId')::uuid,c,k.token_hash,k.recipient,input->>'revisionHash',(input->>'netPence')::bigint,
   input->>'decision'='reject',CASE WHEN input->>'decision'='reject' THEN 'not_agreed' ELSE NULL END,'Named fictional client approver','customer-session:'||s.id::text);
  PERFORM app.append_final_check_audit(gen_random_uuid(),'membership:'||c::text,j,'contractor.extra.client_decided',jsonb_build_object('commandId',input->>'commandId','requestId',q.id,'sessionId',s.id));
  result:=app.complete_command((input->>'commandId')::uuid,'{}');
  -- Run both invoker checks as this function's owner, before the identity login commits.
  -- Leave unrelated deferred constraints in the caller's transaction unchanged.
  SET CONSTRAINTS app.decision_check_complete, app.extra_event_raised_audit IMMEDIATE;
  RETURN result;
 END IF;
 IF EXISTS(SELECT 1 FROM app.extra_client_link_closure WHERE tenant_id=t AND link_id=k.id) THEN
  IF input->>'action'='queue' THEN RETURN jsonb_build_object('items','[]'::jsonb); END IF;
  RAISE EXCEPTION 'LINK_REPLAYED' USING ERRCODE='23514';
 END IF;
 IF clock_timestamp()>=k.expires_at THEN RAISE EXCEPTION 'LINK_EXPIRED' USING ERRCODE='23514'; END IF;
 IF q.request_revision<>(SELECT max(request_revision) FROM app.extra_approval_request WHERE tenant_id=t AND variation_id=q.variation_id) THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.extra_approval_outcome WHERE tenant_id=t AND request_id=q.id) THEN RAISE EXCEPTION 'ALREADY_DECIDED' USING ERRCODE='23514'; END IF;
 result:=jsonb_build_object('requestId',q.id,'revision',q.request_revision,'revisionHash',q.revision_hash,'netPence',q.net_pence,'lane','mandatory',
  'description',(SELECT description FROM app.variation WHERE tenant_id=t AND id=q.variation_id),
  'timingInputs',app.xc_timing(t,j,q.variation_id,q.id));
 RETURN CASE WHEN input->>'action'='queue' THEN jsonb_build_object('items',jsonb_build_array(result)) ELSE result END;
END $$;
COMMIT;
