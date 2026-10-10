BEGIN;
-- M4-6-S: a persisted practice recovery follow-up. Expand-only: no existing table, column, grant or policy changes; the preceding demo keeps running.
-- Six new tables (tenant-owned, FORCE RLS, migration-owned, runtime SELECT/INSERT only) and one AFTER INSERT trigger on SBOX-2's
-- app.sandbox_run_event. The three M4-5-S guards are restated below with exactly one exception each, which only an open follow-up reminder can use.
--
--  * app.recovery_follow_up           the durable intent: bound to one delivered M4-5-S message, the case revision the builder reviewed and
--                                     one SBOX-2 practice run. Its due time is the run's own fake clock (fake_clock_tick), never wall time.
--  * app.recovery_follow_up_owner     exactly one persisted scheduling owner per intent (unique, and required at commit).
--  * app.recovery_follow_up_event     append-only history: scheduled, became_due, reminder_previewed, reminder_approved, cancelled.
--  * app.recovery_follow_up_due       the one due Decision per intent and due period (unique). A due Decision is created PENDING: no
--                                     resolution, authorization or outbox row exists, and passing time can create none.
--  * app.recovery_follow_up_reminder  the M4-5-S messages previewed as this intent's reminder; sending one still needs an explicit approval.
--  * app.recovery_follow_up_advance   the ledger of `Advance practice time` commands, for exact replay and conflict detection.

CREATE TABLE app.recovery_follow_up (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, run_id uuid NOT NULL,
 source_message_id uuid NOT NULL, source_message_sequence integer NOT NULL CHECK (source_message_sequence>0),
 case_revision integer NOT NULL CHECK (case_revision>0),
 -- The newest case event the builder had seen. Only later events can end this follow-up; an earlier close or dispute is history.
 case_event_sequence integer NOT NULL CHECK (case_event_sequence>0),
 created_tick integer NOT NULL CHECK (created_tick BETWEEN 0 AND 2),
 due_tick integer NOT NULL CHECK (due_tick BETWEEN 1 AND 3),
 due_after_ticks integer NOT NULL CHECK (due_after_ticks=1),
 fixture_version varchar(60) NOT NULL CHECK (fixture_version='recovery-follow-up-fixture.v1'),
 command_id uuid NOT NULL, request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 actor_membership_id uuid NOT NULL,
 environment varchar(30) NOT NULL CHECK (environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,command_id), UNIQUE (tenant_id,job_id,case_id,id), UNIQUE (tenant_id,id,run_id),
 CONSTRAINT recovery_follow_up_due_tick CHECK (due_tick=created_tick+due_after_ticks),
 FOREIGN KEY (tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY (tenant_id,job_id,case_id,source_message_id) REFERENCES app.recovery_message(tenant_id,job_id,case_id,id),
 FOREIGN KEY (tenant_id,run_id) REFERENCES app.sandbox_run(tenant_id,id),
 FOREIGN KEY (tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE INDEX recovery_follow_up_run_idx ON app.recovery_follow_up(tenant_id,run_id);
CREATE INDEX recovery_follow_up_case_idx ON app.recovery_follow_up(tenant_id,case_id);

CREATE TABLE app.recovery_follow_up_owner (
 tenant_id uuid NOT NULL, follow_up_id uuid NOT NULL, run_id uuid NOT NULL,
 -- The only owner the synthetic slice has. A workflow engine is a later owner and is deliberately not representable here.
 owner_kind varchar(40) NOT NULL CHECK (owner_kind='practice_fake_clock'),
 environment varchar(30) NOT NULL CHECK (environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,follow_up_id),
 FOREIGN KEY (tenant_id,follow_up_id,run_id) REFERENCES app.recovery_follow_up(tenant_id,id,run_id)
);

CREATE TABLE app.recovery_follow_up_event (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, follow_up_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision>0),
 kind varchar(30) NOT NULL CHECK (kind IN ('scheduled','became_due','reminder_previewed','reminder_approved','cancelled')),
 command_id uuid, request_hash char(64) CHECK (request_hash IS NULL OR request_hash ~ '^[0-9a-f]{64}$'),
 actor_membership_id uuid,
 environment varchar(30) NOT NULL CHECK (environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,follow_up_id,revision),
 -- Reaching the due time is the practice clock's act: it names no person and no command. Everything else is a person's command.
 CONSTRAINT recovery_follow_up_event_actor CHECK ((kind='became_due')=(actor_membership_id IS NULL AND command_id IS NULL AND request_hash IS NULL)),
 FOREIGN KEY (tenant_id,job_id,case_id,follow_up_id) REFERENCES app.recovery_follow_up(tenant_id,job_id,case_id,id),
 FOREIGN KEY (tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE UNIQUE INDEX recovery_follow_up_event_command ON app.recovery_follow_up_event(tenant_id,command_id,kind) WHERE command_id IS NOT NULL;
-- A follow-up is scheduled once, comes due once and is cancelled once: a repeated signal can only meet the row that already exists.
CREATE UNIQUE INDEX recovery_follow_up_event_scheduled ON app.recovery_follow_up_event(tenant_id,follow_up_id) WHERE kind='scheduled';
CREATE UNIQUE INDEX recovery_follow_up_event_became_due ON app.recovery_follow_up_event(tenant_id,follow_up_id) WHERE kind='became_due';
CREATE UNIQUE INDEX recovery_follow_up_event_cancelled ON app.recovery_follow_up_event(tenant_id,follow_up_id) WHERE kind='cancelled';

CREATE TABLE app.recovery_follow_up_due (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, follow_up_id uuid NOT NULL,
 period integer NOT NULL CHECK (period=1),
 decision_id uuid NOT NULL,
 due_tick integer NOT NULL CHECK (due_tick BETWEEN 1 AND 3), clock_tick integer NOT NULL CHECK (clock_tick BETWEEN 1 AND 3),
 -- The audit event for this transition is appended by the application in the command that observed it; this id makes that append exactly-once.
 audit_event_id uuid NOT NULL DEFAULT gen_random_uuid(),
 environment varchar(30) NOT NULL CHECK (environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,follow_up_id,period), UNIQUE (tenant_id,decision_id), UNIQUE (tenant_id,audit_event_id),
 CHECK (clock_tick>=due_tick),
 FOREIGN KEY (tenant_id,job_id,case_id,follow_up_id) REFERENCES app.recovery_follow_up(tenant_id,job_id,case_id,id),
 FOREIGN KEY (tenant_id,decision_id) REFERENCES app.decision(tenant_id,id)
);

CREATE TABLE app.recovery_follow_up_reminder (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, follow_up_id uuid NOT NULL,
 period integer NOT NULL CHECK (period=1), attempt integer NOT NULL CHECK (attempt>0), message_id uuid NOT NULL,
 environment varchar(30) NOT NULL CHECK (environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,message_id), UNIQUE (tenant_id,follow_up_id,period,attempt),
 FOREIGN KEY (tenant_id,job_id,case_id,message_id) REFERENCES app.recovery_message(tenant_id,job_id,case_id,id),
 FOREIGN KEY (tenant_id,job_id,case_id,follow_up_id) REFERENCES app.recovery_follow_up(tenant_id,job_id,case_id,id),
 FOREIGN KEY (tenant_id,follow_up_id,period) REFERENCES app.recovery_follow_up_due(tenant_id,follow_up_id,period)
);

CREATE TABLE app.recovery_follow_up_advance (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, run_id uuid NOT NULL, follow_up_id uuid NOT NULL,
 request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 tick_before integer NOT NULL CHECK (tick_before BETWEEN 0 AND 3), tick_after integer NOT NULL CHECK (tick_after BETWEEN 0 AND 3),
 actor_membership_id uuid NOT NULL,
 environment varchar(30) NOT NULL CHECK (environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,command_id), CHECK (tick_after>=tick_before),
 FOREIGN KEY (tenant_id,run_id) REFERENCES app.sandbox_run(tenant_id,id),
 FOREIGN KEY (tenant_id,follow_up_id,run_id) REFERENCES app.recovery_follow_up(tenant_id,id,run_id),
 FOREIGN KEY (tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

-- ---- Facts, read the same way by every guard and by the application ---------------------------------------------------------------------

-- SBOX-2's per-run fake clock: the number of adapter receipts the run has recorded (its `fakeClockTick` / `step`). It is the only clock a follow-up knows.
CREATE FUNCTION app.recovery_follow_up_run_tick(p_tenant uuid, p_run uuid) RETURNS integer LANGUAGE sql STABLE AS $$
 SELECT count(*)::integer FROM app.sandbox_adapter_receipt WHERE tenant_id=p_tenant AND run_id=p_run
$$;

-- The case facts after the event the builder had seen. Mirrors followUpCaseFacts() in packages/core (Q3): dispute = dispute; settlement =
-- close_recovered; cancel = close_no_recovery / write_off / prevent; reopened = resume_pursuit or reverse_landing AFTER the first of those.
CREATE FUNCTION app.recovery_follow_up_case_facts(p_tenant uuid, p_case uuid, p_after integer) RETURNS TABLE(stop_reason text, reopened boolean) LANGUAGE sql STABLE AS $$
 WITH later AS (SELECT sequence, event_type FROM app.recovery_case_event WHERE tenant_id=p_tenant AND case_id=p_case AND sequence>p_after),
 stop AS (SELECT sequence, CASE event_type WHEN 'dispute' THEN 'case_disputed' WHEN 'close_recovered' THEN 'case_settled' ELSE 'case_cancelled' END AS reason
  FROM later WHERE event_type IN ('dispute','close_recovered','close_no_recovery','write_off','prevent') ORDER BY sequence LIMIT 1)
 SELECT (SELECT reason FROM stop), EXISTS (SELECT 1 FROM later l, stop s WHERE l.sequence>s.sequence AND l.event_type IN ('resume_pursuit','reverse_landing'))
$$;

-- Why a follow-up has ended, or NULL while it has not: its own cancellation, the first ending case fact since it was reviewed, or an archived run.
CREATE FUNCTION app.recovery_follow_up_stop_reason(p_tenant uuid, p_follow_up uuid) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT CASE
  WHEN EXISTS (SELECT 1 FROM app.recovery_follow_up_event e WHERE e.tenant_id=f.tenant_id AND e.follow_up_id=f.id AND e.kind='cancelled') THEN 'cancelled'
  WHEN cf.stop_reason IS NOT NULL THEN cf.stop_reason
  WHEN EXISTS (SELECT 1 FROM app.sandbox_run_event a WHERE a.tenant_id=f.tenant_id AND a.run_id=f.run_id AND a.kind='archived') THEN 'run_archived'
 END
 FROM app.recovery_follow_up f CROSS JOIN LATERAL app.recovery_follow_up_case_facts(f.tenant_id,f.case_id,f.case_event_sequence) cf
 WHERE f.tenant_id=p_tenant AND f.id=p_follow_up
$$;

-- A reminder that the practice provider has recorded completes its follow-up.
CREATE FUNCTION app.recovery_follow_up_delivered(p_tenant uuid, p_follow_up uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (SELECT 1 FROM app.recovery_follow_up_reminder l JOIN app.recovery_message_sink s ON s.tenant_id=l.tenant_id AND s.message_id=l.message_id
  WHERE l.tenant_id=p_tenant AND l.follow_up_id=p_follow_up)
$$;

-- A follow-up is live until it is stopped or completed. At most one is live per case.
CREATE FUNCTION app.recovery_follow_up_live(p_tenant uuid, p_follow_up uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT app.recovery_follow_up_stop_reason(p_tenant,p_follow_up) IS NULL AND NOT app.recovery_follow_up_delivered(p_tenant,p_follow_up)
$$;

-- The follow-up whose reminder may be previewed or approved for this case right now, or NULL. It is open only while: the reminder is due,
-- the follow-up has not stopped, and every message effect on the case is a DELIVERED message from before the follow-up was scheduled.
-- A queued, running, unknown, retryable or newer delivered approval keeps M4-5-S's one-effect rule fully in force.
CREATE FUNCTION app.recovery_follow_up_reminder_window(p_tenant uuid, p_case uuid) RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT f.id FROM app.recovery_follow_up f
 JOIN app.recovery_follow_up_due d ON d.tenant_id=f.tenant_id AND d.follow_up_id=f.id AND d.period=1
 WHERE f.tenant_id=p_tenant AND f.case_id=p_case
  AND app.recovery_follow_up_stop_reason(f.tenant_id,f.id) IS NULL AND NOT app.recovery_follow_up_delivered(f.tenant_id,f.id)
  AND NOT EXISTS (
   SELECT 1 FROM app.recovery_message_approval x
   JOIN app.action_outbox xo ON xo.tenant_id=x.tenant_id AND xo.id=x.outbox_action_id
   JOIN app.recovery_message xm ON xm.tenant_id=x.tenant_id AND xm.id=x.message_id
   WHERE x.tenant_id=f.tenant_id AND x.case_id=f.case_id AND xo.status<>'cancelled'
    AND NOT (xm.case_sequence<=f.source_message_sequence AND xo.status='succeeded'))
 ORDER BY f.created_at DESC, f.id LIMIT 1
$$;

-- The message may be approved as a reminder only if it is the newest message of the case, is its follow-up's newest linked reminder, and the window is open.
CREATE FUNCTION app.recovery_follow_up_reminder_approvable(p_tenant uuid, p_case uuid, p_message uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT EXISTS (
  SELECT 1 FROM app.recovery_follow_up_reminder l
  JOIN app.recovery_message m ON m.tenant_id=l.tenant_id AND m.id=l.message_id
  WHERE l.tenant_id=p_tenant AND l.case_id=p_case AND l.message_id=p_message
   AND l.attempt=(SELECT max(x.attempt) FROM app.recovery_follow_up_reminder x WHERE x.tenant_id=l.tenant_id AND x.follow_up_id=l.follow_up_id AND x.period=l.period)
   AND m.case_sequence=(SELECT max(y.case_sequence) FROM app.recovery_message y WHERE y.tenant_id=m.tenant_id AND y.case_id=m.case_id)
   AND app.recovery_follow_up_reminder_window(p_tenant,p_case)=l.follow_up_id)
$$;

-- ---- The three M4-5-S guards, restated with their one M4-6-S exception each (bodies otherwise exactly as in 0107) ----------------------
CREATE OR REPLACE FUNCTION app.guard_recovery_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s record; pounds text; expected_body text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 SELECT * INTO s FROM app.recovery_message_case_snapshot(NEW.tenant_id,NEW.job_id,NEW.case_id);
 IF NOT FOUND OR s.synthetic IS NOT TRUE OR s.environment<>'synthetic_demo' OR s.case_type<>NEW.case_type THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CASE_INVALID' USING ERRCODE='23514'; END IF;
 IF NEW.case_revision<>s.case_revision OR NEW.amount_pence<>s.outstanding_pence OR app.recovery_message_source_refs(NEW.immutable_content) IS DISTINCT FROM s.source_refs THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 -- A message whose approval is still an effect (queued, running, unknown, retryable or delivered) is never hidden by a newer preview.
 IF EXISTS (SELECT 1 FROM app.recovery_message_approval x JOIN app.action_outbox xo ON xo.tenant_id=x.tenant_id AND xo.id=x.outbox_action_id
   WHERE x.tenant_id=NEW.tenant_id AND x.case_id=NEW.case_id AND xo.status<>'cancelled')
  -- M4-6-S: the one exception. While a follow-up's reminder is due and nothing but earlier DELIVERED messages stand, the reminder may be previewed.
  AND app.recovery_follow_up_reminder_window(NEW.tenant_id,NEW.case_id) IS NULL THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_EXISTING_EFFECT' USING ERRCODE='23514'; END IF;
 pounds:=to_char(NEW.amount_pence::numeric/100,'FM9,999,999,999,990.00');
 expected_body:=CASE NEW.case_type WHEN 'merchant_overcharge'
  THEN format('Practice message — not sent. Our practice supplier records show £%s net is questioned in this supplier correction case. Please review the attached example supplier records.',pounds)
  ELSE format('Practice message — not sent. Our practice records show £%s net remains in this case. Please review the attached example records.',pounds) END;
 IF NEW.body<>expected_body THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 IF NEW.pack_revision IS DISTINCT FROM (SELECT max(p.revision) FROM app.evidence_pack_revision p WHERE p.tenant_id=NEW.tenant_id AND p.case_id=NEW.case_id) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM app.evidence_pack_revision p WHERE p.tenant_id=NEW.tenant_id AND p.job_id=NEW.job_id AND p.case_id=NEW.case_id AND p.pack_id=NEW.pack_id
   AND p.revision=NEW.pack_revision AND p.manifest_hash=NEW.manifest_hash AND p.content_hash=NEW.attachment_hash) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_PACK_INVALID' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM app.evidence_pack_attachment_approval a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.attachment_approval_id AND a.job_id=NEW.job_id
   AND a.case_id=NEW.case_id AND a.pack_id=NEW.pack_id AND a.manifest_hash=NEW.manifest_hash AND a.content_hash=NEW.attachment_hash) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED' USING ERRCODE='23514'; END IF;
 IF NEW.case_sequence<>coalesce((SELECT max(m.case_sequence) FROM app.recovery_message m WHERE m.tenant_id=NEW.tenant_id AND m.case_id=NEW.case_id),0)+1 THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_SEQUENCE_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.guard_recovery_message_approval() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s record;
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM app.recovery_message m
  JOIN app.action_authorization a ON a.tenant_id=m.tenant_id AND a.id=NEW.authorization_id
  JOIN app.decision d ON d.tenant_id=a.tenant_id AND d.id=a.decision_id
  JOIN app.decision_resolution r ON r.tenant_id=a.tenant_id AND r.id=a.resolution_id
  JOIN app.membership mem ON mem.tenant_id=a.tenant_id AND mem.id=a.actor_membership_id
  JOIN app.action_outbox o ON o.tenant_id=m.tenant_id AND o.id=NEW.outbox_action_id
  WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.message_id AND m.job_id=NEW.job_id AND m.case_id=NEW.case_id
   AND ((d.subject_type='recovery_message' AND d.subject_ref=m.id::text) OR
    -- M4-6-S: the first approval of a follow-up's reminder resolves the follow-up's own due Decision, never a second one.
    (d.subject_type='recovery_follow_up' AND EXISTS (SELECT 1 FROM app.recovery_follow_up_due du JOIN app.recovery_follow_up_reminder rl
      ON rl.tenant_id=du.tenant_id AND rl.follow_up_id=du.follow_up_id AND rl.period=du.period
      WHERE du.tenant_id=d.tenant_id AND du.decision_id=d.id AND rl.message_id=m.id AND d.subject_ref=du.follow_up_id::text||':'||du.period::text)))
   AND d.action_type='recovery.message.simulate'
   AND r.resolution='approved' AND mem.role='owner' AND mem.revoked_at IS NULL AND (mem.expires_at IS NULL OR mem.expires_at>clock_timestamp())
   AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND a.action_type='recovery.message.simulate' AND a.recipient=m.recipient
   AND a.content_hash=m.content_hash AND a.amount_pence=m.amount_pence AND a.currency='GBP' AND a.aggregate_revision=m.case_revision AND a.policy_version=m.policy_version
   AND o.authorization_id=a.id AND o.adapter='fake_recovery_message' AND o.provider_effect_key='recovery-message:'||m.id::text AND o.action_type=a.action_type
   AND o.recipient=m.recipient AND o.content_hash=m.content_hash AND o.immutable_content=m.immutable_content AND o.amount_pence=a.amount_pence
   AND o.currency=a.currency AND o.policy_version=a.policy_version AND o.aggregate_revision=a.aggregate_revision AND o.authorization_expires_at=a.expires_at AND o.status='pending')
 THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 -- Only the newest preview may be approved, and only against the case as it stands now.
 SELECT * INTO s FROM app.recovery_message_case_snapshot(NEW.tenant_id,NEW.job_id,NEW.case_id);
 IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM app.recovery_message m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.message_id AND m.case_revision=s.case_revision AND m.amount_pence=s.outstanding_pence
   AND m.case_sequence=(SELECT max(x.case_sequence) FROM app.recovery_message x WHERE x.tenant_id=m.tenant_id AND x.case_id=m.case_id)) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 -- One live approval per case: a delivered, unknown or queued message is an effect that a new approval must not bypass.
 IF EXISTS (SELECT 1 FROM app.recovery_message_approval x JOIN app.action_outbox xo ON xo.tenant_id=x.tenant_id AND xo.id=x.outbox_action_id
   WHERE x.tenant_id=NEW.tenant_id AND x.case_id=NEW.case_id AND x.message_id<>NEW.message_id AND xo.status<>'cancelled')
  AND NOT app.recovery_follow_up_reminder_approvable(NEW.tenant_id,NEW.case_id,NEW.message_id) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_EXISTING_EFFECT' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION app.guard_recovery_message_sink() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE m app.recovery_message; s record; latest_pack integer; pack_sources jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 PERFORM app.lock_recovery_message_sources(NEW.tenant_id);
 SELECT * INTO m FROM app.recovery_message WHERE tenant_id=NEW.tenant_id AND id=NEW.message_id AND job_id=NEW.job_id AND case_id=NEW.case_id;
 IF NOT FOUND OR NOT EXISTS (
  SELECT 1 FROM app.recovery_message_approval ap
  JOIN app.action_outbox o ON o.tenant_id=ap.tenant_id AND o.id=ap.outbox_action_id
  JOIN app.action_authorization a ON a.tenant_id=o.tenant_id AND a.id=o.authorization_id
  JOIN app.decision_resolution r ON r.tenant_id=a.tenant_id AND r.id=a.resolution_id AND r.resolution='approved'
  JOIN app.membership mem ON mem.tenant_id=a.tenant_id AND mem.id=a.actor_membership_id AND mem.role='owner' AND mem.revoked_at IS NULL
   AND (mem.expires_at IS NULL OR mem.expires_at>clock_timestamp())
  WHERE ap.tenant_id=m.tenant_id AND ap.message_id=m.id AND ap.outbox_action_id=NEW.outbox_action_id
   AND o.status='executing' AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
   AND m.recipient=NEW.recipient AND m.body=NEW.body AND m.content_hash=NEW.content_hash AND m.attachment_hash=NEW.attachment_hash
  FOR SHARE OF a,mem,o)
 THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_SINK_INVALID' USING ERRCODE='23514'; END IF;
 -- M4-6-S: a reminder whose follow-up has stopped (cancelled, or its practice run archived) is never recorded as delivered.
 IF EXISTS (SELECT 1 FROM app.recovery_follow_up_reminder l WHERE l.tenant_id=m.tenant_id AND l.message_id=m.id
   AND app.recovery_follow_up_stop_reason(l.tenant_id,l.follow_up_id) IS NOT NULL) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 SELECT * INTO s FROM app.recovery_message_case_snapshot(m.tenant_id,m.job_id,m.case_id);
 IF NOT FOUND OR s.synthetic IS NOT TRUE OR s.environment<>'synthetic_demo' OR s.case_revision<>m.case_revision OR s.outstanding_pence<>m.amount_pence
    OR app.recovery_message_source_refs(m.immutable_content) IS DISTINCT FROM s.source_refs THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 SELECT max(p.revision) INTO latest_pack FROM app.evidence_pack_revision p WHERE p.tenant_id=m.tenant_id AND p.case_id=m.case_id;
 SELECT p.sources INTO pack_sources FROM app.evidence_pack_revision p
  WHERE p.tenant_id=m.tenant_id AND p.job_id=m.job_id AND p.case_id=m.case_id AND p.pack_id=m.pack_id AND p.revision=m.pack_revision
   AND p.manifest_hash=m.manifest_hash AND p.content_hash=m.attachment_hash
   AND p.source_omissions='[]'::jsonb AND p.format='TEXT' AND p.artifact_text IS NOT NULL
   AND encode(sha256(convert_to(p.artifact_text,'UTF8')),'hex')=p.content_hash
   AND encode(sha256(convert_to(p.canonical_manifest,'UTF8')),'hex')=p.manifest_hash;
 IF latest_pack IS DISTINCT FROM m.pack_revision OR pack_sources IS NULL
    OR NOT EXISTS (SELECT 1 FROM app.evidence_pack_attachment_approval x WHERE x.tenant_id=m.tenant_id AND x.id=m.attachment_approval_id AND x.pack_id=m.pack_id
      AND x.manifest_hash=m.manifest_hash AND x.content_hash=m.attachment_hash)
    OR NOT app.recovery_message_proofs_current(m.tenant_id,m.job_id,pack_sources)
    OR NOT app.recovery_message_sources_current(m.tenant_id,m.job_id,m.case_id,pack_sources) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

-- ---- Guards: nothing here trusts the caller ---------------------------------------------------------------------------------------------

CREATE FUNCTION app.guard_recovery_follow_up() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record; s record; sm record; tick integer;
BEGIN
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
 -- The message is the newest APPROVED message of the case, and the practice provider has recorded it.
 SELECT m.id, m.case_sequence INTO sm FROM app.recovery_message m
  WHERE m.tenant_id=NEW.tenant_id AND m.case_id=NEW.case_id
   AND EXISTS (SELECT 1 FROM app.recovery_message_approval a WHERE a.tenant_id=m.tenant_id AND a.message_id=m.id)
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
CREATE TRIGGER recovery_follow_up_guard BEFORE INSERT ON app.recovery_follow_up FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_follow_up();

-- Every intent has exactly one owner and its `scheduled` event by the time the transaction ends.
CREATE FUNCTION app.require_recovery_follow_up_parts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM app.recovery_follow_up_owner o WHERE o.tenant_id=NEW.tenant_id AND o.follow_up_id=NEW.id AND o.run_id=NEW.run_id)
    OR NOT EXISTS (SELECT 1 FROM app.recovery_follow_up_event e WHERE e.tenant_id=NEW.tenant_id AND e.follow_up_id=NEW.id AND e.kind='scheduled' AND e.revision=1
       AND e.command_id=NEW.command_id AND e.actor_membership_id=NEW.actor_membership_id) THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_INCOMPLETE' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER recovery_follow_up_parts AFTER INSERT ON app.recovery_follow_up DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_recovery_follow_up_parts();

CREATE FUNCTION app.guard_recovery_follow_up_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM app.recovery_follow_up f WHERE f.tenant_id=NEW.tenant_id AND f.id=NEW.follow_up_id AND f.run_id=NEW.run_id) THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_OWNER_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_follow_up_owner_guard BEFORE INSERT ON app.recovery_follow_up_owner FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_follow_up_owner();

-- History is a narrative of facts: a legal step from the previous kind, and the due row, link, approval or absence of one that it claims.
CREATE FUNCTION app.guard_recovery_follow_up_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prev text; prev_revision integer; f record; attempts integer; live_effect boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext('recovery-follow-up:'||NEW.follow_up_id::text));
 SELECT e.kind,e.revision INTO prev,prev_revision FROM app.recovery_follow_up_event e WHERE e.tenant_id=NEW.tenant_id AND e.follow_up_id=NEW.follow_up_id ORDER BY e.revision DESC LIMIT 1;
 IF NEW.revision<>coalesce(prev_revision,0)+1 OR (NEW.revision=1)<>(NEW.kind='scheduled') THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_EVENT_SEQUENCE_INVALID' USING ERRCODE='23514'; END IF;
 SELECT * INTO f FROM app.recovery_follow_up WHERE tenant_id=NEW.tenant_id AND id=NEW.follow_up_id;
 IF NEW.kind='scheduled' THEN
  IF NEW.command_id IS DISTINCT FROM f.command_id OR NEW.request_hash IS DISTINCT FROM f.request_hash OR NEW.actor_membership_id IS DISTINCT FROM f.actor_membership_id THEN
   RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_EVENT_FACTS_INVALID' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NOT coalesce(CASE NEW.kind
   WHEN 'became_due' THEN prev='scheduled'
   WHEN 'reminder_previewed' THEN prev IN ('became_due','reminder_previewed','reminder_approved')
   WHEN 'reminder_approved' THEN prev='reminder_previewed'
   WHEN 'cancelled' THEN prev IN ('scheduled','became_due','reminder_previewed','reminder_approved')
   ELSE false END,false) THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_EVENT_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO attempts FROM app.recovery_follow_up_reminder l WHERE l.tenant_id=NEW.tenant_id AND l.follow_up_id=NEW.follow_up_id;
 IF NOT coalesce(CASE NEW.kind
   WHEN 'became_due' THEN EXISTS (SELECT 1 FROM app.recovery_follow_up_due d WHERE d.tenant_id=NEW.tenant_id AND d.follow_up_id=NEW.follow_up_id)
   -- One preview event per linked reminder message, written in the transaction that links it.
   WHEN 'reminder_previewed' THEN attempts=(SELECT count(*) FROM app.recovery_follow_up_event e WHERE e.tenant_id=NEW.tenant_id AND e.follow_up_id=NEW.follow_up_id AND e.kind='reminder_previewed')+1
   -- The newest linked reminder carries a live approval of this follow-up's own.
   WHEN 'reminder_approved' THEN EXISTS (SELECT 1 FROM app.recovery_follow_up_reminder l
      JOIN app.recovery_message_approval a ON a.tenant_id=l.tenant_id AND a.message_id=l.message_id
      JOIN app.action_outbox o ON o.tenant_id=a.tenant_id AND o.id=a.outbox_action_id
      WHERE l.tenant_id=NEW.tenant_id AND l.follow_up_id=NEW.follow_up_id AND l.attempt=attempts AND o.status<>'cancelled')
   -- An approved, queued or delivered reminder is revoked, not cancelled away: a cancellation never hides an effect.
   WHEN 'cancelled' THEN NOT EXISTS (SELECT 1 FROM app.recovery_follow_up_reminder l
      JOIN app.recovery_message_approval a ON a.tenant_id=l.tenant_id AND a.message_id=l.message_id
      JOIN app.action_outbox o ON o.tenant_id=a.tenant_id AND o.id=a.outbox_action_id
      WHERE l.tenant_id=NEW.tenant_id AND l.follow_up_id=NEW.follow_up_id AND o.status<>'cancelled')
   ELSE false END,false) THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_EVENT_FACTS_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_follow_up_event_guard BEFORE INSERT ON app.recovery_follow_up_event FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_follow_up_event();

-- The due Decision: pending at birth, named for its intent and period, created only because the follow-up's own clock reached its due tick.
CREATE FUNCTION app.guard_recovery_follow_up_due() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f record; tick integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext('recovery-follow-up:'||NEW.follow_up_id::text));
 SELECT * INTO f FROM app.recovery_follow_up WHERE tenant_id=NEW.tenant_id AND id=NEW.follow_up_id;
 IF NOT FOUND OR NEW.due_tick<>f.due_tick THEN RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_DUE_INVALID' USING ERRCODE='23514'; END IF;
 tick:=app.recovery_follow_up_run_tick(NEW.tenant_id,f.run_id);
 IF tick<f.due_tick OR NEW.clock_tick<>tick OR app.recovery_follow_up_stop_reason(NEW.tenant_id,NEW.follow_up_id) IS NOT NULL THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_DUE_INVALID' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS (SELECT 1 FROM app.decision d WHERE d.tenant_id=NEW.tenant_id AND d.id=NEW.decision_id AND d.subject_type='recovery_follow_up'
    AND d.subject_ref=NEW.follow_up_id::text||':'||NEW.period::text AND d.action_type='recovery.message.simulate')
    -- Elapsed time never creates consent: the Decision has no resolution and nothing is authorized or queued for it.
    OR EXISTS (SELECT 1 FROM app.decision_resolution r WHERE r.tenant_id=NEW.tenant_id AND r.decision_id=NEW.decision_id)
    OR EXISTS (SELECT 1 FROM app.action_authorization a WHERE a.tenant_id=NEW.tenant_id AND a.decision_id=NEW.decision_id) THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_DUE_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_follow_up_due_guard BEFORE INSERT ON app.recovery_follow_up_due FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_follow_up_due();

-- A reminder link: the newest message of the case, newer than the one the follow-up came from, while the follow-up is due and has not stopped.
CREATE FUNCTION app.guard_recovery_follow_up_reminder() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f record; m record; previous record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext('recovery-follow-up:'||NEW.follow_up_id::text));
 SELECT * INTO f FROM app.recovery_follow_up WHERE tenant_id=NEW.tenant_id AND id=NEW.follow_up_id;
 SELECT * INTO m FROM app.recovery_message WHERE tenant_id=NEW.tenant_id AND id=NEW.message_id;
 IF NOT FOUND OR f.id IS NULL OR m.case_sequence<=f.source_message_sequence
    OR m.case_sequence<>(SELECT max(x.case_sequence) FROM app.recovery_message x WHERE x.tenant_id=NEW.tenant_id AND x.case_id=NEW.case_id)
    OR app.recovery_follow_up_reminder_window(NEW.tenant_id,NEW.case_id) IS DISTINCT FROM NEW.follow_up_id
    OR NEW.attempt<>coalesce((SELECT max(l.attempt) FROM app.recovery_follow_up_reminder l WHERE l.tenant_id=NEW.tenant_id AND l.follow_up_id=NEW.follow_up_id),0)+1 THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_REMINDER_INVALID' USING ERRCODE='23514'; END IF;
 -- A reminder that carries a live approval is replaced by revoking it, never by previewing another.
 SELECT l.message_id INTO previous FROM app.recovery_follow_up_reminder l
  JOIN app.recovery_message_approval a ON a.tenant_id=l.tenant_id AND a.message_id=l.message_id
  JOIN app.action_outbox o ON o.tenant_id=a.tenant_id AND o.id=a.outbox_action_id
  WHERE l.tenant_id=NEW.tenant_id AND l.follow_up_id=NEW.follow_up_id AND o.status<>'cancelled' LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_REMINDER_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_follow_up_reminder_guard BEFORE INSERT ON app.recovery_follow_up_reminder FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_follow_up_reminder();

-- ---- Due evaluation, on SBOX-2's own clock ---------------------------------------------------------------------------------------------

-- Idempotent and safe to signal any number of times, from any connection: it reads only the run's persisted fake clock and the intent's
-- persisted facts, takes the intent's lock, and creates a missing due Decision at most once. It writes a PENDING Decision, a due row and
-- an event. It creates no resolution, authorization, outbox action, message or sink row, and it never reads wall-clock time to decide.
CREATE FUNCTION app.evaluate_recovery_follow_ups(p_tenant uuid, p_run uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE tick integer; f record; decision uuid; made integer:=0;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'RECOVERY_FOLLOW_UP_TENANT_INVALID' USING ERRCODE='42501'; END IF;
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
 RETURN made;
END $$;

-- SBOX-2's `advance` records its `advanced` event after its receipt, in its own transaction. This trigger runs inside that same transaction,
-- so the due evaluation commits with the advance or rolls back with it. SBOX-2's code, tables and behaviour are untouched; a run with no
-- follow-up does exactly what it did before.
CREATE FUNCTION app.recovery_follow_up_on_sandbox_advance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM app.evaluate_recovery_follow_ups(NEW.tenant_id,NEW.run_id);
 RETURN NULL;
END $$;
CREATE TRIGGER recovery_follow_up_due_on_advance AFTER INSERT ON app.sandbox_run_event FOR EACH ROW WHEN (NEW.kind='advanced') EXECUTE FUNCTION app.recovery_follow_up_on_sandbox_advance();

-- ---- Ownership, row security and grants -------------------------------------------------------------------------------------------------

DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['recovery_follow_up','recovery_follow_up_owner','recovery_follow_up_event','recovery_follow_up_due','recovery_follow_up_reminder','recovery_follow_up_advance'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP; END $$;

-- Invoker functions only. The facts and the evaluation run as the caller, under the caller's tenant and row security; the guards are trigger-only.
DO $$ DECLARE f text; BEGIN FOREACH f IN ARRAY ARRAY[
 'app.recovery_follow_up_run_tick(uuid,uuid)','app.recovery_follow_up_case_facts(uuid,uuid,integer)','app.recovery_follow_up_stop_reason(uuid,uuid)',
 'app.recovery_follow_up_delivered(uuid,uuid)','app.recovery_follow_up_live(uuid,uuid)','app.recovery_follow_up_reminder_window(uuid,uuid)',
 'app.recovery_follow_up_reminder_approvable(uuid,uuid,uuid)','app.evaluate_recovery_follow_ups(uuid,uuid)',
 'app.guard_recovery_follow_up()','app.require_recovery_follow_up_parts()','app.guard_recovery_follow_up_owner()','app.guard_recovery_follow_up_event()',
 'app.guard_recovery_follow_up_due()','app.guard_recovery_follow_up_reminder()','app.recovery_follow_up_on_sandbox_advance()'] LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',f);
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f);
END LOOP; END $$;
-- The helpers and the evaluation are called by guards and by the application as the runtime role.
GRANT EXECUTE ON FUNCTION app.recovery_follow_up_run_tick(uuid,uuid), app.recovery_follow_up_case_facts(uuid,uuid,integer), app.recovery_follow_up_stop_reason(uuid,uuid),
 app.recovery_follow_up_delivered(uuid,uuid), app.recovery_follow_up_live(uuid,uuid), app.recovery_follow_up_reminder_window(uuid,uuid),
 app.recovery_follow_up_reminder_approvable(uuid,uuid,uuid), app.evaluate_recovery_follow_ups(uuid,uuid) TO jobguard_runtime;
COMMIT;
