BEGIN;
-- Read-only synthetic company-owner capability; no underlying table grant.
CREATE FUNCTION app.platform_invoice_read(t uuid, digest text) RETURNS SETOF jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 actor := app.mon1_company_actor(t,digest);
 IF NOT EXISTS (SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor
   AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'PLATFORM_INVOICE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT d.document FROM app.platform_invoice_document d
  WHERE d.tenant_id=t ORDER BY d.issuer_id,d.sequence;
END $$;
ALTER FUNCTION app.platform_invoice_read(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.platform_invoice_read(uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.platform_invoice_read(uuid,text) TO jobguard_runtime;
COMMIT;
