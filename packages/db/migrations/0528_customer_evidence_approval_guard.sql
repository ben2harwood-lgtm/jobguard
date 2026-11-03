BEGIN;
-- SV-5 follow-up: raw runtime INSERT must meet the same evidence gate as the repository.
-- This verifies the cited object only. customer_evidence remains no stronger than
-- builder_attestation; an arbitrary verified original is not proof of a written yes.
CREATE FUNCTION app.variation_customer_evidence_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.method='customer_evidence' AND NOT EXISTS (
  SELECT 1 FROM app.evidence_object e
  WHERE e.tenant_id=NEW.tenant_id AND e.job_id=NEW.job_id AND e.id=NEW.evidence_id
   AND e.kind='original' AND e.server_verified_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM app.evidence_invalidation i
    WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)
 ) THEN
  RAISE EXCEPTION 'CUSTOMER_EVIDENCE_REQUIRED' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.variation_customer_evidence_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.variation_customer_evidence_guard() FROM PUBLIC;
CREATE TRIGGER variation_customer_evidence_guard BEFORE INSERT ON app.variation_approval
 FOR EACH ROW EXECUTE FUNCTION app.variation_customer_evidence_guard();
COMMIT;
