BEGIN;
-- LP-6C-CUSTOMER-DELEGATION. No new role; ordinary bind_request kinds stay unchanged.
ALTER TABLE control_plane.request_binding
 ADD COLUMN scope_job_id uuid,
 ADD COLUMN scope_command_type text;
ALTER TABLE control_plane.request_binding DROP CONSTRAINT request_binding_credential_kind_check;
ALTER TABLE control_plane.request_binding ADD CONSTRAINT request_binding_credential_kind_check
 CHECK (credential_kind IN ('real','practice','contractor_practice','customer_portal_delegated'));
ALTER TABLE control_plane.request_binding ADD CONSTRAINT request_binding_delegated_scope_check
 CHECK (((scope_job_id IS NOT NULL) IS NOT DISTINCT FROM (credential_kind IS NOT DISTINCT FROM 'customer_portal_delegated'))
  AND ((scope_command_type IS NOT NULL) IS NOT DISTINCT FROM (credential_kind IS NOT DISTINCT FROM 'customer_portal_delegated')));

-- Read-only access for the existing private binding owner, under the same tenant boundary.
-- The established validator retains the advisory-lock/revocation and current-party checks.
GRANT SELECT ON app.customer_portal_session,app.customer_portal_grant TO jobguard_binding_owner;
CREATE POLICY lp6_customer_binding_read ON app.customer_portal_session FOR SELECT TO jobguard_binding_owner
 USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY lp6_customer_binding_read ON app.customer_portal_grant FOR SELECT TO jobguard_binding_owner
 USING (tenant_id IS NOT DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT EXECUTE ON FUNCTION identity.customer_portal_use(uuid,uuid,uuid,text,text,text) TO jobguard_binding_owner;
GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;

CREATE FUNCTION app.lp6_bind_customer_portal(t uuid,j uuid,c uuid,digest text) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE s app.customer_portal_session; sponsor uuid;
 environment_key text:=extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database());
 request_xid xid8:=pg_current_xact_id();
BEGIN
 IF EXISTS(SELECT 1 FROM control_plane.request_binding b
  WHERE b.environment_id IS NOT DISTINCT FROM environment_key AND b.transaction_id IS NOT DISTINCT FROM request_xid) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 -- Re-resolve even when invoked by another migration-owned definer. A caller's
 -- tenant setting, sponsor hint or earlier resolve is never authority.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT * INTO s FROM app.customer_portal_session p
  WHERE p.tenant_id IS NOT DISTINCT FROM t AND p.job_id IS NOT DISTINCT FROM j
   AND p.customer_id IS NOT DISTINCT FROM c AND p.token_digest IS NOT DISTINCT FROM digest
   AND p.revoked_at IS NULL AND p.expires_at>clock_timestamp();
 SELECT g.issuer_membership_id INTO sponsor FROM app.customer_portal_grant g
  WHERE g.tenant_id IS NOT DISTINCT FROM t AND g.id IS NOT DISTINCT FROM s.grant_id
   AND g.job_id IS NOT DISTINCT FROM j AND g.customer_id IS NOT DISTINCT FROM c AND g.revoked_at IS NULL;
 IF s.id IS NULL OR sponsor IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 INSERT INTO control_plane.request_binding(environment_id,transaction_id,credential_kind,session_ref,tenant_id,actor_id,expires_at,scope_job_id,scope_command_type)
 VALUES(environment_key,request_xid,'customer_portal_delegated',s.id::text,t,sponsor,
  least(s.expires_at,clock_timestamp()+interval '1 minute'),j,'JobSource.customer_message');
 RETURN sponsor;
END $$;
ALTER FUNCTION app.lp6_bind_customer_portal(uuid,uuid,uuid,text) OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.lp6_bind_customer_portal(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_command_writer;
GRANT EXECUTE ON FUNCTION app.lp6_bind_customer_portal(uuid,uuid,uuid,text) TO jobguard_migration;

CREATE FUNCTION app.lp6_delegated_actor(p_tenant uuid,p_command_type text,p_job uuid) RETURNS uuid
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b control_plane.request_binding;
BEGIN
 BEGIN b:=app.lp6_bound_request();
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM IS DISTINCT FROM 'REQUEST_BINDING_REFUSED' THEN RAISE; END IF;
  RETURN NULL;
 END;
 IF b.credential_kind IS NOT DISTINCT FROM 'customer_portal_delegated'
  AND b.tenant_id IS NOT DISTINCT FROM p_tenant
  AND b.scope_command_type IS NOT DISTINCT FROM p_command_type
  AND b.scope_job_id IS NOT DISTINCT FROM p_job THEN
  RETURN b.actor_id;
 END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.lp6_delegated_actor(uuid,text,uuid) OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.lp6_delegated_actor(uuid,text,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_migration;
GRANT EXECUTE ON FUNCTION app.lp6_delegated_actor(uuid,text,uuid) TO jobguard_command_writer;
-- Remove any inherited creator-default direct grants to existing logins too.
DO $$ DECLARE login record; BEGIN
 FOR login IN SELECT rolname FROM pg_roles WHERE rolcanlogin LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION app.lp6_bind_customer_portal(uuid,uuid,uuid,text), app.lp6_delegated_actor(uuid,text,uuid) FROM %I',login.rolname);
 END LOOP;
END $$;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;

CREATE OR REPLACE FUNCTION app.current_actor() RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT CASE WHEN b.credential_kind IS DISTINCT FROM 'customer_portal_delegated' THEN b.actor_id END
 FROM app.lp6_bound_request() b
$$;
CREATE OR REPLACE FUNCTION app.current_tenant() RETURNS uuid
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT CASE WHEN b.credential_kind IS DISTINCT FROM 'customer_portal_delegated' THEN b.tenant_id END
 FROM app.lp6_bound_request() b
$$;

CREATE OR REPLACE FUNCTION identity.customer_portal_message(t uuid,j uuid,c uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; sid uuid; existed boolean;
BEGIN
 -- Resolve before looking at command history. Same advisory lock as sign-in/revoke,
 -- retained through the writer, so revoke/rebind cannot race a stale successful write.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 PERFORM app.lp6_bind_customer_portal(t,j,c,digest);
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR input->>'version' IS DISTINCT FROM 'customer-portal-message.v1'
  OR (SELECT count(*) FROM jsonb_object_keys(input))<>4
  OR NOT input ?& ARRAY['version','jobId','commandId','text'] OR input->>'jobId' IS DISTINCT FROM j::text
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT id INTO sid FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 SELECT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=t AND command_id=(input->>'commandId')::uuid) INTO existed;
 result:=app.sv7a_intake_job_source(t,j,'customer:'||c::text||':'||digest,'customer_message',
  jsonb_build_object('version','customer-message-input.v1','commandId',input->>'commandId','text',input->'text',
   'fictionalCustomer',jsonb_build_object('kind','named_fictional_customer','name','Fictional customer')));
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 IF NOT existed THEN
  PERFORM app.append_final_check_audit(gen_random_uuid(),'customer-session:'||sid::text,j,'customer_portal.message_recorded',
   jsonb_build_object('commandId',input->>'commandId','customerId',c,'sessionId',sid,'sourceId',result->'record'->>'id'));
 END IF;
 -- Builder storage/receipts retain the sponsor; redact only the customer result,
 -- including authorized replays of the original stored receipt.
 -- No signal access, counts, detector scheduling or inferred approval/price in this path.
 SET CONSTRAINTS ALL IMMEDIATE;
 RETURN result #- '{record,actualTesterMembershipId}';
END $$;

CREATE OR REPLACE FUNCTION app.begin_command(p_version text,p_command_id uuid,p_command_type text,p_semantic_key text,
 p_resource jsonb,p_expected_revisions jsonb,p_significant_input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid;
 reg app.command_type_registry; prior app.command_receipt; found_count integer:=0;
 digest text; digest_input jsonb; legacy_digest text; legacy_input jsonb; claimed uuid; dec uuid; res uuid; auth uuid; a jsonb; existing_dec uuid;
BEGIN
 -- Keep ordinary tenant refusal ahead of any resource UUID conversion.
 IF t IS NULL OR (app.current_tenant() IS NOT NULL AND t IS DISTINCT FROM app.current_tenant()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 -- LP-6c identity only; existing permission and exact-approval checks follow.
 IF t IS NULL OR (p_resource->>'actorMembershipId')::uuid IS NULL OR NOT ((p_resource->>'actorMembershipId')::uuid IS NOT DISTINCT FROM coalesce(
  CASE WHEN t IS NOT DISTINCT FROM app.current_tenant() THEN app.current_actor() END,
  app.lp6_delegated_actor(t,p_command_type,(p_resource->>'subjectRef')::uuid))) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;

 actor:=(p_resource->>'actorMembershipId')::uuid;
 -- No membership lock upgrade: preserve the receipt FK KEY SHARE deadlock fix.
 IF t IS NULL OR t IS DISTINCT FROM (p_resource->>'tenantId')::uuid OR NOT EXISTS(
  SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND revoked_at IS NULL
   AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO reg FROM app.command_type_registry WHERE command_type=p_command_type AND version=p_version;
 IF NOT FOUND THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner') THEN
   RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF reg.permission_rule='owner' AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner') THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_command_id IS NULL OR p_semantic_key IS NULL OR length(p_semantic_key) NOT BETWEEN 1 AND 300
  OR jsonb_typeof(p_resource) IS DISTINCT FROM 'object' OR (p_resource-ARRAY['tenantId','actorMembershipId','subjectType','subjectRef'])<>'{}'
  OR NOT(p_resource ?& ARRAY['tenantId','actorMembershipId','subjectType','subjectRef'])
  OR jsonb_typeof(p_resource->'subjectType') IS DISTINCT FROM 'string' OR jsonb_typeof(p_resource->'subjectRef') IS DISTINCT FROM 'string'
  OR length(p_resource->>'subjectType') NOT BETWEEN 1 AND 100 OR length(p_resource->>'subjectRef') NOT BETWEEN 1 AND 200
  OR jsonb_typeof(p_expected_revisions) IS DISTINCT FROM 'object' OR jsonb_typeof(p_significant_input) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF (p_significant_input->>'version') IS DISTINCT FROM p_version
  OR (p_significant_input->>'actorMembershipId')::uuid IS DISTINCT FROM actor
  OR (p_version='command.v1' AND ((p_significant_input->>'commandType') IS DISTINCT FROM p_command_type
   OR (p_significant_input->>'subjectType') IS DISTINCT FROM (p_resource->>'subjectType')
   OR (p_significant_input->>'subjectRef') IS DISTINCT FROM (p_resource->>'subjectRef'))) THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 -- Pre-cutover receipts keep their exact historical digest format. No new claim
 -- is recorded with this digest. Legacy replay still checks both keys and access.
 legacy_input:=p_significant_input;
 IF p_version='repository-command.v1' THEN
  IF (p_significant_input-ARRAY['version','actorMembershipId','input','legacyJson'])<>'{}'
   OR jsonb_typeof(p_significant_input->'input') IS DISTINCT FROM 'object'
   OR jsonb_typeof(p_significant_input->'legacyJson') IS DISTINCT FROM 'string'
   OR (p_significant_input->>'legacyJson')::jsonb IS DISTINCT FROM (p_significant_input->'input')
   OR p_expected_revisions<>'{}'::jsonb THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  IF p_command_type IN('LogBuilderExtra','AddFinalReviewExtra') AND p_semantic_key IS DISTINCT FROM 'extra-origin:'||(p_resource->>'subjectRef')||':'||p_command_id::text THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  IF (p_resource->>'subjectType') IS DISTINCT FROM 'job'
   OR (p_resource->>'subjectRef')::uuid IS NULL
   OR (((p_significant_input->'input') ? 'actorMembershipId') AND (p_significant_input->'input'->>'actorMembershipId')::uuid IS DISTINCT FROM actor)
   OR (((p_significant_input->'input') ? 'membershipId') AND (p_significant_input->'input'->>'membershipId')::uuid IS DISTINCT FROM actor)
   OR (((p_significant_input->'input') ? 'tenantId') AND (p_significant_input->'input'->>'tenantId')::uuid IS DISTINCT FROM t)
   OR (((p_significant_input->'input') ? 'jobId') AND (p_significant_input->'input'->>'jobId')::uuid IS DISTINCT FROM (p_resource->>'subjectRef')::uuid)
   OR (((p_significant_input->'input') ? 'job') AND (p_significant_input->'input'->>'job')::uuid IS DISTINCT FROM (p_resource->>'subjectRef')::uuid)
   OR (((p_significant_input->'input') ? 'commandId') AND (p_significant_input->'input'->>'commandId')::uuid IS DISTINCT FROM p_command_id)
   OR (((p_significant_input->'input'->'input') ? 'commandId') AND (p_significant_input->'input'->'input'->>'commandId')::uuid IS DISTINCT FROM p_command_id) THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 IF p_version='command.v1' THEN
  legacy_input:=jsonb_set((legacy_input-ARRAY['commandId','decisionId','resolutionId','authorizationId']),'{action,expiresAt}','{}');
 END IF;
 legacy_digest:=encode(sha256(convert_to((CASE WHEN p_version='repository-command.v1'
  THEN (p_significant_input->>'legacyJson') ELSE app.final_lock_canonical(legacy_input) END),'UTF8')),'hex');
 -- Preserve the historical exclusion of server-generated grant expiry. It
 -- remains in the immutable authorization and is checked for fresh execution;
 -- a replay neither renews that grant nor repeats its business effect.
 digest_input:=(p_significant_input-ARRAY['commandId','decisionId','resolutionId','authorizationId']);
 IF p_version='command.v1' THEN
  digest_input:=jsonb_set(digest_input,'{action,expiresAt}','{}');
 END IF;
 -- Principal/resource and every non-generated action term remain significant.
 digest:=encode(sha256(convert_to(app.final_lock_canonical(jsonb_build_object('version',p_version,'commandType',p_command_type,
  'semanticKey',p_semantic_key,'resource',p_resource,'expectedRevisions',p_expected_revisions,
  'input',digest_input)),'UTF8')),'hex');
 -- First execution preserves the writer's existing authority/refusal order.
 -- Current contractor grants are checked before terminal replay and completion.
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(p_command_id,t,p_command_type,p_semantic_key,digest,'processing',actor) ON CONFLICT DO NOTHING RETURNING command_id INTO claimed;
 IF claimed IS NULL THEN
  -- Resolve BOTH keys, never arbitrary rows[0]. Two different receipts always conflict.
  FOR prior IN SELECT * FROM app.command_receipt WHERE tenant_id=t AND
   (command_id=p_command_id OR (command_type=p_command_type AND semantic_key=p_semantic_key)) LOOP
   found_count:=found_count+1;
   IF prior.actor_membership_id IS DISTINCT FROM actor OR prior.command_type IS DISTINCT FROM p_command_type
    OR (prior.request_hash IS DISTINCT FROM digest AND (prior.request_hash IS DISTINCT FROM legacy_digest
     OR EXISTS(SELECT 1 FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=prior.command_id)))
    OR prior.status IS DISTINCT FROM 'succeeded' THEN
    RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  END LOOP;
  IF found_count<>1 THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
  -- Recheck after a uniqueness wait, too; never lock membership FOR UPDATE.
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF reg.permission_rule='owner' AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner') THEN
   RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF reg.permission_rule='contractor' THEN
   PERFORM app.lp5b_contractor_permission(p_command_type,actor,(p_resource->>'subjectRef')::uuid,(p_significant_input->'input'));
  END IF;
  RETURN jsonb_build_object('kind','replay','result',prior.result);
 END IF;
 IF p_version='repository-command.v1' THEN
  NULL; -- Operational writers mint no commercial approval.
 ELSIF reg.completion_adapter='finding' THEN
  IF (p_significant_input-ARRAY['version','commandId','semanticKey','actorMembershipId','decisionId','findingFingerprint','resolution','expectedSnapshotRevision'])<>'{}'
   OR NOT(p_expected_revisions ? 'snapshotRevision') OR (p_expected_revisions-ARRAY['snapshotRevision'])<>'{}' OR (p_expected_revisions->>'snapshotRevision')::integer IS DISTINCT FROM (p_significant_input->>'expectedSnapshotRevision')::integer
   OR (p_resource->>'subjectRef') IS DISTINCT FROM (p_significant_input->>'decisionId')
  THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  IF (p_significant_input->>'resolution') IS NULL OR (p_significant_input->>'resolution') NOT IN('dismissed','rejected')
   OR NOT EXISTS(SELECT 1 FROM app.job_finding WHERE tenant_id=t AND decision_id=(p_significant_input->>'decisionId')::uuid
    AND fingerprint=(p_significant_input->>'findingFingerprint') AND snapshot_revision=(p_expected_revisions->>'snapshotRevision')::integer)
  THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
   VALUES(gen_random_uuid(),t,(p_significant_input->>'decisionId')::uuid,(p_significant_input->>'resolution'),actor);
 ELSE
  IF (p_significant_input-ARRAY['version','commandId','commandType','semanticKey','actorMembershipId','subjectType','subjectRef','decisionId','resolutionId','authorizationId','action'])<>'{}'
   OR NOT(p_expected_revisions ? 'aggregateRevision') OR (p_expected_revisions-ARRAY['aggregateRevision'])<>'{}' THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  a:=(p_significant_input->'action');
  IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR NOT(a ?& ARRAY['actionType','recipient','contentHash','aggregateRevision','amountPence','currency','policyVersion','expiresAt'])
   OR (a-ARRAY['actionType','recipient','contentHash','aggregateRevision','amountPence','currency','policyVersion','expiresAt'])<>'{}'
   OR (a->>'expiresAt')::timestamptz<=clock_timestamp() OR (a->>'expiresAt') IS NULL
   OR (a->>'contentHash') IS NULL OR (a->>'contentHash')!~'^[a-f0-9]{64}$'
   OR (a->>'aggregateRevision')::integer IS DISTINCT FROM (p_expected_revisions->>'aggregateRevision')::integer
   OR (a->>'aggregateRevision')::integer<0 OR (a->>'actionType') IS NULL OR length(a->>'actionType') NOT BETWEEN 1 AND 100
   OR length(a->>'policyVersion') NOT BETWEEN 1 AND 80 OR (a->>'policyVersion') IS NULL
   OR ((a->>'amountPence') IS NULL) IS DISTINCT FROM ((a->>'currency') IS NULL)
   OR ((a->>'amountPence') IS NOT NULL AND ((a->>'amountPence')::numeric NOT BETWEEN 0 AND 1000000000000 OR (a->>'currency')<>'GBP'))
  THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  -- Operational no-op probes validate the same schema but mint no grant.
  IF reg.completion_adapter<>'synthetic_lock_noop' THEN
  dec:=coalesce((p_significant_input->>'decisionId')::uuid,gen_random_uuid());
  res:=coalesce((p_significant_input->>'resolutionId')::uuid,gen_random_uuid());
  auth:=coalesce((p_significant_input->>'authorizationId')::uuid,gen_random_uuid());
  IF (p_significant_input ? 'decisionId') THEN
   SELECT id INTO existing_dec FROM app.decision WHERE tenant_id=t AND id=dec
    AND subject_type=(p_resource->>'subjectType') AND subject_ref=(p_resource->>'subjectRef') AND action_type=(a->>'actionType');
   IF existing_dec IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
  ELSE
   INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
    VALUES(dec,t,(p_resource->>'subjectType'),(p_resource->>'subjectRef'),(a->>'actionType'));
  END IF;
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(res,t,dec,'approved',actor);
  INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
   VALUES(auth,t,dec,res,actor,(a->>'actionType'),(a->>'recipient'),(a->>'contentHash'),(a->>'aggregateRevision')::integer,
    (a->>'amountPence')::bigint,(a->>'currency'),(a->>'policyVersion'),(a->>'expiresAt')::timestamptz);
  END IF;
 END IF;
 INSERT INTO app.command_lifecycle_claim(tenant_id,command_id,actor_membership_id,version,resource,expected_revisions,significant_input,authorization_id)
  VALUES(t,p_command_id,actor,p_version,p_resource || CASE WHEN app.current_actor() IS NULL THEN jsonb_build_object('credential_kind','customer_portal_delegated') ELSE '{}'::jsonb END,p_expected_revisions,p_significant_input,auth);
 RETURN jsonb_build_object('kind','claim','decisionId',dec,'resolutionId',res,'authorizationId',auth);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR not_null_violation OR string_data_right_truncation THEN
 RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 WHEN unique_violation THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
END $$;

CREATE OR REPLACE FUNCTION app.lp5_bind_effect(p_command uuid,p_authorization uuid,p_adapter text,p_reference jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim; r app.command_receipt; adapter text;
BEGIN
 -- Preserve the early ordinary-tenant/unbound refusal before input or claim access.
 -- A delegated binding hides its tenant here; the exact claim scope is checked below.
 IF t IS NULL OR (app.current_tenant() IS NOT NULL AND t IS DISTINCT FROM app.current_tenant()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 -- LP-6c identity only; existing permission and exact-approval checks follow.


 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;


 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 IF t IS NULL OR c.actor_membership_id IS NULL OR NOT (c.actor_membership_id IS NOT DISTINCT FROM coalesce(
  CASE WHEN t IS NOT DISTINCT FROM app.current_tenant() THEN app.current_actor() END,
  app.lp6_delegated_actor(t,r.command_type,(c.resource->>'subjectRef')::uuid))) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF c.command_id IS NULL THEN
  IF p_reference->>'closeKind'='abandoned' THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='23514'; END IF;
  RETURN; END IF; -- LP-5b unconverted callers retain their own backstops.
 SELECT completion_adapter INTO adapter FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF r.status IS DISTINCT FROM 'processing' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR (c.authorization_id IS DISTINCT FROM p_authorization AND NOT(p_adapter='lock_invoice' AND c.authorization_id IS NULL
   AND p_authorization IS NOT NULL AND EXISTS(SELECT 1 FROM app.customer_invoice invoice
    JOIN app.action_authorization grant_row ON(grant_row.tenant_id,grant_row.id)=(invoice.tenant_id,invoice.authorization_id)
    WHERE invoice.tenant_id=t AND invoice.job_id=(c.resource->>'subjectRef')::uuid AND invoice.id=(p_reference->>'invoiceId')::uuid
     AND invoice.authorization_id=p_authorization AND grant_row.actor_membership_id=c.actor_membership_id
     AND invoice.xmin::text=pg_current_xact_id()::text)))
  OR adapter IS DISTINCT FROM p_adapter OR c.effect_ref IS NOT NULL
  OR p_adapter NOT IN('activation','review','import','site_visit','extra_chain','contractor_extra','source_intake','lock_invoice') OR jsonb_typeof(p_reference) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF r.command_type='CloseAbandonedSiteVisit' OR p_reference->>'closeKind'='abandoned' THEN
  IF r.command_type IS DISTINCT FROM 'CloseAbandonedSiteVisit'
   OR c.actor_membership_id IS DISTINCT FROM r.actor_membership_id
   OR (c.resource->>'subjectRef') IS DISTINCT FROM (p_reference->>'jobId')
   OR (c.significant_input->'input'->>'visitId') IS DISTINCT FROM (p_reference->>'visitId')
   OR encode(sha256(convert_to(c.significant_input->'input'->>'reason','UTF8')),'hex') IS DISTINCT FROM (p_reference->>'reasonHash')
   OR (p_reference->>'closeKind') IS DISTINCT FROM 'abandoned' THEN
   RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE app.command_lifecycle_claim SET effect_ref=p_reference,authorization_id=p_authorization WHERE tenant_id=t AND command_id=p_command;
END $$;

CREATE OR REPLACE FUNCTION app.complete_command(p_command_id uuid,p_outcome jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim;
 r app.command_receipt; reg app.command_type_registry; value jsonb; refs jsonb; proof_ref jsonb;
BEGIN
 -- Preserve the early ordinary-tenant/unbound refusal before input or claim access.
 -- A delegated binding hides its tenant here; the exact claim scope is checked below.
 IF t IS NULL OR (app.current_tenant() IS NOT NULL AND t IS DISTINCT FROM app.current_tenant()) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 -- LP-6c identity only; existing permission and exact-approval checks follow.


 IF jsonb_typeof(p_outcome) IS DISTINCT FROM 'object' OR (p_outcome-ARRAY['eventId','placementId','invoiceId','locked','revision','sourceJobId','sourceBindingId','id','revisionId'])<>'{}' THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command_id;

 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command_id;
 IF t IS NULL OR c.actor_membership_id IS NULL OR NOT (c.actor_membership_id IS NOT DISTINCT FROM coalesce(
  CASE WHEN t IS NOT DISTINCT FROM app.current_tenant() THEN app.current_actor() END,
  app.lp6_delegated_actor(t,r.command_type,(c.resource->>'subjectRef')::uuid))) THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 IF c.command_id IS NULL OR r.status IS DISTINCT FROM 'processing' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR c.outcome IS NOT NULL THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT * INTO reg FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=c.actor_membership_id AND (role=reg.permission_rule OR reg.permission_rule IN('active_member','contractor'))
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF reg.permission_rule='contractor' THEN
  PERFORM app.lp5b_contractor_permission(r.command_type,c.actor_membership_id,(c.resource->>'subjectRef')::uuid,(c.significant_input->'input'));
 END IF;
 IF c.authorization_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM app.action_authorization a JOIN app.decision_resolution d ON(d.tenant_id,d.id)=(a.tenant_id,a.resolution_id)
  WHERE a.tenant_id=t AND a.id=c.authorization_id AND a.actor_membership_id=c.actor_membership_id
   AND d.actor_membership_id=c.actor_membership_id AND d.resolution='approved' AND a.revoked_at IS NULL
   AND a.expires_at>(CASE WHEN r.command_type='recovery.terms.approve' THEN transaction_timestamp() ELSE clock_timestamp() END)) THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF reg.completion_adapter IN('prevention','inbox_seed') THEN
  PERFORM app.lp5b_prepare_projection(p_command_id);
  SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command_id;
 END IF;
 value:=app.lp5_command_result(p_command_id,p_outcome);
 IF reg.completion_adapter='proof' AND (value->>'decisionId') IS NOT NULL THEN
  INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)
   VALUES(gen_random_uuid(),t,(value->>'decisionId')::uuid,'approved',c.actor_membership_id);
 END IF;
 IF reg.completion_adapter='contractor_extra' AND ((c.significant_input->'input') ? 'clientCaptureId')
  AND EXISTS(SELECT 1 FROM app.extra_origin o WHERE o.tenant_id=t AND o.job_id=(c.resource->>'subjectRef')::uuid
   AND o.variation_id=(value->>'variationId')::uuid AND o.command_id<>p_command_id
   AND o.client_capture_id=(c.significant_input->'input'->>'clientCaptureId')::uuid) THEN
  c.effect_ref:=coalesce(c.effect_ref,'{}'::jsonb)||jsonb_build_object('noopReason','client_capture_already_exists');
  UPDATE app.command_lifecycle_claim SET effect_ref=c.effect_ref WHERE tenant_id=t AND command_id=p_command_id;
 END IF;
 -- The argument is a reference hint only. Persist exclusively the adapter-derived result.
 proof_ref:=CASE reg.completion_adapter
  WHEN 'job_parties' THEN jsonb_strip_nulls(jsonb_build_object('id',(value->'id'),'revisionId',(value->'revisionId')))
  WHEN 'import' THEN (CASE WHEN (value ? 'sourceJobId') THEN jsonb_build_object('sourceJobId',(value->'sourceJobId'),'sourceBindingId',(value->'sourceBindingId')) ELSE '{}'::jsonb END)
  WHEN 'acceptance' THEN jsonb_build_object('eventId',(value->'eventId'))
  WHEN 'disposition' THEN jsonb_build_object('eventId',(value->'eventId'))
  WHEN 'purchase_order' THEN jsonb_build_object('placementId',(value->'placementId'))
  WHEN 'invoice' THEN jsonb_build_object('invoiceId',(value->'invoiceId'))
  WHEN 'synthetic_lock_noop' THEN jsonb_build_object('locked',(value->'locked'))
  WHEN 'review' THEN (CASE WHEN (value ? 'revision') THEN jsonb_build_object('revision',(value->'revision')) ELSE '{}'::jsonb END)
  ELSE '{}'::jsonb END;
 UPDATE app.command_lifecycle_claim SET outcome=proof_ref WHERE tenant_id=t AND command_id=p_command_id;
 UPDATE app.command_receipt SET status='succeeded',result=value,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=p_command_id;
 refs:=jsonb_build_object('commandId',p_command_id::text);
 IF c.authorization_id IS NOT NULL THEN refs:=refs||jsonb_build_object('authorizationId',c.authorization_id::text); END IF;
 IF reg.completion_adapter='synthetic_lock_noop' OR (value->>'reused')='true' OR (c.effect_ref ? 'noopReason') THEN
  refs:=refs||jsonb_build_object('outcome','succeeded_noop','reason',coalesce((c.effect_ref->>'noopReason'),'adapter_verified_existing_effect')); END IF;
 -- All business writes and the terminal receipt precede the last contending lock.
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
  'actorRef','membership:'||c.actor_membership_id::text,'eventType','command.succeeded','subjectType',(c.resource->>'subjectType'),
  'subjectRef',(c.resource->>'subjectRef'),'payload',jsonb_build_object('references',refs,
  'classifications',jsonb_build_object('action',reg.audit_class)))),'checked_operation');
 RETURN value;
END $$;

COMMIT;
