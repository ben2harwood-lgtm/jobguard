BEGIN;
-- LATER-SAFETY-12: preserve the latest mainline routine, narrowing session authority only.
CREATE OR REPLACE FUNCTION app.retention_records(t uuid,digest text,j uuid,cid uuid,v jsonb,expected text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; records jsonb; prior app.retention_record; fingerprint text;
 caller_tenant text:=current_setting('app.tenant_id',true); result jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'RETENTION_DARK'; END IF;
 IF t IS NULL OR t IS DISTINCT FROM nullif(caller_tenant,'')::uuid THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND'; END IF;
 -- Before audit, lock the entire job book; prepare and append keep this lock
 -- through the caller's transaction, including core validation and replay.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,753));
 IF digest IS NOT NULL THEN actor:=app.mon1_company_actor(t,digest); END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j) THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND'; END IF;
 SELECT coalesce(jsonb_agg(record ORDER BY ordinal),'[]'::jsonb) INTO records
  FROM app.retention_record WHERE tenant_id=t AND job_id=j;
 IF EXISTS(SELECT 1 FROM app.retention_record WHERE tenant_id=t AND job_id=j AND record_hash<>app.final_lock_hash(record))
 THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
 fingerprint:=app.final_lock_hash(records);
 IF v IS NOT NULL THEN
  IF actor IS NULL OR cid IS NULL OR expected IS DISTINCT FROM fingerprint OR jsonb_typeof(v) IS DISTINCT FROM 'object'
   OR v->>'tenantId' IS DISTINCT FROM t::text OR v->>'jobId' IS DISTINCT FROM j::text OR v->>'id' IS DISTINCT FROM cid::text
   OR coalesce(v->>'version','') NOT IN('retention.profile.v1','retention.review.v1','retention.resolution.v1','retention.release.v1','retention.receipt.v1','retention.reversal.v1')
   OR EXISTS(SELECT 1 FROM jsonb_path_query(v,'$.**.actorId') a(value) WHERE value IS DISTINCT FROM to_jsonb(actor::text))
   OR EXISTS(SELECT 1 FROM jsonb_path_query(v,'$.** ? (@.kind == "human_input")') s(value) WHERE value->>'actorId' IS DISTINCT FROM actor::text)
   OR (v->>'version'='retention.review.v1' AND v->>'trigger' IS DISTINCT FROM 'human')
   OR (v->>'version'='retention.resolution.v1' AND v->'humanSource'->>'actorId' IS DISTINCT FROM actor::text)
  THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
  SELECT * INTO prior FROM app.retention_record WHERE tenant_id=t AND command_id=cid;
  IF FOUND THEN
   IF prior.job_id<>j OR prior.record IS DISTINCT FROM v OR prior.actor_membership_id<>actor THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
  ELSE
   INSERT INTO app.retention_record(tenant_id,job_id,command_id,ordinal,record_kind,record,record_hash,actor_membership_id)
    VALUES(t,j,cid,jsonb_array_length(records)+1,v->>'version',v,app.final_lock_hash(v),actor);
   PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
    'actorRef','membership:'||actor::text,'eventType','retention.record.appended','subjectType','job','subjectRef',j::text,
    'payload',jsonb_build_object('references',jsonb_build_object('commandId',cid::text),
     'hashes',jsonb_build_object('record',app.final_lock_hash(v))))),'checked_operation');
   records:=records||jsonb_build_array(v);
  END IF;
 END IF;
 result:=jsonb_build_object('actorId',actor,'records',records,'bookHash',app.final_lock_hash(records));
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
 RAISE;
END $$;
ALTER FUNCTION app.retention_records(uuid,text,uuid,uuid,jsonb,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.retention_records(uuid,text,uuid,uuid,jsonb,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.retention_records(uuid,text,uuid,uuid,jsonb,text) TO jobguard_runtime;
COMMIT;
