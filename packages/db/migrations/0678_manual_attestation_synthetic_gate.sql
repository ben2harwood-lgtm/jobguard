BEGIN;
-- Reject before the live-job, command-id and order-effect triggers can run.
-- Forward fix only: existing immutable attestations and privileges are unchanged.
CREATE FUNCTION app.guard_manual_attestation_synthetic() RETURNS trigger
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_manual_attestation_synthetic() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_manual_attestation_synthetic() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER a_manual_attestation_synthetic BEFORE INSERT ON app.purchase_order_manual_attestation
 FOR EACH ROW EXECUTE FUNCTION app.guard_manual_attestation_synthetic();
COMMIT;
