-- Q63 / V2-G4. Who can read the handover pack. The builder can stop a link, a link sent to a customer
-- contact the job no longer has stops opening, and "newer version available" ignores stopped releases.
-- Replaces only the 2083 scope-open and view bodies; everything else in them is as 2083 has it.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) OR to_regclass('app.v2_handover_release') IS NULL THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;

  -- One stop per release, never undone. To send the pack again the builder releases again.
  CREATE TABLE IF NOT EXISTS app.v2_handover_release_stop (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    release_id uuid NOT NULL,
    command_id uuid NOT NULL,
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    actor_membership_id uuid NOT NULL,
    reason varchar(200) NOT NULL CHECK (btrim(reason) <> ''),
    stopped_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, release_id),
    UNIQUE (tenant_id, command_id),
    FOREIGN KEY (tenant_id, job_id, release_id) REFERENCES app.v2_handover_release (tenant_id, job_id, id)
  );
  -- A linked V2 builder's membership lives in the identity tenant, not the practice tenant, so a membership FK
  -- refused every write. As in 2012 and 2071, the actor is the verified v2_work_plan_editor id, unkeyed.
  -- Dropped here too for a local database that already ran the first version of this file.
  ALTER TABLE app.v2_handover_release_stop DROP CONSTRAINT IF EXISTS v2_handover_release_stop_tenant_id_actor_membership_id_fkey;
  ALTER TABLE app.v2_handover_release_stop ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_handover_release_stop FORCE ROW LEVEL SECURITY;
  -- app.job carries the practice-firm policy, so the job EXISTS also confines the firm.
  DROP POLICY IF EXISTS v2_handover_release_stop_runtime ON app.v2_handover_release_stop;
  CREATE POLICY v2_handover_release_stop_runtime ON app.v2_handover_release_stop TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_release_stop.tenant_id, v2_handover_release_stop.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_release_stop.tenant_id, v2_handover_release_stop.job_id)));
  -- FL: the same restrictive firm lock as every V2 table.
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_handover_release_stop;
  CREATE POLICY v2_practice_firm ON app.v2_handover_release_stop AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_release_stop.tenant_id, v2_handover_release_stop.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_handover_release_stop.tenant_id, v2_handover_release_stop.job_id)));
  REVOKE ALL ON app.v2_handover_release_stop
    FROM PUBLIC, jobguard_runtime, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_handover_release_stop TO jobguard_runtime;
  DROP TRIGGER IF EXISTS v2_handover_release_stop_immutable ON app.v2_handover_release_stop;
  CREATE TRIGGER v2_handover_release_stop_immutable BEFORE UPDATE OR DELETE ON app.v2_handover_release_stop
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

  -- The link functions run as the table owner: they read only the one job the link scope names.
  DROP POLICY IF EXISTS v2_handover_link_read ON app.v2_handover_release_stop;
  CREATE POLICY v2_handover_link_read ON app.v2_handover_release_stop FOR SELECT TO jobguard_migration
    USING (app.v2_handover_link_scoped(tenant_id, job_id));
  -- The job's current customer, read as G3's release() reads it (own copies of E2's 2029 policies).
  DROP POLICY IF EXISTS v2_handover_link_read ON app.job_party_current;
  CREATE POLICY v2_handover_link_read ON app.job_party_current FOR SELECT TO jobguard_migration
    USING (app.v2_handover_link_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_handover_link_read ON app.job_party_binding;
  CREATE POLICY v2_handover_link_read ON app.job_party_binding FOR SELECT TO jobguard_migration
    USING (app.v2_handover_link_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_handover_link_read ON app.customer_revision;
  CREATE POLICY v2_handover_link_read ON app.customer_revision FOR SELECT TO jobguard_migration
    USING (EXISTS (SELECT FROM app.job_party_binding b WHERE (b.tenant_id, b.customer_revision_id) = (customer_revision.tenant_id, customer_revision.id)
      AND app.v2_handover_link_scoped(b.tenant_id, b.job_id)));

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
      -- G4: a stopped link, or one sent to an address that is no longer the job's current customer
      -- email (case and surrounding spaces ignored), is refused like an unknown one.
      IF r.expires_at > clock_timestamp()
        AND NOT EXISTS (SELECT FROM app.v2_handover_release_stop s
          WHERE (s.tenant_id, s.job_id, s.release_id) = (r.tenant_id, r.job_id, r.id))
        AND EXISTS (SELECT FROM app.job_party_current x
          JOIN app.job_party_binding b ON (b.tenant_id, b.job_id, b.id) = (x.tenant_id, x.job_id, x.binding_id)
          JOIN app.customer_revision cr ON (cr.tenant_id, cr.id) = (b.tenant_id, b.customer_revision_id)
          WHERE (x.tenant_id, x.job_id) = (r.tenant_id, r.job_id)
            AND lower(btrim(cr.payload->>'email')) = lower(btrim(r.recipient_email))) THEN
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

  CREATE OR REPLACE FUNCTION app.v2_handover_link_view(r app.v2_handover_release) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $f$
    SELECT jsonb_build_object('status', 'open', 'version', r.version, 'firmName', r.firm_name,
      'releasedAt', r.released_at, 'expiresAt', r.expires_at,
      'content', (SELECT v.content FROM app.v2_handover_version v
        WHERE (v.tenant_id, v.job_id, v.version) = (r.tenant_id, r.job_id, r.version)),
      'newerAvailable', EXISTS (SELECT FROM app.v2_handover_release n
        WHERE (n.tenant_id, n.job_id) = (r.tenant_id, r.job_id) AND (n.released_at, n.id) > (r.released_at, r.id)
          AND NOT EXISTS (SELECT FROM app.v2_handover_release_stop s
            WHERE (s.tenant_id, s.job_id, s.release_id) = (n.tenant_id, n.job_id, n.id))),
      'acknowledgedAt', (SELECT a.acknowledged_at FROM app.v2_handover_acknowledgement a
        WHERE (a.tenant_id, a.job_id, a.release_id) = (r.tenant_id, r.job_id, r.id)))
  $f$;
  REVOKE ALL ON FUNCTION app.v2_handover_link_view(app.v2_handover_release) FROM PUBLIC;
END
$v2$;
COMMIT;
