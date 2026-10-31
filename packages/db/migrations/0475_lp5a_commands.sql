-- LP-5a RED: checked dispatcher lifecycle. Actor/tenant binding remains LP-6;
-- direct writers/grants remain until LP-5b/c. No production gate is opened.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_command_writer') THEN
  RAISE EXCEPTION 'jobguard_command_writer is missing; run administrative ensureRoles before migrations' USING ERRCODE='42704';
 END IF;
END $$;
-- Required only while transferring ownership; removed before this transaction commits.
GRANT CREATE ON SCHEMA app TO jobguard_command_writer;
GRANT USAGE ON SCHEMA app TO jobguard_command_writer;
-- Private control-plane configuration, deliberately not tenant-owned business data.
CREATE TABLE app.command_type_registry (
 command_type text NOT NULL, version text NOT NULL, permission_rule text NOT NULL CHECK(permission_rule='owner'),
 lock_adapter text NOT NULL CHECK(lock_adapter='route_before_begin'), completion_adapter text NOT NULL,
 audit_class text NOT NULL CHECK(audit_class IN('commercial','operational')), outbox_class text,
 PRIMARY KEY(command_type,version)
);
ALTER TABLE app.command_type_registry OWNER TO jobguard_command_writer;
REVOKE ALL ON app.command_type_registry FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
INSERT INTO app.command_type_registry VALUES
 ('confirm_proposal_review','command.v1','owner','route_before_begin','review','commercial',NULL),
 ('job.adopt_in_flight','command.v1','owner','route_before_begin','import','commercial',NULL),
 ('job.adopt_in_flight_v3','command.v1','owner','route_before_begin','import_v3','commercial',NULL),
 ('customer_payment.record','command.v1','owner','route_before_begin','payment','commercial',NULL),
 ('quote.issue','command.v1','owner','route_before_begin','quote_send','commercial','fake_quote_delivery'),
 ('job.switch_live','command.v1','owner','route_before_begin','activation','commercial',NULL),
 ('synthetic.settlement','command.v1','owner','route_before_begin','settlement','commercial',NULL),
 ('quote.acceptance.attest','command.v1','owner','route_before_begin','acceptance','commercial',NULL),
 ('quote.declined','command.v1','owner','route_before_begin','disposition','commercial',NULL),
 ('quote.superseded','command.v1','owner','route_before_begin','disposition','commercial',NULL),
 ('quote.acceptance_cancelled','command.v1','owner','route_before_begin','disposition','commercial',NULL),
 ('quote.send','command.v1','owner','route_before_begin','quote_send','commercial','fake_quote_delivery'),
 ('customer_invoice.issue','command.v1','owner','route_before_begin','invoice','commercial','fake_invoice_delivery'),
 ('customer_credit_note.issue','command.v1','owner','route_before_begin','credit','commercial',NULL),
 ('customer_payment.reverse','command.v1','owner','route_before_begin','payment_reversal','commercial',NULL),
 ('purchase_order.simulate','command.v1','owner','route_before_begin','purchase_order','commercial','fake_purchase_order'),
 ('recovery.terms.approve','command.v1','owner','route_before_begin','recovery_terms','commercial',NULL),
 ('recovery.message.approve','command.v1','owner','route_before_begin','message','commercial','fake_recovery_message'),
 ('recovery.follow_up.approve_reminder','command.v1','owner','route_before_begin','message','commercial','fake_recovery_message'),
 ('IssueClientApproval','command.v1','owner','route_before_begin','client_link','commercial','fake_email'),
 ('finding.resolve','decision-resolution-command.v1','owner','route_before_begin','finding','operational',NULL),
 -- Existing commands.integration lock observer: explicitly scoped, adapter-proven no-op.
 ('synthetic.lock','command.v1','owner','route_before_begin','synthetic_lock_noop','operational',NULL);

CREATE TABLE app.command_lifecycle_claim (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 version text NOT NULL, resource jsonb NOT NULL, expected_revisions jsonb NOT NULL, significant_input jsonb NOT NULL,
 authorization_id uuid, transaction_id xid8 NOT NULL DEFAULT pg_current_xact_id(), effect_ref jsonb, outcome jsonb,
 PRIMARY KEY(tenant_id,command_id), UNIQUE(tenant_id,authorization_id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id)
);
ALTER TABLE app.command_lifecycle_claim OWNER TO jobguard_command_writer;
ALTER TABLE app.command_lifecycle_claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.command_lifecycle_claim FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.command_lifecycle_claim FOR ALL TO jobguard_command_writer
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.command_lifecycle_claim FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;

-- Read-only proof adapters; no business locks are taken here or at completion.
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['proposal_review','imported_job_baseline','job_party_binding','job_import_v3','trial_admission','membership','job','job_activation','job_activation_terms','cap_snapshot','synthetic_obligation',
 'simulated_settlement_event','quote_acceptance','acceptance_event','activation_acceptance_operation_use',
 'quote_send','quote_document_version','final_account_revision','customer_invoice','customer_credit_note','customer_payment','customer_payment_reversal',
 'purchase_order_placement','purchase_order_revision','recovery_case_terms_approval','recovery_message_approval',
 'recovery_message','extra_client_link','extra_client_link_closure','job_finding','audit_event','action_outbox','decision','decision_resolution',
 'action_authorization','command_receipt'] LOOP
  EXECUTE format('GRANT SELECT ON app.%I TO jobguard_command_writer',n);
  EXECUTE format('CREATE POLICY lp5_command_read ON app.%I FOR SELECT TO jobguard_command_writer USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 END LOOP;
 FOREACH n IN ARRAY ARRAY['decision','decision_resolution','action_authorization','command_receipt'] LOOP
  EXECUTE format('GRANT INSERT ON app.%I TO jobguard_command_writer',n);
  EXECUTE format('CREATE POLICY lp5_command_insert ON app.%I FOR INSERT TO jobguard_command_writer WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 END LOOP;
END $$;
GRANT UPDATE(status,result,completed_at) ON app.command_receipt TO jobguard_command_writer;
CREATE POLICY lp5_command_complete ON app.command_receipt FOR UPDATE TO jobguard_command_writer
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT EXECUTE ON FUNCTION app.final_lock_canonical(jsonb),app.lp4_seal_audit(jsonb,text) TO jobguard_command_writer;

-- Private effect handoff from the checked operation itself. A receipt and owner
-- alone cannot manufacture this reference. Runtime cannot call this helper.
CREATE FUNCTION app.lp5_bind_effect(p_command uuid,p_authorization uuid,p_adapter text,p_reference jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim; r app.command_receipt; adapter text;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command;
 IF c.command_id IS NULL THEN RETURN; END IF; -- LP-5b unconverted callers retain their own backstops.
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command;
 SELECT completion_adapter INTO adapter FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF r.status IS DISTINCT FROM 'processing' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR c.authorization_id IS DISTINCT FROM p_authorization OR adapter IS DISTINCT FROM p_adapter OR c.effect_ref IS NOT NULL
  OR p_adapter NOT IN('activation','review','import') OR jsonb_typeof(p_reference) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 UPDATE app.command_lifecycle_claim SET effect_ref=p_reference WHERE tenant_id=t AND command_id=p_command;
END $$;
ALTER FUNCTION app.lp5_bind_effect(uuid,uuid,text,jsonb) OWNER TO jobguard_command_writer;
REVOKE ALL ON FUNCTION app.lp5_bind_effect(uuid,uuid,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.lp5_bind_effect(uuid,uuid,text,jsonb) TO jobguard_migration;

CREATE FUNCTION app.begin_command(p_version text,p_command_id uuid,p_command_type text,p_semantic_key text,
 p_resource jsonb,p_expected_revisions jsonb,p_significant_input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid;
 reg app.command_type_registry; prior app.command_receipt; found_count integer:=0;
 digest text; digest_input jsonb; legacy_digest text; legacy_input jsonb; claimed uuid; dec uuid; res uuid; auth uuid; a jsonb; existing_dec uuid;
BEGIN
 actor:=(p_resource->>'actorMembershipId')::uuid;
 -- No membership lock upgrade: preserve the receipt FK KEY SHARE deadlock fix.
 IF t IS NULL OR t IS DISTINCT FROM (p_resource->>'tenantId')::uuid OR NOT EXISTS(
  SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner' AND revoked_at IS NULL
   AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO reg FROM app.command_type_registry WHERE command_type=p_command_type AND version=p_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
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
 IF p_version='command.v1' THEN
  legacy_input:=jsonb_set((legacy_input-ARRAY['commandId','decisionId','resolutionId','authorizationId']),'{action,expiresAt}','{}');
 END IF;
 legacy_digest:=encode(sha256(convert_to(app.final_lock_canonical(legacy_input),'UTF8')),'hex');
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
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner'
    AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('kind','replay','result',prior.result);
 END IF;
 IF reg.completion_adapter='finding' THEN
  IF (p_significant_input-ARRAY['version','commandId','semanticKey','actorMembershipId','decisionId','findingFingerprint','resolution','expectedSnapshotRevision'])<>'{}'
   OR NOT((p_expected_revisions ? 'snapshotRevision')) OR (p_expected_revisions-ARRAY['snapshotRevision'])<>'{}' OR (p_expected_revisions->>'snapshotRevision')::integer IS DISTINCT FROM (p_significant_input->>'expectedSnapshotRevision')::integer
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
   OR NOT((p_expected_revisions ? 'aggregateRevision')) OR (p_expected_revisions-ARRAY['aggregateRevision'])<>'{}' THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
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
  VALUES(t,p_command_id,actor,p_version,p_resource,p_expected_revisions,p_significant_input,auth);
 RETURN jsonb_build_object('kind','claim','decisionId',dec,'resolutionId',res,'authorizationId',auth);
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range OR not_null_violation OR string_data_right_truncation THEN
 RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 WHEN unique_violation THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
END $$;

CREATE FUNCTION app.lp5_command_result(p_command_id uuid,p_outcome jsonb) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim;
 r app.command_receipt; adapter text; subject text; a jsonb; value jsonb; expected_revision integer; effect_table text; effect_count bigint;
BEGIN
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command_id;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command_id;
 SELECT completion_adapter INTO adapter FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF c.command_id IS NULL OR adapter IS NULL OR c.actor_membership_id IS DISTINCT FROM r.actor_membership_id
  OR c.transaction_id IS DISTINCT FROM pg_current_xact_id() THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 subject:=(c.resource->>'subjectRef'); a:=(c.significant_input->'action'); expected_revision:=(c.expected_revisions->>'aggregateRevision')::integer;
 effect_table:=CASE adapter WHEN 'invoice' THEN 'customer_invoice' WHEN 'credit' THEN 'customer_credit_note'
  WHEN 'payment' THEN 'customer_payment' WHEN 'payment_reversal' THEN 'customer_payment_reversal'
  WHEN 'quote_send' THEN 'quote_send' WHEN 'purchase_order' THEN 'purchase_order_placement'
  WHEN 'message' THEN 'recovery_message_approval' WHEN 'client_link' THEN 'extra_client_link' END;
 IF effect_table IS NOT NULL THEN
  EXECUTE format('SELECT count(*) FROM app.%I WHERE tenant_id=$1 AND authorization_id=$2',effect_table)
   INTO effect_count USING t,c.authorization_id;
  IF effect_count>1 THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 END IF;

 CASE adapter
 WHEN 'review' THEN
  SELECT CASE WHEN (p_outcome ? 'revision') THEN jsonb_build_object('jobId',j.id,'revision',j.revision,'status',j.status)
   ELSE jsonb_build_object('jobId',j.id,'reviewId',v.id,'jobRevision',j.revision,'status',j.status) END INTO value
   FROM app.proposal_review v JOIN app.job j ON(j.tenant_id,j.id)=(v.tenant_id,v.job_id)
   WHERE v.tenant_id=t AND j.id=subject::uuid AND v.state='confirmed' AND j.status='quoting'
    AND v.revision=expected_revision AND v.id=(c.effect_ref->>'reviewId')::uuid AND j.revision=(c.effect_ref->>'jobRevision')::integer AND r.semantic_key='job:'||j.id::text||':confirm:'||v.proposal_id::text;
 WHEN 'import' THEN
  SELECT jsonb_build_object('jobId',b.job_id,'baselineId',b.id,'provenance','imported','lifecyclePoint',j.status,
   'acceptedNetValuePence',b.accepted_net_value_pence,'recoveryCapPence',b.recovery_cap_pence,
   'lineageStrength','builder_attested_weaker','lineageLabel','Imported — builder-attested baseline; weaker than a JobGuard-generated and customer-accepted quote.',
   'billing','none','historicFeesCreated',0) INTO value
   FROM app.imported_job_baseline b JOIN app.job j ON(j.tenant_id,j.id)=(b.tenant_id,b.job_id)
   WHERE b.tenant_id=t AND b.job_id=subject::uuid AND b.attested_by_membership_id=c.actor_membership_id
    AND b.baseline_hash=(a->>'contentHash') AND b.accepted_net_value_pence=(a->>'amountPence')::bigint
    AND b.import_terms_version=(a->>'policyVersion') AND b.id=(c.effect_ref->>'baselineId')::uuid;
  -- The parties-import API enriches the legacy mutation's base result. Treat
  -- its two IDs only as references: rederive their relationship and source hash
  -- from the immutable bindings and the baseline before returning the DTO.
  IF value IS NOT NULL AND ((p_outcome ? 'sourceJobId') OR (p_outcome ? 'sourceBindingId')) THEN
   IF jsonb_typeof(p_outcome->'sourceJobId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_outcome->'sourceBindingId') IS DISTINCT FROM 'string'
    OR NOT EXISTS(SELECT 1 FROM app.imported_job_baseline b
     JOIN app.job_party_binding imported ON(imported.tenant_id,imported.job_id)=(b.tenant_id,b.job_id)
     JOIN app.job_party_binding source ON source.tenant_id=b.tenant_id
      AND source.id=(p_outcome->>'sourceBindingId')::uuid AND source.job_id=(p_outcome->>'sourceJobId')::uuid
      AND source.customer_revision_id=imported.customer_revision_id
      AND source.site_revision_id=imported.site_revision_id AND source.paying_party_revision_id=imported.paying_party_revision_id
     WHERE b.tenant_id=t AND b.id=(c.effect_ref->>'baselineId')::uuid AND b.job_id=subject::uuid
      AND b.baseline_hash=encode(sha256(convert_to(
       '{"sourceJobId":'||to_jsonb(p_outcome->>'sourceJobId')::text||',"bindingId":'||to_jsonb(p_outcome->>'sourceBindingId')::text||
       ',"baselineDescription":'||to_jsonb(b.baseline_description)::text||',"netPence":'||b.accepted_net_value_pence::text||'}','UTF8')),'hex'))
   THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
   value:=value||jsonb_build_object('version','job-parties-import-result.v1','environment','synthetic_demo',
    'sourceJobId',(p_outcome->>'sourceJobId'),'sourceBindingId',(p_outcome->>'sourceBindingId'),'realExternalActions',0);
  END IF;
 WHEN 'import_v3' THEN
  SELECT i.result INTO value FROM app.job_import_v3 i WHERE i.tenant_id=t AND i.command_id=p_command_id
   AND i.job_id=subject::uuid AND i.xmin::text=pg_current_xact_id()::text;
 WHEN 'payment' THEN
  SELECT jsonb_build_object('paymentId',id,'provenance','manual_builder_attestation','qualifyingRecoveryProof',false,'platformFeeSettlement',false) INTO value
   FROM app.customer_payment WHERE tenant_id=t AND authorization_id=c.authorization_id AND job_id=subject::uuid
    AND amount_pence=(a->>'amountPence')::bigint;
 WHEN 'finding' THEN
  SELECT jsonb_build_object('decisionId',d.decision_id,'resolution',d.resolution,'authorizedAction',false) INTO value
   FROM app.decision_resolution d JOIN app.job_finding f ON(f.tenant_id,f.decision_id)=(d.tenant_id,d.decision_id)
   WHERE d.tenant_id=t AND d.decision_id=(c.significant_input->>'decisionId')::uuid
    AND d.actor_membership_id=c.actor_membership_id AND d.resolution=(c.significant_input->>'resolution')
    AND f.fingerprint=(c.significant_input->>'findingFingerprint') AND f.snapshot_revision=(c.expected_revisions->>'snapshotRevision')::integer;
 WHEN 'activation' THEN
  IF (a->>'policyVersion')='synthetic_demo_activation.v3' THEN
   SELECT jsonb_build_object('jobId',j.job_id,'activationId',j.id,'termsId',terms.id,'state','live') INTO value
    FROM app.job_activation j JOIN app.job_activation_terms terms ON(terms.tenant_id,terms.activation_id)=(j.tenant_id,j.id)
    WHERE j.tenant_id=t AND j.job_id=subject::uuid AND j.actor_membership_id=c.actor_membership_id
     AND j.accepted_document_hash=(a->>'contentHash') AND j.accepted_document_version=expected_revision
     AND j.id=(c.effect_ref->>'activationId')::uuid AND terms.id=(c.effect_ref->>'termsId')::uuid;
  IF value IS NOT NULL AND EXISTS(SELECT 1 FROM app.trial_admission WHERE tenant_id=t AND command_id=p_command_id) THEN
    value:=value||jsonb_build_object('snapshotId',(SELECT snapshot_id FROM app.trial_admission WHERE tenant_id=t AND command_id=p_command_id)); END IF;
  ELSE
   SELECT jsonb_build_object('activationId',j.id,'capSnapshotId',cap.id,'syntheticObligationId',ob.id,'jobId',j.job_id,
    'state','live','mode',j.mode,'acceptedNetValuePence',cap.accepted_net_value_pence,'recoveryCapPence',cap.recovery_cap_pence,
    'label',CASE WHEN j.mode='pilot_no_charge' THEN 'no charge' ELSE 'illustrative only' END) INTO value
    FROM app.activation_acceptance_operation_use u JOIN app.job_activation j ON(j.tenant_id,j.job_id)=(u.tenant_id,u.job_id)
    JOIN app.cap_snapshot cap ON(cap.tenant_id,cap.activation_id)=(j.tenant_id,j.id)
    LEFT JOIN app.synthetic_obligation ob ON(ob.tenant_id,ob.activation_id)=(j.tenant_id,j.id)
    WHERE u.tenant_id=t AND u.command_id=p_command_id AND u.authorization_id=c.authorization_id
     AND u.actor_membership_id=c.actor_membership_id AND j.job_id=subject::uuid
     AND j.accepted_document_hash=(a->>'contentHash') AND j.accepted_document_version=expected_revision;
   -- Owner-connected legacy transition/lock fixtures have no activation row.
   -- Keep their narrow proof for the unchanged commands integration tests:
   -- runtime cannot execute transition_job or become a superuser, and even the
   -- fixture must prove a real live/revision change in this same transaction.
   IF value IS NULL AND (a->>'actionType')='switch_live' AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=session_user AND rolsuper) THEN
    SELECT jsonb_build_object('jobId',id,'revision',app.job.revision,'status',status) INTO value FROM app.job
     WHERE tenant_id=t AND id=subject::uuid AND status='live' AND app.job.revision=expected_revision+1
      AND xmin::text=pg_current_xact_id()::text;
   END IF;
  END IF;
 WHEN 'settlement' THEN
  SELECT jsonb_build_object('settlementId',s.id,'obligationId',s.obligation_id,'label','simulated — not collected') INTO value
   FROM app.activation_acceptance_operation_use u JOIN app.simulated_settlement_event s ON(s.tenant_id,s.job_id)=(u.tenant_id,u.job_id)
   WHERE u.tenant_id=t AND u.command_id=p_command_id AND u.authorization_id=c.authorization_id
    AND u.actor_membership_id=c.actor_membership_id AND s.obligation_id=subject::uuid AND s.amount_pence=(a->>'amountPence')::bigint;
 WHEN 'acceptance' THEN
  SELECT jsonb_build_object('acceptanceId',q.id,'eventId',e.id,'jobId',q.job_id,'documentId',q.document_id,
   'documentVersion',q.document_version,'documentHash',q.document_hash,'acceptedTotalPence',q.accepted_total_pence,
   'acceptanceKind',q.acceptance_kind,'state','accepted') INTO value
   FROM app.activation_acceptance_operation_use u JOIN app.quote_acceptance q ON(q.tenant_id,q.job_id)=(u.tenant_id,u.job_id)
   JOIN app.acceptance_event e ON(e.tenant_id,e.acceptance_id)=(q.tenant_id,q.id)
   WHERE u.tenant_id=t AND u.command_id=p_command_id AND u.authorization_id=c.authorization_id
    AND q.actor_membership_id=c.actor_membership_id AND q.document_id=subject::uuid AND q.document_hash=(a->>'contentHash')
    AND q.document_version=expected_revision AND q.accepted_total_pence=(a->>'amountPence')::bigint AND e.kind='accepted'
    AND e.id=(p_outcome->>'eventId')::uuid;
 WHEN 'disposition' THEN
  SELECT jsonb_build_object('eventId',e.id,'jobId',e.job_id,'documentId',e.document_id,'kind',e.kind,
   'state',CASE WHEN e.kind='declined' THEN 'lost' ELSE 'quoting' END) INTO value
   FROM app.activation_acceptance_operation_use u JOIN app.acceptance_event e ON(e.tenant_id,e.job_id)=(u.tenant_id,u.job_id)
   WHERE u.tenant_id=t AND u.command_id=p_command_id AND u.authorization_id=c.authorization_id
    AND e.id=(p_outcome->>'eventId')::uuid AND e.actor_membership_id=c.actor_membership_id AND e.document_id=subject::uuid
    AND e.document_hash=(a->>'contentHash') AND e.document_version=expected_revision AND 'quote.'||e.kind=r.command_type;
 WHEN 'quote_send' THEN
  SELECT jsonb_build_object('documentId',s.document_id,'outboxActionId',s.outbox_action_id,'state','issued') INTO value
   FROM app.quote_send s JOIN app.quote_document_version d ON(d.tenant_id,d.id)=(s.tenant_id,s.document_id)
   WHERE s.tenant_id=t AND s.authorization_id=c.authorization_id AND s.document_id=subject::uuid
    AND s.content_hash=(a->>'contentHash') AND d.document_version=expected_revision;
 WHEN 'invoice' THEN
  SELECT jsonb_build_object('invoiceId',i.id,'invoiceNumber',i.invoice_number,'pdfSha256',i.pdf_sha256,'reused',i.authorization_id<>c.authorization_id,'synthetic',i.synthetic) INTO value
   FROM app.customer_invoice i JOIN app.action_outbox b ON(b.tenant_id,b.authorization_id)=(i.tenant_id,i.authorization_id)
   WHERE i.tenant_id=t AND (i.authorization_id=c.authorization_id OR i.id=(p_outcome->>'invoiceId')::uuid) AND i.job_id=subject::uuid
    AND i.pdf_sha256=(a->>'contentHash') AND i.total_pence=(a->>'amountPence')::bigint
    AND EXISTS(SELECT 1 FROM app.final_account_revision WHERE tenant_id=t AND id=i.final_account_revision_id AND revision=expected_revision);
 WHEN 'credit' THEN
  SELECT jsonb_build_object('creditNoteId',id,'creditNumber',credit_number,'originalInvoiceUnchanged',true) INTO value
   FROM app.customer_credit_note WHERE tenant_id=t AND authorization_id=c.authorization_id AND job_id=subject::uuid
    AND amount_pence=(a->>'amountPence')::bigint;
 WHEN 'payment_reversal' THEN
  SELECT jsonb_build_object('reversalId',x.id,'invoiceId',p.invoice_id) INTO value
   FROM app.customer_payment_reversal x JOIN app.customer_payment p ON(p.tenant_id,p.id)=(x.tenant_id,x.payment_id)
   WHERE x.tenant_id=t AND x.authorization_id=c.authorization_id AND x.job_id=subject::uuid;
 WHEN 'purchase_order' THEN
  SELECT jsonb_build_object('placementId',p.id,'outboxActionId',p.outbox_action_id,'reused',p.authorization_id<>c.authorization_id) INTO value
   FROM app.purchase_order_placement p JOIN app.purchase_order_revision v ON(v.tenant_id,v.id)=(p.tenant_id,p.revision_id)
   WHERE p.tenant_id=t AND p.id=(p_outcome->>'placementId')::uuid AND p.revision_id=subject::uuid
    AND v.revision=expected_revision AND v.authority_hash=(a->>'contentHash') AND v.order_net_pence=(a->>'amountPence')::bigint
    AND v.recipient IS NOT DISTINCT FROM (a->>'recipient');
 WHEN 'recovery_terms' THEN
  SELECT jsonb_build_object('version','recovery-case-terms.v1','id',id,'tenantId',tenant_id,'jobId',job_id,'caseId',case_id,
   'termsVersion',terms_version,'feePolicyVersion',fee_policy_version,'eligibilityPolicyVersion',eligibility_policy_version,
   'policyStatus',policy_status,'environment',environment,'termsHash',terms_hash,'actorMembershipId',actor_membership_id,
   'commandId',command_id,'authorizationId',authorization_id,'approvedAt',to_char(approved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'realExternalActions',0) INTO value
   FROM app.recovery_case_terms_approval WHERE tenant_id=t AND command_id=p_command_id AND authorization_id=c.authorization_id
    AND actor_membership_id=c.actor_membership_id AND case_id=subject::uuid AND terms_hash=(a->>'contentHash');
 WHEN 'message' THEN
  SELECT jsonb_build_object('messageId',m.message_id,'outboxActionId',m.outbox_action_id,'authorizationId',m.authorization_id) INTO value
   FROM app.recovery_message_approval m JOIN app.recovery_message d ON(d.tenant_id,d.id)=(m.tenant_id,m.message_id)
   WHERE m.tenant_id=t AND m.authorization_id=c.authorization_id AND d.content_hash=(a->>'contentHash')
    AND d.case_revision=expected_revision AND (m.message_id::text=subject OR ((c.resource->>'subjectType')='recovery_follow_up' AND EXISTS(SELECT 1 FROM app.decision WHERE tenant_id=t AND id=(c.significant_input->>'decisionId')::uuid AND subject_type='recovery_follow_up' AND subject_ref=subject)));
 WHEN 'client_link' THEN
  SELECT jsonb_build_object('linkId',id,'outboxActionId',outbox_action_id,'requestId',request_id,'replacedOutboxIds',coalesce((SELECT jsonb_agg(k.outbox_action_id ORDER BY x.server_recorded_at,k.id) FROM app.extra_client_link_closure x JOIN app.extra_client_link k ON(k.tenant_id,k.id)=(x.tenant_id,x.link_id) WHERE x.tenant_id=t AND x.command_id=p_command_id AND x.kind='replaced'),'[]'::jsonb)) INTO value
   FROM app.extra_client_link WHERE tenant_id=t AND command_id=p_command_id AND authorization_id=c.authorization_id
    AND issued_by_membership_id=c.actor_membership_id AND variation_id=subject::uuid;
 WHEN 'synthetic_lock_noop' THEN
  -- Explicit existing lock-test contract; not an unknown-type fallback.
  SELECT jsonb_build_object('locked',id) INTO value FROM app.job WHERE tenant_id=t AND id=subject::uuid
   AND (p_outcome->>'locked')=id::text;
 ELSE RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514';
 END CASE;
 IF value IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN value;
END $$;

CREATE FUNCTION app.complete_command(p_command_id uuid,p_outcome jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; c app.command_lifecycle_claim;
 r app.command_receipt; reg app.command_type_registry; value jsonb; refs jsonb; proof_ref jsonb;
BEGIN
 IF jsonb_typeof(p_outcome) IS DISTINCT FROM 'object' OR (p_outcome-ARRAY['eventId','placementId','invoiceId','locked','revision','sourceJobId','sourceBindingId'])<>'{}' THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=t AND command_id=p_command_id;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=p_command_id;
 IF c.command_id IS NULL OR r.status IS DISTINCT FROM 'processing' OR c.transaction_id IS DISTINCT FROM pg_current_xact_id()
  OR c.outcome IS NOT NULL THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT * INTO reg FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=c.actor_membership_id AND role=reg.permission_rule
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF c.authorization_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM app.action_authorization a JOIN app.decision_resolution d ON(d.tenant_id,d.id)=(a.tenant_id,a.resolution_id)
  WHERE a.tenant_id=t AND a.id=c.authorization_id AND a.actor_membership_id=c.actor_membership_id
   AND d.actor_membership_id=c.actor_membership_id AND d.resolution='approved' AND a.revoked_at IS NULL
   AND a.expires_at>(CASE WHEN r.command_type='recovery.terms.approve' THEN transaction_timestamp() ELSE clock_timestamp() END)) THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 value:=app.lp5_command_result(p_command_id,p_outcome);
 -- The argument is a reference hint only. Persist exclusively the adapter-derived result.
 proof_ref:=CASE reg.completion_adapter
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

CREATE FUNCTION app.lp5_check_command_completion() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE c app.command_lifecycle_claim; r app.command_receipt; reg app.command_type_registry;
 value jsonb; outbox uuid; outbox_authorization_id uuid; a app.action_authorization; caller_tenant text:=current_setting('app.tenant_id',true);
BEGIN
 -- Deferred checks run after caller code may have changed or cleared context.
 -- RLS and the result adapter must see the tenant of THIS receipt, not that setting.
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 SELECT * INTO c FROM app.command_lifecycle_claim WHERE tenant_id=NEW.tenant_id AND command_id=NEW.command_id;
 -- Every touched receipt must finish before commit. LP-5b converts other writers;
 -- LP-5c closes direct grants. Full effect/audit/outbox proof covers managed claims.
 IF NEW.status='processing' AND NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=NEW.tenant_id AND command_id=NEW.command_id AND status='succeeded') THEN
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23514'; END IF;
 IF c.command_id IS NULL THEN
  PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true); RETURN NULL; END IF;
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=NEW.tenant_id AND command_id=NEW.command_id;
 SELECT * INTO reg FROM app.command_type_registry WHERE command_type=r.command_type AND version=c.version;
 IF r.status IS DISTINCT FROM 'succeeded' OR c.outcome IS NULL THEN
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23514'; END IF;
 value:=app.lp5_command_result(r.command_id,c.outcome);
 IF value IS DISTINCT FROM r.result OR NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=r.tenant_id
   AND e.version='audit.v2' AND e.event_type='command.succeeded' AND e.actor_ref='membership:'||r.actor_membership_id::text
   AND e.subject_type=(c.resource->>'subjectType') AND e.subject_ref=(c.resource->>'subjectRef')
   AND (e.payload->'references'->>'commandId')=r.command_id::text AND (e.payload->'references'->>'auditTrust')='checked_operation') THEN
  RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 IF reg.outbox_class IS NOT NULL THEN
  outbox_authorization_id:=c.authorization_id;
  IF reg.completion_adapter='purchase_order' AND (value->>'reused')='true' THEN
   SELECT authorization_id INTO outbox_authorization_id FROM app.purchase_order_placement WHERE tenant_id=r.tenant_id AND id=(value->>'placementId')::uuid;
  END IF;
  IF reg.completion_adapter='invoice' AND (value->>'reused')='true' THEN
   SELECT authorization_id INTO outbox_authorization_id FROM app.customer_invoice WHERE tenant_id=r.tenant_id AND id=(value->>'invoiceId')::uuid;
  END IF;
  SELECT * INTO a FROM app.action_authorization WHERE tenant_id=r.tenant_id AND id=outbox_authorization_id;
  IF NOT EXISTS(SELECT 1 FROM app.action_outbox b WHERE b.tenant_id=r.tenant_id AND b.authorization_id=outbox_authorization_id
   AND b.adapter=reg.outbox_class AND b.action_type=a.action_type AND b.content_hash=a.content_hash
   AND b.aggregate_revision=a.aggregate_revision AND b.recipient IS NOT DISTINCT FROM a.recipient
   AND b.amount_pence IS NOT DISTINCT FROM a.amount_pence AND b.currency IS NOT DISTINCT FROM a.currency
   AND b.policy_version=a.policy_version) THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER lp5_command_completion AFTER INSERT OR UPDATE ON app.command_receipt
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.lp5_check_command_completion();
ALTER FUNCTION app.begin_command(text,uuid,text,text,jsonb,jsonb,jsonb) OWNER TO jobguard_command_writer;
ALTER FUNCTION app.complete_command(uuid,jsonb) OWNER TO jobguard_command_writer;
ALTER FUNCTION app.lp5_command_result(uuid,jsonb) OWNER TO jobguard_command_writer;
ALTER FUNCTION app.lp5_check_command_completion() OWNER TO jobguard_command_writer;
REVOKE ALL ON FUNCTION app.begin_command(text,uuid,text,text,jsonb,jsonb,jsonb),app.complete_command(uuid,jsonb),
 app.lp5_command_result(uuid,jsonb),app.lp5_check_command_completion() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.begin_command(text,uuid,text,text,jsonb,jsonb,jsonb),app.complete_command(uuid,jsonb) TO jobguard_runtime,jobguard_migration;

-- Latest definition: 0109_job_activation_terms.sql; only the private effect handoff is added.
CREATE OR REPLACE FUNCTION app.switch_job_live_v3(p_tenant uuid,p_activation uuid,p_terms uuid,p_job uuid,p_document uuid,p_version integer,p_hash char(64),p_expected integer,p_actor uuid,p_command uuid,p_authorization uuid)
RETURNS app.job_activation_terms LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE j app.job;d app.quote_document_version;q app.quote_version;t app.job_activation_terms;highest bigint;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF j.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt c JOIN app.action_authorization a ON a.tenant_id=c.tenant_id AND a.actor_membership_id=c.actor_membership_id
 JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id)
 JOIN app.decision x ON(x.tenant_id,x.id)=(a.tenant_id,a.decision_id)
 WHERE c.tenant_id=p_tenant AND c.command_id=p_command AND c.command_type='job.switch_live' AND c.status='processing' AND c.actor_membership_id=p_actor
 AND a.id=p_authorization AND a.action_type='job.switch_live' AND a.content_hash=p_hash AND a.aggregate_revision=p_version AND a.amount_pence IS NULL AND a.currency IS NULL AND a.recipient IS NULL
 AND a.policy_version='synthetic_demo_activation.v3' AND a.expires_at>clock_timestamp() AND a.revoked_at IS NULL AND r.resolution='approved' AND x.subject_type='job' AND x.subject_ref=p_job::text)
 THEN RAISE EXCEPTION 'EXACT_ACTIVATION_AUTHORIZATION_MISMATCH' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job_party_current WHERE tenant_id=p_tenant AND job_id=p_job) THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO t FROM app.job_activation_terms WHERE tenant_id=p_tenant AND job_id=p_job;
 IF t.id IS NOT NULL THEN
  IF t.baseline_quote_version_id IS DISTINCT FROM p_document OR t.baseline_document_version IS DISTINCT FROM p_version OR t.baseline_document_hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'activation conflict' USING ERRCODE='40001'; END IF;
  PERFORM app.lp5_bind_effect(p_command,p_authorization,'activation',jsonb_build_object('activationId',t.activation_id,'termsId',t.id,'noopReason','activation_already_exists')); RETURN t;
 END IF;
 IF j.status IS DISTINCT FROM 'accepted' OR j.revision IS DISTINCT FROM p_expected OR j.accepted_quote_version_id IS DISTINCT FROM p_document THEN RAISE EXCEPTION 'accepted job revision required' USING ERRCODE='40001'; END IF;
 SELECT * INTO d FROM app.quote_document_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND document_version=p_version AND content_hash=p_hash;
 SELECT * INTO q FROM app.quote_version WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_document AND status='accepted';
 IF d.id IS NULL OR q.id IS NULL OR q.net_value_pence NOT BETWEEN 0 AND 1000000000000 OR (d.snapshot->>'netPence')::bigint IS DISTINCT FROM q.net_value_pence THEN RAISE EXCEPTION 'exact accepted terms mismatch' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.quote_acceptance WHERE tenant_id=p_tenant AND job_id=p_job AND document_id=p_document AND document_version=p_version AND document_hash=p_hash) THEN RAISE EXCEPTION 'acceptance required' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.quote_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=d.quote_revision_id AND issuable AND tax_policy_version='candidate_m1_standard_v1') THEN RAISE EXCEPTION 'resolved price and tax fields required' USING ERRCODE='22023'; END IF;
 SELECT coalesce(max(r.net_pence),0) INTO highest FROM app.quote_send s JOIN app.quote_document_version v ON(v.tenant_id,v.job_id,v.id)=(s.tenant_id,s.job_id,s.document_id)
 JOIN app.quote_revision r ON(r.tenant_id,r.job_id,r.id)=(v.tenant_id,v.job_id,v.quote_revision_id) WHERE s.tenant_id=p_tenant AND s.job_id=p_job;
 INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)
 VALUES(p_activation,p_tenant,p_job,p_document,p_version,p_hash,'synthetic_demo','synthetic_demo_activation.v3','reference_fee_policy_v3',p_actor,transaction_timestamp());
 -- SH-1's activation trigger binds the track; CH-3a's trigger freezes parties.
 INSERT INTO app.job_activation_terms(id,tenant_id,job_id,activation_id,baseline_quote_version_id,baseline_document_version,baseline_document_hash,accepted_net_pence,highest_sent_net_pence,small_job,policy_version,commercial_track,trial_plan_context)
 VALUES(p_terms,p_tenant,p_job,p_activation,p_document,p_version,p_hash,q.net_value_pence,highest,greatest(q.net_value_pence,highest)<200000,'reference_fee_policy_v3','small_builder','none_recorded_pre_mon2a') RETURNING * INTO t;
 UPDATE app.job SET status='live',revision=revision+1,baseline_quote_version_id=p_document,accepted_net_value_pence=q.net_value_pence,fee_policy_version='reference_fee_policy_v3',recovery_cap_pence=NULL,updated_at=transaction_timestamp() WHERE tenant_id=p_tenant AND id=p_job;
 PERFORM app.lp5_bind_effect(p_command,p_authorization,'activation',jsonb_build_object('activationId',t.activation_id,'termsId',t.id)); RETURN t;
END $$;

-- Latest definition: 0356_unchecked_job_doors.sql; only the private effect handoff is added.
CREATE OR REPLACE FUNCTION app.start_quote_from_review(
 p_tenant uuid,p_job uuid,p_expected integer,p_actor uuid,p_command uuid,p_authorization uuid,p_review uuid,p_content text
) RETURNS app.job LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE review app.proposal_review; j app.job; content jsonb; expected_content jsonb; normalized jsonb; digest text;
BEGIN
 -- Authority first, before any resource lookup or state-dependent refusal.
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner'
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO review FROM app.proposal_review WHERE tenant_id=p_tenant AND id=p_review AND job_id=p_job FOR UPDATE;
 IF review.id IS NULL THEN RAISE EXCEPTION 'REVIEW_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=p_tenant AND r.command_id=p_command
  AND r.actor_membership_id=p_actor AND r.command_type='confirm_proposal_review' AND r.status='processing'
  AND r.semantic_key='job:'||p_job::text||':confirm:'||review.proposal_id::text)
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 content:=p_content::jsonb;
 digest:=encode(sha256(convert_to(p_content,'UTF8')),'hex');
 IF NOT EXISTS(SELECT 1 FROM app.action_authorization a
  JOIN app.decision d ON(d.tenant_id,d.id)=(a.tenant_id,a.decision_id)
  JOIN app.decision_resolution x ON(x.tenant_id,x.id,x.decision_id)=(a.tenant_id,a.resolution_id,a.decision_id)
  WHERE a.tenant_id=p_tenant AND a.id=p_authorization AND a.actor_membership_id=p_actor AND x.actor_membership_id=p_actor
   AND x.resolution='approved' AND d.subject_type='job' AND d.subject_ref=p_job::text AND d.action_type='confirm_scope'
   AND a.action_type='confirm_scope' AND a.recipient IS NULL AND a.content_hash=digest AND a.aggregate_revision=review.revision
   AND a.amount_pence IS NULL AND a.currency IS NULL AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 -- Reconstruct the complete persisted review, including identities, dispositions and prices.
 -- Parent/question ordering is not stored; normalize only those arrays on BOTH sides.
 SELECT jsonb_build_object('version','proposal_review_v1','reviewId',review.id,'proposalId',review.proposal_id,
  'jobId',review.job_id,'revision',review.revision,'lines',coalesce((
   SELECT jsonb_agg(jsonb_build_object('id',l.id,'scopeItemId',l.scope_item_id,'origin',l.origin,'description',l.description,
    'room',l.room,'category',l.category,'quantity',l.quantity_decimal,'unit',l.unit,'unitPricePence',l.unit_price_pence,
    'disposition',l.disposition,'dismissalReason',l.dismissal_reason,'sourceExcerpt',l.source_excerpt,
    'parentScopeItemIds',coalesce((SELECT jsonb_agg(p.parent_scope_item_id ORDER BY p.parent_scope_item_id)
      FROM app.proposal_review_line_parent p WHERE p.tenant_id=l.tenant_id AND p.review_id=l.review_id AND p.line_id=l.id),'[]'::jsonb)) ORDER BY l.ordinal)
   FROM app.proposal_review_line l WHERE l.tenant_id=p_tenant AND l.review_id=p_review),'[]'::jsonb),
  'questions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',q.id,'question',q.question,'blocking',q.blocking,
    'disposition',q.disposition,'answer',q.answer) ORDER BY q.id)
   FROM app.proposal_review_question q WHERE q.tenant_id=p_tenant AND q.review_id=p_review),'[]'::jsonb)) INTO expected_content;
 normalized:=content || jsonb_build_object('lines',coalesce((SELECT jsonb_agg(
   l.value || jsonb_build_object('parentScopeItemIds',coalesce((SELECT jsonb_agg(p.value ORDER BY p.value)
    FROM jsonb_array_elements(l.value->'parentScopeItemIds') p),'[]'::jsonb)) ORDER BY l.ordinality)
   FROM jsonb_array_elements(content->'lines') WITH ORDINALITY l),'[]'::jsonb),
  'questions',coalesce((SELECT jsonb_agg(q.value ORDER BY q.value->>'id') FROM jsonb_array_elements(content->'questions') q),'[]'::jsonb));
 IF normalized IS DISTINCT FROM expected_content
  OR review.state IS DISTINCT FROM 'reviewing'
  OR NOT EXISTS(SELECT 1 FROM app.proposal_review_line WHERE tenant_id=p_tenant AND review_id=p_review AND disposition='accepted')
  OR EXISTS(SELECT 1 FROM app.proposal_review_line WHERE tenant_id=p_tenant AND review_id=p_review
   AND (disposition='proposed' OR (disposition='accepted' AND (quantity_decimal IS NULL OR unit IS NULL))))
  OR EXISTS(SELECT 1 FROM app.proposal_review_line l WHERE l.tenant_id=p_tenant AND l.review_id=p_review AND l.disposition='accepted'
   AND NOT EXISTS(SELECT 1 FROM app.scope_identity i JOIN app.scope_revision s
    ON(s.tenant_id,s.job_id,s.scope_item_id)=(i.tenant_id,i.job_id,i.id)
    WHERE (i.tenant_id,i.job_id,i.id)=(l.tenant_id,l.job_id,l.scope_item_id) AND i.state='confirmed'
     AND s.description=l.description AND s.quantity_decimal=l.quantity_decimal AND s.unit=l.unit
     AND s.unit_price_pence IS NOT DISTINCT FROM l.unit_price_pence))
  OR EXISTS(SELECT 1 FROM app.proposal_review_question WHERE tenant_id=p_tenant AND review_id=p_review
   AND ((blocking AND disposition<>'answered') OR (NOT blocking AND disposition='unresolved')))
 THEN RAISE EXCEPTION 'REVIEW_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 SELECT * INTO j FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF j.id IS NULL OR j.status IS DISTINCT FROM 'draft' OR j.revision IS DISTINCT FROM p_expected OR j.provenance IS DISTINCT FROM 'system_generated_quote'
  OR EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=p_tenant AND job_id=p_job AND job_track='contractor')
 THEN RAISE EXCEPTION 'REVIEW_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 UPDATE app.proposal_review SET state='confirmed',confirmed_at=transaction_timestamp(),updated_at=transaction_timestamp()
  WHERE tenant_id=p_tenant AND id=p_review;
 UPDATE app.job SET status='quoting',revision=revision+1,updated_at=transaction_timestamp()
  WHERE tenant_id=p_tenant AND id=p_job RETURNING * INTO j;
 PERFORM app.lp5_bind_effect(p_command,p_authorization,'review',jsonb_build_object('reviewId',p_review,'jobRevision',j.revision)); RETURN j;
END $$;

-- Latest definition: 0356_unchecked_job_doors.sql; only the private effect handoff is added.
CREATE OR REPLACE FUNCTION app.adopt_in_flight_job(p_tenant uuid,p_job uuid,p_baseline uuid,p_title varchar,p_lifecycle varchar,p_hash char(64),p_description varchar,p_net bigint,p_cap bigint,p_policy varchar,p_terms varchar,p_actor uuid,p_attested timestamptz,p_customer uuid,p_site uuid,p_payer uuid,p_command uuid,p_authorization uuid)
RETURNS app.imported_job_baseline LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE b app.imported_job_baseline; c app.customer_revision; s app.site_revision; p app.customer_revision; binding uuid:=gen_random_uuid();
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 -- Controlled write: the actor must be a current owner and the exact adoption must carry a processing command and an
 -- unexpired, unrevoked, approved authorization bound to this job, actor, content hash, amount and terms.
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
 OR NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=p_tenant AND r.command_id=p_command AND r.actor_membership_id=p_actor AND r.command_type='job.adopt_in_flight' AND r.semantic_key='import:'||p_job::text AND r.status='processing')
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.action_authorization a JOIN app.decision d ON(d.tenant_id,d.id)=(a.tenant_id,a.decision_id) JOIN app.decision_resolution x ON(x.tenant_id,x.id)=(a.tenant_id,a.resolution_id)
   WHERE a.tenant_id=p_tenant AND a.id=p_authorization AND a.actor_membership_id=p_actor AND x.actor_membership_id=p_actor AND x.resolution='approved'
   AND d.subject_type='job' AND d.subject_ref=p_job::text AND d.action_type='job.adopt_in_flight' AND a.action_type='job.adopt_in_flight' AND a.recipient IS NULL AND a.content_hash=p_hash AND a.aggregate_revision=0
   AND a.amount_pence=p_net AND a.currency='GBP' AND a.policy_version=p_terms AND a.expires_at>clock_timestamp() AND a.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 IF p_lifecycle NOT IN('live','invoiced') OR p_net<0 OR p_cap<>app.reference_recovery_cap(p_net) OR p_policy<>'reference_fee_policy_v1' OR p_terms<>'synthetic_import_terms_candidate.v1' OR p_attested>clock_timestamp() THEN RAISE EXCEPTION 'invalid imported terms' USING ERRCODE='22023';END IF;
 SELECT * INTO c FROM app.customer_revision WHERE tenant_id=p_tenant AND id=p_customer;
 SELECT * INTO s FROM app.site_revision WHERE tenant_id=p_tenant AND id=p_site;
 SELECT * INTO p FROM app.customer_revision WHERE tenant_id=p_tenant AND id=coalesce(p_payer,p_customer);
 IF c.id IS NULL OR s.id IS NULL OR p.id IS NULL THEN RAISE EXCEPTION 'JOB_PARTIES_REQUIRED' USING ERRCODE='22023'; END IF;
 INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,insert_shape,actor_membership_id,command_id,authorization_id)
 VALUES(p_tenant,p_job,pg_backend_pid(),pg_current_xact_id(),'adoption',
  app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object('tenant_id',p_tenant,'id',p_job,'title',p_title,
   'status','draft','revision',1,'provenance','imported','accepted_net_value_pence',p_net,'fee_policy_version',p_policy,'recovery_cap_pence',p_cap))),
  p_actor,p_command,p_authorization);
 INSERT INTO app.job(id,tenant_id,title,status,revision,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence)
 VALUES(p_job,p_tenant,p_title,'draft',1,'imported',p_net,p_policy,p_cap);
 INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)
 VALUES(p_tenant,binding,p_job,1,c.customer_id,c.id,p.customer_id,p.id,s.site_id,s.id,'entered');
 INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES(p_tenant,p_job,binding);
 UPDATE app.job SET status=p_lifecycle WHERE tenant_id=p_tenant AND id=p_job;
 INSERT INTO app.imported_job_baseline(id,tenant_id,job_id,provenance,lineage_strength,baseline_hash,baseline_description,accepted_value_source,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,import_terms_version,attested_by_membership_id,attested_at)
 VALUES(p_baseline,p_tenant,p_job,'imported','builder_attested_weaker',p_hash,p_description,'builder_attestation',p_net,'GBP',p_cap,p_policy,p_terms,p_actor,p_attested) RETURNING * INTO b;
 PERFORM app.lp5_bind_effect(p_command,p_authorization,'import',jsonb_build_object('baselineId',b.id)); RETURN b;
END $$;
REVOKE CREATE ON SCHEMA app FROM jobguard_command_writer;
COMMIT;
