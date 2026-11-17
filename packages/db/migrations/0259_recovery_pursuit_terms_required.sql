BEGIN;
-- CH-7-REST-C: new withheld-payment pursuit always requires applicable terms.
-- CREATE OR REPLACE preserves the existing owner and ACL. The invoker, volatility,
-- search path and three case-locking trigger callers retain their existing contract.
CREATE OR REPLACE FUNCTION app.recovery_case_terms_approved(p_tenant uuid,p_job uuid,p_case uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,app AS $$
 SELECT EXISTS(SELECT 1 FROM app.recovery_case_current c JOIN app.job j ON(j.tenant_id,j.id)=(c.tenant_id,c.job_id)
 WHERE c.tenant_id=p_tenant AND c.job_id=p_job AND c.id=p_case AND
 (c.case_type<>'withheld_customer_payment' OR
 EXISTS(SELECT 1 FROM app.recovery_case_terms_approval a WHERE a.tenant_id=c.tenant_id AND a.job_id=c.job_id AND a.case_id=c.id AND a.terms_version='synthetic_recovery_fee_terms.v1')))
$$;
COMMIT;
