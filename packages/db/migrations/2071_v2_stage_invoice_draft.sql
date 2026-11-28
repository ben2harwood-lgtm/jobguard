BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) OR to_regclass('app.v2_payment_stage_due') IS NULL THEN RETURN; END IF;
  SET LOCAL ROLE jobguard_migration;
  -- K5B-1: a draft of a deposit or stage invoice, bound to the stage's frozen row. A V2 record only: never an
  -- invoice, never numbered, posted or sent. The FK means no draft exists without a frozen stage.
  CREATE TABLE IF NOT EXISTS app.v2_stage_invoice_draft (
    tenant_id uuid NOT NULL, job_id uuid NOT NULL, quote_revision_id uuid NOT NULL,
    stage_index integer NOT NULL, draft_no integer NOT NULL CHECK (draft_no BETWEEN 1 AND 1000),
    command_id uuid NOT NULL, amount_pence bigint NOT NULL, counted_approval_ids uuid[] NOT NULL,
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, quote_revision_id, stage_index, draft_no),
    UNIQUE (tenant_id, command_id),
    FOREIGN KEY (tenant_id, job_id, quote_revision_id, stage_index)
      REFERENCES app.v2_payment_stage_due (tenant_id, job_id, quote_revision_id, stage_index)
  );
  CREATE TABLE IF NOT EXISTS app.v2_stage_invoice_draft_withdrawal (
    tenant_id uuid NOT NULL, job_id uuid NOT NULL, quote_revision_id uuid NOT NULL,
    stage_index integer NOT NULL, draft_no integer NOT NULL,
    command_id uuid NOT NULL, reason varchar(200) NOT NULL CHECK (btrim(reason) <> ''),
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, quote_revision_id, stage_index, draft_no),
    UNIQUE (tenant_id, command_id),
    FOREIGN KEY (tenant_id, job_id, quote_revision_id, stage_index, draft_no)
      REFERENCES app.v2_stage_invoice_draft (tenant_id, job_id, quote_revision_id, stage_index, draft_no)
  );
  -- A linked V2 builder's membership lives in the identity tenant, not the practice tenant, so a membership FK
  -- refused every draft. Like 2012's schedule rows, the actor is the verified v2_work_plan_editor id, unkeyed.
  -- Dropped here too for a local database that already ran the first version of this file.
  ALTER TABLE app.v2_stage_invoice_draft DROP CONSTRAINT IF EXISTS v2_stage_invoice_draft_tenant_id_actor_membership_id_fkey;
  ALTER TABLE app.v2_stage_invoice_draft_withdrawal DROP CONSTRAINT IF EXISTS v2_stage_invoice_draft_withdr_tenant_id_actor_membership_i_fkey;

  -- The copied amount and counted ids equal the frozen row; draft numbers run 1, 2, … and a new
  -- draft waits until every earlier draft of the stage is withdrawn.
  CREATE OR REPLACE FUNCTION app.v2_stage_invoice_draft_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $guard$
  BEGIN
    IF NOT EXISTS (SELECT FROM app.v2_payment_stage_due d
      WHERE (d.tenant_id, d.job_id, d.quote_revision_id, d.stage_index, d.amount_pence, d.counted_approval_ids)
        = (NEW.tenant_id, NEW.job_id, NEW.quote_revision_id, NEW.stage_index, NEW.amount_pence, NEW.counted_approval_ids)) THEN
      RAISE EXCEPTION 'V2_STAGE_DRAFT_NOT_FROZEN_AMOUNT' USING ERRCODE = '23514';
    END IF;
    IF NEW.draft_no <> 1 + (SELECT count(*) FROM app.v2_stage_invoice_draft x
        WHERE (x.tenant_id, x.job_id, x.quote_revision_id, x.stage_index) = (NEW.tenant_id, NEW.job_id, NEW.quote_revision_id, NEW.stage_index)
          AND x.draft_no <> NEW.draft_no) THEN
      RAISE EXCEPTION 'V2_STAGE_DRAFT_NUMBER' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT FROM app.v2_stage_invoice_draft x
        WHERE (x.tenant_id, x.job_id, x.quote_revision_id, x.stage_index) = (NEW.tenant_id, NEW.job_id, NEW.quote_revision_id, NEW.stage_index)
          AND x.draft_no <> NEW.draft_no AND NOT EXISTS (SELECT FROM app.v2_stage_invoice_draft_withdrawal w
            WHERE (w.tenant_id, w.job_id, w.quote_revision_id, w.stage_index, w.draft_no)
              = (x.tenant_id, x.job_id, x.quote_revision_id, x.stage_index, x.draft_no))) THEN
      RAISE EXCEPTION 'V2_STAGE_DRAFT_LIVE' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END $guard$;
  DROP TRIGGER IF EXISTS v2_stage_invoice_draft_guard ON app.v2_stage_invoice_draft;
  CREATE TRIGGER v2_stage_invoice_draft_guard AFTER INSERT ON app.v2_stage_invoice_draft
    FOR EACH ROW EXECUTE FUNCTION app.v2_stage_invoice_draft_guard();

  ALTER TABLE app.v2_stage_invoice_draft ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_stage_invoice_draft FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_stage_invoice_draft_withdrawal ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_stage_invoice_draft_withdrawal FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_stage_invoice_draft_runtime ON app.v2_stage_invoice_draft;
  CREATE POLICY v2_stage_invoice_draft_runtime ON app.v2_stage_invoice_draft TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_stage_invoice_draft.tenant_id, v2_stage_invoice_draft.job_id)
    ));
  DROP POLICY IF EXISTS v2_stage_invoice_draft_withdrawal_runtime ON app.v2_stage_invoice_draft_withdrawal;
  CREATE POLICY v2_stage_invoice_draft_withdrawal_runtime ON app.v2_stage_invoice_draft_withdrawal TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_stage_invoice_draft_withdrawal.tenant_id, v2_stage_invoice_draft_withdrawal.job_id)
    ));
  -- FL: the standard firm lock, joining the job on (tenant_id, job_id) (Q83, as FL-6 did for V2 tables).
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_stage_invoice_draft;
  CREATE POLICY v2_practice_firm ON app.v2_stage_invoice_draft AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_stage_invoice_draft.tenant_id, v2_stage_invoice_draft.job_id)));
  -- FL: the standard firm lock, joining the job on (tenant_id, job_id) (Q83, as FL-6 did for V2 tables).
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_stage_invoice_draft_withdrawal;
  CREATE POLICY v2_practice_firm ON app.v2_stage_invoice_draft_withdrawal AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_stage_invoice_draft_withdrawal.tenant_id, v2_stage_invoice_draft_withdrawal.job_id)));
  REVOKE ALL ON app.v2_stage_invoice_draft, app.v2_stage_invoice_draft_withdrawal FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_stage_invoice_draft, app.v2_stage_invoice_draft_withdrawal TO jobguard_runtime;
  DROP TRIGGER IF EXISTS v2_stage_invoice_draft_immutable ON app.v2_stage_invoice_draft;
  CREATE TRIGGER v2_stage_invoice_draft_immutable BEFORE UPDATE OR DELETE ON app.v2_stage_invoice_draft
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  DROP TRIGGER IF EXISTS v2_stage_invoice_draft_withdrawal_immutable ON app.v2_stage_invoice_draft_withdrawal;
  CREATE TRIGGER v2_stage_invoice_draft_withdrawal_immutable BEFORE UPDATE OR DELETE ON app.v2_stage_invoice_draft_withdrawal
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
END
$v2$;
COMMIT;
