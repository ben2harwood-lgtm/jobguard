BEGIN;
-- LATER-SAFETY-7: synthetic practice records only; no real notice authority.
CREATE OR REPLACE FUNCTION app.notice_fixture_records(j uuid,n uuid,digest text,operation text,v jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 saved_tenant text:=current_setting('app.tenant_id',true); actor uuid; cid uuid;
 input jsonb; next_row jsonb; r jsonb; rows jsonb; result jsonb; old app.notice_fixture_record;
 latest jsonb; decision jsonb; prior_decision jsonb; seq integer; current_count integer;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS NULL OR j IS NULL OR n IS NULL
 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF operation IS NULL OR operation NOT IN('read','prepare','append') OR v IS NULL OR jsonb_typeof(v)<>'object'
 THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF operation='read' THEN
  IF v<>'{}'::jsonb OR digest IS NOT NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 ELSE
  actor:=app.mon1_company_actor(t,digest);
  input:=(CASE WHEN operation='append' THEN v->'input' ELSE v END);
  IF input->>'version' IS DISTINCT FROM 'notice.fixture-record-command.v1'
   OR input-ARRAY['version','commandId','jobId','noticeId','kind','data']<>'{}'::jsonb
   OR NOT(input ?& ARRAY['version','commandId','jobId','noticeId','kind','data'])
   OR input->>'jobId' IS DISTINCT FROM j::text OR input->>'noticeId' IS DISTINCT FROM n::text
   OR coalesce(input->>'kind','') NOT IN('revision','decision','service_event')
  THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  cid:=(input->>'commandId')::uuid;
  IF cid IS NULL THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  -- Command before book: conflicting keys across two books cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text||cid::text,754));
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text||n::text,755));
  actor:=app.mon1_company_actor(t,digest); -- recheck after waiting
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j)
  OR EXISTS(SELECT 1 FROM app.notice_fixture_record WHERE tenant_id=t AND notice_id=n AND job_id<>j)
 THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('sequence',sequence,'commandId',command_id,'actorId',actor_id,
  'kind',kind,'record',record,'recordHash',record_hash,'environment',environment,'watermark',watermark) ORDER BY sequence),'[]'::jsonb)
 INTO rows FROM app.notice_fixture_record WHERE tenant_id=t AND job_id=j AND notice_id=n;
 IF operation='read' THEN
  IF rows='[]'::jsonb THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
  result:=jsonb_build_object('records',rows);
 ELSE
  SELECT * INTO old FROM app.notice_fixture_record WHERE tenant_id=t AND command_id=cid;
  IF FOUND THEN
   IF old.job_id<>j OR old.notice_id<>n OR old.actor_id<>actor OR old.request<>input
   THEN RAISE EXCEPTION 'REPLAY_CONFLICT'; END IF;
   result:=jsonb_build_object('records',rows,'replay',rows->(old.sequence-1));
   IF operation='append' THEN result:=result->'replay'; END IF;
  -- Historical reads and exact command replay stay accessible at any job status.
  -- Only a fresh command must satisfy the neighbouring post-live billing rule.
  ELSIF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j AND status IN('live','invoiced','paid')) THEN
   RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
  ELSIF operation='prepare' THEN
   result:=jsonb_build_object('records',rows,'actorId',actor,'now',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  ELSE
   next_row:=v->'next'; r:=next_row->'record';
   current_count:=jsonb_array_length(rows); seq:=(next_row->>'sequence')::integer;
   IF seq IS DISTINCT FROM current_count+1 THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;
   IF v-ARRAY['input','next','canonicalRecord']<>'{}'::jsonb OR jsonb_typeof(r) IS DISTINCT FROM 'object'
    OR next_row->>'commandId' IS DISTINCT FROM cid::text OR next_row->>'actorId' IS DISTINCT FROM actor::text
    OR next_row->>'kind' IS DISTINCT FROM input->>'kind'
    OR next_row->>'environment' IS DISTINCT FROM 'synthetic'
    OR next_row->>'watermark' IS DISTINCT FROM 'FIXTURE, NOT REVIEWED — NOT A NOTICE — NOT FOR SERVICE'
    OR r->>'tenantId' IS DISTINCT FROM t::text OR r->>'jobId' IS DISTINCT FROM j::text
    OR r->>'environment' IS DISTINCT FROM 'synthetic'
    OR (v->>'canonicalRecord')::jsonb IS DISTINCT FROM r
    OR next_row->>'recordHash' IS DISTINCT FROM encode(sha256(convert_to(v->>'canonicalRecord','UTF8')),'hex')
   THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
   SELECT record INTO latest FROM app.notice_fixture_record WHERE tenant_id=t AND notice_id=n AND kind='revision' ORDER BY sequence DESC LIMIT 1;
   IF input->>'kind'='revision' THEN
    IF r IS DISTINCT FROM (input->'data')||jsonb_build_object('tenantId',t,'jobId',j,'noticeId',n)
     OR r->>'version' IS DISTINCT FROM 'notice.input.v1'
     OR (r->>'revision')::integer IS DISTINCT FROM coalesce((latest->>'revision')::integer,0)+1
     OR r->>'previousRevisionId' IS DISTINCT FROM latest->>'revisionId'
     OR EXISTS(SELECT 1 FROM app.notice_fixture_record WHERE tenant_id=t AND notice_id=n AND kind='revision' AND record->>'revisionId'=r->>'revisionId')
    THEN RAISE EXCEPTION 'STALE_REVISION'; END IF;
   ELSIF input->>'kind'='decision' THEN
    SELECT record INTO prior_decision FROM app.notice_fixture_record WHERE tenant_id=t AND notice_id=n AND kind='decision' AND record->>'id'=r->>'id' ORDER BY sequence DESC LIMIT 1;
    IF latest IS NULL OR input->'data'->>'noticeRevisionId' IS DISTINCT FROM latest->>'revisionId'
     OR r->>'version' IS DISTINCT FROM 'notice.fixture-decision.v1' OR r->>'actorKind' IS DISTINCT FROM 'human'
     OR r->>'actorId' IS DISTINCT FROM actor::text OR r->>'action' IS DISTINCT FROM 'notice.fixture_service'
     OR r->>'id' IS DISTINCT FROM input->'data'->>'id' OR r->>'resolution' IS DISTINCT FROM input->'data'->>'resolution'
     OR coalesce(r->>'resolution','') NOT IN('pending','approved','rejected','dismissed','revoked','superseded')
     OR (r->>'approvedPreview')::jsonb->'input' IS DISTINCT FROM latest
     OR (r->>'expiresAt')::timestamptz<=clock_timestamp() OR (r->>'decidedAt')::timestamptz>clock_timestamp()
     OR (prior_decision IS NOT NULL AND (prior_decision->>'resolution'<>'approved' OR r->>'resolution' NOT IN('revoked','superseded')
      OR r-'resolution' IS DISTINCT FROM prior_decision-'resolution'))
    THEN RAISE EXCEPTION 'APPROVAL_REQUIRED'; END IF;
   ELSE
    SELECT record INTO decision FROM app.notice_fixture_record WHERE tenant_id=t AND notice_id=n AND kind='decision' AND record->>'id'=r->>'decisionId' ORDER BY sequence DESC LIMIT 1;
    IF r IS DISTINCT FROM (input->'data')||jsonb_build_object('version','notice.fixture-service-event.v1','environment','synthetic','tenantId',t,'jobId',j,'recordedAt',r->>'recordedAt')
     OR r->>'noticeRevisionId' IS DISTINCT FROM latest->>'revisionId' OR latest IS NULL
     OR decision IS NULL OR decision->>'resolution'<>'approved'
     OR (decision->>'approvedPreview')::jsonb->'input' IS DISTINCT FROM latest
     OR (decision->>'expiresAt')::timestamptz<=clock_timestamp()
     OR (r->>'recordedAt')::timestamptz<clock_timestamp()-interval '1 minute'
     OR (r->>'recordedAt')::timestamptz>clock_timestamp()
    THEN RAISE EXCEPTION 'APPROVAL_REQUIRED'; END IF;
    IF coalesce(r->>'state','') NOT IN('queued','provider_accepted','outcome_unknown','read','legally_served')
     OR (r->>'state'='legally_served' AND nullif(r->>'legalAssessmentReference','') IS NULL)
     OR (r->>'state'<>'queued' AND r->>'evidenceId' IS NULL)
     OR (r->>'state' IN('provider_accepted','read') AND nullif(r->>'providerReference','') IS NULL)
     OR EXISTS(SELECT 1 FROM app.notice_fixture_record WHERE tenant_id=t AND notice_id=n AND kind='service_event' AND record->>'id'=r->>'id')
    THEN RAISE EXCEPTION 'INVALID_SERVICE_STATE'; END IF;
   END IF;
   INSERT INTO app.notice_fixture_record(tenant_id,job_id,notice_id,sequence,command_id,actor_id,kind,request,record,canonical_record,record_hash)
    VALUES(t,j,n,seq,cid,actor,input->>'kind',input,r,v->>'canonicalRecord',next_row->>'recordHash');
   result:=next_row;
  END IF;
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RETURN result;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(saved_tenant,''),true);
 RAISE;
END $$;
ALTER FUNCTION app.notice_fixture_records(uuid,uuid,text,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.notice_fixture_records(uuid,uuid,text,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.notice_fixture_records(uuid,uuid,text,text,jsonb) TO jobguard_runtime;
COMMIT;
