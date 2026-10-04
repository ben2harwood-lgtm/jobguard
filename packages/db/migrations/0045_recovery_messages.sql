BEGIN;
-- M4-5-S: factual practice recovery messages. Expand-only: no existing table, column, grant or policy changes, so the
-- previous release keeps running during rollout. Every table is append-only (runtime SELECT/INSERT), forced-RLS and
-- migration-owned. Guards are invoker functions: they read through the caller's own row security and write nothing.

-- One read-only view of "where is this case now" shared by the guards, matching the repository's case workbench:
-- revision = latest claim revision + event count; outstanding = claim - landed (net of reversals) - written off.
CREATE FUNCTION app.recovery_message_case_snapshot(p_tenant uuid, p_job uuid, p_case uuid)
RETURNS TABLE(case_type text, synthetic boolean, environment text, source_refs jsonb, case_revision integer, outstanding_pence bigint)
LANGUAGE sql STABLE AS $$
 SELECT rc.case_type::text, rc.synthetic, rc.environment::text, rc.source_refs,
        (cl.revision + (SELECT count(*) FROM app.recovery_case_event e WHERE e.tenant_id=rc.tenant_id AND e.case_id=rc.id))::integer,
        (cl.claimed_net_pence - coalesce((SELECT sum(CASE e.event_type WHEN 'record_landing' THEN e.amount_pence WHEN 'reverse_landing' THEN -e.amount_pence WHEN 'write_off' THEN e.amount_pence ELSE 0 END)
          FROM app.recovery_case_event e WHERE e.tenant_id=rc.tenant_id AND e.case_id=rc.id),0))::bigint
 FROM app.recovery_case rc
 JOIN LATERAL (SELECT q.revision, q.claimed_net_pence FROM app.recovery_claim_revision q WHERE q.tenant_id=rc.tenant_id AND q.case_id=rc.id ORDER BY q.revision DESC LIMIT 1) cl ON true
 WHERE rc.tenant_id=p_tenant AND rc.job_id=p_job AND rc.id=p_case
$$;

CREATE TABLE app.recovery_message (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL,
 case_sequence integer NOT NULL CHECK (case_sequence>0),
 pack_id uuid NOT NULL, pack_revision integer NOT NULL CHECK (pack_revision>0),
 manifest_hash char(64) NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
 attachment_hash char(64) NOT NULL CHECK (attachment_hash ~ '^[0-9a-f]{64}$'),
 attachment_approval_id uuid NOT NULL,
 command_id uuid NOT NULL, request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 case_type varchar(40) NOT NULL CHECK (case_type IN ('withheld_customer_payment','merchant_overcharge')),
 case_revision integer NOT NULL CHECK (case_revision>0),
 amount_pence bigint NOT NULL CHECK (amount_pence BETWEEN 1 AND 1000000000000),
 currency char(3) NOT NULL CHECK (currency='GBP'),
 sender varchar(320) NOT NULL CHECK (sender='practice-builder@example.invalid'),
 recipient varchar(320) NOT NULL,
 body text NOT NULL,
 policy_version varchar(80) NOT NULL CHECK (policy_version='practice-factual-message.v1'),
 content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
 immutable_content text NOT NULL,
 actor_membership_id uuid NOT NULL,
 environment varchar(30) NOT NULL CHECK (environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,command_id), UNIQUE (tenant_id,case_id,case_sequence), UNIQUE (tenant_id,job_id,case_id,id),
 FOREIGN KEY (tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY (tenant_id,job_id,case_id,pack_id,manifest_hash,attachment_hash)
  REFERENCES app.evidence_pack_revision(tenant_id,job_id,case_id,pack_id,manifest_hash,content_hash),
 FOREIGN KEY (tenant_id,attachment_approval_id) REFERENCES app.evidence_pack_attachment_approval(tenant_id,id),
 FOREIGN KEY (tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 -- A practice message goes only to the fictional recipient for its case type.
 CONSTRAINT recovery_message_recipient_pairing CHECK (
  (case_type='withheld_customer_payment' AND recipient='practice-customer@example.invalid') OR
  (case_type='merchant_overcharge' AND recipient='practice-supplier@example.invalid')),
 -- The hash is the hash of the stored bytes, and every column is the value inside those bytes.
 CONSTRAINT recovery_message_hash_matches_content CHECK (content_hash=encode(sha256(convert_to(immutable_content,'UTF8')),'hex')),
 CONSTRAINT recovery_message_content_columns_check CHECK (
  (immutable_content::jsonb->>'version')='recovery-message.v1' AND (immutable_content::jsonb->>'caseId')=case_id::text AND
  (immutable_content::jsonb->>'jobId')=job_id::text AND (immutable_content::jsonb->>'caseType')=case_type AND
  (immutable_content::jsonb->>'caseRevision')::integer=case_revision AND (immutable_content::jsonb->>'amountPence')::bigint=amount_pence AND
  (immutable_content::jsonb->>'currency')=currency AND (immutable_content::jsonb->>'packId')=pack_id::text AND
  (immutable_content::jsonb->>'packRevision')::integer=pack_revision AND (immutable_content::jsonb->>'manifestHash')=manifest_hash AND
  (immutable_content::jsonb->>'attachmentHash')=attachment_hash AND (immutable_content::jsonb->>'sender')=sender AND
  (immutable_content::jsonb->>'recipient')=recipient AND (immutable_content::jsonb->>'body')=body AND (immutable_content::jsonb->>'policyVersion')=policy_version)
);

CREATE TABLE app.recovery_message_approval (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, message_id uuid NOT NULL,
 authorization_id uuid NOT NULL, outbox_action_id uuid NOT NULL,
 environment varchar(30) NOT NULL CHECK (environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,message_id), UNIQUE (tenant_id,authorization_id), UNIQUE (tenant_id,outbox_action_id),
 UNIQUE (tenant_id,job_id,case_id,message_id,outbox_action_id),
 FOREIGN KEY (tenant_id,job_id,case_id,message_id) REFERENCES app.recovery_message(tenant_id,job_id,case_id,id),
 FOREIGN KEY (tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 FOREIGN KEY (tenant_id,outbox_action_id) REFERENCES app.action_outbox(tenant_id,id)
);

CREATE TABLE app.recovery_message_event (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, message_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision>0),
 kind varchar(30) NOT NULL CHECK (kind IN ('previewed','approved','revoked','started','succeeded','retryable','failed','outcome_unknown','reconcile_started','reconciled','blocked')),
 command_id uuid NOT NULL, request_hash char(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
 actor_membership_id uuid NOT NULL,
 environment varchar(30) NOT NULL CHECK (environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,message_id,revision), UNIQUE (tenant_id,command_id,kind),
 FOREIGN KEY (tenant_id,job_id,case_id,message_id) REFERENCES app.recovery_message(tenant_id,job_id,case_id,id),
 FOREIGN KEY (tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);

-- The practice provider's own record: exactly one row per message, written only while its action is executing.
CREATE TABLE app.recovery_message_sink (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, message_id uuid NOT NULL,
 outbox_action_id uuid NOT NULL,
 recipient varchar(320) NOT NULL CHECK (recipient LIKE '%@example.invalid'),
 body text NOT NULL, content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
 attachment_hash char(64) NOT NULL CHECK (attachment_hash ~ '^[0-9a-f]{64}$'),
 provider_reference varchar(200) NOT NULL,
 environment varchar(30) NOT NULL CHECK (environment='synthetic_demo'),
 real_external_actions integer NOT NULL CHECK (real_external_actions=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,message_id), UNIQUE (tenant_id,outbox_action_id),
 FOREIGN KEY (tenant_id,job_id,case_id,message_id,outbox_action_id)
  REFERENCES app.recovery_message_approval(tenant_id,job_id,case_id,message_id,outbox_action_id)
);

CREATE FUNCTION app.guard_recovery_message() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE s record; pounds text; expected_body text;
BEGIN
 SELECT * INTO s FROM app.recovery_message_case_snapshot(NEW.tenant_id,NEW.job_id,NEW.case_id);
 IF NOT FOUND OR s.synthetic IS NOT TRUE OR s.environment<>'synthetic_demo' OR s.case_type<>NEW.case_type THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CASE_INVALID' USING ERRCODE='23514'; END IF;
 IF NEW.case_revision<>s.case_revision OR NEW.amount_pence<>s.outstanding_pence OR (NEW.immutable_content::jsonb->'sourceRefs') IS DISTINCT FROM s.source_refs THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
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
CREATE TRIGGER recovery_message_guard BEFORE INSERT ON app.recovery_message FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_message();

CREATE FUNCTION app.guard_recovery_message_approval() RETURNS trigger LANGUAGE plpgsql AS $$
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
   AND d.subject_type='recovery_message' AND d.subject_ref=m.id::text AND d.action_type='recovery.message.simulate'
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
   WHERE x.tenant_id=NEW.tenant_id AND x.case_id=NEW.case_id AND x.message_id<>NEW.message_id AND xo.status<>'cancelled') THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_EXISTING_EFFECT' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_message_approval_guard BEFORE INSERT ON app.recovery_message_approval FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_message_approval();

CREATE FUNCTION app.guard_recovery_message_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.revision<>coalesce((SELECT max(e.revision) FROM app.recovery_message_event e WHERE e.tenant_id=NEW.tenant_id AND e.message_id=NEW.message_id),0)+1
    OR (NEW.revision=1)<>(NEW.kind='previewed') THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_EVENT_SEQUENCE_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_message_event_guard BEFORE INSERT ON app.recovery_message_event FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_message_event();

CREATE FUNCTION app.guard_recovery_message_sink() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM app.recovery_message m
  JOIN app.recovery_message_approval ap ON ap.tenant_id=m.tenant_id AND ap.message_id=m.id
  JOIN app.action_outbox o ON o.tenant_id=ap.tenant_id AND o.id=ap.outbox_action_id
  JOIN app.action_authorization a ON a.tenant_id=o.tenant_id AND a.id=o.authorization_id
  WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.message_id AND m.job_id=NEW.job_id AND m.case_id=NEW.case_id
   AND ap.outbox_action_id=NEW.outbox_action_id AND o.status='executing' AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
   AND m.recipient=NEW.recipient AND m.body=NEW.body AND m.content_hash=NEW.content_hash AND m.attachment_hash=NEW.attachment_hash)
 THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_SINK_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_message_sink_guard BEFORE INSERT ON app.recovery_message_sink FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_message_sink();

DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['recovery_message','recovery_message_approval','recovery_message_event','recovery_message_sink'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP; END $$;
ALTER FUNCTION app.recovery_message_case_snapshot(uuid,uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_recovery_message() OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_recovery_message_approval() OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_recovery_message_event() OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_recovery_message_sink() OWNER TO jobguard_migration;
-- Invoker functions only. The snapshot is readable by the runtime role through its own row security; the guards are trigger-only.
REVOKE ALL ON FUNCTION app.recovery_message_case_snapshot(uuid,uuid,uuid), app.guard_recovery_message(), app.guard_recovery_message_approval(), app.guard_recovery_message_event(), app.guard_recovery_message_sink() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recovery_message_case_snapshot(uuid,uuid,uuid) TO jobguard_runtime;
COMMIT;
