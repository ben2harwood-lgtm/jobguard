BEGIN;
-- Expand-only: prior recovery cases and evidence packs retain their existing shape.
ALTER TABLE app.evidence_pack_revision ADD CONSTRAINT evidence_pack_revision_case_link UNIQUE(tenant_id,job_id,case_id,id);
CREATE TABLE app.recovery_message_case_access (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, session_id uuid NOT NULL, membership_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,case_id), UNIQUE(tenant_id,job_id,case_id,session_id),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.recovery_message_preview (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, session_id uuid NOT NULL,
 command_id uuid NOT NULL, request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 case_revision integer NOT NULL CHECK(case_revision>0), pack_revision_id uuid NOT NULL,
 amount_pence bigint NOT NULL CHECK(amount_pence BETWEEN 1 AND 1000000000000), currency char(3) NOT NULL CHECK(currency='GBP'),
 sender varchar(320) NOT NULL CHECK(sender LIKE '%.invalid'), recipient varchar(320) NOT NULL CHECK(recipient LIKE '%.invalid'),
 body text NOT NULL, content_hash char(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'), immutable_content text NOT NULL,
 snapshot jsonb NOT NULL, actor_membership_id uuid NOT NULL,
 environment varchar(30) NOT NULL CHECK(environment='synthetic_demo'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id,session_id) REFERENCES app.recovery_message_case_access(tenant_id,job_id,case_id,session_id),
 FOREIGN KEY(tenant_id,job_id,case_id,pack_revision_id) REFERENCES app.evidence_pack_revision(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.recovery_message_approval (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, message_id uuid NOT NULL,
 authorization_id uuid NOT NULL, outbox_action_id uuid NOT NULL,
 environment varchar(30) NOT NULL CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,message_id), UNIQUE(tenant_id,outbox_action_id),
 FOREIGN KEY(tenant_id,job_id,case_id,message_id) REFERENCES app.recovery_message_preview(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id),
 FOREIGN KEY(tenant_id,outbox_action_id) REFERENCES app.action_outbox(tenant_id,id)
);
CREATE TABLE app.recovery_message_event (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, message_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>1), command_id uuid NOT NULL, request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 kind varchar(30) NOT NULL CHECK(kind IN('approved','cancelled','retry','started','succeeded','retryable','outcome_unknown','reconciled','blocked')),
 actor_membership_id uuid NOT NULL, environment varchar(30) NOT NULL CHECK(environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,message_id,revision), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,case_id,message_id) REFERENCES app.recovery_message_preview(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.recovery_message_sink (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, message_id uuid NOT NULL,
 outbox_action_id uuid NOT NULL, recipient varchar(320) NOT NULL CHECK(recipient LIKE '%.invalid'),
 body text NOT NULL, content_hash char(64) NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'), attachment_hash char(64) NOT NULL,
 environment varchar(30) NOT NULL CHECK(environment='synthetic_demo'), real_external_actions integer NOT NULL CHECK(real_external_actions=0),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,outbox_action_id),
 FOREIGN KEY(tenant_id,job_id,case_id,message_id) REFERENCES app.recovery_message_preview(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,outbox_action_id) REFERENCES app.recovery_message_approval(tenant_id,outbox_action_id)
);
-- Invoker-only guards: they neither elevate the caller nor write FORCE-RLS tables.
CREATE FUNCTION app.guard_recovery_message_preview() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c record; p record; expected_body text; expected_recipient text;
BEGIN
 SELECT rc.case_type,rc.synthetic,rc.source_refs,q.revision+(SELECT count(*) FROM app.recovery_case_event e WHERE e.tenant_id=rc.tenant_id AND e.case_id=rc.id) revision,
 q.claimed_net_pence-coalesce((SELECT sum(CASE e.event_type WHEN 'record_landing' THEN e.amount_pence WHEN 'reverse_landing' THEN -e.amount_pence WHEN 'write_off' THEN e.amount_pence ELSE 0 END) FROM app.recovery_case_event e WHERE e.tenant_id=rc.tenant_id AND e.case_id=rc.id),0) amount
 INTO c FROM app.recovery_case rc JOIN LATERAL(SELECT * FROM app.recovery_claim_revision q WHERE q.tenant_id=rc.tenant_id AND q.case_id=rc.id ORDER BY revision DESC LIMIT 1)q ON true WHERE rc.tenant_id=NEW.tenant_id AND rc.job_id=NEW.job_id AND rc.id=NEW.case_id;
 SELECT * INTO p FROM app.evidence_pack_revision WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id ORDER BY revision DESC LIMIT 1;
 expected_recipient:=CASE WHEN c.case_type='merchant_overcharge' THEN 'practice-supplier@example.invalid' ELSE 'practice-customer@example.invalid' END;
 expected_body:=CASE WHEN c.case_type='merchant_overcharge' THEN 'Practice message — not sent. Our practice supplier records show £' ELSE 'Practice message — not sent. Our practice records show £' END||to_char(c.amount::numeric/100,'FM999999999999990.00')||CASE WHEN c.case_type='merchant_overcharge' THEN ' net is questioned in this supplier correction case. Please review the attached example supplier records.' ELSE ' net remains in this case. Please review the attached example records.' END;
 IF c IS NULL OR NOT c.synthetic OR c.case_type NOT IN('merchant_overcharge','withheld_customer_payment') OR NEW.case_revision<>c.revision OR NEW.amount_pence<>c.amount OR p.id IS DISTINCT FROM NEW.pack_revision_id OR NEW.recipient<>expected_recipient OR NEW.body<>expected_body OR NEW.sender<>'practice-builder@example.invalid' OR NEW.content_hash<>encode(public.digest(convert_to(NEW.immutable_content,'UTF8'),'sha256'),'hex') OR (NEW.immutable_content::jsonb - 'contentHash') IS DISTINCT FROM (NEW.snapshot - 'contentHash') OR NEW.snapshot->>'body' IS DISTINCT FROM NEW.body OR NEW.snapshot->>'recipient' IS DISTINCT FROM NEW.recipient OR NEW.snapshot->>'attachmentHash' IS DISTINCT FROM p.content_hash::text OR NEW.snapshot->>'manifestHash' IS DISTINCT FROM p.manifest_hash::text OR (NEW.snapshot->>'amountPence')::bigint IS DISTINCT FROM NEW.amount_pence OR NEW.snapshot->>'contentHash' IS DISTINCT FROM NEW.content_hash::text OR NEW.snapshot->>'sender' IS DISTINCT FROM NEW.sender OR NEW.snapshot->>'currency' IS DISTINCT FROM 'GBP' OR NEW.snapshot->>'policyVersion' IS DISTINCT FROM 'practice-factual-message.v1' OR NEW.snapshot->>'caseId' IS DISTINCT FROM NEW.case_id::text OR NEW.snapshot->>'jobId' IS DISTINCT FROM NEW.job_id::text OR NEW.snapshot->>'packId' IS DISTINCT FROM p.pack_id::text OR (NEW.snapshot->>'packRevision')::integer IS DISTINCT FROM p.revision OR (NEW.snapshot->>'caseRevision')::integer IS DISTINCT FROM NEW.case_revision OR NEW.snapshot->>'caseType' IS DISTINCT FROM c.case_type OR NEW.snapshot->'sourceRefs' IS DISTINCT FROM c.source_refs THEN
 RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_message_preview_guard BEFORE INSERT ON app.recovery_message_preview FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_message_preview();
CREATE FUNCTION app.guard_recovery_message_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.recovery_message_preview p JOIN app.action_authorization a ON a.tenant_id=p.tenant_id AND a.id=NEW.authorization_id JOIN app.decision d ON d.tenant_id=a.tenant_id AND d.id=a.decision_id JOIN app.decision_resolution r ON r.tenant_id=a.tenant_id AND r.id=a.resolution_id JOIN app.action_outbox o ON o.tenant_id=p.tenant_id AND o.id=NEW.outbox_action_id JOIN app.membership m ON m.tenant_id=a.tenant_id AND m.id=a.actor_membership_id WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.message_id AND d.subject_ref=p.id::text AND d.subject_type='recovery_message' AND r.resolution='approved' AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND a.action_type='recovery.message.simulate' AND a.recipient=p.recipient AND a.content_hash=p.content_hash AND a.amount_pence=p.amount_pence AND a.currency='GBP' AND a.aggregate_revision=p.case_revision AND a.policy_version=p.snapshot->>'policyVersion' AND o.authorization_id=a.id AND o.adapter='fake_recovery_message' AND o.provider_effect_key='recovery-message:'||p.id::text AND o.recipient=p.recipient AND o.content_hash=p.content_hash AND o.immutable_content=p.immutable_content AND o.action_type=a.action_type AND o.amount_pence=a.amount_pence AND o.currency=a.currency AND o.policy_version=a.policy_version AND o.aggregate_revision=a.aggregate_revision AND o.authorization_expires_at=a.expires_at) THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_AUTHORIZATION_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_message_approval_guard BEFORE INSERT ON app.recovery_message_approval FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_message_approval();
CREATE FUNCTION app.guard_recovery_message_sink() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.recovery_message_preview p JOIN app.recovery_message_approval a ON a.tenant_id=p.tenant_id AND a.message_id=p.id JOIN app.action_outbox o ON o.tenant_id=a.tenant_id AND o.id=a.outbox_action_id WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.message_id AND a.outbox_action_id=NEW.outbox_action_id AND o.status='executing' AND p.body=NEW.body AND p.recipient=NEW.recipient AND p.content_hash=NEW.content_hash AND p.snapshot->>'attachmentHash'=NEW.attachment_hash) THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_SINK_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_message_sink_guard BEFORE INSERT ON app.recovery_message_sink FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_message_sink();
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['recovery_message_case_access','recovery_message_preview','recovery_message_approval','recovery_message_event','recovery_message_sink'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP; END $$;
ALTER FUNCTION app.guard_recovery_message_preview() OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_recovery_message_approval() OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_recovery_message_sink() OWNER TO jobguard_migration;
COMMIT;
