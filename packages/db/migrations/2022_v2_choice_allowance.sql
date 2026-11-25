BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- One version of a customer choice's allowance (an E1 customer-choice fact), never updated.
  -- The row is also E9's intent: it names the draft to withdraw and the draft to propose,
  -- with ids fixed before any variation command runs, so a retry or a read can finish it.
  CREATE TABLE IF NOT EXISTS app.v2_choice_allowance (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    fact_id uuid NOT NULL,
    version integer NOT NULL CHECK (version BETWEEN 1 AND 2147483647),
    command_id uuid NOT NULL,
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    basis text NOT NULL CHECK (basis IN ('per_unit', 'total')),
    allowance_pence bigint NOT NULL CHECK (allowance_pence BETWEEN 0 AND 1000000000000),
    quantity varchar(32) NOT NULL CHECK (quantity ~ '^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$' AND quantity !~ '^0(?:\.0+)?$'),
    unit varchar(40) NOT NULL CHECK (btrim(unit) <> ''),
    decide_by date NOT NULL,
    chosen_item varchar(500) CHECK (chosen_item IS NULL OR btrim(chosen_item) <> ''),
    chosen_pence bigint CHECK (chosen_pence BETWEEN 0 AND 1000000000000),
    -- The prior version's open draft, withdrawn before this version becomes current.
    withdraw_variation_id uuid,
    rejection_id uuid,
    rejection_reason text CHECK (rejection_reason = 'superseded_by_choice_change'),
    -- The draft for this version's excess: a new one, or the prior one carried when the excess is identical.
    draft_kind text CHECK (draft_kind IN ('new', 'carried')),
    proposal_id uuid,
    revision_id uuid,
    excess_rate_pence bigint CHECK (excess_rate_pence BETWEEN 1 AND 1000000000000),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, fact_id, version),
    UNIQUE (tenant_id, job_id, command_id),
    CHECK ((chosen_item IS NULL) = (chosen_pence IS NULL)),
    CHECK (basis = 'per_unit' OR (quantity = '1' AND unit = 'item')),
    CHECK ((withdraw_variation_id IS NULL) = (rejection_id IS NULL)),
    CHECK ((withdraw_variation_id IS NULL) = (rejection_reason IS NULL)),
    CHECK ((draft_kind IS NULL) = (proposal_id IS NULL)),
    CHECK ((proposal_id IS NULL) = (revision_id IS NULL)),
    CHECK ((proposal_id IS NULL) = (excess_rate_pence IS NULL)),
    CHECK (proposal_id IS NULL OR chosen_pence IS NOT NULL),
    CHECK (draft_kind IS DISTINCT FROM 'carried' OR withdraw_variation_id IS NULL),
    FOREIGN KEY (tenant_id, job_id, fact_id)
      REFERENCES app.v2_open_fact (tenant_id, job_id, id)
  );

  -- Append-only steps of a version: 'current' after any withdrawal (outcome says what happened),
  -- then 'proposed' and 'priced' for a new draft. Each step is its own E9 transaction and audit event.
  CREATE TABLE IF NOT EXISTS app.v2_choice_allowance_step (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    fact_id uuid NOT NULL,
    version integer NOT NULL,
    step text NOT NULL CHECK (step IN ('current', 'proposed', 'priced')),
    outcome text CHECK (outcome IN ('withdrawn', 'kept_agreed')),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, fact_id, version, step),
    CHECK (step = 'current' OR outcome IS NULL),
    FOREIGN KEY (tenant_id, job_id, fact_id, version)
      REFERENCES app.v2_choice_allowance (tenant_id, job_id, fact_id, version)
  );

  ALTER TABLE app.v2_choice_allowance ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_choice_allowance FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_choice_allowance_step ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_choice_allowance_step FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS v2_choice_allowance_runtime ON app.v2_choice_allowance;
  CREATE POLICY v2_choice_allowance_runtime ON app.v2_choice_allowance TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_choice_allowance.tenant_id, v2_choice_allowance.job_id)
    ));

  DROP POLICY IF EXISTS v2_choice_allowance_step_runtime ON app.v2_choice_allowance_step;
  CREATE POLICY v2_choice_allowance_step_runtime ON app.v2_choice_allowance_step TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_choice_allowance_step.tenant_id, v2_choice_allowance_step.job_id)
    ));

  REVOKE ALL ON app.v2_choice_allowance, app.v2_choice_allowance_step FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_choice_allowance, app.v2_choice_allowance_step TO jobguard_runtime;
END
$v2$;
COMMIT;
