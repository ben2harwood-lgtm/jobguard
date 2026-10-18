BEGIN;
-- Synthetic Decision checks use existing receipt and immutable finding stores.
-- No business table, runtime table-write grant, policy change or historical rewrite.
CREATE FUNCTION app.decision_check_command(p_digest text,p_command jsonb,p_phase text,p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid; j uuid; c uuid; actor uuid; owned boolean; prior app.command_receipt;
 request_digest text; revision_number integer; item jsonb; did uuid; fid uuid; added integer:=0; repeated integer:=0;
 seq bigint; prev text; ts timestamptz; payload jsonb; ph text; eh text; actor_ref text;
BEGIN
 -- Authority is established before job existence, phase handling or replay.
 t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 IF t IS DISTINCT FROM '11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM 1 FROM control_plane.practice_session s WHERE s.token_digest=p_digest AND s.environment='synthetic_demo'
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 SELECT a.membership_id INTO actor FROM app.authenticate_practice_session(p_digest,t) a;
 IF actor IS NULL THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=actor AND m.role='owner'
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 IF p_command IS NULL OR jsonb_typeof(p_command)<>'object' OR p_command->>'version' IS DISTINCT FROM 'finding-evaluation-command.v1'
   OR p_command - ARRAY['version','commandId','tenantId','jobId'] <> '{}'::jsonb
   OR (p_command->>'tenantId')::uuid IS DISTINCT FROM t OR p_command->>'commandId' IS NULL OR p_command->>'jobId' IS NULL
 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 j:=(p_command->>'jobId')::uuid; c:=(p_command->>'commandId')::uuid;
 WITH RECURSIVE owned_job AS (
   SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=p_digest
   UNION
   SELECT next_job.id FROM owned_job source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job'
     AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
   JOIN app.job next_job ON next_job.tenant_id=e.tenant_id AND next_job.id::text=e.subject_ref
     AND next_job.provenance='imported' AND next_job.practice_session_digest IS NULL
 ) SELECT EXISTS(SELECT 1 FROM owned_job WHERE id=j) INTO owned;
 IF NOT owned THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 -- Same lock order on all phases: authority -> job -> command -> receipt -> finding -> audit.
 -- This synthetic builder endpoint does not accept contractor principals or tenants.
 SELECT revision INTO revision_number FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('decision-check:'||t::text||':'||c::text,0));
 request_digest:=app.final_lock_hash(p_command);
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=c FOR UPDATE;
 IF FOUND AND (prior.command_type<>'finding.evaluate' OR prior.request_hash<>request_digest OR prior.actor_membership_id<>actor)
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 IF p_phase='begin' THEN
   IF prior.command_id IS NOT NULL THEN
     IF prior.status<>'succeeded' THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
     RETURN jsonb_build_object('replay',true,'response',prior.result);
   END IF;
   INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)
     VALUES(c,t,'finding.evaluate','finding-evaluate:'||j::text||':'||c::text,request_digest,'processing',actor);
   RETURN jsonb_build_object('replay',false);
 END IF;
 IF prior.command_id IS NULL OR prior.status<>'processing' OR prior.created_at<>transaction_timestamp()
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 IF p_phase='persist' THEN
   IF p_data IS NULL OR jsonb_typeof(p_data->'findings') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_data->'suppressed') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'findings')>100
   THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
   FOR item IN SELECT value FROM jsonb_array_elements(p_data->'findings') LOOP
     IF item->>'version' IS DISTINCT FROM 'finding.v1' OR (item->>'jobId')::uuid IS DISTINCT FROM j
       OR item - ARRAY['version','fingerprint','kind','classification','title','detail','jobId','subjectRef','actionType','suggestionConfidence'] <> '{}'::jsonb
       OR item->>'fingerprint' IS NULL OR item->>'fingerprint' !~ '^[a-f0-9]{64}$'
       OR (item->>'kind'='required_proof' AND item->>'classification' IS DISTINCT FROM 'mandatory')
     THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
     SELECT decision_id,id INTO did,fid FROM app.job_finding WHERE tenant_id=t AND fingerprint=item->>'fingerprint';
     IF FOUND THEN
       IF NOT EXISTS (SELECT 1 FROM app.job_finding f WHERE f.tenant_id=t AND f.id=fid AND f.job_id=j
         AND (f.kind,f.classification,f.title,f.detail,f.subject_ref,f.action_type)=
           (item->>'kind',item->>'classification',item->>'title',item->>'detail',item->>'subjectRef',item->>'actionType'))
       THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
       repeated:=repeated+1;
     ELSE
       did:=gen_random_uuid(); fid:=gen_random_uuid();
       INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
         VALUES(did,t,'finding',item->>'subjectRef',item->>'actionType');
       INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,suggestion_confidence,snapshot_revision)
         VALUES(fid,t,j,did,item->>'fingerprint',item->>'kind',item->>'classification',item->>'title',item->>'detail',item->>'subjectRef',item->>'actionType',(item->>'suggestionConfidence')::numeric,revision_number);
       added:=added+1;
     END IF;
     IF (p_data->'suppressed') ? (item->>'fingerprint') THEN
       INSERT INTO app.finding_suppression(id,tenant_id,finding_id,reason,policy_version)
         VALUES(gen_random_uuid(),t,fid,'daily_advisory_budget','decision-suppression.v1') ON CONFLICT(tenant_id,finding_id) DO NOTHING;
     END IF;
   END LOOP;
   RETURN jsonb_build_object('created',added,'replayed',repeated);
 ELSIF p_phase='finish' THEN
   IF p_data->'response' IS NULL OR p_data->'response'->>'version' IS DISTINCT FROM 'decision-inbox.v1'
   THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
   UPDATE app.command_receipt SET status='succeeded',result=p_data->'response',completed_at=clock_timestamp()
     WHERE tenant_id=t AND command_id=c;
   -- Audit allocation is the final new lock. All command/domain writes precede it.
   SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();
   seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp()); actor_ref:='membership:'||actor::text;
   payload:=jsonb_build_object('references',jsonb_build_object('commandId',c,'jobId',j)); ph:=app.final_lock_hash(payload);
   eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,actor_ref,'finding.checked','job',j::text,
     to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
   INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
     VALUES(gen_random_uuid(),t,seq,'audit.v1',actor_ref,'finding.checked','job',j::text,ts,payload,ph,prev,eh);
   PERFORM app.advance_audit_head(seq,eh);
   RETURN '{}'::jsonb;
 END IF;
 RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023';
END $$;
ALTER FUNCTION app.decision_check_command(text,jsonb,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.decision_check_command(text,jsonb,text,jsonb) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.decision_check_command(text,jsonb,text,jsonb) TO jobguard_runtime;

-- A phase cannot be committed alone, and a completed response cannot be rewritten.
CREATE FUNCTION app.guard_decision_check_receipt() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.command_type='finding.evaluate') OR (TG_OP='UPDATE' AND (OLD.command_type='finding.evaluate' OR NEW.command_type='finding.evaluate')) THEN
   IF current_user<>'jobguard_migration' OR (TG_OP='UPDATE' AND (OLD.status='succeeded' OR
     (NEW.command_id,NEW.tenant_id,NEW.command_type,NEW.semantic_key,NEW.request_hash,NEW.actor_membership_id,NEW.created_at)
       IS DISTINCT FROM (OLD.command_id,OLD.tenant_id,OLD.command_type,OLD.semantic_key,OLD.request_hash,OLD.actor_membership_id,OLD.created_at)))
   THEN RAISE EXCEPTION 'DECISION_CHECK_IMMUTABLE' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_decision_check_receipt() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_decision_check_receipt() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER decision_check_receipt_guard BEFORE INSERT OR UPDATE ON app.command_receipt FOR EACH ROW EXECUTE FUNCTION app.guard_decision_check_receipt();
CREATE FUNCTION app.require_completed_decision_check() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.command_type='finding.evaluate' AND NOT EXISTS (
   SELECT 1 FROM app.command_receipt r JOIN app.audit_event e ON e.tenant_id=r.tenant_id AND e.event_type='finding.checked'
     AND e.payload->'references'->>'commandId'=r.command_id::text
   WHERE r.tenant_id=NEW.tenant_id AND r.command_id=NEW.command_id AND r.status='succeeded')
 THEN RAISE EXCEPTION 'DECISION_CHECK_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.require_completed_decision_check() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_completed_decision_check() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE CONSTRAINT TRIGGER decision_check_complete AFTER INSERT OR UPDATE ON app.command_receipt DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION app.require_completed_decision_check();
COMMIT;
