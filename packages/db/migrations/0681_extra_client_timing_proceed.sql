BEGIN;
-- Reuse the existing timing projection and pure derivation, including uncertain visit bounds.
CREATE OR REPLACE FUNCTION app.xc_timing(t uuid,j uuid,v uuid,r uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('visit',(SELECT to_jsonb(x) FROM (SELECT v.id visit_id,to_char(v.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') started_at,
      to_char(v.completed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') completed_at,
      (extract(epoch FROM v.started_at)*1000000)::bigint::text start_us,
      (extract(epoch FROM v.completed_at)*1000000)::bigint::text finish_us
     FROM app.extra_origin o JOIN app.site_visit v ON (v.tenant_id,v.job_id,v.id)=(o.tenant_id,o.job_id,o.site_visit_id)
     WHERE o.tenant_id=$1 AND o.job_id=$2 AND o.variation_id=$3) x),
 'requests',coalesce((SELECT jsonb_agg(x) FROM (SELECT q.id,CASE WHEN (q.comparisons->>'aboveClientBeforeWorkThreshold')::boolean
        AND NOT (q.requirement->>'clientRequired')::boolean THEN NULL
        ELSE (q.comparisons->>'aboveClientBeforeWorkThreshold')::boolean END preapproval_required,
      (SELECT (extract(epoch FROM min(n.server_recorded_at))*1000000)::bigint::text FROM app.extra_approval_request n
       WHERE (n.tenant_id,n.job_id,n.variation_id)=(q.tenant_id,q.job_id,q.variation_id) AND n.request_revision>q.request_revision) superseded_us
     FROM app.extra_approval_request q JOIN app.extra_approval_request selected
       ON (selected.tenant_id,selected.job_id,selected.variation_id)=(q.tenant_id,q.job_id,q.variation_id)
     WHERE q.tenant_id=$1 AND q.job_id=$2 AND q.variation_id=$3 AND selected.id=$4 AND q.request_revision<=selected.request_revision) x),'[]'::jsonb),
 'facts',coalesce((SELECT jsonb_agg(x) FROM (SELECT request_id,step_index,step_role,(extract(epoch FROM server_recorded_at)*1000000)::bigint::text at_us
     FROM app.extra_approval_step_fact WHERE tenant_id=$1 AND job_id=$2 AND variation_id=$3 ORDER BY step_index) x),'[]'::jsonb),
 'workStatus',app.ent3_extra_work_status(j,v),
 'proceedIds',coalesce(app.xa_proceed_breaches(j,v),'{}'::uuid[]))
$$;
ALTER FUNCTION app.xc_timing(uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.xc_timing(uuid,uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.xc_timing(uuid,uuid,uuid,uuid) TO jobguard_runtime;
COMMIT;
