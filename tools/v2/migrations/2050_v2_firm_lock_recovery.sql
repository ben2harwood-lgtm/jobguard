-- Q38 / V2-FL-4. V2 bootstrap only; no main migrations, grants or other policies change.
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
    RAISE EXCEPTION 'V2 migration 2050 requires 2001''s job firm policy';
  END IF;

  FOREACH relation IN ARRAY ARRAY[
    'app.managed_recovery_election',
    'app.managed_recovery_pursuit',
    'app.recovery_allocation_command',
    'app.recovery_allocation_line_source',
    'app.recovery_allocation_review',
    'app.recovery_approval',
    'app.recovery_attribution_command',
    'app.recovery_attribution_reassessment',
    'app.recovery_attribution_revision',
    'app.recovery_case',
    'app.recovery_case_allocation',
    'app.recovery_case_allocation_reversal',
    'app.recovery_case_event',
    'app.recovery_case_terms_approval',
    'app.recovery_claim_line',
    'app.recovery_claim_revision',
    'app.recovery_demo_selection',
    'app.recovery_eligibility_revision',
    'app.recovery_eligibility_v3_review',
    'app.recovery_fee_derivation',
    'app.recovery_fee_journal',
    'app.recovery_follow_up',
    'app.recovery_follow_up_due',
    'app.recovery_follow_up_event',
    'app.recovery_follow_up_reminder',
    'app.recovery_message',
    'app.recovery_message_approval',
    'app.recovery_message_event',
    'app.recovery_message_sink',
    'app.recovery_payment_payer_mark',
    'app.recovery_review',
    'app.recovery_timeline_run'
  ]::regclass[] LOOP
    IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = relation AND polname = 'v2_practice_firm') THEN
      EXECUTE format('CREATE POLICY v2_practice_firm ON %s AS RESTRICTIVE FOR ALL TO jobguard_runtime
        USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(%s.tenant_id,%s.job_id)))',
        relation, relation, relation);
    END IF;
  END LOOP;

  -- The follow-up's full foreign key also binds the run; no independent run visibility can widen it.
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.recovery_follow_up_advance'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.recovery_follow_up_advance AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.recovery_follow_up f WHERE (f.tenant_id,f.id,f.run_id)=
        (recovery_follow_up_advance.tenant_id,recovery_follow_up_advance.follow_up_id,recovery_follow_up_advance.run_id)));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.recovery_follow_up_owner'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.recovery_follow_up_owner AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.recovery_follow_up f WHERE (f.tenant_id,f.id,f.run_id)=
        (recovery_follow_up_owner.tenant_id,recovery_follow_up_owner.follow_up_id,recovery_follow_up_owner.run_id)));
  END IF;
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.recovery_timeline_signal'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.recovery_timeline_signal AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.recovery_timeline_run r WHERE (r.tenant_id,r.follow_up_id)=
        (recovery_timeline_signal.tenant_id,recovery_timeline_signal.follow_up_id)));
  END IF;
END
$v2$;
