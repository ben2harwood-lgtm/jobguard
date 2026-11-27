-- Q35 / V2-FL-1 (migration 2047). Loaded only by the checked V2 bootstrap, outside the shared migration runner.
-- V2's linked practice firms share one backing tenant, so main's tenant RLS doesn't separate them.
-- Add 2001's restrictive firm rule to the V2 core tables (list from the live catalog, packet Q35).
-- Policies are created only when missing; no grants, other policies or main migrations change.
DO $v2$
DECLARE
  relation regclass;
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT COALESCE(
    (inet_server_port() = 5432 AND current_setting('data_directory') = '/var/lib/postgresql/data/pgdata-v2')
    OR (inet_server_port() = 56432 AND host(inet_server_addr()) = '127.0.0.1'
      AND current_setting('data_directory') LIKE '/%/.jobguard/v2/postgres'), false
  ) THEN
    RAISE EXCEPTION 'V2 migration requires the dedicated local rehearsal database';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm') THEN
    RAISE EXCEPTION 'V2 migration 2047 requires 2001''s job firm policy';
  END IF;

  FOREACH relation IN ARRAY ARRAY[
    'app.customer_credit_note',
    'app.customer_invoice',
    'app.customer_message_source',
    'app.customer_payment',
    'app.customer_payment_reversal',
    'app.job_activation',
    'app.job_activation_terms',
    'app.job_assignment',
    'app.job_commercial_track',
    'app.job_diary_entry',
    'app.job_finding',
    'app.job_import_v3',
    'app.job_party_binding',
    'app.job_party_current',
    'app.job_site_source_receipt',
    'app.job_small_trip_event',
    'app.job_small_trip_observation',
    'app.job_source_original',
    'app.job_work_state_event',
    'app.proposal_review',
    'app.proposal_review_line',
    'app.proposal_review_line_parent',
    'app.proposal_review_question',
    'app.quote_acceptance_sequence',
    'app.quote_version',
    'app.scope_lineage',
    'app.scope_progress',
    'app.v2_work_plan',
    'app.v2_work_plan_edit',
    'app.v2_work_plan_task',
    'app.variation',
    'app.variation_approval',
    'app.variation_rate_observation',
    'app.variation_rejection',
    'app.variation_revision',
    'app.variation_withdrawal'
  ]::regclass[] LOOP
    IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = relation AND polname = 'v2_practice_firm') THEN
      EXECUTE format('CREATE POLICY v2_practice_firm ON %s AS RESTRICTIVE FOR ALL TO jobguard_runtime
        USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(%s.tenant_id,%s.job_id)))',
        relation, relation, relation);
    END IF;
  END LOOP;

  -- Indirect tables reach the job through their named parent, as 2001 does for capture_source.
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.finding_suppression'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.finding_suppression AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.job_finding f WHERE (f.tenant_id,f.id)=(finding_suppression.tenant_id,finding_suppression.finding_id)));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.quote_delivery_event'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.quote_delivery_event AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.quote_send s WHERE (s.tenant_id,s.id)=(quote_delivery_event.tenant_id,quote_delivery_event.quote_send_id)));
  END IF;
  -- A link names two jobs; both must be visible to the firm.
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.job_link'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.job_link AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.job_party_binding b WHERE (b.tenant_id,b.job_id,b.id)=(job_link.tenant_id,job_link.predecessor_job_id,job_link.predecessor_binding_id))
        AND EXISTS (SELECT FROM app.job_party_binding b WHERE (b.tenant_id,b.job_id,b.id)=(job_link.tenant_id,job_link.successor_job_id,job_link.successor_binding_id)));
  END IF;
END
$v2$;
