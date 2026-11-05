BEGIN;
-- No table grants or historical row changes. Discovery stays on infrastructure.
REVOKE ALL ON FUNCTION infrastructure.retention_timer(uuid,uuid,jsonb,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

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
 IF digest IS NULL OR digest !~ '^[a-f0-9]{64}$' OR NOT EXISTS(
  SELECT 1 FROM identity.session WHERE token_digest=digest AND environment='synthetic_demo'
   AND revoked_at IS NULL AND expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'RETENTION_UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 PERFORM set_config('app.tenant_id',t::text,true);
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j) THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND'; END IF;
 PERFORM app.require_watchdog_live(j);
 SELECT coalesce(jsonb_agg(record ORDER BY ordinal),'[]'::jsonb) INTO records
  FROM app.retention_record WHERE tenant_id=t AND job_id=j;
 IF EXISTS(SELECT 1 FROM app.retention_record WHERE tenant_id=t AND job_id=j AND record_hash<>app.final_lock_hash(record))
 THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
 fingerprint:=app.final_lock_hash(records);
 IF v IS NOT NULL THEN
  IF v->>'version'='retention.review.v1' THEN
   IF v->>'trigger' IS DISTINCT FROM 'human' THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
   SELECT * INTO prior FROM app.retention_record WHERE tenant_id=t AND command_id=cid;
   v:=jsonb_set(v,'{raisedOn}',to_jsonb(CASE WHEN FOUND THEN prior.record->>'raisedOn' ELSE to_char(CURRENT_DATE,'YYYY-MM-DD') END));
  END IF;
  IF actor IS NULL OR cid IS NULL OR expected IS DISTINCT FROM fingerprint OR jsonb_typeof(v) IS DISTINCT FROM 'object'
   OR v->>'tenantId' IS DISTINCT FROM t::text OR v->>'jobId' IS DISTINCT FROM j::text OR v->>'id' IS DISTINCT FROM cid::text
   OR coalesce(v->>'version','') NOT IN('retention.profile.v1','retention.review.v1','retention.resolution.v1','retention.release.v1','retention.receipt.v1','retention.reversal.v1')
   OR EXISTS(SELECT 1 FROM jsonb_path_query(v,'$.**.actorId') a(value) WHERE value IS DISTINCT FROM to_jsonb(actor::text))
   OR EXISTS(SELECT 1 FROM jsonb_path_query(v,'$.** ? (@.kind == "human_input")') s(value) WHERE value->>'actorId' IS DISTINCT FROM actor::text)
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
 result:=jsonb_build_object('actorId',actor,'records',records,'bookHash',app.final_lock_hash(records),'today',to_char(CURRENT_DATE,'YYYY-MM-DD'));
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
 RAISE;
END $$;

-- Private helper: timer validation needs the book without impersonating a session.
-- Neither business runtime nor infrastructure may invoke this helper directly.
CREATE FUNCTION app.retention_timer_book(t uuid,j uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE records jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'RETENTION_DARK'; END IF;
 IF t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||j::text,753));
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j) THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND'; END IF;
 PERFORM app.require_watchdog_live(j);
 SELECT coalesce(jsonb_agg(record ORDER BY ordinal),'[]'::jsonb) INTO records
  FROM app.retention_record WHERE tenant_id=t AND job_id=j;
 IF EXISTS(SELECT 1 FROM app.retention_record WHERE tenant_id=t AND job_id=j AND record_hash<>app.final_lock_hash(record))
 THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
 RETURN jsonb_build_object('actorId',NULL,'records',records,'bookHash',app.final_lock_hash(records),
  'today',to_char(CURRENT_DATE,'YYYY-MM-DD'));
END $$;
ALTER FUNCTION app.retention_timer_book(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.retention_timer_book(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

CREATE FUNCTION app.retention_timer(t uuid,j uuid,v jsonb,expected text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE caller_tenant text:=current_setting('app.tenant_id',true); stored jsonb; result jsonb; profile jsonb; prior jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'RETENTION_DARK'; END IF;
 IF t IS NULL OR t IS DISTINCT FROM nullif(caller_tenant,'')::uuid THEN RAISE EXCEPTION 'RETENTION_NOT_FOUND'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 IF j IS NULL THEN
  IF v IS NOT NULL OR expected IS NOT NULL THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
  SELECT coalesce(jsonb_agg(job_id ORDER BY job_id),'[]'::jsonb) INTO result
   FROM (SELECT DISTINCT job_id FROM app.retention_record WHERE tenant_id=t AND record_kind='retention.profile.v1') jobs;
 ELSE
  stored:=app.retention_timer_book(t,j);
  IF v IS NOT NULL THEN
   SELECT record INTO profile FROM app.retention_record WHERE tenant_id=t AND job_id=j
    AND record_kind='retention.profile.v1' ORDER BY ordinal DESC LIMIT 1;
   IF expected IS DISTINCT FROM stored->>'bookHash' OR jsonb_typeof(v) IS DISTINCT FROM 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v) k) IS DISTINCT FROM
     ARRAY['conditionId','id','jobId','owner','profileId','raisedOn','tenantId','trigger','version']::text[]
    OR v->>'version' IS DISTINCT FROM 'retention.review.v1' OR v->>'trigger' IS DISTINCT FROM 'timer'
    OR v->>'owner' IS DISTINCT FROM 'retention-release-review-v1'
    OR v->>'tenantId' IS DISTINCT FROM t::text OR v->>'jobId' IS DISTINCT FROM j::text
    OR v->>'profileId' IS DISTINCT FROM profile->>'id' OR profile IS NULL
    OR v->>'raisedOn' IS DISTINCT FROM to_char(CURRENT_DATE,'YYYY-MM-DD')
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(profile->'conditions') c WHERE c->>'id'=v->>'conditionId'
      AND c->>'dueDate'<=to_char(CURRENT_DATE,'YYYY-MM-DD'))
   THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
   SELECT record INTO prior FROM app.retention_record WHERE tenant_id=t AND job_id=j AND command_id=(v->>'id')::uuid;
   IF FOUND THEN
    IF prior IS DISTINCT FROM v THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
   ELSE
    IF EXISTS(SELECT 1 FROM app.retention_record WHERE tenant_id=t AND job_id=j AND record_kind='retention.review.v1'
      AND record->>'profileId'=v->>'profileId' AND record->>'conditionId'=v->>'conditionId')
    THEN RAISE EXCEPTION 'RETENTION_CONFLICT'; END IF;
    INSERT INTO app.retention_record(tenant_id,job_id,command_id,ordinal,record_kind,record,record_hash,actor_membership_id)
     VALUES(t,j,(v->>'id')::uuid,jsonb_array_length(stored->'records')+1,'retention.review.v1',v,app.final_lock_hash(v),NULL);
    PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version','audit.v1',
     'actorRef','system:retention-release-review-v1','eventType','retention.review.raised','subjectType','job','subjectRef',j::text,
     'payload',jsonb_build_object('references',jsonb_build_object('commandId',v->>'id'),
      'hashes',jsonb_build_object('record',app.final_lock_hash(v))))),'checked_operation');
   END IF;
   stored:=app.retention_timer_book(t,j);
  END IF;
  result:=stored||jsonb_build_object('today',to_char(CURRENT_DATE,'YYYY-MM-DD'));
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(caller_tenant,''),true); RAISE;
END $$;
ALTER FUNCTION app.retention_timer(uuid,uuid,jsonb,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.retention_timer(uuid,uuid,jsonb,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.retention_timer(uuid,uuid,jsonb,text) TO jobguard_runtime;
COMMIT;
