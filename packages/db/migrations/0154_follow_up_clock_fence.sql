BEGIN;
-- MIGFIX-8: fix-forward serialization only. No row, column, policy, role or grant changes.
-- Run -> case/intent -> catch-up serialization -> audit head. The fence is transaction-local.
-- A clock winner makes a tick-2 intent stale; a scheduling winner becomes visible before due evaluation.

-- Private invoker trigger helper shared by clock events (including archive) and receipt inserts.
-- Trigger execution needs no application EXECUTE grant; this function exposes no callable capability.
CREATE FUNCTION app.recovery_follow_up_run_fence() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_TENANT_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext('recovery-follow-up-run:'||NEW.run_id::text));
 RETURN NEW;
END $$;
ALTER FUNCTION app.recovery_follow_up_run_fence() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.recovery_follow_up_run_fence() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER a_recovery_follow_up_clock_fence BEFORE INSERT ON app.sandbox_run_event
 FOR EACH ROW EXECUTE FUNCTION app.recovery_follow_up_run_fence();
CREATE TRIGGER a_recovery_follow_up_receipt_fence BEFORE INSERT ON app.sandbox_adapter_receipt
 FOR EACH ROW EXECUTE FUNCTION app.recovery_follow_up_run_fence();

-- Retain all 0115 scheduling refusals and immutable source requirements.
CREATE OR REPLACE FUNCTION app.guard_recovery_follow_up() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record; s record; sm record; tick integer;
BEGIN
 -- Run fence precedes the case key and the clock read for raw and repository scheduling.
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext('recovery-follow-up-run:'||NEW.run_id::text));
 -- The same case key every case command, pack command, message command and delivery boundary takes.
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 SELECT sr.status AS run_status, sr.environment AS run_environment, rj.practice_session_digest AS run_digest, cj.practice_session_digest AS case_digest INTO r
  FROM app.sandbox_run sr JOIN app.job rj ON rj.tenant_id=sr.tenant_id AND rj.id=sr.job_id
  JOIN app.job cj ON cj.tenant_id=sr.tenant_id AND cj.id=NEW.job_id
  WHERE sr.tenant_id=NEW.tenant_id AND sr.id=NEW.run_id;
 -- The run is an active practice run of the very practice session that owns the case's job: nobody else's clock can schedule this.
 IF NOT FOUND OR r.run_status<>'active' OR r.run_environment<>'synthetic_demo' OR r.run_digest IS NULL OR r.run_digest IS DISTINCT FROM r.case_digest
    OR EXISTS (SELECT 1 FROM app.sandbox_run_event a WHERE a.tenant_id=NEW.tenant_id AND a.run_id=NEW.run_id AND a.kind='archived') THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_RUN_INVALID' USING ERRCODE='23514'; END IF;
 tick:=app.recovery_follow_up_run_tick(NEW.tenant_id,NEW.run_id);
 IF NEW.created_tick<>tick THEN RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_CLOCK_INVALID' USING ERRCODE='23514'; END IF;
 -- The source is the newest DELIVERED message, provided every later approved attempt is revoked/cancelled.
 SELECT m.id, m.case_sequence INTO sm FROM app.recovery_message m
  WHERE m.tenant_id=NEW.tenant_id AND m.case_id=NEW.case_id
   AND EXISTS (SELECT 1 FROM app.recovery_message_sink k JOIN app.recovery_message_approval a ON a.tenant_id=k.tenant_id AND a.message_id=k.message_id
     JOIN app.action_outbox o ON o.tenant_id=a.tenant_id AND o.id=a.outbox_action_id
     WHERE k.tenant_id=m.tenant_id AND k.message_id=m.id AND o.status='succeeded')
   AND NOT EXISTS (SELECT 1 FROM app.recovery_message later WHERE later.tenant_id=m.tenant_id AND later.case_id=m.case_id AND later.case_sequence>m.case_sequence
     AND EXISTS (SELECT 1 FROM app.recovery_message_approval a JOIN app.action_outbox o ON o.tenant_id=a.tenant_id AND o.id=a.outbox_action_id
       WHERE a.tenant_id=later.tenant_id AND a.message_id=later.id AND o.status<>'cancelled'))
  ORDER BY m.case_sequence DESC LIMIT 1;
 IF NOT FOUND OR sm.id<>NEW.source_message_id OR sm.case_sequence<>NEW.source_message_sequence
    OR NOT EXISTS (SELECT 1 FROM app.recovery_message_sink k JOIN app.recovery_message_approval a ON a.tenant_id=k.tenant_id AND a.message_id=k.message_id
      JOIN app.action_outbox o ON o.tenant_id=a.tenant_id AND o.id=a.outbox_action_id
      WHERE k.tenant_id=NEW.tenant_id AND k.message_id=NEW.source_message_id AND o.status='succeeded') THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED' USING ERRCODE='23514'; END IF;
 -- The case as the builder reviewed it: still current, synthetic and with something outstanding.
 SELECT * INTO s FROM app.recovery_message_case_snapshot(NEW.tenant_id,NEW.job_id,NEW.case_id);
 IF NOT FOUND OR s.synthetic IS NOT TRUE OR s.environment<>'synthetic_demo' OR s.outstanding_pence<=0 THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_CASE_INVALID' USING ERRCODE='23514'; END IF;
 IF NEW.case_revision<>s.case_revision OR NEW.case_event_sequence IS DISTINCT FROM (SELECT max(e.sequence) FROM app.recovery_case_event e WHERE e.tenant_id=NEW.tenant_id AND e.case_id=NEW.case_id) THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_CHANGED' USING ERRCODE='23514'; END IF;
 -- One live follow-up per case. A stopped or completed one is history, and a reopened case may be given a new reviewed one.
 IF EXISTS (SELECT 1 FROM app.recovery_follow_up o WHERE o.tenant_id=NEW.tenant_id AND o.case_id=NEW.case_id AND app.recovery_follow_up_live(o.tenant_id,o.id)) THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_ALREADY_ACTIVE' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM app.membership mem WHERE mem.tenant_id=NEW.tenant_id AND mem.id=NEW.actor_membership_id AND mem.role='owner' AND mem.revoked_at IS NULL
   AND (mem.expires_at IS NULL OR mem.expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_FORBIDDEN' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;


-- Retain 0115 unique due effects and atomic time_advanced -> became_due audit.
CREATE OR REPLACE FUNCTION app.evaluate_recovery_follow_ups(p_tenant uuid, p_run uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE tick integer; f record; decision uuid; made integer:=0;
 audit_due record; clock_event record; audit_kind text; audit_id uuid; payload_text text; payload_digest text;
 head_sequence bigint; previous_digest text; occurred timestamptz; event_digest text; appended integer:=0;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_TENANT_INVALID' USING ERRCODE='42501'; END IF;
 -- Take the fence before enumerating intents or taking per-intent/audit locks.
 PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext('recovery-follow-up-run:'||p_run::text));
 IF EXISTS (SELECT 1 FROM app.sandbox_run_event e WHERE e.tenant_id=p_tenant AND e.run_id=p_run AND e.kind='archived') THEN RETURN 0; END IF;
 tick:=app.recovery_follow_up_run_tick(p_tenant,p_run);
 FOR f IN SELECT id,job_id,case_id,due_tick FROM app.recovery_follow_up WHERE tenant_id=p_tenant AND run_id=p_run AND due_tick<=tick ORDER BY created_at,id LOOP
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext('recovery-follow-up:'||f.id::text));
  CONTINUE WHEN EXISTS (SELECT 1 FROM app.recovery_follow_up_due d WHERE d.tenant_id=p_tenant AND d.follow_up_id=f.id AND d.period=1);
  CONTINUE WHEN app.recovery_follow_up_stop_reason(p_tenant,f.id) IS NOT NULL;
  decision:=gen_random_uuid();
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision,p_tenant,'recovery_follow_up',f.id::text||':1','recovery.message.simulate');
  INSERT INTO app.recovery_follow_up_due(tenant_id,job_id,case_id,follow_up_id,period,decision_id,due_tick,clock_tick,environment)
   VALUES(p_tenant,f.job_id,f.case_id,f.id,1,decision,f.due_tick,tick,'synthetic_demo');
  INSERT INTO app.recovery_follow_up_event(id,tenant_id,job_id,case_id,follow_up_id,revision,kind,environment)
   VALUES(gen_random_uuid(),p_tenant,f.job_id,f.case_id,f.id,(SELECT coalesce(max(e.revision),0)+1 FROM app.recovery_follow_up_event e WHERE e.tenant_id=p_tenant AND e.follow_up_id=f.id),'became_due','synthetic_demo');
  made:=made+1;
 END LOOP;
 -- All domain mutations and per-intent locks above precede the audit batch. The application catch-up uses the same
 -- serialization key; take it before the audit head, then re-read missing entries under that lock. A second signal or
 -- observer finds the persisted audit_event_id already present. No business lock is acquired after the head.
 IF EXISTS (SELECT 1 FROM app.recovery_follow_up_due du JOIN app.recovery_follow_up fu ON fu.tenant_id=du.tenant_id AND fu.id=du.follow_up_id
   WHERE du.tenant_id=p_tenant AND fu.run_id=p_run
    AND NOT EXISTS (SELECT 1 FROM app.audit_event a WHERE a.tenant_id=du.tenant_id AND a.id=du.audit_event_id)) THEN
  PERFORM pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext('recovery-follow-up-audit'));
  SELECT h.sequence,h.event_hash INTO head_sequence,previous_digest FROM app.lock_audit_head() h;
  FOR audit_due IN SELECT du.* FROM app.recovery_follow_up_due du JOIN app.recovery_follow_up fu ON fu.tenant_id=du.tenant_id AND fu.id=du.follow_up_id
    WHERE du.tenant_id=p_tenant AND fu.run_id=p_run
     AND NOT EXISTS (SELECT 1 FROM app.audit_event a WHERE a.tenant_id=du.tenant_id AND a.id=du.audit_event_id)
    ORDER BY du.created_at,du.follow_up_id LOOP
   SELECT e.command_id,e.payload_hash INTO clock_event FROM app.sandbox_run_event e
    WHERE e.tenant_id=p_tenant AND e.run_id=p_run AND e.kind='advanced' AND e.fake_clock_tick=audit_due.clock_tick
    ORDER BY e.event_index DESC LIMIT 1;
   -- Preserve time_advanced -> became_due history without deferring the due audit to another transaction.
   -- This is the persisted clock's fact, attributed to the system, not a claim of fresh human authorization.
   -- The later application command recognizes this command reference and does not append time_advanced again.
   FOREACH audit_kind IN ARRAY ARRAY['time_advanced','became_due'] LOOP
    IF audit_kind='time_advanced' THEN
     CONTINUE WHEN clock_event.command_id IS NULL OR EXISTS (SELECT 1 FROM app.audit_event a WHERE a.tenant_id=p_tenant
       AND a.subject_type='recovery_follow_up' AND a.subject_ref=audit_due.follow_up_id::text AND a.event_type='recovery.follow_up.time_advanced'
       AND a.payload->'references'->>'commandId'=clock_event.command_id::text);
     audit_id:=gen_random_uuid();
     payload_text:=format('{"classifications":{"action":"commercial"},"hashes":{"clock":"%s"},"references":{"caseId":"%s","commandId":"%s","jobId":"%s","runId":"%s"}}',
       clock_event.payload_hash,audit_due.case_id,clock_event.command_id,audit_due.job_id,p_run);
    ELSE
     audit_id:=audit_due.audit_event_id;
     payload_text:=format('{"classifications":{"action":"commercial"},"hashes":{},"references":{"caseId":"%s","decisionId":"%s","jobId":"%s"}}',
       audit_due.case_id,audit_due.decision_id,audit_due.job_id);
    END IF;
    -- Exactly the audit.ts canonical key order, UTF-8 SHA-256 and UTC millisecond timestamp representation.
    -- Values are server UUIDs and a checked SHA-256, so no free text or unescaped strings enter this payload.
    occurred:=date_trunc('milliseconds',clock_timestamp());
    payload_digest:=encode(sha256(convert_to(payload_text,'UTF8')),'hex');
    head_sequence:=head_sequence+1;
    event_digest:=encode(sha256(convert_to(array_to_string(ARRAY['audit.v1',p_tenant::text,head_sequence::text,
      'system:recovery-follow-up-clock','recovery.follow_up.'||audit_kind,'recovery_follow_up',audit_due.follow_up_id::text,
      to_char(occurred AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),payload_digest,coalesce(previous_digest,'')],chr(31)),'UTF8')),'hex');
    INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
     VALUES(audit_id,p_tenant,head_sequence,'audit.v1','system:recovery-follow-up-clock','recovery.follow_up.'||audit_kind,
       'recovery_follow_up',audit_due.follow_up_id::text,occurred,payload_text::jsonb,payload_digest,previous_digest,event_digest);
    previous_digest:=event_digest;
    appended:=appended+1;
   END LOOP;
  END LOOP;
  -- A concurrent observer may have completed the legacy catch-up while this transaction waited for the audit lock.
  IF appended>0 THEN
   PERFORM app.advance_audit_head(head_sequence,previous_digest::char(64));
  END IF;
 END IF;
 RETURN made;
END $$;

COMMIT;
