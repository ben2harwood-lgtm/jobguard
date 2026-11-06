BEGIN;
-- LATER-SAFETY-124: keep the mutable head on its next linked revision only.
-- A trigger survives later replacements of advance_final_account_draft.
CREATE FUNCTION app.guard_final_account_draft_advance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior_context text:=current_setting('app.tenant_id',true);
BEGIN
 IF NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id
    OR NEW.revision IS DISTINCT FROM OLD.revision THEN
  -- Like serialize_final_account_source (0132), scope FORCE-RLS reads to
  -- the row even for administrative fixture writes, then restore the caller.
  PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
  IF NEW.revision IS DISTINCT FROM OLD.revision + 1
     OR NOT EXISTS (
      SELECT 1 FROM app.final_account_revision r
      WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.current_revision_id
       AND r.final_account_draft_id=NEW.id AND r.revision=NEW.revision
       AND r.previous_revision_id IS NOT DISTINCT FROM OLD.current_revision_id
     ) THEN
   RAISE EXCEPTION 'INVALID_TRANSITION' USING ERRCODE='23514';
  END IF;
  PERFORM set_config('app.tenant_id',coalesce(prior_context,''),true);
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_final_account_draft_advance() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_final_account_draft_advance() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER final_account_draft_advance_guard BEFORE UPDATE ON app.final_account_draft
 FOR EACH ROW EXECUTE FUNCTION app.guard_final_account_draft_advance();
-- Forward repair only: removing this guard requires a reviewed follow-up migration.
COMMIT;
