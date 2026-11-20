BEGIN;
-- LATER-SAFETY-111: preserve approved work when collapsing duplicate extras.
CREATE FUNCTION app.xa_duplicate_canonical_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c text; d text;
BEGIN
 c:=app.xa_latest_kind(NEW.tenant_id,NEW.job_id,NEW.canonical_id);
 d:=app.xa_latest_kind(NEW.tenant_id,NEW.job_id,NEW.duplicate_id);
 IF c='rejected' OR (d='approved' AND c IS DISTINCT FROM 'approved') THEN
  RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.xa_duplicate_canonical_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.xa_duplicate_canonical_guard() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
-- extra_duplicate_link_insert_guard fires first: it owns receipt validation,
-- the job graph lock and the existing structural/export checks.
CREATE TRIGGER z_duplicate_canonical_guard BEFORE INSERT ON app.extra_duplicate_link
 FOR EACH ROW WHEN (NEW.kind='link') EXECUTE FUNCTION app.xa_duplicate_canonical_guard();

CREATE FUNCTION app.xa_active_canonical_withdraw_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.extra_duplicate_link l
  WHERE(l.tenant_id,l.job_id,l.canonical_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id)
   AND l.kind='link' AND NOT EXISTS(
    SELECT 1 FROM app.extra_duplicate_link u
    WHERE(u.tenant_id,u.job_id,u.reverses_link_id)=(l.tenant_id,l.job_id,l.id) AND u.kind='unlink'
   )) THEN
  RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.xa_active_canonical_withdraw_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.xa_active_canonical_withdraw_guard() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
-- extra_event_insert_guard fires first and takes the same job graph lock.
CREATE TRIGGER z_active_canonical_withdraw_guard BEFORE INSERT ON app.extra_event
 FOR EACH ROW WHEN (NEW.kind='withdrawn') EXECUTE FUNCTION app.xa_active_canonical_withdraw_guard();
-- Forward repair only; preserve immutable history. Any rollback of these guards
-- requires a reviewed follow-up migration rather than rewriting past facts.
COMMIT;
