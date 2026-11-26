BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- One fact a job is still waiting to hear, as the builder logged it by hand.
  -- The four kinds keep their own detail column; none is shared between kinds.
  CREATE TABLE IF NOT EXISTS app.v2_open_fact (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('customer_choice', 'merchant_delivery_date', 'crew_availability', 'access')),
    scope_item_id uuid,
    plan_quote_revision_id uuid,
    plan_task_key text,
    owner_kind text NOT NULL CHECK (owner_kind IN ('customer', 'merchant', 'crew_member', 'builder')),
    owner_name varchar(120) CHECK (owner_name IS NULL OR btrim(owner_name) <> ''),
    needed_by date NOT NULL,
    source text NOT NULL CHECK (source = 'builder_logged'),
    choice_question varchar(500),
    choice_may_change_price boolean,
    delivery_item varchar(500),
    crew_need varchar(500),
    access_need varchar(500),
    PRIMARY KEY (tenant_id, job_id, id),
    CHECK ((owner_kind IN ('merchant', 'crew_member')) = (owner_name IS NOT NULL)),
    CHECK ((plan_task_key IS NULL) = (plan_quote_revision_id IS NULL)),
    CHECK (plan_task_key IS NULL OR scope_item_id IS NOT NULL),
    CHECK ((kind = 'customer_choice') = (choice_question IS NOT NULL AND choice_may_change_price IS NOT NULL)),
    CHECK (kind = 'customer_choice' OR (choice_question IS NULL AND choice_may_change_price IS NULL)),
    CHECK ((kind = 'merchant_delivery_date') = (delivery_item IS NOT NULL)),
    CHECK ((kind = 'crew_availability') = (crew_need IS NOT NULL)),
    CHECK ((kind = 'access') = (access_need IS NOT NULL)),
    FOREIGN KEY (tenant_id, job_id, scope_item_id)
      REFERENCES app.scope_identity (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, job_id, plan_quote_revision_id, scope_item_id, plan_task_key)
      REFERENCES app.v2_work_plan_task (tenant_id, job_id, quote_revision_id, scope_item_id, template_task_key)
  );

  -- Append-only changes to a fact. Version 0 logs it; later versions answer,
  -- cancel or mark it out of date. The highest version is the current status,
  -- and earlier answers stay as history. The request digest lets an exact
  -- retry replay while the same command id with changed content is refused.
  CREATE TABLE IF NOT EXISTS app.v2_open_fact_change (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    fact_id uuid NOT NULL,
    expected_version integer NOT NULL CHECK (expected_version BETWEEN 0 AND 2147483646),
    command_id uuid NOT NULL,
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    action text NOT NULL CHECK (action IN ('log', 'answer', 'cancel', 'mark_out_of_date')),
    status text NOT NULL CHECK (status IN ('open', 'answered', 'cancelled', 'out_of_date')),
    choice_answer varchar(500),
    answer_may_change_price boolean,
    delivery_date date,
    crew_available boolean,
    access_answer varchar(500),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, fact_id, expected_version),
    UNIQUE (tenant_id, job_id, command_id),
    CHECK ((action = 'log') = (expected_version = 0)),
    CHECK (status = CASE action WHEN 'log' THEN 'open' WHEN 'answer' THEN 'answered'
      WHEN 'cancel' THEN 'cancelled' ELSE 'out_of_date' END),
    CHECK (action = 'answer' OR (choice_answer IS NULL AND answer_may_change_price IS NULL
      AND delivery_date IS NULL AND crew_available IS NULL AND access_answer IS NULL)),
    CHECK (action <> 'answer' OR num_nonnulls(choice_answer, delivery_date, crew_available, access_answer) = 1),
    CHECK ((choice_answer IS NULL) = (answer_may_change_price IS NULL)),
    FOREIGN KEY (tenant_id, job_id, fact_id)
      REFERENCES app.v2_open_fact (tenant_id, job_id, id)
  );

  ALTER TABLE app.v2_open_fact ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_open_fact FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_open_fact_change ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_open_fact_change FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS v2_open_fact_runtime ON app.v2_open_fact;
  CREATE POLICY v2_open_fact_runtime ON app.v2_open_fact TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_open_fact.tenant_id, v2_open_fact.job_id)
    ));

  DROP POLICY IF EXISTS v2_open_fact_change_runtime ON app.v2_open_fact_change;
  CREATE POLICY v2_open_fact_change_runtime ON app.v2_open_fact_change TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_open_fact_change.tenant_id, v2_open_fact_change.job_id)
    ));

  REVOKE ALL ON app.v2_open_fact, app.v2_open_fact_change FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_open_fact, app.v2_open_fact_change TO jobguard_runtime;
END
$v2$;
COMMIT;
