-- LATER-SAFETY-16: reuse export's private effective-state projection behind billing read authority.
BEGIN;
CREATE FUNCTION app.contractor_approved_not_exported(p_session uuid, p_job uuid)
RETURNS TABLE(extra_id uuid, net_pence bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid;
BEGIN
 PERFORM app.cb_authority(p_session,p_job,false);
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 RETURN QUERY
 SELECT q.variation_id,q.net_pence
 FROM app.extra_approval_request q
 JOIN app.extra_approval_outcome o ON(o.tenant_id,o.request_id)=(q.tenant_id,q.id) AND o.kind='approved'
 WHERE q.tenant_id=t AND q.job_id=p_job
 AND q.request_revision=(SELECT max(x.request_revision) FROM app.extra_approval_request x WHERE x.tenant_id=q.tenant_id AND x.variation_id=q.variation_id)
 AND NOT EXISTS(SELECT 1 FROM app.billing_export_line l WHERE l.tenant_id=q.tenant_id AND l.extra_id=q.variation_id)
 AND app.xa_latest_kind(q.tenant_id,q.job_id,q.variation_id)='approved'
 ORDER BY q.variation_id;
END $$;
ALTER FUNCTION app.contractor_approved_not_exported(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.contractor_approved_not_exported(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.contractor_approved_not_exported(uuid,uuid) TO jobguard_runtime;
COMMIT;
