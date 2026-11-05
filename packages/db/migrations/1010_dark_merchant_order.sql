BEGIN;
-- Forward fix: disable the dark application seam and retain immutable facts; never erase attestations.
ALTER TABLE app.watchdog_command_identity DROP CONSTRAINT watchdog_command_identity_command_type_check;
ALTER TABLE app.watchdog_command_identity ADD CONSTRAINT watchdog_command_identity_command_type_check CHECK(command_type IN(
 'readiness.record','readiness.advance','things_to_check.evaluate','things_to_check.review','things_to_check.supersede',
 'supplier_match.create','supplier_match.correct','inbox.seed','inbox.dismiss','purchase_order.revise','purchase_order.place',
 'supplier_document.intake','supplier_document.receipt','supplier_document.confirm','evidence.begin_upload','evidence.finalize','proof.complete',
 'WorkState.finish','WorkState.cancel_finish','WorkState.close','WorkState.reopen','WorkState.link','WorkState.resume',
 'JobSource.diary','JobSource.customer_message','purchase_order.attest_manual'));
-- Existing orders need no backfill. No old migration is changed.
CREATE UNIQUE INDEX purchase_order_revision_draft_identity
  ON app.purchase_order_revision(tenant_id,job_id,draft_id,id);
CREATE TABLE app.purchase_order_manual_attestation (
  id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, draft_id uuid NOT NULL,
  revision_id uuid NOT NULL, merchant_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
  command_id uuid NOT NULL, supplier_reference_hash char(64) NOT NULL CHECK(supplier_reference_hash ~ '^[a-f0-9]{64}$'),
  environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
  attested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,draft_id), UNIQUE(tenant_id,command_id),
  UNIQUE(tenant_id,merchant_id,supplier_reference_hash),
  FOREIGN KEY(tenant_id,job_id,draft_id,revision_id) REFERENCES app.purchase_order_revision(tenant_id,job_id,draft_id,id),
  FOREIGN KEY(tenant_id,merchant_id) REFERENCES app.merchant(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
  FOREIGN KEY(tenant_id,command_id) REFERENCES app.watchdog_command_identity(tenant_id,command_id)
);
ALTER TABLE app.purchase_order_manual_attestation OWNER TO jobguard_migration;
ALTER TABLE app.purchase_order_manual_attestation ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.purchase_order_manual_attestation FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.purchase_order_manual_attestation FOR ALL TO jobguard_runtime
  USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT ON app.purchase_order_manual_attestation TO jobguard_runtime;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.purchase_order_manual_attestation FROM jobguard_runtime;

-- Existing draft writers share this lock with approval and executor claims.
-- Pending work may be superseded (the executor cancels it); an in-flight/unknown
-- or delivered order cannot be edited into a different effect or blindly resent.
CREATE FUNCTION app.guard_dark_order_revision() RETURNS trigger LANGUAGE plpgsql
  SET search_path=pg_catalog,app AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text||':watchdog-command',0));
  IF EXISTS(SELECT 1 FROM app.purchase_order_placement p JOIN app.action_outbox o
    ON(o.tenant_id,o.id)=(p.tenant_id,p.outbox_action_id)
    WHERE p.tenant_id=NEW.tenant_id AND p.draft_id=NEW.draft_id AND o.adapter='fake_merchant_order'
      AND o.status IN('executing','outcome_unknown','succeeded')) THEN
    RAISE EXCEPTION 'ORDER_ALREADY_COMMITTED';
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.guard_dark_order_revision() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_dark_order_revision() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER guard_dark_order_revision BEFORE INSERT ON app.purchase_order_revision
  FOR EACH ROW EXECUTE FUNCTION app.guard_dark_order_revision();

CREATE FUNCTION app.guard_manual_order_effect() RETURNS trigger LANGUAGE plpgsql
  SET search_path=pg_catalog,app AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text||':watchdog-command',0));
  IF TG_TABLE_NAME='purchase_order_placement' THEN
    IF EXISTS(SELECT 1 FROM app.purchase_order_manual_attestation a WHERE a.tenant_id=NEW.tenant_id AND a.draft_id=NEW.draft_id) THEN
      RAISE EXCEPTION 'ORDER_ALREADY_COMMITTED';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM app.purchase_order_placement p WHERE p.tenant_id=NEW.tenant_id AND p.draft_id=NEW.draft_id) THEN
      RAISE EXCEPTION 'ORDER_ALREADY_COMMITTED';
    END IF;
  END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.guard_manual_order_effect() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_manual_order_effect() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER guard_manual_order_effect BEFORE INSERT ON app.purchase_order_placement
  FOR EACH ROW EXECUTE FUNCTION app.guard_manual_order_effect();
CREATE TRIGGER guard_manual_order_effect BEFORE INSERT ON app.purchase_order_manual_attestation
  FOR EACH ROW EXECUTE FUNCTION app.guard_manual_order_effect();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.purchase_order_manual_attestation
  FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.purchase_order_manual_attestation
  FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('purchase_order.attest_manual','command_id');
-- Use main's registry, begin/complete boundary and checked completion audit.
INSERT INTO app.command_type_registry VALUES
 ('purchase_order.send.dark','command.v1','owner','route_before_begin','purchase_order','commercial','fake_merchant_order');

-- Preserve main's latest result adapters, including 0573 supervisor queries; only the dark purchase-order branch differs.
CREATE OR REPLACE FUNCTION app.lp5_command_result(p_command_id uuid,p_outcome jsonb) RETURNS jsonb
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
 effect_table:=CASE adapter WHEN 'invoice' THEN 'customer_invoice' WHEN 'lock_invoice' THEN 'customer_invoice' WHEN 'credit' THEN 'customer_credit_note'
  WHEN 'payment' THEN 'customer_payment' WHEN 'payment_reversal' THEN 'customer_payment_reversal'
  WHEN 'quote_send' THEN 'quote_send' WHEN 'purchase_order' THEN 'purchase_order_placement'
  WHEN 'message' THEN 'recovery_message_approval' WHEN 'client_link' THEN 'extra_client_link' END;
 IF effect_table IS NOT NULL THEN
  EXECUTE format('SELECT count(*) FROM app.%I WHERE tenant_id=$1 AND authorization_id=$2',effect_table)
   INTO effect_count USING t,c.authorization_id;
  IF effect_count>1 THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 END IF;

 CASE adapter
 WHEN 'managed_recovery' THEN
  SELECT jsonb_build_object('version','managed-recovery-state.v1','environment','synthetic_demo',
   'tenantId',e.tenant_id,'jobId',e.job_id,'caseId',e.case_id,'pursuitStartedAt',NULL,
   'election',jsonb_build_object('tenantId',e.tenant_id,'jobId',e.job_id,'caseId',e.case_id,
    'commandId',e.command_id,'actorMembershipId',e.actor_membership_id,
    'electedAt',to_char(e.elected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'termsVersion',e.terms_version,'selection',jsonb_build_object('service',e.service,'points',e.points),
    'bindingHash',encode(sha256(convert_to(replace(jsonb_build_array('managed-recovery-election.v1',
     e.tenant_id,e.job_id,e.case_id,e.command_id,e.actor_membership_id,
     to_char(e.elected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
     e.terms_version,e.service,e.points)::text,', ',','),'UTF8')),'hex'))) INTO value
  FROM app.managed_recovery_election e
  WHERE e.tenant_id=t AND e.case_id=subject::uuid AND e.command_id=p_command_id
   AND e.actor_membership_id=c.actor_membership_id AND e.authorization_id=c.authorization_id
   AND e.xmin::text=pg_current_xact_id()::text AND expected_revision=1
   AND a->>'actionType'='managed_recovery.elect' AND a->>'policyVersion'=e.terms_version
   AND a->>'contentHash'=encode(sha256(convert_to('managed-recovery-election-command.v1'||chr(10)||e.job_id::text||chr(10)||e.case_id::text||chr(10)||e.service||chr(10)||e.points::text||chr(10)||e.terms_version,'UTF8')),'hex');
 WHEN 'site_supervisor_query' THEN
  SELECT jsonb_build_object('version','site-supervisor-query.v1','environment','synthetic_demo','realExternalActions',0,
   'queryId',q.id,'jobId',q.job_id,'orderLineScopeItemId',q.order_line_scope_item_id,'sorCode',q.sor_code,'quantity',q.quantity,
   'orderRevisionId',q.order_revision_id,'operativeMembershipId',q.operative_membership_id,
   'recordedAt',to_char(q.recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) INTO value
  FROM app.site_supervisor_query q WHERE q.tenant_id=t AND q.command_id=p_command_id AND q.job_id=subject::uuid
   AND q.operative_membership_id=c.actor_membership_id AND q.xmin::text=pg_current_xact_id()::text
   AND r.command_type='RecordSiteSupervisorQuery';
 WHEN 'source_intake' THEN
  -- The DTO is handed off only by the private checked source routine. Prove its
  -- exact command, job, actor and freshly registered original before accepting it.
  IF r.command_type='LateSource.import' THEN
   SELECT s.receipt INTO value FROM app.late_source_import s JOIN app.evidence_object e
    ON(e.tenant_id,e.job_id,e.id,e.object_version_id,e.sha256,e.server_received_at)=
      (s.tenant_id,s.job_id,s.evidence_id,s.object_version_id,s.sha256,s.source_received_at)
    WHERE s.tenant_id=t AND s.job_id=subject::uuid AND s.command_id=p_command_id
     AND s.actor_membership_id=c.actor_membership_id AND s.xmin::text=pg_current_xact_id()::text
     AND e.xmin::text=pg_current_xact_id()::text AND s.receipt=c.effect_ref->'result';
   IF value IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
   RETURN value;
  END IF;
  value:=(c.effect_ref->'result');
  IF NOT EXISTS(
   SELECT 1 FROM (
    SELECT tenant_id,job_id,id,command_id,actor_membership_id,evidence_id,object_version_id,sha256,xmin::text transaction_id,'JobSource.diary' command_type FROM app.job_diary_entry
    UNION ALL SELECT tenant_id,job_id,id,command_id,actor_membership_id,evidence_id,object_version_id,sha256,xmin::text,'JobSource.customer_message' FROM app.customer_message_source
   ) source_fact JOIN app.evidence_object evidence ON(evidence.tenant_id,evidence.job_id,evidence.id)=(source_fact.tenant_id,source_fact.job_id,source_fact.evidence_id)
   WHERE source_fact.tenant_id=t AND source_fact.job_id=subject::uuid AND source_fact.command_id=p_command_id
    AND source_fact.command_type=r.command_type AND source_fact.actor_membership_id=c.actor_membership_id
    AND source_fact.transaction_id=pg_current_xact_id()::text AND evidence.xmin::text=pg_current_xact_id()::text
    AND source_fact.id=(value->'record'->>'id')::uuid AND source_fact.evidence_id=(value->'record'->'evidence'->>'id')::uuid
    AND source_fact.object_version_id=(value->'record'->'evidence'->>'objectVersionId') AND source_fact.sha256=(value->'record'->'evidence'->>'sha256')
    AND evidence.object_version_id=source_fact.object_version_id AND evidence.sha256=source_fact.sha256
  ) THEN value:=NULL; END IF;
 WHEN 'lock_invoice' THEN
  -- Preserve the latest combined-invoice body. Bind its exact invoice, approval,
  -- locked revision and immutable fake outbox, including deferred validation.
  SELECT jsonb_build_object('invoiceId',invoice.id,'invoiceNumber',invoice.invoice_number,'pdfSha256',invoice.pdf_sha256,
   'netPence',invoice.net_pence,'taxPence',invoice.tax_pence,'totalPence',invoice.total_pence,'sourceHash',invoice.source_hash,
   'invoiceKind',binding.invoice_kind,'lockId',binding.lock_id) INTO value
  FROM app.customer_invoice invoice JOIN app.final_account_invoice_binding binding
   ON(binding.tenant_id,binding.job_id,binding.invoice_id)=(invoice.tenant_id,invoice.job_id,invoice.id)
  JOIN app.action_authorization grant_row ON(grant_row.tenant_id,grant_row.id)=(invoice.tenant_id,invoice.authorization_id)
  JOIN app.decision_resolution resolution_row ON(resolution_row.tenant_id,resolution_row.id)=(grant_row.tenant_id,grant_row.resolution_id)
  JOIN app.action_outbox outbox_row ON(outbox_row.tenant_id,outbox_row.authorization_id)=(grant_row.tenant_id,grant_row.id)
  WHERE invoice.tenant_id=t AND invoice.job_id=subject::uuid AND invoice.id=(c.effect_ref->>'invoiceId')::uuid AND invoice.authorization_id=c.authorization_id
   AND invoice.xmin::text=pg_current_xact_id()::text AND binding.xmin::text=pg_current_xact_id()::text
   AND invoice.final_account_revision_id=(c.significant_input->'input'->>'revision')::uuid
   AND binding.revision_id=invoice.final_account_revision_id AND binding.invoice_kind=(c.significant_input->'input'->>'kind')
   AND invoice.source_hash=(c.significant_input->'input'->>'sourceHash') AND grant_row.actor_membership_id=c.actor_membership_id
   AND resolution_row.actor_membership_id=c.actor_membership_id AND resolution_row.resolution='approved' AND grant_row.revoked_at IS NULL
   AND grant_row.action_type='final_account.issue' AND grant_row.content_hash=invoice.pdf_sha256
   AND grant_row.recipient=(c.significant_input->'input'->>'recipient') AND grant_row.amount_pence=invoice.total_pence AND grant_row.currency=invoice.currency
   AND outbox_row.adapter='fake_invoice_delivery' AND outbox_row.action_type=grant_row.action_type
   AND outbox_row.content_hash=grant_row.content_hash AND outbox_row.recipient=grant_row.recipient
   AND outbox_row.aggregate_revision=grant_row.aggregate_revision AND outbox_row.amount_pence=grant_row.amount_pence
   AND outbox_row.currency=grant_row.currency AND outbox_row.policy_version=grant_row.policy_version
   AND outbox_row.authorization_expires_at=grant_row.expires_at AND outbox_row.immutable_content=convert_from(invoice.pdf_bytes,'UTF8');
 WHEN 'prevention' THEN value:=app.lp5b_projection_result(p_command_id);
 WHEN 'inbox_seed' THEN value:=app.lp5b_projection_result(p_command_id);
 WHEN 'site_visit' THEN value:=app.lp5b_contractor_result(p_command_id,p_outcome);
 WHEN 'extra_chain' THEN value:=app.lp5b_contractor_result(p_command_id,p_outcome);
 WHEN 'contractor_extra' THEN value:=app.lp5b_contractor_result(p_command_id,p_outcome);
 WHEN 'operational_record' THEN
  SELECT x.result INTO value FROM app.repository_operational_record x WHERE x.tenant_id=t AND x.command_id=p_command_id
   AND x.actor_membership_id=c.actor_membership_id AND x.job_id=subject::uuid AND x.record_kind=(CASE WHEN r.command_type='commercial_integrity.review' THEN 'feedback' ELSE 'demo_checkpoint' END)
   AND x.xmin::text=pg_current_xact_id()::text;
 WHEN 'recovery_message_marker' THEN
  a:=(c.significant_input->'input');
  IF EXISTS(SELECT 1 FROM app.recovery_message m WHERE m.tenant_id=t AND m.command_id=p_command_id
   AND m.actor_membership_id=c.actor_membership_id AND m.case_id=(a->>'caseId')::uuid AND m.job_id=subject::uuid
   AND m.request_hash=encode(sha256(convert_to((c.significant_input->>'legacyJson'),'UTF8')),'hex')
   AND m.xmin::text=pg_current_xact_id()::text AND r.command_type='recovery.message.preview')
   OR EXISTS(SELECT 1 FROM app.recovery_message_event e WHERE e.tenant_id=t AND e.command_id=p_command_id
    AND e.actor_membership_id=c.actor_membership_id AND e.case_id=(a->>'caseId')::uuid AND e.job_id=subject::uuid
    AND e.message_id=(a->>'messageId')::uuid AND e.request_hash=encode(sha256(convert_to((c.significant_input->>'legacyJson'),'UTF8')),'hex')
    AND e.xmin::text=pg_current_xact_id()::text
    AND ((r.command_type='recovery.message.revoke' AND e.kind='revoked')
     OR (r.command_type='recovery.message.advance' AND e.kind IN('started','blocked'))
     OR (r.command_type='recovery.message.reconcile' AND e.kind IN('reconcile_started','outcome_unknown')))) THEN
   value:=jsonb_build_object('recoveryMessageCommand',substr(r.command_type,length('recovery.message.')+1));
  END IF;
 WHEN 'recovery_follow_up_marker' THEN
  a:=(c.significant_input->'input');
  IF EXISTS(SELECT 1 FROM app.recovery_follow_up_event e WHERE e.tenant_id=t AND e.command_id=p_command_id
   AND e.actor_membership_id=c.actor_membership_id AND e.case_id=(a->>'caseId')::uuid AND e.job_id=subject::uuid
   AND e.request_hash=encode(sha256(convert_to((c.significant_input->>'legacyJson'),'UTF8')),'hex')
   AND ((r.command_type='recovery.follow_up.cancel' AND e.id=(c.effect_ref->>'followUpEventId')::uuid)
    OR (r.command_type<>'recovery.follow_up.cancel' AND e.xmin::text=pg_current_xact_id()::text))
   AND ((r.command_type='recovery.follow_up.schedule' AND e.kind='scheduled' AND EXISTS(
    SELECT 1 FROM app.recovery_follow_up f WHERE f.tenant_id=t AND f.id=e.follow_up_id AND f.command_id=p_command_id
     AND f.source_message_id=(a->>'sourceMessageId')::uuid AND f.actor_membership_id=c.actor_membership_id))
    OR (r.command_type='recovery.follow_up.open_review' AND e.kind='reminder_previewed' AND e.follow_up_id=(a->>'followUpId')::uuid)
    OR (r.command_type='recovery.follow_up.cancel' AND e.kind='cancelled' AND e.follow_up_id=(a->>'followUpId')::uuid)))
   OR (r.command_type='recovery.follow_up.advance' AND EXISTS(SELECT 1 FROM app.recovery_follow_up_advance x
    JOIN app.recovery_follow_up f ON(f.tenant_id,f.id)=(x.tenant_id,x.follow_up_id)
    WHERE x.tenant_id=t AND x.command_id=p_command_id AND x.actor_membership_id=c.actor_membership_id
     AND x.follow_up_id=(a->>'followUpId')::uuid AND f.case_id=(a->>'caseId')::uuid AND f.job_id=subject::uuid
     AND x.request_hash=encode(sha256(convert_to((c.significant_input->>'legacyJson'),'UTF8')),'hex')
     AND x.xmin::text=pg_current_xact_id()::text)) THEN
   value:=jsonb_build_object('recoveryFollowUpCommand',substr(r.command_type,length('recovery.follow_up.')+1));
  END IF;
 WHEN 'proof' THEN
  a:=(c.significant_input->'input');
  SELECT jsonb_build_object('completionId',s.id,'evidenceId',e.id,'state','complete','decisionId',
    (CASE WHEN (a->>'deriveDecision')='true' THEN
     (SELECT d.id FROM app.decision d JOIN app.job_finding f ON(f.tenant_id,f.decision_id)=(d.tenant_id,d.id)
      WHERE d.tenant_id=t AND f.job_id=subject::uuid AND f.subject_ref=(a->>'scopeItemId')||':'||(a->>'requiredEvidenceType')
       AND d.action_type='proof.capture' ORDER BY f.created_at DESC,f.id DESC LIMIT 1)
     ELSE (a->>'decisionId')::uuid END)) INTO value
   FROM app.stage_completion s JOIN app.evidence_link l ON(l.tenant_id,l.id)=(s.tenant_id,s.evidence_link_id)
   JOIN app.evidence_object e ON(e.tenant_id,e.id)=(l.tenant_id,l.evidence_id)
   JOIN app.scope_progress p ON(p.tenant_id,p.job_id,p.scope_item_id)=(s.tenant_id,s.job_id,s.scope_item_id)
   WHERE s.tenant_id=t AND s.command_id=p_command_id AND s.job_id=subject::uuid
    AND s.scope_item_id=(a->>'scopeItemId')::uuid AND s.stage=(a->>'stage')
    AND e.id=(a->>'evidenceId')::uuid AND e.job_id=s.job_id AND e.scope_item_id=s.scope_item_id
    AND e.evidence_type=(a->>'requiredEvidenceType') AND e.kind='original' AND p.stage='complete'
    AND s.xmin::text=pg_current_xact_id()::text;
  IF (value->>'decisionId') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.decision d WHERE d.tenant_id=t
   AND d.id=(value->>'decisionId')::uuid AND d.subject_ref=(a->>'scopeItemId')||':'||(a->>'requiredEvidenceType')
   AND d.action_type='proof.capture') THEN RAISE EXCEPTION 'PROOF_NOT_FINAL' USING ERRCODE='23514'; END IF;
 WHEN 'builder_capture' THEN
  SELECT jsonb_build_object('variationId',v.id) INTO value
   FROM app.variation v JOIN app.extra_origin o ON(o.tenant_id,o.job_id,o.variation_id)=(v.tenant_id,v.job_id,v.id)
   WHERE v.tenant_id=t AND v.job_id=subject::uuid AND o.command_id=p_command_id
    AND o.raising_membership_id=c.actor_membership_id AND o.job_track='small_builder'
    AND o.kind=(CASE r.command_type WHEN 'LogBuilderExtra' THEN 'builder_logged' ELSE 'final_review' END)
    AND v.id=(c.significant_input->'input'->'proposal'->>'id')::uuid
    AND v.scope_item_id=(c.significant_input->'input'->'proposal'->>'scopeItemId')::uuid
    AND v.description=(c.significant_input->'input'->'proposal'->>'description')
    AND v.capture_text=(c.significant_input->'input'->'proposal'->>'captureText')
    AND v.job_id=(c.significant_input->'input'->'proposal'->>'jobId')::uuid
    AND v.capture_kind=(c.significant_input->'input'->'proposal'->>'captureKind')
    AND v.existing_scope_item_id IS NOT DISTINCT FROM (c.significant_input->'input'->'proposal'->>'existingScopeItemId')::uuid
    AND v.lineage_parent_scope_item_id IS NOT DISTINCT FROM (c.significant_input->'input'->'proposal'->>'lineageParentScopeItemId')::uuid
    AND o.device_id IS NOT DISTINCT FROM (c.significant_input->'input'->>'deviceId')
    AND o.device_captured_at IS NOT DISTINCT FROM (c.significant_input->'input'->>'deviceCapturedAt')::timestamptz
    AND ((c.significant_input->'input'->'price')='null'::jsonb OR EXISTS(SELECT 1 FROM app.variation_revision vr
     WHERE vr.tenant_id=t AND vr.variation_id=v.id AND vr.confirmed_by_membership_id=c.actor_membership_id
      AND vr.quantity_decimal=(c.significant_input->'input'->'price'->>'quantity')
      AND vr.unit=(c.significant_input->'input'->'price'->>'unit')
      AND vr.unit_rate_pence=(c.significant_input->'input'->'price'->>'unitRatePence')::bigint
      AND vr.content_hash=encode(sha256(convert_to(app.final_lock_canonical(jsonb_build_object(
       'description',v.description,'price',(c.significant_input->'input'->'price'))),'UTF8')),'hex')
      AND vr.xmin::text=pg_current_xact_id()::text))
    AND o.xmin::text=pg_current_xact_id()::text;
 WHEN 'job_parties' THEN
  a:=(c.significant_input->'input'->'input');
  IF (a->>'action') IN('create_customer','revise_customer') THEN
   SELECT jsonb_build_object('id',customer_id,'revisionId',id,'revision',revision) INTO value FROM app.customer_revision
    WHERE tenant_id=t AND id=(p_outcome->>'revisionId')::uuid AND payload=(a->'customer')
     AND revision=(CASE WHEN (a->>'action')='create_customer' THEN 1 ELSE (a->>'expectedRevision')::integer+1 END)
     AND ((a->>'action')='create_customer' OR customer_id=(a->>'customerId')::uuid)
     AND xmin::text=pg_current_xact_id()::text;
  ELSIF (a->>'action')='create_site' THEN
   SELECT jsonb_build_object('id',site_id,'revisionId',id,'reused',(a ? 'reuseSiteId')) INTO value FROM app.site_revision
    WHERE tenant_id=t AND id=(p_outcome->>'revisionId')::uuid
     AND ((NOT(a ? 'reuseSiteId') AND payload=(a->'site') AND xmin::text=pg_current_xact_id()::text)
      OR ((a->>'confirmSamePlace')='true' AND site_id=(a->>'reuseSiteId')::uuid
       AND trim(regexp_replace(upper(normalize(coalesce((payload->>'unit'),''),NFKC)),'\s+',' ','g'))
        =trim(regexp_replace(upper(normalize(coalesce((a->'site'->>'unit'),''),NFKC)),'\s+',' ','g'))
       AND (regexp_replace(upper(payload->>'postcode'),'\s','','g')=regexp_replace(upper(a->'site'->>'postcode'),'\s','','g')
        OR (((a->'site') ? 'uprn') AND match_key->>0='uprn'
         AND match_key->>1=regexp_replace((a->'site'->>'uprn'),'^0+(?=[0-9])','')))
       AND id=(SELECT id FROM app.site_revision WHERE tenant_id=t AND site_id=(a->>'reuseSiteId')::uuid ORDER BY revision DESC LIMIT 1)));
  ELSE
   SELECT jsonb_build_object('id',b.id,'revision',j.revision) INTO value FROM app.job_party_binding b
    JOIN app.job j ON(j.tenant_id,j.id)=(b.tenant_id,b.job_id)
    WHERE b.tenant_id=t AND b.id=(p_outcome->>'id')::uuid AND b.job_id=subject::uuid
     AND b.customer_revision_id=(a->'parties'->>'customerRevisionId')::uuid
     AND b.site_revision_id=(a->'parties'->>'siteRevisionId')::uuid
     AND b.paying_party_revision_id=coalesce((a->'parties'->>'payingPartyRevisionId')::uuid,b.customer_revision_id)
     AND j.revision=(a->>'expectedJobRevision')::integer+1 AND b.xmin::text=pg_current_xact_id()::text;
  END IF;
  IF value IS NOT NULL THEN value:=value||jsonb_build_object('version','job-parties-command-result.v1',
   'environment','synthetic_demo','commandId',p_command_id,'realExternalActions',0); END IF;
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
  IF r.command_type='purchase_order.send.dark' THEN
   -- Dark orders approve the entire merchant artifact, which also binds the
   -- existing immutable revision authority. Never alias a legacy simulation.
   SELECT jsonb_build_object('placementId',p.id,'outboxActionId',p.outbox_action_id,
    'environment','synthetic_demo','realExternalActions',0) INTO value
   FROM app.purchase_order_placement p
   JOIN app.purchase_order_revision v ON(v.tenant_id,v.job_id,v.draft_id,v.id)=(p.tenant_id,p.job_id,p.draft_id,p.revision_id)
   JOIN app.action_outbox o ON(o.tenant_id,o.id,o.authorization_id)=(p.tenant_id,p.outbox_action_id,p.authorization_id)
   WHERE p.tenant_id=t AND p.id=(p_outcome->>'placementId')::uuid AND p.revision_id=subject::uuid
    AND p.command_id=p_command_id AND p.authorization_id=c.authorization_id
    AND p.xmin::text=pg_current_xact_id()::text AND o.xmin::text=pg_current_xact_id()::text
    AND v.revision=expected_revision AND v.order_net_pence=(a->>'amountPence')::bigint
    AND v.recipient=(a->>'recipient') AND o.adapter='fake_merchant_order'
    AND o.action_type='purchase_order.send.dark' AND o.action_type=(a->>'actionType')
    AND o.policy_version='dark-merchant-order.v1' AND o.policy_version=(a->>'policyVersion')
    AND o.content_hash=(a->>'contentHash') AND o.content_hash=encode(sha256(convert_to(o.immutable_content,'UTF8')),'hex')
    AND o.recipient=v.recipient AND o.aggregate_revision=v.revision AND o.amount_pence=v.order_net_pence AND o.currency='GBP'
    AND o.currency=(a->>'currency') AND o.authorization_expires_at=(a->>'expiresAt')::timestamptz
    AND o.provider_effect_key='merchant-order:'||t::text||':'||p.draft_id::text
    AND (c.resource->>'subjectType')='purchase_order'
    AND (o.immutable_content::jsonb)->>'version'='merchant-order.v1'
    AND (o.immutable_content::jsonb)->>'environment'='synthetic_demo'
    AND (o.immutable_content::jsonb)->>'tenantId'=t::text
    AND (o.immutable_content::jsonb)->>'jobId'=p.job_id::text
    AND (o.immutable_content::jsonb)->>'draftId'=p.draft_id::text
    AND (o.immutable_content::jsonb)->>'revisionId'=v.id::text
    AND (o.immutable_content::jsonb)->>'revisionAuthorityHash'=v.authority_hash
    AND ((o.immutable_content::jsonb)->>'revision')::integer=v.revision
    AND (o.immutable_content::jsonb)->>'recipient'=v.recipient
    AND (o.immutable_content::jsonb)->>'deliveryDate'=to_char(v.required_date,'YYYY-MM-DD')
    AND (o.immutable_content::jsonb)->'line'->>'quantity'=v.quantity_decimal
    AND ((o.immutable_content::jsonb)->'line'->>'unitPricePence')::bigint=v.unit_price_pence;
  ELSE
  SELECT jsonb_build_object('placementId',p.id,'outboxActionId',p.outbox_action_id,'reused',p.authorization_id<>c.authorization_id) INTO value
   FROM app.purchase_order_placement p JOIN app.purchase_order_revision v ON(v.tenant_id,v.id)=(p.tenant_id,p.revision_id)
   WHERE p.tenant_id=t AND p.id=(p_outcome->>'placementId')::uuid AND p.revision_id=subject::uuid
    AND v.revision=expected_revision AND v.authority_hash=(a->>'contentHash') AND v.order_net_pence=(a->>'amountPence')::bigint
    AND v.recipient IS NOT DISTINCT FROM (a->>'recipient');
  END IF;
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
 END CASE;
 IF value IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN value;
END $$;
COMMIT;
