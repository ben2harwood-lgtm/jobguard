BEGIN;
-- Retained synthetic observations only; no new write authority.
CREATE FUNCTION app.read_rate_suggestion_acceptances(digest text,j uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; result jsonb;
 previous_sso text:=current_setting('app.sso_session_id',true);
BEGIN
 actor:=app.ch5_import_actor(t,digest);
 PERFORM set_config('app.tenant_id',t::text,true);
 PERFORM set_config('app.sso_session_id',coalesce(previous_sso,''),true);
 -- A current small-builder owner covers this tenant's jobs. Contractor grants
 -- do not confer access to this small-builder-only surface.
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track
  WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo')
 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',a.id,'jobId',a.job_id,'scopeItemId',a.scope_item_id,'previousRevisionId',a.previous_revision_id,
  'acceptedRatePence',a.accepted_pence,'unit',a.unit,'taxBasis',a.tax_basis,'category',a.category,'region',a.region,
  'actorId',a.actor_id,'acceptedAt',to_char(a.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'recordHash',a.record_hash,'baselineHash',a.baseline_hash,'policyVersion',a.policy_version,
  'provenance',a.provenance,'environment',a.environment,
  'sources',(SELECT coalesce(jsonb_agg(jsonb_build_object('observationId',o.id,'jobId',o.job_id,
    'scopeItemId',o.scope_item_id,'sourceScopeRevisionId',o.source_scope_revision_id,'provenance',o.provenance)
    ORDER BY o.id),'[]'::jsonb) FROM app.rate_book_observation o
    WHERE o.tenant_id=t AND o.id=ANY(a.source_observation_ids))
 ) ORDER BY a.created_at,a.id),'[]'::jsonb) INTO result
 FROM app.rate_suggestion_acceptance a WHERE a.tenant_id=t AND a.job_id=j;
 RETURN result;
END $$;
ALTER FUNCTION app.read_rate_suggestion_acceptances(text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_rate_suggestion_acceptances(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.read_rate_suggestion_acceptances(text,uuid) TO jobguard_runtime;
COMMIT;
