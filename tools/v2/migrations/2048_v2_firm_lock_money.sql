-- Loaded only by the checked V2 bootstrap, outside the shared migration runner.
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
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm') THEN
    RAISE EXCEPTION 'V2 migration 2048 requires 2001''s job firm policy';
  END IF;

  FOREACH relation IN ARRAY ARRAY[
    'app.billing_allocation_run',
    'app.billing_application_event',
    'app.billing_export_batch',
    'app.billing_export_delivery',
    'app.billing_export_line',
    'app.billing_fact',
    'app.billing_line_match',
    'app.billing_quarantine',
    'app.billing_status_import',
    'app.cap_snapshot',
    'app.closeout_answer',
    'app.extra_approval_outcome',
    'app.extra_approval_request',
    'app.extra_approval_revision_binding',
    'app.extra_approval_step_fact',
    'app.extra_client_link',
    'app.extra_duplicate_link',
    'app.extra_escalation_fact',
    'app.extra_event',
    'app.extra_order_line_link',
    'app.extra_origin',
    'app.extra_pack_artifact',
    'app.extra_pricing_basis',
    'app.extra_sor_revision',
    'app.fee_illustration_source',
    'app.final_account_draft',
    'app.final_account_invoice_binding',
    'app.final_account_invoiced_line',
    'app.final_account_line',
    'app.final_account_lock',
    'app.final_account_lock_check',
    'app.final_account_revision',
    'app.final_account_scope_disposition'
  ]::regclass[] LOOP
    IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = relation AND polname = 'v2_practice_firm') THEN
      EXECUTE format('CREATE POLICY v2_practice_firm ON %s AS RESTRICTIVE FOR ALL TO jobguard_runtime
        USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(%s.tenant_id,%s.job_id)))',
        relation, relation, relation);
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.extra_client_link_closure'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.extra_client_link_closure AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.extra_client_link l WHERE (l.tenant_id,l.id)=(extra_client_link_closure.tenant_id,extra_client_link_closure.link_id)));
  END IF;
END
$v2$;
