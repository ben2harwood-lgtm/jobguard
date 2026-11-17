-- LP-6e RED. Forward-only; preserve all existing v1/v2 history and checkpoints.
-- Requires LP-6d caller enforcement before activation. Recorded definitions updated in its proof.
BEGIN;
ALTER TABLE app.audit_event DROP CONSTRAINT audit_event_version_check;
ALTER TABLE app.audit_event ADD CONSTRAINT audit_event_version_check CHECK(version IN ('audit.v1','audit.v2','audit.v3'));
GRANT EXECUTE ON FUNCTION app.current_actor(),app.current_tenant() TO jobguard_audit_writer;
-- Resolve optional request attribution without weakening expiry/delegation refusals.
-- Existing non-request writers remain system work. A present invalid binding never falls back.
CREATE FUNCTION app.lp6e_audit_context() RETURNS TABLE(actor uuid,tenant uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF app.lp6e_request_binding_present() THEN
  RETURN QUERY SELECT app.current_actor(),app.current_tenant();
 END IF;
END $$;
ALTER FUNCTION app.lp6e_audit_context() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6e_audit_context() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.lp6e_audit_context() TO jobguard_audit_writer;
CREATE OR REPLACE FUNCTION app.lp4_seal_audit(p_events jsonb, p_trust text) RETURNS SETOF app.audit_event
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 e jsonb; payload jsonb; section text; entry record; seq bigint; prev text; ts timestamptz;
 ph text; eh text; stored app.audit_event; bound_actor uuid; bound_tenant uuid; actor_ref text; actor_kind text; queued_system boolean:=p_trust='queued_system';
BEGIN
 IF t IS NULL THEN RAISE EXCEPTION 'AUDIT_CONTEXT_REQUIRED' USING ERRCODE='42501'; END IF;
 -- The protected lookup adds no business lock. Never catch an expired binding
 -- as a system fallback for an application login (including inherited logins).
 IF queued_system THEN
  -- Only the private sealer's checked outbox bridge may request this mode.
  p_trust:='lower_trust';
 ELSE
  SELECT actor,tenant INTO bound_actor,bound_tenant FROM app.lp6e_audit_context();
 END IF;
 IF bound_tenant IS NOT NULL AND bound_tenant IS DISTINCT FROM t THEN
  RAISE EXCEPTION 'AUDIT_CONTEXT_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_trust IS NULL OR p_trust NOT IN ('lower_trust','checked_operation')
  OR jsonb_typeof(p_events) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(p_events)=0 THEN RETURN; END IF;
 -- Validate the WHOLE batch before the head wait. Errors contain no caller input.
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  IF jsonb_typeof(e) IS DISTINCT FROM 'object'
   OR e - ARRAY['id','version','actorRef','eventType','subjectType','subjectRef','payload'] <> '{}'::jsonb
   OR NOT (e ?& ARRAY['id','version','actorRef','eventType','subjectType','subjectRef','payload'])
   OR e->>'version' IS DISTINCT FROM 'audit.v1' THEN
   RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  FOREACH section IN ARRAY ARRAY['id','actorRef','eventType','subjectType','subjectRef'] LOOP
   IF jsonb_typeof(e->section) IS DISTINCT FROM 'string' OR length(e->>section) NOT BETWEEN 1 AND 200
    OR (e->>section) !~ '^[A-Za-z0-9_.:@/-]+$'
    OR (e->>section) ~ '@[^@]*[.]' THEN
    RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF (e->>'id') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
   OR length(e->>'eventType')>100 OR length(e->>'subjectType')>100 THEN
   RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  -- Legacy names stay lower-trust pending LP-6e-LEGACY-WRITERS conversion.
  -- All other authority-bearing names require a checked domain operation.
  IF p_trust='lower_trust' AND (e->>'eventType') NOT IN (
   'command.succeeded',
   'contractor.extra.client_link_issued',
   'contractor.extra.step_approved',
   'contractor.prompt.command',
   'contractor.visit.completed',
   'customer_credit_note.synthetic_approved',
   'customer_invoice.synthetic_issued',
   'customer_payment.recorded',
   'customer_payment.synthetic_recorded',
   'customer_payment.synthetic_reversed',
   'evidence_pack.attachment_approved',
   'outbox.authorization_revoked',
   'outbox.succeeded',
   'proof.completed',
   'quote.acceptance.attested',
   'quote.acceptance_cancelled',
   'recovery.eligibility.approve',
   'recovery.follow_up.reminder_approved',
   'recovery.message.approved',
   'recovery.message.succeeded',
   'recovery.payment_payer.mark_withdrawn',
   'recovery.payment_payer.marked',
   'recovery.terms.approved',
   'sso.oidc.request.issued',
   'sso.oidc.signin.completed',
   'sso.request.issued',
   'sso.signin.completed',
   'synthetic_obligation.simulated_settlement',
   'variation.approved',
   'worm.authorized') AND lower(e->>'eventType') ~
   '(^|[_.:/-])(command|success[a-z]*|succeeded|approv[a-z]*|payment[a-z]*|paid|settle[a-z]*|complet[a-z]*|accept[a-z]*|authoriz[a-z]*|issued|locked)([_.:/-]|$)' THEN
   RAISE EXCEPTION 'AUDIT_CHECKED_OPERATION_REQUIRED' USING ERRCODE='42501'; END IF;
  payload:=e->'payload';
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
   OR payload - ARRAY['references','hashes','classifications'] <> '{}'::jsonb THEN
   RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
  FOREACH section IN ARRAY ARRAY['references','hashes','classifications'] LOOP
   IF payload ? section THEN
    IF jsonb_typeof(payload->section) IS DISTINCT FROM 'object' THEN
     RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
    FOR entry IN SELECT key,value FROM jsonb_each(payload->section) LOOP
     IF length(entry.key) NOT BETWEEN 1 AND 200 OR entry.key !~ '^[A-Za-z0-9_.:@/-]+$'
      OR entry.key IN ('actor','tenant','type','auditActorKind','auditActorRef','auditTrust','tenantId','id','version','actorRef','eventType','subjectType','subjectRef','sequence','occurredAt','previousHash','eventHash')
      OR jsonb_typeof(entry.value) IS DISTINCT FROM 'string'
      OR length(entry.value #>> '{}') NOT BETWEEN 1 AND 200
      OR (entry.value #>> '{}') !~ '^[A-Za-z0-9_.:@/-]+$'
      OR (entry.value #>> '{}') ~ '@[^@]*[.]' THEN
      RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
     IF section='hashes' AND (entry.value #>> '{}') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
     IF section='classifications' AND (entry.value #>> '{}') NOT IN ('operational','commercial','financial','security') THEN
      RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
    END LOOP;
   END IF;
  END LOOP;
 END LOOP;
 INSERT INTO audit_control.audit_head(tenant_id) VALUES(t) ON CONFLICT DO NOTHING;
 SELECT h.sequence,h.event_hash INTO seq,prev FROM audit_control.audit_head h WHERE h.tenant_id=t FOR UPDATE;
 -- A head wait must not extend an authenticated request's lifetime. These
 -- protected lookups read binding state only; the audit head stays the last lock.
 IF bound_tenant IS NOT NULL THEN
  IF app.current_actor() IS DISTINCT FROM bound_actor OR app.current_tenant() IS DISTINCT FROM t THEN
   RAISE EXCEPTION 'AUDIT_CONTEXT_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
  seq:=seq+1;
  ts:=date_trunc('milliseconds',clock_timestamp());
  -- Retain the domain actor_ref for existing integrity checks. Only the separately
  -- sealed auditActorRef authenticates a person; owner/worker claims remain system work.
  actor_kind:=CASE WHEN bound_actor IS NULL THEN 'system' ELSE 'bound_member' END;
  actor_ref:=CASE WHEN bound_actor IS NOT NULL THEN 'membership:'||bound_actor::text
   ELSE 'system:database:'||session_user END;
  payload:=jsonb_set(e->'payload','{references}',coalesce(e->'payload'->'references','{}'::jsonb)||jsonb_build_object('auditTrust',p_trust,'auditActorKind',actor_kind,'auditActorRef',actor_ref));
  ph:=encode(sha256(convert_to(app.final_lock_canonical(payload),'UTF8')),'hex');
  eh:=encode(sha256(convert_to(array_to_string(ARRAY['audit.v3',(e->>'id')::uuid::text,t::text,seq::text,e->>'actorRef',e->>'eventType',
    e->>'subjectType',e->>'subjectRef',to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')],chr(31)),'UTF8')),'hex');
  INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
   VALUES((e->>'id')::uuid,t,seq,'audit.v3',e->>'actorRef',e->>'eventType',e->>'subjectType',e->>'subjectRef',ts,payload,ph,prev,eh)
   RETURNING * INTO stored;
  RETURN NEXT stored;
  prev:=eh;
 END LOOP;
 UPDATE audit_control.audit_head SET sequence=seq,event_hash=prev WHERE tenant_id=t;
END $$;
CREATE OR REPLACE FUNCTION app.lp5_check_command_completion() RETURNS trigger
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
   AND e.version IN ('audit.v2','audit.v3') AND e.event_type='command.succeeded' AND e.actor_ref='membership:'||r.actor_membership_id::text
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

-- Binding presence is supplied by prerequisite 0754; never recreate or regrant it here.

-- A worker has no request session. This narrow bridge records only lower-trust
-- outbox statements matching the tenant's stored state; it grants no delivery authority.
CREATE FUNCTION app.lp6e_append_outbox_audit(p_event jsonb) RETURNS SETOF app.audit_event
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; expected_type text;
BEGIN
 IF app.lp6d_request_bound() OR app.lp6e_request_binding_present() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
 SELECT CASE WHEN p_event->>'eventType'='outbox.authorization_revoked' AND o.status='cancelled'
   THEN 'outbox.authorization_revoked' ELSE 'outbox.'||o.status END,o.tenant_id INTO expected_type,t
 FROM app.action_outbox o WHERE o.tenant_id=t AND o.id=(p_event->>'subjectRef')::uuid;
 IF expected_type IS NULL OR p_event->>'subjectType' IS DISTINCT FROM 'outbox_action'
  OR p_event->>'eventType' IS DISTINCT FROM expected_type
  OR expected_type NOT IN ('outbox.succeeded','outbox.outcome_unknown','outbox.cancelled',
    'outbox.retryable','outbox.dead_letter','outbox.authorization_revoked') THEN
  RAISE EXCEPTION 'AUDIT_INPUT_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 RETURN QUERY SELECT * FROM app.lp4_seal_audit(jsonb_build_array(p_event),'queued_system');
END $$;
ALTER FUNCTION app.lp6e_append_outbox_audit(jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6e_append_outbox_audit(jsonb) FROM PUBLIC,jobguard_identity,jobguard_infrastructure,jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.lp6e_append_outbox_audit(jsonb) TO jobguard_runtime;

-- Version-only proof compatibility; keep checks and replay predicates intact.
CREATE OR REPLACE FUNCTION app.validate_job_proof_receipt(t uuid,cid uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp SET timezone='UTC' AS $$
DECLARE r app.command_receipt; s app.job_proof_statement; j uuid; expected jsonb; request jsonb;
BEGIN
 SELECT * INTO r FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 j:=(r.result->>'jobId')::uuid;
 SELECT * INTO s FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j AND id=(r.result->'statement'->>'id')::uuid;
 expected:=jsonb_build_object('version','practice-proof-statement-result.v1','jobId',j,'statement',jsonb_build_object('id',s.id,'includesElectricalWork',s.includes_electrical_work,'membershipId',s.membership_id,'recordedAt',s.recorded_at));
 request:=jsonb_build_object('version','practice-proof-command.v1','action','answer_statement','commandId',cid,'includesElectricalWork',s.includes_electrical_work);
 IF s.id IS NULL OR r.command_type IS DISTINCT FROM 'proof.statement' OR r.status IS DISTINCT FROM 'succeeded'
  OR NOT EXISTS(SELECT 1 FROM app.watchdog_command_identity i WHERE i.tenant_id=t AND i.command_id=cid AND i.job_id=j AND i.command_type='proof.statement' AND i.request_hash=r.request_hash)
  OR r.result IS DISTINCT FROM expected OR r.semantic_key IS DISTINCT FROM 'proof-statement:'||j::text||':'||cid::text
  OR r.request_hash IS DISTINCT FROM app.final_lock_hash(jsonb_build_object('jobId',j,'actorId',r.actor_membership_id,'command',request))
  OR NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.event_type='proof.statement_recorded'
   AND e.version IN ('audit.v2','audit.v3') AND e.payload->'references'->>'auditTrust'='checked_operation'
   AND e.actor_ref='membership:'||r.actor_membership_id::text AND e.subject_type='job' AND e.subject_ref=j::text
   AND e.payload->'references'->>'statementId'=s.id::text AND e.payload->'references'->>'commandId'=cid::text
   AND e.payload->'hashes'->>'requestHash'=r.request_hash)
 THEN RAISE EXCEPTION 'PROOF_STATEMENT_RECEIPT_INVALID' USING ERRCODE='23514'; END IF;
END $$;

-- Version-only proof compatibility; keep checks and replay predicates intact.
CREATE OR REPLACE FUNCTION app.retire_replaced_job_proof_findings(j uuid,c uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; a uuid; sid uuid; anchor uuid; f record; receipt app.command_receipt;
BEGIN
 PERFORM app.job_proof_authority(j,true); a:=app.current_actor();
 SELECT * INTO receipt FROM app.command_receipt WHERE tenant_id=t AND command_id=c;
 IF receipt.command_type IS DISTINCT FROM 'finding.evaluate' OR receipt.status IS DISTINCT FROM 'processing'
  OR receipt.actor_membership_id IS DISTINCT FROM a OR receipt.created_at IS DISTINCT FROM transaction_timestamp()
  OR receipt.semantic_key IS DISTINCT FROM 'finding-evaluate:'||j::text||':'||c::text
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT id INTO sid FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j ORDER BY revision DESC LIMIT 1;
 IF NOT EXISTS(SELECT 1 FROM app.job_proof_statement WHERE tenant_id=t AND id=sid AND includes_electrical_work=false) THEN RETURN; END IF;
 SELECT id INTO anchor FROM app.scope_identity WHERE tenant_id=t AND job_id=j AND state='confirmed' ORDER BY created_at,id LIMIT 1;
 FOR f IN SELECT id FROM app.job_finding WHERE tenant_id=t AND job_id=j AND kind='required_proof' AND subject_ref=anchor::text||':electrical_certificate' LOOP
  IF NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.event_type='proof.requirement_replaced'
   AND e.version IN ('audit.v2','audit.v3') AND e.payload->'references'->>'auditTrust'='checked_operation'
   AND e.payload->'references'->>'statementId'=sid::text AND e.payload->'references'->>'findingId'=f.id::text) THEN
   PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1','actorRef','membership:'||a::text,
    'eventType','proof.requirement_replaced','subjectType','job','subjectRef',j::text,
    'payload',jsonb_build_object('references',jsonb_build_object('statementId',sid,'findingId',f.id,'commandId',c)))),'checked_operation');
  END IF;
 END LOOP;
END $$;

-- Version-only proof compatibility; keep checks and replay predicates intact.
CREATE OR REPLACE FUNCTION app.retired_job_proof_findings(j uuid) RETURNS SETOF uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; sid uuid;
BEGIN
 PERFORM app.job_proof_authority(j,false);
 SELECT id INTO sid FROM app.job_proof_statement WHERE tenant_id=t AND job_id=j ORDER BY revision DESC LIMIT 1;
 RETURN QUERY SELECT f.id FROM app.job_finding f WHERE f.tenant_id=t AND f.job_id=j
  AND EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=t AND e.subject_type='job' AND e.subject_ref=j::text
   AND e.event_type='proof.requirement_replaced' AND e.version IN ('audit.v2','audit.v3') AND e.payload->'references'->>'auditTrust'='checked_operation'
   AND e.payload->'references'->>'statementId'=sid::text AND e.payload->'references'->>'findingId'=f.id::text);
END $$;
COMMIT;
