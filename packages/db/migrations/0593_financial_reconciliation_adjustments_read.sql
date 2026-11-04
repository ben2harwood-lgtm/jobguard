BEGIN;
-- Uses the same finance/session authority and FORCE-RLS tenant context as 0572.
-- No settings, tables, runs or financial facts are changed here.
CREATE FUNCTION app.financial_reconciliation_adjustments_read(p_session uuid,p_job uuid,p_run uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; result jsonb;
BEGIN
 PERFORM app.ef_actor(p_session);
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF NOT EXISTS(SELECT 1 FROM app.financial_reconciliation_run WHERE tenant_id=t AND job_id=p_job AND id=p_run) THEN
  RETURN NULL;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('adjustmentId',a.id,'adjustment',a.request->'adjustment',
  'contentHash',a.content_hash,'approvalId',v.id) ORDER BY a.recorded_at,a.id),'[]'::jsonb)
 INTO result FROM app.financial_reconciliation_adjustment a
 LEFT JOIN app.financial_reconciliation_approval v ON v.tenant_id=a.tenant_id AND v.job_id=a.job_id AND v.adjustment_id=a.id
 WHERE a.tenant_id=t AND a.job_id=p_job AND a.run_id=p_run;
 RETURN result;
END $$;
ALTER FUNCTION app.financial_reconciliation_adjustments_read(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.financial_reconciliation_adjustments_read(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.financial_reconciliation_adjustments_read(uuid,uuid,uuid) TO jobguard_runtime;
COMMIT;
