BEGIN;

-- Keep this boundary on the table: later credit-routine replacements retain it.
-- Adopted jobs inherit ownership through the same private import edges as 0843.
CREATE FUNCTION app.guard_credit_note_practice_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS (
  WITH RECURSIVE ancestors(id) AS (
   SELECT NEW.job_id
   UNION
   SELECT i.source_job_id FROM app.job_import_v3 i
   JOIN ancestors a ON a.id=i.job_id WHERE i.tenant_id=NEW.tenant_id
  )
  SELECT 1 FROM ancestors a JOIN app.job j ON j.id=a.id AND j.tenant_id=NEW.tenant_id
  WHERE j.practice_session_digest IS NOT NULL
   AND j.practice_session_digest IS DISTINCT FROM nullif(current_setting('app.practice_material_digest',true),'')
 ) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_credit_note_practice_session() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_credit_note_practice_session()
 FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER credit_note_practice_session_guard BEFORE INSERT ON app.customer_credit_note
 FOR EACH ROW EXECUTE FUNCTION app.guard_credit_note_practice_session();

-- Forward fix only: removing the trigger restores cross-visitor credit issuance.
COMMIT;
