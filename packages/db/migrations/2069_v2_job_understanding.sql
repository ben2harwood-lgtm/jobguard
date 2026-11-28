-- V2-SQ-G. The stored spoken-job understanding, and the append-only ledger of model-reader calls.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- One row per capture whose proposal was built from Reader A combined with the model reader.
  -- `understanding` is the combined job-understanding.v1; `reader_a` is Reader A's own, for audit and the review's room checks.
  CREATE TABLE IF NOT EXISTS app.v2_job_understanding (
    tenant_id uuid NOT NULL,
    capture_id uuid NOT NULL,
    job_id uuid NOT NULL,
    contract_version text NOT NULL CHECK (contract_version = 'job-understanding.v1'),
    reader_a_version text NOT NULL CHECK (length(reader_a_version) BETWEEN 1 AND 80),
    reader_b_version text NOT NULL CHECK (length(reader_b_version) BETWEEN 1 AND 80),
    prompt_version text NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 80),
    understanding jsonb NOT NULL CHECK (jsonb_typeof(understanding) = 'object'),
    reader_a jsonb NOT NULL CHECK (jsonb_typeof(reader_a) = 'object'),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    PRIMARY KEY (tenant_id, capture_id),
    UNIQUE (tenant_id, job_id),
    FOREIGN KEY (tenant_id, job_id) REFERENCES app.job (tenant_id, id)
  );
  ALTER TABLE app.v2_job_understanding ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_job_understanding FORCE ROW LEVEL SECURITY;
  -- Firm-locked through the job, as 2002: app.job carries the restrictive v2_practice_firm policy.
  DROP POLICY IF EXISTS v2_job_understanding_runtime ON app.v2_job_understanding;
  CREATE POLICY v2_job_understanding_runtime ON app.v2_job_understanding TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_job_understanding.tenant_id, v2_job_understanding.job_id)
    ))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_job_understanding.tenant_id, v2_job_understanding.job_id)
    ));

  -- A model-reader call is two rows: `reserved` before the call (the worst case), `settled` after it (from returned usage).
  -- No job exists at call time, so the lock is on the tenant only. No session digest: practice firms share one tenant
  -- and the digest is a sign-in input. Money is micro-pence (millionths of a penny) so small calls are not rounded away.
  CREATE TABLE IF NOT EXISTS app.v2_ai_call (
    tenant_id uuid NOT NULL,
    call_id uuid NOT NULL,
    phase text NOT NULL CHECK (phase IN ('reserved', 'settled')),
    capture_id uuid NOT NULL,
    operation text NOT NULL CHECK (operation = 'spoken_job_sort.v1'),
    micro_pence bigint NOT NULL CHECK (micro_pence BETWEEN 0 AND 2000000000),
    outcome text CHECK (outcome IN ('ok', 'refused', 'truncated', 'timeout', 'invalid_output', 'wrong_model', 'unavailable')),
    model_id text CHECK (length(model_id) BETWEEN 1 AND 100),
    input_tokens integer CHECK (input_tokens >= 0),
    output_tokens integer CHECK (output_tokens >= 0),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    utc_month date GENERATED ALWAYS AS (date_trunc('month', created_at AT TIME ZONE 'UTC')::date) STORED,
    utc_day date GENERATED ALWAYS AS ((created_at AT TIME ZONE 'UTC')::date) STORED,
    PRIMARY KEY (tenant_id, call_id, phase),
    CHECK ((phase = 'reserved') = (outcome IS NULL)),
    CHECK (phase = 'settled' OR (model_id IS NULL AND input_tokens IS NULL AND output_tokens IS NULL))
  );
  CREATE INDEX IF NOT EXISTS v2_ai_call_month ON app.v2_ai_call (tenant_id, utc_month);
  ALTER TABLE app.v2_ai_call ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_ai_call FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_ai_call_runtime ON app.v2_ai_call;
  CREATE POLICY v2_ai_call_runtime ON app.v2_ai_call TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()));

  -- A settled row needs its reservation, in the same tenant.
  CREATE OR REPLACE FUNCTION app.v2_ai_call_settle_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $guard$
  BEGIN
    IF NEW.phase = 'settled' AND NOT EXISTS (
      SELECT FROM app.v2_ai_call r WHERE (r.tenant_id, r.call_id, r.phase) = (NEW.tenant_id, NEW.call_id, 'reserved')
        AND r.capture_id = NEW.capture_id
    ) THEN
      RAISE EXCEPTION 'AI_CALL_NOT_RESERVED' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
  END
  $guard$;
  REVOKE ALL ON FUNCTION app.v2_ai_call_settle_guard() FROM PUBLIC;
  DROP TRIGGER IF EXISTS v2_ai_call_settle_guard ON app.v2_ai_call;
  CREATE TRIGGER v2_ai_call_settle_guard BEFORE INSERT ON app.v2_ai_call
    FOR EACH ROW EXECUTE FUNCTION app.v2_ai_call_settle_guard();

  REVOKE ALL ON app.v2_job_understanding, app.v2_ai_call
    FROM PUBLIC, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_job_understanding, app.v2_ai_call TO jobguard_runtime;
END
$v2$;
COMMIT;
