BEGIN;
-- Narrow actor lookup only. The caller retains the order lock, stored command,
-- attestation insert and audit in one transaction. No wider identity grant.
CREATE FUNCTION app.order_attestation_actor(t uuid,digest text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN
  RAISE EXCEPTION 'ORDER_ACTION_INVALID' USING ERRCODE='42501';
 END IF;
 BEGIN
  actor:=app.mon1_company_actor(t,digest);
 EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'ORDER_ACTION_INVALID' USING ERRCODE='42501';
 END;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner'
   AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'ORDER_ACTION_INVALID' USING ERRCODE='42501';
 END IF;
 RETURN actor;
END $$;
ALTER FUNCTION app.order_attestation_actor(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.order_attestation_actor(uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.order_attestation_actor(uuid,text) TO jobguard_runtime;
COMMIT;
