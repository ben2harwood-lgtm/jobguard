BEGIN;

-- Drafts exist before activation. Stamp only a proposal just created by an
-- authenticated pilot builder, without granting runtime access to the track table.
ALTER TABLE app.job_commercial_track DROP CONSTRAINT job_commercial_track_provenance_check;
ALTER TABLE app.job_commercial_track ADD CONSTRAINT job_commercial_track_provenance_check
 CHECK(provenance IN ('backfilled_synthetic_fixture','quote_activation','adoption_import',
 'legacy_synthetic_live_fixture','work_order_import','pilot_capture'));

-- A narrow predicate keeps the protected request row private.
GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;
CREATE FUNCTION app.pilot_capture_real_binding(t uuid) RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT b.tenant_id=t AND b.credential_kind='real' AND b.scope_job_id IS NULL AND b.scope_command_type IS NULL
 FROM app.lp6_bound_request() b
$$;
ALTER FUNCTION app.pilot_capture_real_binding(uuid) OWNER TO jobguard_binding_owner;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.pilot_capture_real_binding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_capture_real_binding(uuid) TO jobguard_migration;

CREATE FUNCTION app.stamp_pilot_capture_track() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NEW.model <> 'pilot-fixture-capture-v1' THEN RETURN NEW; END IF;
 IF current_database() !~ '^jobguard_pilot(_[a-z0-9]+)*$'
    OR current_database() ~ '^jobguard_pilot_(queue|restore)(_|$)'
    OR app.current_tenant() IS DISTINCT FROM NEW.tenant_id
    OR app.pilot_capture_real_binding(NEW.tenant_id) IS DISTINCT FROM TRUE
    OR NOT EXISTS (SELECT 1 FROM app.membership m WHERE m.tenant_id=NEW.tenant_id
      AND m.id=app.current_actor() AND m.role='owner' AND m.revoked_at IS NULL
      AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE)
    OR NOT EXISTS (SELECT 1 FROM app.job j WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.job_id
      AND j.status='draft' AND j.revision=0 AND j.practice_session_digest IS NULL
      AND j.practice_scenario IS NULL AND j.provenance='system_generated_quote')
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance,source_id)
 VALUES(NEW.tenant_id,NEW.job_id,'small_builder','pilot_no_charge','pilot_capture',NEW.id);
 RETURN NEW;
END $$;
ALTER FUNCTION app.stamp_pilot_capture_track() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.stamp_pilot_capture_track() FROM PUBLIC;
CREATE TRIGGER pilot_capture_track AFTER INSERT ON app.job_record_proposal
 FOR EACH ROW EXECUTE FUNCTION app.stamp_pilot_capture_track();

COMMIT;
