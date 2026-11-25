-- Q37 / V2-FL-3 (2049): orders, receipts, landing and site firm lock.
-- V2 bootstrap only; no grants, functions or other policies change.
DO $v2$
DECLARE
  routine regprocedure;
  definition text;
  relation regclass;
  demo_literal text := quote_literal('jobguard_synthetic_demo');
  v2_literal text := quote_literal('jobguard_v2_local');
BEGIN
  -- Bootstrap first verifies the exact directory and system ID for this checkout.
  IF current_database() <> 'jobguard_v2_local' OR NOT COALESCE(
    (inet_server_port() = 5432 AND current_setting('data_directory') = '/var/lib/postgresql/data/pgdata-v2')
    OR (inet_server_port() = 56432 AND host(inet_server_addr()) = '127.0.0.1'
      AND current_setting('data_directory') LIKE '/%/.jobguard/v2/postgres'), false
  ) THEN
    RAISE EXCEPTION 'V2 migration requires the dedicated local rehearsal database';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid='app.job'::regclass AND polname='v2_practice_firm') THEN
    RAISE EXCEPTION 'V2 migration 2049 requires 2001''s job firm policy';
  END IF;

  FOREACH relation IN ARRAY ARRAY[
    'app.activation_acceptance_operation_use',
    'app.imported_job_baseline',
    'app.late_source_import',
    'app.material_requirement',
    'app.planned_work_revision',
    'app.property_constraint_fact',
    'app.readiness_decision',
    'app.readiness_snapshot',
    'app.scheduled_readiness_plan',
    'app.scheduled_readiness_proposal',
    'app.site_visit',
    'app.stage_completion',
    'app.commercial_integrity_activity_fact',
    'app.commercial_integrity_value_fact',
    'app.contractor_party_binding',
    'app.contractor_receipt_line_allocation',
    'app.counterparty_check',
    'app.discrepancy_finding_revision',
    'app.discrepancy_review_outcome',
    'app.goods_receipt',
    'app.landing_allocation',
    'app.landing_reversal',
    'app.purchase_order_draft',
    'app.purchase_order_manual_attestation',
    'app.purchase_order_placement',
    'app.purchase_order_revision',
    'app.rate_book_observation',
    'app.receipt_line_allocation',
    'app.work_order',
    'app.work_order_line'
  ]::regclass[] LOOP
    IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid=relation AND polname='v2_practice_firm') THEN
      EXECUTE format('CREATE POLICY v2_practice_firm ON %s AS RESTRICTIVE FOR ALL TO jobguard_runtime
        USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(%s.tenant_id,%s.job_id)))',
        relation, relation, relation);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid='app.stage_review_event'::regclass AND polname='v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.stage_review_event AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.stage_completion p WHERE (p.tenant_id,p.id)=(stage_review_event.tenant_id,stage_review_event.stage_completion_id)));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid='app.import_row_receipt'::regclass AND polname='v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.import_row_receipt AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.work_order p WHERE (p.tenant_id,p.id)=(import_row_receipt.tenant_id,import_row_receipt.work_order_id)));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid='app.work_order_revision'::regclass AND polname='v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.work_order_revision AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.work_order p WHERE (p.tenant_id,p.id)=(work_order_revision.tenant_id,work_order_revision.work_order_id)));
  END IF;
END
$v2$;
