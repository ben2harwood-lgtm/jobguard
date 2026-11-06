BEGIN;
-- Read-only session projection; the fixed preview operation cannot write a change.
CREATE FUNCTION app.accounting_export_route_read(t uuid,digest text,source text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f app.accounting_export_fixture; history jsonb; confirmed jsonb; proposal jsonb; old_route text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'EXPORT_SYNTHETIC_ONLY'; END IF;
 PERFORM app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,484));
 PERFORM app.mon1_company_actor(t,digest);
 IF source IS NULL OR source !~ '^demo-[a-z0-9-]{1,80}$' THEN RAISE EXCEPTION 'EXPORT_INVALID_INPUT'; END IF;
 SELECT * INTO f FROM app.accounting_export_fixture WHERE tenant_id=t AND source_id=source;
 IF NOT FOUND THEN RAISE EXCEPTION 'EXPORT_NOT_FOUND'; END IF;
 IF f.revoked OR f.consent_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'EXPORT_CONSENT_EXPIRED'; END IF;
 IF f.artifact #>> '{scope,tenantId}' IS DISTINCT FROM 'demo-'||t::text
  OR f.artifact #>> '{scope,sourceId}' IS DISTINCT FROM source
 THEN RAISE EXCEPTION 'EXPORT_STALE_REVISION'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('version',1,'artifact',c.artifact,'previewHash',c.preview_hash,
  'commandId',c.command_id,'decisionId',c.decision_id,'actorId',c.actor_id,'revision',c.revision)
  ORDER BY c.revision DESC),'[]'::jsonb) INTO history
 FROM app.accounting_export_route_change c WHERE c.tenant_id=t
  AND c.company_id=f.artifact #>> '{scope,companyId}' AND c.job_id=f.artifact #>> '{scope,jobId}';
 confirmed:=history->0;
 SELECT coalesce(confirmed #>> '{artifact,to}',l.artifact->>'route') INTO old_route
 FROM (SELECT 1) singleton LEFT JOIN LATERAL (
  SELECT artifact FROM app.accounting_export_ledger WHERE tenant_id=t
   AND company_id=f.artifact #>> '{scope,companyId}' AND artifact #>> '{scope,jobId}'=f.artifact #>> '{scope,jobId}'
   ORDER BY source_id LIMIT 1
 ) l ON true;
 IF old_route IS NOT NULL AND old_route IS DISTINCT FROM f.artifact->>'route' THEN
  proposal:=app.accounting_export_route(t,digest,'routeChangePreview',source,jsonb_build_object(
   'version',1,'scope',f.artifact->'scope','from',old_route,'to',f.artifact->'route',
   'connectionRevision',f.artifact->'connectionRevision','consentRevision',f.artifact->'consentRevision'));
 END IF;
 RETURN jsonb_build_object('version',1,'proposal',proposal,'confirmed',confirmed,'history',history);
END $$;
ALTER FUNCTION app.accounting_export_route_read(uuid,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.accounting_export_route_read(uuid,text,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.accounting_export_route_read(uuid,text,text) TO jobguard_runtime;
COMMIT;
