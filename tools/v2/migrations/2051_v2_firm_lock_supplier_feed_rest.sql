-- Q39 / V2-FL-5 (RED tenancy). V2-only; no grant, function or main migration changes.
DO $v2$
DECLARE
  relation regclass;
BEGIN
  -- Bootstrap first verifies the exact directory and system ID for this checkout.
  IF current_database() <> 'jobguard_v2_local' OR NOT COALESCE(
    (inet_server_port() = 5432 AND current_setting('data_directory') = '/var/lib/postgresql/data/pgdata-v2')
    OR (inet_server_port() = 56432 AND host(inet_server_addr()) = '127.0.0.1'
      AND current_setting('data_directory') LIKE '/%/.jobguard/v2/postgres'), false
  ) THEN
    RAISE EXCEPTION 'V2 migration requires the dedicated local rehearsal database';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm') THEN
    RAISE EXCEPTION 'V2 migration 2051 requires 2001''s job firm policy';
  END IF;

  FOREACH relation IN ARRAY ARRAY[
    'app.inbox_decision_revision',
    'app.inbox_finding_revision',
    'app.inbox_metric_receipt',
    'app.inbox_outcome_event',
    'app.practice_exposure_schedule',
    'app.practice_feed_account',
    'app.practice_feed_command',
    'app.practice_feed_event',
    'app.practice_feed_job_owner',
    'app.practice_feed_receipt_match',
    'app.practice_supplier_credit_case_binding',
    'app.practice_supplier_credit_review_payment',
    'app.supplier_bill_supersession',
    'app.supplier_credit_consumption',
    'app.supplier_document',
    'app.supplier_document_intake',
    'app.supplier_document_version',
    'app.supplier_fact_proposal',
    'app.supplier_fact_revision',
    'app.supplier_line_match_correction',
    'app.supplier_line_match_snapshot',
    'app.supplier_match_allocation',
    'app.supplier_match_proposal',
    'app.supplier_match_revision',
    'app.sandbox_run',
    'app.simulated_settlement_event',
    'app.synthetic_obligation',
    'app.synthetic_recovery_receipt',
    'app.watchdog_command_identity',
    'app.worm_command',
    'app.worm_synthetic_version'
  ]::regclass[] LOOP
    IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = relation AND polname = 'v2_practice_firm') THEN
      EXECUTE format('CREATE POLICY v2_practice_firm ON %s AS RESTRICTIVE FOR ALL TO jobguard_runtime
        USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(%s.tenant_id,%s.job_id)))',
        relation, relation, relation);
    END IF;
  END LOOP;

  -- Indirect rows follow the full key of their already firm-locked parent.
  -- Northside non-evidence attributions have no job binding: they fail closed.
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.northside_action_attribution'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.northside_action_attribution AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.evidence_object e WHERE (e.tenant_id,e.id)=(northside_action_attribution.tenant_id,northside_action_attribution.evidence_id)) OR EXISTS (SELECT FROM app.evidence_upload u WHERE (u.tenant_id,u.id)=(northside_action_attribution.tenant_id,northside_action_attribution.upload_id)));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.sandbox_adapter_receipt'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.sandbox_adapter_receipt AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.sandbox_run r WHERE (r.tenant_id,r.id)=(sandbox_adapter_receipt.tenant_id,sandbox_adapter_receipt.run_id))
        AND EXISTS (SELECT FROM app.sandbox_work w WHERE (w.tenant_id,w.id)=(sandbox_adapter_receipt.tenant_id,sandbox_adapter_receipt.work_id)));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.sandbox_run_event'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.sandbox_run_event AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.sandbox_run r WHERE (r.tenant_id,r.id)=(sandbox_run_event.tenant_id,sandbox_run_event.run_id)));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.sandbox_work'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.sandbox_work AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.sandbox_run r WHERE (r.tenant_id,r.id)=(sandbox_work.tenant_id,sandbox_work.run_id)));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.watchdog_command_result'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.watchdog_command_result AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.watchdog_command_identity c WHERE (c.tenant_id,c.command_id)=(watchdog_command_result.tenant_id,watchdog_command_result.command_id)));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.worm_attempt'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.worm_attempt AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.worm_command c WHERE (c.tenant_id,c.id)=(worm_attempt.tenant_id,worm_attempt.command_id)));
  END IF;
END
$v2$;
