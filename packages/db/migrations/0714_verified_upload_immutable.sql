-- LATER-SAFETY-69: preserve finalized upload proof without changing owner, ACL or triggers.
BEGIN;
CREATE OR REPLACE FUNCTION app.guard_watchdog_upload_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
  IF (NEW.id,NEW.tenant_id,NEW.job_id,NEW.scope_item_id,NEW.object_key,NEW.expected_sha256,NEW.expected_content_type,NEW.maximum_bytes)
    IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.job_id,OLD.scope_item_id,OLD.object_key,OLD.expected_sha256,OLD.expected_content_type,OLD.maximum_bytes)
  THEN RAISE EXCEPTION 'evidence upload identity is immutable' USING ERRCODE='42501'; END IF;
  IF OLD.state='verified' AND
    (NEW.state,NEW.object_version_id,NEW.server_verified_at,NEW.rejection_code)
    IS DISTINCT FROM (OLD.state,OLD.object_version_id,OLD.server_verified_at,OLD.rejection_code)
  THEN RAISE EXCEPTION 'verified evidence upload is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.state IN ('quarantined','verified') AND
    (NEW.state,NEW.object_version_id,NEW.server_verified_at) IS DISTINCT FROM (OLD.state,OLD.object_version_id,OLD.server_verified_at)
  THEN PERFORM app.require_watchdog_live(NEW.job_id); END IF;
  RETURN NEW;
END $$;
COMMIT;
