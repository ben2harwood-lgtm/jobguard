BEGIN;
-- MON-6: bounded synthetic customer display. No attempt or commercial mutation.
CREATE FUNCTION identity.customer_practice_pay_now(t uuid,j uuid,c uuid,digest text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 -- Resolve checks the session, grant, sponsor and current customer/job binding
 -- before any invoice read, holding the existing portal locks until return.
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT jsonb_build_object('invoiceNumber',i.invoice_number,'balancePence',greatest(0,i.total_pence
  -coalesce((SELECT sum(n.amount_pence) FROM app.customer_credit_note n WHERE n.tenant_id=t AND n.invoice_id=i.id),0)
  -coalesce((SELECT sum(p.amount_pence) FROM app.customer_payment p WHERE p.tenant_id=t AND p.invoice_id=i.id
   AND NOT EXISTS(SELECT 1 FROM app.customer_payment_reversal r WHERE r.tenant_id=t AND r.payment_id=p.id)),0)))
 INTO result FROM app.customer_invoice i WHERE i.tenant_id=t AND i.job_id=j AND i.synthetic
 ORDER BY i.issued_on DESC,i.invoice_number DESC LIMIT 1;
 IF result IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
ALTER FUNCTION identity.customer_practice_pay_now(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.customer_practice_pay_now(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION identity.customer_practice_pay_now(uuid,uuid,uuid,text) TO jobguard_identity;
COMMIT;
