BEGIN;
CREATE FUNCTION identity.extra_customer_approval(t uuid,j uuid,c uuid,digest text,input jsonb) RETURNS jsonb
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
  -- Run the invoker receipt check as this function's owner, before the identity login commits.
  -- Leave unrelated deferred constraints in the caller's transaction unchanged.
  SET CONSTRAINTS app.decision_check_complete IMMEDIATE;
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
ALTER FUNCTION identity.extra_customer_approval(uuid,uuid,uuid,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.extra_customer_approval(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION identity.extra_customer_approval(uuid,uuid,uuid,text,jsonb) TO jobguard_identity;
-- The practice switch remains authoritative for practice actions. A client decision
-- instead has private, credential-validated session provenance written above.
DO $$ DECLARE original text; changed text; BEGIN
 original:=pg_get_functiondef('app.northside_capture_action()'::regprocedure);
 changed:=replace(original,'SELECT * INTO run FROM app.northside_run WHERE tenant_id=NEW.tenant_id;',
 'IF TG_TABLE_NAME=''command_receipt'' THEN
 IF NEW.command_type=''ClientDecideExtra'' AND EXISTS(
 SELECT 1 FROM app.extra_client_command_session p JOIN app.extra_client_session s ON(s.tenant_id,s.id)=(p.tenant_id,p.session_id)
 JOIN app.extra_client_link k ON(k.tenant_id,k.id)=(s.tenant_id,s.link_id)
 WHERE p.tenant_id=NEW.tenant_id AND p.command_id=NEW.command_id AND k.approver_membership_id=NEW.actor_membership_id
 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()) THEN RETURN NEW; END IF;
 END IF;
 SELECT * INTO run FROM app.northside_run WHERE tenant_id=NEW.tenant_id;');
 IF changed=original THEN RAISE EXCEPTION 'unexpected practice attribution'; END IF;
 EXECUTE changed;
END $$;
COMMIT;
