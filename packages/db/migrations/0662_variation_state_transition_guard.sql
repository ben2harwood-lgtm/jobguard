BEGIN;
-- LATER-SAFETY-106: protect the cached state without changing writers or grants.
CREATE FUNCTION app.guard_variation_state_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r app.variation_revision;
BEGIN
 IF NEW.current_revision_id IS NOT NULL THEN
  SELECT * INTO r FROM app.variation_revision
   WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id
    AND variation_id=NEW.id AND id=NEW.current_revision_id;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'VARIATION_REVISION_REFUSED' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.state IS NOT DISTINCT FROM OLD.state
  AND NEW.current_revision_id IS NOT DISTINCT FROM OLD.current_revision_id THEN
  RETURN NEW;
 END IF;
 -- writePricedRevision: first pricing or a fresh revision, including fresh terms
 -- after approval/rejection. Never reopen the existing approved/rejected revision.
 IF NEW.state='priced' AND NEW.current_revision_id IS NOT NULL
  AND NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id
  AND r.previous_revision_id IS NOT DISTINCT FROM OLD.current_revision_id
  AND ((OLD.current_revision_id IS NULL AND OLD.state='draft' AND r.revision=1)
   OR EXISTS(SELECT 1 FROM app.variation_revision p
    WHERE p.tenant_id=OLD.tenant_id AND p.job_id=OLD.job_id AND p.variation_id=OLD.id
     AND p.id=OLD.current_revision_id AND r.revision::bigint=p.revision::bigint+1)) THEN
  RETURN NEW;
 END IF;
 -- approvePricedVariation / identity.customer_variation and repository rejection.
 IF NEW.current_revision_id IS NOT DISTINCT FROM OLD.current_revision_id
  AND ((OLD.state='priced' AND NEW.state IN('approved','rejected'))
   OR (OLD.state='draft' AND NEW.state='rejected')) THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'VARIATION_STATE_TRANSITION_REFUSED' USING ERRCODE='23514';
END $$;
ALTER FUNCTION app.guard_variation_state_transition() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_variation_state_transition() FROM PUBLIC;
CREATE TRIGGER variation_state_transition_guard BEFORE UPDATE OF state,current_revision_id ON app.variation
 FOR EACH ROW EXECUTE FUNCTION app.guard_variation_state_transition();
COMMIT;
