-- V2-G9. After the handover release (G3), one offer of a check-up visit at 6 months and one at 12 months,
-- only when the builder switched aftercare on for that job. Each offer is sent once. A run that first
-- happens after the 12-month point sends only the 12-month offer: the 6-month one is too late.
-- The months count from the first handover release, so a corrected re-release does not move them.
-- No offer goes while a recovery case is open or an invoice is unpaid, the same hold as G8.
-- Practice only: the send reaches the local catcher and nothing else.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) OR to_regclass('app.v2_handover_release_stop') IS NULL THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;

  -- The builder's aftercare switch for one job. Insert-only: the newest row is the setting. No row means off.
  CREATE TABLE IF NOT EXISTS app.v2_aftercare_switch (
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

  -- One row per offer. The key includes the month, so each offer can be written once only.
  CREATE TABLE IF NOT EXISTS app.v2_aftercare_offer (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    at_months smallint NOT NULL CHECK (at_months IN (6, 12)),
    release_id uuid NOT NULL,
    recipient_email varchar(320) NOT NULL CHECK (btrim(recipient_email) <> ''),
    command_id uuid NOT NULL,
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    actor_membership_id uuid NOT NULL,
    sent_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, at_months),
    UNIQUE (tenant_id, command_id),
    FOREIGN KEY (tenant_id, job_id, release_id) REFERENCES app.v2_handover_release (tenant_id, job_id, id)
  );
  -- A linked V2 builder's membership lives in the identity tenant, not the practice tenant, so a membership FK
  -- refused every write. As in 2012 and 2071, the actor is the verified v2_work_plan_editor id, unkeyed.
  -- Dropped here too for a local database that already ran the first version of this file.
  ALTER TABLE app.v2_aftercare_switch DROP CONSTRAINT IF EXISTS v2_aftercare_switch_tenant_id_actor_membership_id_fkey;
  ALTER TABLE app.v2_aftercare_offer DROP CONSTRAINT IF EXISTS v2_aftercare_offer_tenant_id_actor_membership_id_fkey;

  ALTER TABLE app.v2_aftercare_switch ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_aftercare_switch FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_aftercare_offer ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_aftercare_offer FORCE ROW LEVEL SECURITY;
  -- app.job carries the practice-firm policy, so the job EXISTS also confines the firm.
  DROP POLICY IF EXISTS v2_aftercare_switch_runtime ON app.v2_aftercare_switch;
  CREATE POLICY v2_aftercare_switch_runtime ON app.v2_aftercare_switch TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_aftercare_switch.tenant_id, v2_aftercare_switch.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_aftercare_switch.tenant_id, v2_aftercare_switch.job_id)));
  DROP POLICY IF EXISTS v2_aftercare_offer_runtime ON app.v2_aftercare_offer;
  CREATE POLICY v2_aftercare_offer_runtime ON app.v2_aftercare_offer TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_aftercare_offer.tenant_id, v2_aftercare_offer.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_aftercare_offer.tenant_id, v2_aftercare_offer.job_id)));
  -- FL: the same restrictive firm lock as every V2 table.
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_aftercare_switch;
  CREATE POLICY v2_practice_firm ON app.v2_aftercare_switch AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_aftercare_switch.tenant_id, v2_aftercare_switch.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_aftercare_switch.tenant_id, v2_aftercare_switch.job_id)));
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_aftercare_offer;
  CREATE POLICY v2_practice_firm ON app.v2_aftercare_offer AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_aftercare_offer.tenant_id, v2_aftercare_offer.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_aftercare_offer.tenant_id, v2_aftercare_offer.job_id)));
  REVOKE ALL ON app.v2_aftercare_switch, app.v2_aftercare_offer
    FROM PUBLIC, jobguard_runtime, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_aftercare_switch, app.v2_aftercare_offer TO jobguard_runtime;
  DROP TRIGGER IF EXISTS v2_aftercare_switch_immutable ON app.v2_aftercare_switch;
  CREATE TRIGGER v2_aftercare_switch_immutable BEFORE UPDATE OR DELETE ON app.v2_aftercare_switch
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  DROP TRIGGER IF EXISTS v2_aftercare_offer_immutable ON app.v2_aftercare_offer;
  CREATE TRIGGER v2_aftercare_offer_immutable BEFORE UPDATE OR DELETE ON app.v2_aftercare_offer
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

  -- Which offer may go now, and why not. The screen and the insert guard both read this, so they never
  -- disagree. Runs as the caller: row security decides what it can see.
  -- First matching state wins: off, no_release, recipient_changed, done (both offers sent or the
  -- 12-month one sent), open_dispute, unpaid_invoice (G8's hold), too_soon (next offer's date in nextAt),
  -- due (months says which offer). A hold that runs past 12 months skips the 6-month offer.
  -- ignoring: the insert guard passes the new row's month, so the row being checked does not count as sent.
  CREATE OR REPLACE FUNCTION app.v2_aftercare_due(t uuid, j uuid, ignoring smallint DEFAULT NULL) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $f$
    WITH switch AS (
      SELECT s.enabled FROM app.v2_aftercare_switch s WHERE (s.tenant_id, s.job_id) = (t, j)
      ORDER BY s.recorded_at DESC, s.id DESC LIMIT 1
    ), release AS (
      -- The newest release whose link the builder has not stopped (G4), as G8 reads it.
      SELECT r.id, r.recipient_email, r.released_at FROM app.v2_handover_release r WHERE (r.tenant_id, r.job_id) = (t, j)
        AND NOT EXISTS (SELECT FROM app.v2_handover_release_stop x WHERE (x.tenant_id, x.job_id, x.release_id) = (r.tenant_id, r.job_id, r.id))
      ORDER BY r.released_at DESC, r.id DESC LIMIT 1
    ), first_release AS (
      -- The clocks start at the first release, stopped or not, so "N months since we finished" stays true.
      SELECT min(r.released_at) AS released_at FROM app.v2_handover_release r WHERE (r.tenant_id, r.job_id) = (t, j)
    ), facts AS (
      SELECT coalesce((SELECT enabled FROM switch), false) AS enabled,
        (SELECT id FROM release) AS release_id, (SELECT recipient_email FROM release) AS recipient,
        (SELECT released_at + interval '6 months' FROM first_release) AS six_at,
        (SELECT released_at + interval '12 months' FROM first_release) AS twelve_at,
        EXISTS (SELECT FROM app.v2_aftercare_offer o WHERE (o.tenant_id, o.job_id, o.at_months) = (t, j, 6)
          AND ignoring IS DISTINCT FROM 6) AS six_sent,
        EXISTS (SELECT FROM app.v2_aftercare_offer o WHERE (o.tenant_id, o.job_id, o.at_months) = (t, j, 12)
          AND ignoring IS DISTINCT FROM 12) AS twelve_sent,
        -- The same address rule as G4's link check: case and surrounding spaces ignored.
        EXISTS (SELECT FROM release r JOIN app.job_party_current x ON (x.tenant_id, x.job_id) = (t, j)
          JOIN app.job_party_binding b ON (b.tenant_id, b.job_id, b.id) = (x.tenant_id, x.job_id, x.binding_id)
          JOIN app.customer_revision cr ON (cr.tenant_id, cr.id) = (b.tenant_id, b.customer_revision_id)
          WHERE lower(btrim(cr.payload->>'email')) = lower(btrim(r.recipient_email))) AS recipient_current,
        -- G8's hold, word for word (2085): an open recovery case against the customer, or any issued invoice
        -- whose total less credit notes is more than its payments less reversals.
        EXISTS (SELECT FROM app.recovery_case_current c WHERE (c.tenant_id, c.job_id) = (t, j) AND c.book = 'builder_customer'
          AND c.state IN ('identified', 'active', 'evidence_assembled', 'pursuing', 'negotiating', 'partially_landed')) AS disputed,
        EXISTS (SELECT FROM app.customer_invoice i WHERE (i.tenant_id, i.job_id) = (t, j)
          AND i.total_pence - coalesce((SELECT sum(n.amount_pence) FROM app.customer_credit_note n
              WHERE (n.tenant_id, n.invoice_id) = (i.tenant_id, i.id)), 0)
            > coalesce((SELECT sum(p.amount_pence) FROM app.customer_payment p
              WHERE (p.tenant_id, p.invoice_id) = (i.tenant_id, i.id) AND NOT EXISTS (SELECT FROM app.customer_payment_reversal v
                WHERE (v.tenant_id, v.payment_id) = (p.tenant_id, p.id))), 0)) AS unpaid
    ), plan AS (
      SELECT *, CASE
          WHEN twelve_sent THEN NULL
          WHEN twelve_at <= clock_timestamp() THEN 12
          WHEN six_sent THEN NULL
          WHEN six_at <= clock_timestamp() THEN 6
        END AS months FROM facts
    )
    SELECT jsonb_build_object('state', CASE
        WHEN NOT enabled THEN 'off'
        WHEN release_id IS NULL THEN 'no_release'
        WHEN NOT recipient_current THEN 'recipient_changed'
        WHEN twelve_sent THEN 'done'
        WHEN disputed THEN 'open_dispute'
        WHEN unpaid THEN 'unpaid_invoice'
        WHEN months IS NULL THEN 'too_soon'
        ELSE 'due' END,
      'enabled', enabled, 'releaseId', release_id, 'recipient', recipient, 'months', months,
      'nextAt', CASE WHEN twelve_sent THEN NULL WHEN six_sent OR six_at <= clock_timestamp() THEN twelve_at ELSE six_at END,
      'sixSent', six_sent, 'twelveSent', twelve_sent)
    FROM plan
  $f$;
  REVOKE ALL ON FUNCTION app.v2_aftercare_due(uuid, uuid, smallint) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_aftercare_due(uuid, uuid, smallint) TO jobguard_runtime;

  -- An offer is written only when it is the one due now, for that release and that address.
  -- AFTER INSERT, so row security refuses an outsider's row (42501) first.
  CREATE OR REPLACE FUNCTION app.v2_aftercare_offer_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $guard$
  DECLARE due jsonb := app.v2_aftercare_due(NEW.tenant_id, NEW.job_id, NEW.at_months);
  BEGIN
    IF due->>'state' IS DISTINCT FROM 'due' OR (due->>'months')::smallint IS DISTINCT FROM NEW.at_months
      OR due->>'releaseId' IS DISTINCT FROM NEW.release_id::text OR due->>'recipient' IS DISTINCT FROM NEW.recipient_email THEN
      RAISE EXCEPTION 'V2_AFTERCARE_NOT_DUE' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END $guard$;
  DROP TRIGGER IF EXISTS v2_aftercare_offer_guard ON app.v2_aftercare_offer;
  CREATE TRIGGER v2_aftercare_offer_guard AFTER INSERT ON app.v2_aftercare_offer
    FOR EACH ROW EXECUTE FUNCTION app.v2_aftercare_offer_guard();
END
$v2$;
COMMIT;
