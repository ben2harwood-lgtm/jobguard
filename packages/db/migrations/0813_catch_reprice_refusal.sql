BEGIN;
-- The immutable catch case binds its first positive price. Correct before that
-- price, or withdraw and raise a fresh catch; never strand its receipt sources.
CREATE FUNCTION app.final_check_refuse_catch_reprice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- Match the pricing path's variation lock, including direct concurrent inserts.
 PERFORM 1 FROM app.variation
 WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.variation_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM app.extra_origin
   WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id
     AND variation_id=NEW.variation_id AND kind='jobguard_catch')
 AND EXISTS(SELECT 1 FROM app.recovery_case
   WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id
     AND case_type='missed_variation_final_account'
     AND source_refs ? ('variation:'||NEW.variation_id::text)) THEN
  RAISE EXCEPTION 'CATCH_PRICE_LOCKED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.final_check_refuse_catch_reprice() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_refuse_catch_reprice() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
CREATE TRIGGER final_check_catch_price_lock BEFORE INSERT ON app.variation_revision
 FOR EACH ROW EXECUTE FUNCTION app.final_check_refuse_catch_reprice();
COMMIT;
