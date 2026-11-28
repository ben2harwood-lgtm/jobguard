-- Q57 / V2-G3. Release a saved handover version to the customer by link, and "Acknowledge receipt".
-- Release needs ordinary site completion (every scope item of the job complete) and never reads the
-- final-account lock, an invoice or a payment. Acknowledgement records receipt only. The link side
-- copies E2's reply link (2029) and F7M's crew link (2041) under its own names.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) OR to_regclass('app.v2_handover_version') IS NULL THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;

  -- One link for one saved version and one recipient. Never changed: a newer release supersedes it.
  CREATE TABLE IF NOT EXISTS app.v2_handover_release (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    id uuid NOT NULL,
    version integer NOT NULL,
    content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    recipient_email varchar(320) NOT NULL CHECK (btrim(recipient_email) <> ''),
    -- The customer binding and revision the address came from, so a later correction is visible.
    party_binding_id uuid NOT NULL,
    customer_revision_id uuid NOT NULL,
    firm_name varchar(120) NOT NULL CHECK (btrim(firm_name) <> ''),
    token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    command_id uuid NOT NULL,
    actor_membership_id uuid NOT NULL,
    released_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (tenant_id, job_id, id),
    UNIQUE (tenant_id, command_id),
    CHECK (expires_at > released_at AND expires_at <= released_at + interval '90 days'),
    FOREIGN KEY (tenant_id, job_id, version) REFERENCES app.v2_handover_version (tenant_id, job_id, version),
    FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES app.membership (tenant_id, id),
    FOREIGN KEY (tenant_id, job_id, party_binding_id) REFERENCES app.job_party_binding (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, customer_revision_id) REFERENCES app.customer_revision (tenant_id, id)
  );

  -- Receipt only: one row per release, a time and nothing else. No watchdog trigger
  -- (that guard needs a bound request actor, and a link has none).
  CREATE TABLE IF NOT EXISTS app.v2_handover_acknowledgement (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    release_id uuid NOT NULL,
    acknowledged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, release_id),
    FOREIGN KEY (tenant_id, job_id, release_id) REFERENCES app.v2_handover_release (tenant_id, job_id, id)
  );

  -- The release carries the saved version's own hash, and the site work is complete.
  -- AFTER INSERT, so row security refuses an outsider's row (42501) first.
  CREATE OR REPLACE FUNCTION app.v2_handover_release_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $guard$
  BEGIN
    IF NOT EXISTS (SELECT FROM app.v2_handover_version v
      WHERE (v.tenant_id, v.job_id, v.version, v.content_hash) = (NEW.tenant_id, NEW.job_id, NEW.version, NEW.content_hash)) THEN
      RAISE EXCEPTION 'V2_HANDOVER_VERSION_MISMATCH' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT FROM app.scope_progress p WHERE (p.tenant_id, p.job_id) = (NEW.tenant_id, NEW.job_id))
      OR EXISTS (SELECT FROM app.scope_progress p
        WHERE (p.tenant_id, p.job_id) = (NEW.tenant_id, NEW.job_id) AND p.stage <> 'complete') THEN
      RAISE EXCEPTION 'V2_HANDOVER_SITE_NOT_COMPLETE' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END $guard$;
  DROP TRIGGER IF EXISTS v2_handover_release_guard ON app.v2_handover_release;
  CREATE TRIGGER v2_handover_release_guard AFTER INSERT ON app.v2_handover_release
    FOR EACH ROW EXECUTE FUNCTION app.v2_handover_release_guard();

  ALTER TABLE app.v2_handover_release ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_handover_release FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_handover_acknowledgement ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_handover_acknowledgement FORCE ROW LEVEL SECURITY;
  -- app.job carries the practice-firm policy, so the job EXISTS also confines the firm.
  DROP POLICY IF EXISTS v2_handover_release_runtime ON app.v2_handover_release;
  CREATE POLICY v2_handover_release_runtime ON app.v2_handover_release TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_release.tenant_id, v2_handover_release.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_release.tenant_id, v2_handover_release.job_id)));
  -- Builder read only: the customer writes receipt through the link function.
  DROP POLICY IF EXISTS v2_handover_acknowledgement_runtime ON app.v2_handover_acknowledgement;
  CREATE POLICY v2_handover_acknowledgement_runtime ON app.v2_handover_acknowledgement FOR SELECT TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_acknowledgement.tenant_id, v2_handover_acknowledgement.job_id)));
  -- FL: the same restrictive firm lock as every V2 table.
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_handover_release;
  CREATE POLICY v2_practice_firm ON app.v2_handover_release AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_release.tenant_id, v2_handover_release.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_release.tenant_id, v2_handover_release.job_id)));
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_handover_acknowledgement;
  CREATE POLICY v2_practice_firm ON app.v2_handover_acknowledgement AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_acknowledgement.tenant_id, v2_handover_acknowledgement.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_acknowledgement.tenant_id, v2_handover_acknowledgement.job_id)));
  REVOKE ALL ON app.v2_handover_release, app.v2_handover_acknowledgement
    FROM PUBLIC, jobguard_runtime, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_handover_release TO jobguard_runtime;
  GRANT SELECT ON app.v2_handover_acknowledgement TO jobguard_runtime;
  DROP TRIGGER IF EXISTS v2_handover_release_immutable ON app.v2_handover_release;
  CREATE TRIGGER v2_handover_release_immutable BEFORE UPDATE OR DELETE ON app.v2_handover_release
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  DROP TRIGGER IF EXISTS v2_handover_acknowledgement_immutable ON app.v2_handover_acknowledgement;
  CREATE TRIGGER v2_handover_acknowledgement_immutable BEFORE UPDATE OR DELETE ON app.v2_handover_acknowledgement
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

  -- The private per-transaction scope, as E2's control_plane.v2_fact_reply_scope.
  CREATE UNLOGGED TABLE IF NOT EXISTS control_plane.v2_handover_link_scope (
    transaction_id xid8 PRIMARY KEY,
    token_hash char(64) NOT NULL,
    tenant_id uuid,
    job_id uuid,
    release_id uuid,
    acknowledged boolean NOT NULL DEFAULT false,
    audited boolean NOT NULL DEFAULT false
  );
  -- Failed attempts, for a coarse limit. Times only: no hash, link or token.
  CREATE UNLOGGED TABLE IF NOT EXISTS control_plane.v2_handover_link_failure (
    failed_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  CREATE INDEX IF NOT EXISTS v2_handover_link_failure_at ON control_plane.v2_handover_link_failure (failed_at);
  REVOKE ALL ON control_plane.v2_handover_link_scope, control_plane.v2_handover_link_failure FROM PUBLIC;
END
$v2$;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR to_regclass('app.v2_handover_release') IS NULL THEN
    RETURN;
  END IF;
  SET LOCAL ROLE jobguard_migration;

  CREATE OR REPLACE FUNCTION app.v2_handover_link_scoped(t uuid, j uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    SELECT EXISTS (SELECT FROM control_plane.v2_handover_link_scope s
      WHERE s.transaction_id = pg_current_xact_id_if_assigned() AND (s.tenant_id, s.job_id) = (t, j))
  $f$;
  CREATE OR REPLACE FUNCTION app.v2_handover_link_scope_token() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    SELECT s.token_hash::text FROM control_plane.v2_handover_link_scope s
    WHERE s.transaction_id = pg_current_xact_id_if_assigned()
  $f$;
  REVOKE ALL ON FUNCTION app.v2_handover_link_scoped(uuid, uuid), app.v2_handover_link_scope_token() FROM PUBLIC;

  -- The link functions run as the table owner. These policies let them read only the one job the scope names.
  DROP POLICY IF EXISTS v2_handover_link_lookup ON app.v2_handover_release;
  CREATE POLICY v2_handover_link_lookup ON app.v2_handover_release FOR SELECT TO jobguard_migration
    USING (token_hash::text = app.v2_handover_link_scope_token() OR app.v2_handover_link_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_handover_link_read ON app.v2_handover_version;
  CREATE POLICY v2_handover_link_read ON app.v2_handover_version FOR SELECT TO jobguard_migration
    USING (app.v2_handover_link_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_handover_link_read ON app.v2_handover_acknowledgement;
  CREATE POLICY v2_handover_link_read ON app.v2_handover_acknowledgement FOR SELECT TO jobguard_migration
    USING (app.v2_handover_link_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_handover_link_write ON app.v2_handover_acknowledgement;
  CREATE POLICY v2_handover_link_write ON app.v2_handover_acknowledgement FOR INSERT TO jobguard_migration
    WITH CHECK (app.v2_handover_link_scoped(tenant_id, job_id) AND release_id = (SELECT s.release_id
      FROM control_plane.v2_handover_link_scope s WHERE s.transaction_id = pg_current_xact_id_if_assigned()));

  -- Open the scope for one token in this transaction and return the release, or record a failed
  -- attempt. An unknown or expired link is refused. A superseded link still opens, read-only.
  CREATE OR REPLACE FUNCTION app.v2_handover_link_scope_open(h text) RETURNS app.v2_handover_release
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE r app.v2_handover_release;
  BEGIN
    IF current_database() <> 'jobguard_v2_local' OR h IS NULL OR h !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'HANDOVER_LINK_REFUSED' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT FROM control_plane.v2_handover_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned()) THEN
      RAISE EXCEPTION 'HANDOVER_LINK_REFUSED' USING ERRCODE = '42501';
    END IF;
    INSERT INTO control_plane.v2_handover_link_scope (transaction_id, token_hash) VALUES (pg_current_xact_id(), h);
    SELECT * INTO r FROM app.v2_handover_release WHERE token_hash = h;
    IF FOUND THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(r.tenant_id::text || ':' || r.id::text, 2058));
      UPDATE control_plane.v2_handover_link_scope SET tenant_id = r.tenant_id, job_id = r.job_id, release_id = r.id
      WHERE transaction_id = pg_current_xact_id_if_assigned();
      IF r.expires_at > clock_timestamp() THEN
        RETURN r;
      END IF;
    END IF;
    -- Recorded for monitoring, capped per ten minutes so guessing cannot grow the table.
    -- Never refuses a valid link: tokens are 256-bit.
    DELETE FROM control_plane.v2_handover_link_failure WHERE failed_at < clock_timestamp() - interval '1 day';
    IF (SELECT count(*) FROM control_plane.v2_handover_link_failure WHERE failed_at > clock_timestamp() - interval '10 minutes') < 20 THEN
      INSERT INTO control_plane.v2_handover_link_failure DEFAULT VALUES;
    END IF;
    DELETE FROM control_plane.v2_handover_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned();
    RETURN NULL;
  END $f$;
  REVOKE ALL ON FUNCTION app.v2_handover_link_scope_open(text) FROM PUBLIC;

  -- What the customer page may show: the saved version's own text, its number, the firm's name as
  -- released, whether a newer release exists (nothing else about it), and this release's receipt.
  CREATE OR REPLACE FUNCTION app.v2_handover_link_view(r app.v2_handover_release) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $f$
    SELECT jsonb_build_object('status', 'open', 'version', r.version, 'firmName', r.firm_name,
      'releasedAt', r.released_at, 'expiresAt', r.expires_at,
      'content', (SELECT v.content FROM app.v2_handover_version v
        WHERE (v.tenant_id, v.job_id, v.version) = (r.tenant_id, r.job_id, r.version)),
      'newerAvailable', EXISTS (SELECT FROM app.v2_handover_release n
        WHERE (n.tenant_id, n.job_id) = (r.tenant_id, r.job_id) AND (n.released_at, n.id) > (r.released_at, r.id)),
      'acknowledgedAt', (SELECT a.acknowledged_at FROM app.v2_handover_acknowledgement a
        WHERE (a.tenant_id, a.job_id, a.release_id) = (r.tenant_id, r.job_id, r.id)))
  $f$;
  REVOKE ALL ON FUNCTION app.v2_handover_link_view(app.v2_handover_release) FROM PUBLIC;

  CREATE OR REPLACE FUNCTION app.v2_handover_link_open(h text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE r app.v2_handover_release; result jsonb;
  BEGIN
    r := app.v2_handover_link_scope_open(h);
    IF r.id IS NULL THEN RETURN jsonb_build_object('status', 'refused'); END IF;
    result := app.v2_handover_link_view(r);
    DELETE FROM control_plane.v2_handover_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned();
    RETURN result;
  END $f$;

  -- Record receipt once. A repeat returns the stored time. Writes nothing else.
  CREATE OR REPLACE FUNCTION app.v2_handover_link_acknowledge(h text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE r app.v2_handover_release; saved app.v2_handover_acknowledgement;
  BEGIN
    r := app.v2_handover_link_scope_open(h);
    IF r.id IS NULL THEN RETURN jsonb_build_object('status', 'refused'); END IF;
    SELECT * INTO saved FROM app.v2_handover_acknowledgement WHERE (tenant_id, job_id, release_id) = (r.tenant_id, r.job_id, r.id);
    IF FOUND THEN
      DELETE FROM control_plane.v2_handover_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned();
      RETURN jsonb_build_object('status', 'acknowledged', 'replayed', true, 'jobId', r.job_id, 'releaseId', r.id,
        'version', r.version, 'acknowledgedAt', saved.acknowledged_at);
    END IF;
    INSERT INTO app.v2_handover_acknowledgement (tenant_id, job_id, release_id) VALUES (r.tenant_id, r.job_id, r.id)
    RETURNING * INTO saved;
    -- The audit sealer reads the tenant from this setting; the scope row decides which single
    -- event may be appended (policy v2_handover_link_audit_write consumes the allowance).
    PERFORM set_config('app.tenant_id', r.tenant_id::text, true);
    UPDATE control_plane.v2_handover_link_scope SET acknowledged = true WHERE transaction_id = pg_current_xact_id_if_assigned();
    RETURN jsonb_build_object('status', 'acknowledged', 'replayed', false, 'jobId', r.job_id, 'releaseId', r.id,
      'version', r.version, 'contentHash', r.content_hash, 'acknowledgedAt', saved.acknowledged_at);
  END $f$;

  CREATE OR REPLACE FUNCTION app.v2_handover_link_close() RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    DELETE FROM control_plane.v2_handover_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned()
  $f$;

  REVOKE ALL ON FUNCTION app.v2_handover_link_open(text), app.v2_handover_link_acknowledge(text),
    app.v2_handover_link_close() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_handover_link_open(text), app.v2_handover_link_acknowledge(text),
    app.v2_handover_link_close() TO jobguard_runtime;

  -- The link has no signed-in member, so the existing sealer finds no request binding. Allow it
  -- exactly one event: this scope's new acknowledgement, with that job as subject (copied from E2, 2029).
  CREATE OR REPLACE FUNCTION app.v2_handover_link_audit_tenant(event_type text, subject_type text, subject_ref text,
    release_ref text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    SELECT s.tenant_id FROM control_plane.v2_handover_link_scope s
    WHERE s.transaction_id = pg_current_xact_id_if_assigned() AND s.acknowledged
      AND event_type = 'v2.handover.acknowledged' AND subject_type = 'job'
      AND subject_ref = s.job_id::text AND release_ref = s.release_id::text
  $f$;
  REVOKE ALL ON FUNCTION app.v2_handover_link_audit_tenant(text, text, text, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_handover_link_audit_tenant(text, text, text, text) TO jobguard_audit_writer;
  CREATE OR REPLACE FUNCTION app.v2_handover_link_audit_take(event_type text, subject_type text, subject_ref text,
    payload jsonb) RETURNS uuid
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE s control_plane.v2_handover_link_scope; r app.v2_handover_release;
  BEGIN
    SELECT * INTO s FROM control_plane.v2_handover_link_scope
    WHERE transaction_id = pg_current_xact_id_if_assigned() AND acknowledged AND NOT audited FOR UPDATE;
    IF NOT FOUND OR event_type IS DISTINCT FROM 'v2.handover.acknowledged' OR subject_type IS DISTINCT FROM 'job'
        OR subject_ref IS DISTINCT FROM s.job_id::text THEN
      RETURN NULL;
    END IF;
    SELECT * INTO r FROM app.v2_handover_release WHERE (tenant_id, job_id, id) = (s.tenant_id, s.job_id, s.release_id);
    IF NOT FOUND OR payload->'references'->>'releaseId' IS DISTINCT FROM r.id::text
        OR payload->'references'->>'handoverVersion' IS DISTINCT FROM r.version::text
        OR payload->'hashes'->>'content' IS DISTINCT FROM r.content_hash::text THEN
      RETURN NULL;
    END IF;
    UPDATE control_plane.v2_handover_link_scope SET audited = true WHERE transaction_id = s.transaction_id;
    RETURN s.tenant_id;
  END $f$;
  REVOKE ALL ON FUNCTION app.v2_handover_link_audit_take(text, text, text, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_handover_link_audit_take(text, text, text, jsonb) TO jobguard_audit_writer;
  DROP POLICY IF EXISTS v2_handover_link_audit_read ON app.audit_event;
  CREATE POLICY v2_handover_link_audit_read ON app.audit_event FOR SELECT TO jobguard_audit_writer
    USING (tenant_id = app.v2_handover_link_audit_tenant(app.lp11_audit_event_type(audit_event), subject_type, subject_ref,
      payload->'references'->>'releaseId'));
  DROP POLICY IF EXISTS v2_handover_link_audit_write ON app.audit_event;
  CREATE POLICY v2_handover_link_audit_write ON app.audit_event FOR INSERT TO jobguard_audit_writer
    WITH CHECK (tenant_id = app.v2_handover_link_audit_take(app.lp11_audit_event_type(audit_event), subject_type, subject_ref,
      payload));
END
$v2$;
COMMIT;
