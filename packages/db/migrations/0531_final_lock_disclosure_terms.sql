BEGIN;
-- SV-5 stage-end sweep: enforce disclosure at the fact boundary as well as the command.
CREATE FUNCTION app.guard_final_lock_disclosure_terms() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance
  WHERE tenant_id=NEW.tenant_id AND terms_version=NEW.onboarding_terms_version
   AND accepted_at<=NEW.locked_at)
 THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_final_lock_disclosure_terms() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_final_lock_disclosure_terms() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
CREATE TRIGGER final_lock_disclosure_terms BEFORE INSERT ON app.final_account_lock
 FOR EACH ROW EXECUTE FUNCTION app.guard_final_lock_disclosure_terms();
COMMIT;
