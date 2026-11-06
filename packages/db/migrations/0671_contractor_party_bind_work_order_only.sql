BEGIN;
-- LATER-SAFETY-127: the importer must never replace an ordinary job's parties.
-- work_order_begin sets job provenance before binding; the work_order row is
-- inserted afterward, so requiring that row here would reject valid imports.
CREATE FUNCTION app.guard_contractor_party_work_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.job j
  WHERE j.tenant_id=NEW.tenant_id AND j.id=NEW.job_id AND j.provenance='work_order') THEN
  RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_contractor_party_work_order() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_contractor_party_work_order() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER contractor_party_work_order_only BEFORE INSERT ON app.job_party_binding
 FOR EACH ROW WHEN (NEW.provenance='work_order_import') EXECUTE FUNCTION app.guard_contractor_party_work_order();
-- Forward repair only: retain existing immutable history. Removing this guard
-- requires a reviewed follow-up migration, never a rewrite of this migration.
COMMIT;
