-- V2-G8. One polite review request a week after the builder releases the handover (G3), only when the
-- builder switched it on for that job. Never repeated. None while the final invoice is unpaid or a
-- recovery case is open. Practice only: the send reaches the local catcher and nothing else.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) OR to_regclass('app.v2_handover_release_stop') IS NULL THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;

  -- The builder's switch for one job. Insert-only: the newest row is the setting. No row means off.
  CREATE TABLE IF NOT EXISTS app.v2_review_request_switch (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    id uuid NOT NULL,
    enabled boolean NOT NULL,
    command_id uuid NOT NULL,
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, id),
    UNIQUE (tenant_id, command_id),
    FOREIGN KEY (tenant_id, job_id) REFERENCES app.job (tenant_id, id)
  );

  -- The one request. The key is the job, so a second request can never be written.
  CREATE TABLE IF NOT EXISTS app.v2_review_request (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    release_id uuid NOT NULL,
    recipient_email varchar(320) NOT NULL CHECK (btrim(recipient_email) <> ''),
    command_id uuid NOT NULL,
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    actor_membership_id uuid NOT NULL,
    sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id),
    UNIQUE (tenant_id, command_id),
    FOREIGN KEY (tenant_id, job_id, release_id) REFERENCES app.v2_handover_release (tenant_id, job_id, id)
  );
  -- A linked V2 builder's membership lives in the identity tenant, not the practice tenant, so a membership FK
  -- refused every write. As in 2012 and 2071, the actor is the verified v2_work_plan_editor id, unkeyed.
  -- Dropped here too for a local database that already ran the first version of this file.
  ALTER TABLE app.v2_review_request_switch DROP CONSTRAINT IF EXISTS v2_review_request_switch_tenant_id_actor_membership_id_fkey;
  ALTER TABLE app.v2_review_request DROP CONSTRAINT IF EXISTS v2_review_request_tenant_id_actor_membership_id_fkey;

  ALTER TABLE app.v2_review_request_switch ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_review_request_switch FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_review_request ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_review_request FORCE ROW LEVEL SECURITY;
  -- app.job carries the practice-firm policy, so the job EXISTS also confines the firm.
  DROP POLICY IF EXISTS v2_review_request_switch_runtime ON app.v2_review_request_switch;
  CREATE POLICY v2_review_request_switch_runtime ON app.v2_review_request_switch TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_review_request_switch.tenant_id, v2_review_request_switch.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_review_request_switch.tenant_id, v2_review_request_switch.job_id)));
  DROP POLICY IF EXISTS v2_review_request_runtime ON app.v2_review_request;
  CREATE POLICY v2_review_request_runtime ON app.v2_review_request TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_review_request.tenant_id, v2_review_request.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_review_request.tenant_id, v2_review_request.job_id)));
  -- FL: the same restrictive firm lock as every V2 table.
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_review_request_switch;
  CREATE POLICY v2_practice_firm ON app.v2_review_request_switch AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_review_request_switch.tenant_id, v2_review_request_switch.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_review_request_switch.tenant_id, v2_review_request_switch.job_id)));
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_review_request;
  CREATE POLICY v2_practice_firm ON app.v2_review_request AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_review_request.tenant_id, v2_review_request.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_review_request.tenant_id, v2_review_request.job_id)));
  REVOKE ALL ON app.v2_review_request_switch, app.v2_review_request
    FROM PUBLIC, jobguard_runtime, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_review_request_switch, app.v2_review_request TO jobguard_runtime;
  DROP TRIGGER IF EXISTS v2_review_request_switch_immutable ON app.v2_review_request_switch;
  CREATE TRIGGER v2_review_request_switch_immutable BEFORE UPDATE OR DELETE ON app.v2_review_request_switch
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  DROP TRIGGER IF EXISTS v2_review_request_immutable ON app.v2_review_request;
  CREATE TRIGGER v2_review_request_immutable BEFORE UPDATE OR DELETE ON app.v2_review_request
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

  -- Whether the one request may go now, and why not. The screen and the insert guard both read this,
  -- so they never disagree. Runs as the caller: row security decides what it can see.
  -- First matching state wins: off, no_release, recipient_changed, open_dispute, unpaid_invoice, too_soon, due.
  CREATE OR REPLACE FUNCTION app.v2_review_request_due(t uuid, j uuid) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $f$
    WITH switch AS (
      SELECT s.enabled FROM app.v2_review_request_switch s WHERE (s.tenant_id, s.job_id) = (t, j)
      ORDER BY s.recorded_at DESC, s.id DESC LIMIT 1
    ), release AS (
      -- The newest release whose link the builder has not stopped (G4). A corrected re-release restarts the week.
      SELECT r.id, r.recipient_email, r.released_at FROM app.v2_handover_release r WHERE (r.tenant_id, r.job_id) = (t, j)
        AND NOT EXISTS (SELECT FROM app.v2_handover_release_stop x WHERE (x.tenant_id, x.job_id, x.release_id) = (r.tenant_id, r.job_id, r.id))
      ORDER BY r.released_at DESC, r.id DESC LIMIT 1
    ), facts AS (
      SELECT coalesce((SELECT enabled FROM switch), false) AS enabled,
        (SELECT id FROM release) AS release_id, (SELECT recipient_email FROM release) AS recipient,
        (SELECT released_at + interval '7 days' FROM release) AS due_at,
        -- The same address rule as G4's link check: case and surrounding spaces ignored.
        EXISTS (SELECT FROM release r JOIN app.job_party_current x ON (x.tenant_id, x.job_id) = (t, j)
          JOIN app.job_party_binding b ON (b.tenant_id, b.job_id, b.id) = (x.tenant_id, x.job_id, x.binding_id)
          JOIN app.customer_revision cr ON (cr.tenant_id, cr.id) = (b.tenant_id, b.customer_revision_id)
          WHERE lower(btrim(cr.payload->>'email')) = lower(btrim(r.recipient_email))) AS recipient_current,
        -- Open dispute: a recovery case against the customer (book builder_customer) whose current state
        -- (recovery_case_current, 0097: the workbench's events, not the creation snapshot) is still open.
        -- A supplier overcharge case is between the builder and a merchant and does not count.
        EXISTS (SELECT FROM app.recovery_case_current c WHERE (c.tenant_id, c.job_id) = (t, j) AND c.book = 'builder_customer'
          AND c.state IN ('identified', 'active', 'evidence_assembled', 'pursuing', 'negotiating', 'partially_landed')) AS disputed,
        -- Unpaid: any issued invoice whose total, less credit notes, is more than its payments less reversals
        -- (the balance rule of projectInvoiceBalance in @jobguard/core).
        EXISTS (SELECT FROM app.customer_invoice i WHERE (i.tenant_id, i.job_id) = (t, j)
          AND i.total_pence - coalesce((SELECT sum(n.amount_pence) FROM app.customer_credit_note n
              WHERE (n.tenant_id, n.invoice_id) = (i.tenant_id, i.id)), 0)
            > coalesce((SELECT sum(p.amount_pence) FROM app.customer_payment p
              WHERE (p.tenant_id, p.invoice_id) = (i.tenant_id, i.id) AND NOT EXISTS (SELECT FROM app.customer_payment_reversal v
                WHERE (v.tenant_id, v.payment_id) = (p.tenant_id, p.id))), 0)) AS unpaid
    )
    SELECT jsonb_build_object('state', CASE
        WHEN NOT enabled THEN 'off'
        WHEN release_id IS NULL THEN 'no_release'
        WHEN NOT recipient_current THEN 'recipient_changed'
        WHEN disputed THEN 'open_dispute'
        WHEN unpaid THEN 'unpaid_invoice'
        WHEN due_at > clock_timestamp() THEN 'too_soon'
        ELSE 'due' END,
      'enabled', enabled, 'releaseId', release_id, 'recipient', recipient, 'dueAt', due_at)
    FROM facts
  $f$;
  REVOKE ALL ON FUNCTION app.v2_review_request_due(uuid, uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_review_request_due(uuid, uuid) TO jobguard_runtime;

  -- The request is written only when it is due now, for that release and that address.
  -- AFTER INSERT, so row security refuses an outsider's row (42501) first.
  CREATE OR REPLACE FUNCTION app.v2_review_request_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $guard$
  DECLARE due jsonb := app.v2_review_request_due(NEW.tenant_id, NEW.job_id);
  BEGIN
    IF due->>'state' IS DISTINCT FROM 'due' OR due->>'releaseId' IS DISTINCT FROM NEW.release_id::text
      OR due->>'recipient' IS DISTINCT FROM NEW.recipient_email THEN
      RAISE EXCEPTION 'V2_REVIEW_REQUEST_NOT_DUE' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END $guard$;
  DROP TRIGGER IF EXISTS v2_review_request_guard ON app.v2_review_request;
  CREATE TRIGGER v2_review_request_guard AFTER INSERT ON app.v2_review_request
    FOR EACH ROW EXECUTE FUNCTION app.v2_review_request_guard();
END
$v2$;
COMMIT;
