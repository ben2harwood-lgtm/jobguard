BEGIN;
-- M4-5-S: factual practice recovery messages. Expand-only: existing data, columns, grants and policies are preserved.
-- Source write-lock triggers are added to the 19 existing mapper tables so delivery cannot race an evidence change.
-- The four new tables are append-only (runtime SELECT/INSERT), forced-RLS and migration-owned. All helpers are invoker-only.

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

-- The stored message is exactly the canonical builder's JSON text, rebuilt here from the row's own columns (the source
-- references are the one value that lives only inside the text). Missing, null, reordered, extra, escaped-differently or
-- pretty-printed content therefore cannot equal it; a NULL result also fails the CHECK because it is wrapped in COALESCE.
CREATE FUNCTION app.recovery_message_source_refs(p_content text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN RETURN p_content::jsonb->'sourceRefs'; EXCEPTION WHEN others THEN RETURN NULL; END $$;

CREATE FUNCTION app.recovery_message_canonical_content(
 p_case uuid, p_job uuid, p_case_type text, p_case_revision integer, p_amount bigint, p_pack uuid, p_pack_revision integer,
 p_manifest text, p_attachment text, p_sender text, p_recipient text, p_body text, p_policy text, p_source_refs jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN jsonb_typeof(p_source_refs)='array' AND jsonb_array_length(p_source_refs) BETWEEN 1 AND 100
   AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_source_refs) r WHERE jsonb_typeof(r)<>'string' OR char_length(r#>>'{}') NOT BETWEEN 1 AND 500)
  THEN '{"version":"recovery-message.v1","caseId":'||to_json(p_case::text)::text||',"jobId":'||to_json(p_job::text)::text||
   ',"caseType":'||to_json(p_case_type)::text||',"caseRevision":'||p_case_revision::text||',"amountPence":'||p_amount::text||
   ',"currency":"GBP","sourceRefs":['||(SELECT string_agg(to_json(r#>>'{}')::text,',' ORDER BY ord) FROM jsonb_array_elements(p_source_refs) WITH ORDINALITY AS t(r,ord))||
   '],"packId":'||to_json(p_pack::text)::text||',"packRevision":'||p_pack_revision::text||',"manifestHash":'||to_json(p_manifest)::text||
   ',"attachmentHash":'||to_json(p_attachment)::text||',"sender":'||to_json(p_sender)::text||',"recipient":'||to_json(p_recipient)::text||
   ',"body":'||to_json(p_body)::text||',"policyVersion":'||to_json(p_policy)::text||'}'
 END $$;

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
 -- The hash is the hash of the stored bytes, and the stored bytes are the canonical text of the row's own columns.
 CONSTRAINT recovery_message_hash_matches_content CHECK (content_hash=encode(sha256(convert_to(immutable_content,'UTF8')),'hex')),
 CONSTRAINT recovery_message_content_canonical CHECK (COALESCE(immutable_content=app.recovery_message_canonical_content(
  case_id,job_id,case_type::text,case_revision,amount_pence,pack_id,pack_revision,manifest_hash::text,attachment_hash::text,
  sender::text,recipient::text,body,policy_version::text,app.recovery_message_source_refs(immutable_content)),false))
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
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 SELECT * INTO s FROM app.recovery_message_case_snapshot(NEW.tenant_id,NEW.job_id,NEW.case_id);
 IF NOT FOUND OR s.synthetic IS NOT TRUE OR s.environment<>'synthetic_demo' OR s.case_type<>NEW.case_type THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CASE_INVALID' USING ERRCODE='23514'; END IF;
 IF NEW.case_revision<>s.case_revision OR NEW.amount_pence<>s.outstanding_pence OR app.recovery_message_source_refs(NEW.immutable_content) IS DISTINCT FROM s.source_refs THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_CHANGED' USING ERRCODE='23514'; END IF;
 -- A message whose approval is still an effect (queued, running, unknown, retryable or delivered) is never hidden by a newer preview.
 IF EXISTS (SELECT 1 FROM app.recovery_message_approval x JOIN app.action_outbox xo ON xo.tenant_id=x.tenant_id AND xo.id=x.outbox_action_id
   WHERE x.tenant_id=NEW.tenant_id AND x.case_id=NEW.case_id AND xo.status<>'cancelled') THEN
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

-- History is a narrative of facts. Every kind after the preview needs the approval that makes it possible, a legal step from
-- the previous kind, and the authorization, attempt, sink or outbox fact it claims. Nothing here trusts the caller.
CREATE FUNCTION app.guard_recovery_message_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prev text; prev_revision integer; starts integer; attempts integer; latest text; sunk boolean; f record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 SELECT e.kind,e.revision INTO prev,prev_revision FROM app.recovery_message_event e
  WHERE e.tenant_id=NEW.tenant_id AND e.message_id=NEW.message_id ORDER BY e.revision DESC LIMIT 1;
 IF NEW.revision<>coalesce(prev_revision,0)+1 OR (NEW.revision=1)<>(NEW.kind='previewed') THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_EVENT_SEQUENCE_INVALID' USING ERRCODE='23514'; END IF;
 IF NEW.kind='previewed' THEN
  IF EXISTS(SELECT 1 FROM app.recovery_message m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.message_id)
   AND NOT EXISTS(SELECT 1 FROM app.recovery_message m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.message_id
    AND m.command_id=NEW.command_id AND m.request_hash=NEW.request_hash AND m.actor_membership_id=NEW.actor_membership_id) THEN
    RAISE EXCEPTION 'RECOVERY_MESSAGE_EVENT_FACTS_INVALID' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NOT coalesce(CASE NEW.kind
   WHEN 'approved' THEN prev='previewed'
   WHEN 'revoked' THEN prev IN ('approved','retryable')
   WHEN 'started' THEN prev IN ('approved','retryable','started')
   WHEN 'succeeded' THEN prev='started'
   WHEN 'failed' THEN prev='started'
   WHEN 'outcome_unknown' THEN prev IN ('started','reconcile_started')
   WHEN 'retryable' THEN prev IN ('started','reconcile_started','outcome_unknown')
   WHEN 'reconcile_started' THEN prev='outcome_unknown'
   WHEN 'reconciled' THEN prev IN ('reconcile_started','outcome_unknown')
   WHEN 'blocked' THEN prev IN ('approved','retryable','started')
   ELSE false END,false) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_EVENT_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 SELECT o.id AS outbox_id,o.status AS outbox_status,a.revoked_at,a.expires_at,a.actor_membership_id INTO f
  FROM app.recovery_message_approval ap
  JOIN app.action_outbox o ON o.tenant_id=ap.tenant_id AND o.id=ap.outbox_action_id
  JOIN app.action_authorization a ON a.tenant_id=ap.tenant_id AND a.id=ap.authorization_id
  WHERE ap.tenant_id=NEW.tenant_id AND ap.message_id=NEW.message_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_MESSAGE_EVENT_FACTS_MISSING' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO starts FROM app.recovery_message_event e WHERE e.tenant_id=NEW.tenant_id AND e.message_id=NEW.message_id AND e.kind='started';
 SELECT count(*) INTO attempts FROM app.action_attempt t WHERE t.tenant_id=NEW.tenant_id AND t.action_id=f.outbox_id;
 SELECT t.outcome INTO latest FROM app.action_attempt t WHERE t.tenant_id=NEW.tenant_id AND t.action_id=f.outbox_id ORDER BY t.attempt_number DESC LIMIT 1;
 sunk:=EXISTS (SELECT 1 FROM app.recovery_message_sink s WHERE s.tenant_id=NEW.tenant_id AND s.message_id=NEW.message_id);
 IF NOT coalesce(CASE NEW.kind
   WHEN 'approved' THEN f.actor_membership_id=NEW.actor_membership_id AND f.outbox_status='pending' AND f.revoked_at IS NULL
   WHEN 'revoked' THEN f.revoked_at IS NOT NULL AND f.outbox_status='cancelled'
   -- A start is a claim intent backed by a live approval on a queued action, or an attempt the history has not recorded yet.
   WHEN 'started' THEN attempts>starts OR (f.outbox_status IN ('pending','retryable') AND f.revoked_at IS NULL AND f.expires_at>clock_timestamp())
   WHEN 'succeeded' THEN latest='succeeded' AND f.outbox_status='succeeded' AND sunk
   WHEN 'failed' THEN latest='failed' AND f.outbox_status='dead_letter'
   WHEN 'outcome_unknown' THEN CASE prev WHEN 'started' THEN latest='outcome_unknown' AND f.outbox_status='outcome_unknown' ELSE f.outbox_status='outcome_unknown' END
   WHEN 'retryable' THEN CASE prev WHEN 'started' THEN latest='retryable' AND f.outbox_status='retryable' ELSE f.outbox_status='retryable' END
   WHEN 'reconcile_started' THEN f.outbox_status='outcome_unknown'
   WHEN 'reconciled' THEN f.outbox_status='succeeded' AND sunk
   WHEN 'blocked' THEN f.outbox_status='cancelled'
   ELSE false END,false) THEN
  RAISE EXCEPTION 'RECOVERY_MESSAGE_EVENT_FACTS_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_message_event_guard BEFORE INSERT ON app.recovery_message_event FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_message_event();

-- All writes which can change a message's case/pack/source set share one tenant-scoped effect lock. This also
-- protects against raw runtime INSERTs: append-only tables cannot be protected from phantoms by row locks.
-- Source writers acquire this before their audit append; the sink takes case -> source -> authority/outbox rows.
CREATE FUNCTION app.lock_recovery_message_sources(p_tenant uuid) RETURNS void LANGUAGE sql VOLATILE AS $$
 SELECT pg_advisory_xact_lock(hashtext(p_tenant::text),hashtext('recovery-message-sources'))
$$;
CREATE FUNCTION app.guard_recovery_message_source_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM app.lock_recovery_message_sources(coalesce(NEW.tenant_id,OLD.tenant_id));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY[
 'job','quote_acceptance','quote_document_version','evidence_upload','evidence_object','evidence_invalidation','synthetic_evidence_original',
 'variation_revision','variation_approval','recovery_case','recovery_claim_revision','recovery_case_event','material_rate_revision',
 'material_requirement','supplier_document','supplier_document_version','customer_invoice','evidence_pack_revision','evidence_pack_attachment_approval'
] LOOP
 EXECUTE format('CREATE TRIGGER recovery_message_source_write BEFORE INSERT OR UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_message_source_write()',t);
END LOOP; END $$;

-- Compare the exact immutable records and the complete current source set. JSONB equality here compares stored
-- source content to database facts, not to caller-supplied flags. The adapter also rebuilds and hashes the entire pack.
CREATE FUNCTION app.recovery_message_sources_current(p_tenant uuid,p_job uuid,p_case uuid,p_sources jsonb)
RETURNS boolean LANGUAGE sql STABLE AS $$
 WITH rc AS (SELECT * FROM app.recovery_case WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_case),
 quote AS (
  SELECT d.id,d.document_version version,to_jsonb(d) record,a.id acceptance_id,to_jsonb(a) acceptance
  FROM app.quote_acceptance a JOIN app.job j ON(j.tenant_id,j.id,j.accepted_quote_version_id)=(a.tenant_id,a.job_id,a.document_id)
  JOIN app.quote_document_version d ON(d.tenant_id,d.job_id,d.id,d.document_version,d.content_hash)=(a.tenant_id,a.job_id,a.document_id,a.document_version,a.document_hash)
  WHERE a.tenant_id=p_tenant AND a.job_id=p_job ORDER BY a.accepted_at DESC,a.recorded_at DESC,a.id DESC LIMIT 1
 ), proof AS (
  SELECT e.id,to_jsonb(e) record,o.bytes,e.sha256
  FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.id,u.job_id)=(e.tenant_id,e.upload_id,e.job_id)
  LEFT JOIN app.synthetic_evidence_original o ON(o.tenant_id,o.job_id,o.upload_id,o.object_key,o.object_version_id)=(e.tenant_id,e.job_id,e.upload_id,e.object_key,e.object_version_id)
  WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.kind='original' AND u.state='verified' AND u.object_version_id=e.object_version_id
   AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)
 ), variation AS (
  SELECT r.id,r.revision version,to_jsonb(r) record,a.id approval_id,to_jsonb(a) approval
  FROM app.variation_revision r JOIN app.variation_approval a ON(a.tenant_id,a.job_id,a.revision_id,a.revision,a.content_hash)=(r.tenant_id,r.job_id,r.id,r.revision,r.content_hash)
  WHERE r.tenant_id=p_tenant AND r.job_id=p_job
 ), records AS (
  SELECT 'quote_document_version:'||id::text source_id,version,jsonb_build_object('recordType','quote_document_version','record',record) content FROM quote
  UNION ALL SELECT 'quote_acceptance:'||acceptance_id::text,1,jsonb_build_object('recordType','quote_acceptance','record',acceptance) FROM quote
  UNION ALL SELECT 'evidence_object:'||id::text,1,jsonb_build_object('recordType','evidence_object','record',record,'originalBytesBase64',replace(encode(bytes,'base64'),E'\n',''),'originalEncoding','base64') FROM proof WHERE bytes IS NOT NULL AND encode(sha256(bytes),'hex')=sha256
  UNION ALL SELECT 'evidence_object:'||id::text||':redacted-metadata',1,jsonb_build_object('recordType','evidence_object_redacted_metadata.v1','record',
    jsonb_build_object('id',id,'job_id',p_job,'object_version_id',record->'object_version_id','sha256',record->'sha256','evidence_type',record->'evidence_type','byte_length',record->'byte_length','content_type',record->'content_type'),
    'omittedFields',jsonb_build_array('original bytes','object key','capture metadata','server timestamps','upload identity','tenant identity')) FROM proof
  UNION ALL SELECT 'variation_revision:'||id::text,version,jsonb_build_object('recordType','variation_revision','record',record) FROM variation
  UNION ALL SELECT 'variation_approval:'||approval_id::text,1,jsonb_build_object('recordType','variation_approval','record',approval) FROM variation
  UNION ALL SELECT 'recovery_claim_revision:'||r.id::text,r.revision,jsonb_build_object('recordType','recovery_claim_revision','record',to_jsonb(r)) FROM app.recovery_claim_revision r WHERE r.tenant_id=p_tenant AND r.job_id=p_job AND r.case_id=p_case
  UNION ALL SELECT 'recovery_case_event:'||e.id::text,e.sequence,jsonb_build_object('recordType','recovery_case_event','record',to_jsonb(e)) FROM app.recovery_case_event e WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.case_id=p_case
  UNION ALL SELECT 'material_rate_revision:'||r.id::text,r.version,jsonb_build_object('recordType','material_rate_revision','record',to_jsonb(r)) FROM app.material_rate_revision r,rc
   WHERE rc.case_type='merchant_overcharge' AND r.tenant_id=p_tenant AND rc.source_refs ? r.id::text AND EXISTS(SELECT 1 FROM app.material_requirement m WHERE m.tenant_id=r.tenant_id AND m.sku_id=r.sku_id AND m.job_id=p_job)
  UNION ALL SELECT 'supplier_document_version:'||v.id::text,v.version,jsonb_build_object('recordType','supplier_document_version','record',to_jsonb(v),'document',to_jsonb(d),'originalBytesAvailable',false)
   FROM app.supplier_document_version v JOIN app.supplier_document d ON(d.tenant_id,d.job_id,d.id)=(v.tenant_id,v.job_id,v.document_id),rc
   WHERE rc.case_type='merchant_overcharge' AND v.tenant_id=p_tenant AND v.job_id=p_job AND (rc.source_refs ? v.id::text OR rc.source_refs ? d.id::text) AND d.status='ready' AND d.document_type IN('invoice','delivery')
  UNION ALL SELECT 'customer_invoice:'||i.id::text,1,jsonb_build_object('recordType','customer_invoice','record',to_jsonb(i)-'pdf_bytes','originalBytesBase64',replace(encode(i.pdf_bytes,'base64'),E'\n',''),'originalEncoding','base64')
   FROM app.customer_invoice i,rc WHERE rc.case_type<>'merchant_overcharge' AND i.tenant_id=p_tenant AND i.job_id=p_job AND rc.source_refs ? i.id::text AND encode(sha256(i.pdf_bytes),'hex')=i.pdf_sha256
 ), saved AS (
  SELECT s->>'sourceId' source_id,(s->>'version')::integer version,(s->>'content')::jsonb content FROM jsonb_array_elements(p_sources) s
 )
 SELECT EXISTS(SELECT 1 FROM quote) AND EXISTS(SELECT 1 FROM proof) AND
 NOT EXISTS(SELECT 1 FROM records r FULL JOIN saved s USING(source_id,version) WHERE r.content IS DISTINCT FROM s.content)
$$;

-- The proofs a pack was built from, compared with the proofs that are verified and not invalidated right now. A source
-- that was invalidated, or a new one that would change a rebuilt pack, makes the saved pack stale. (The other source
-- families are immutable appended records; the delivery boundary rebuilds the whole pack in the same transaction.)
CREATE FUNCTION app.recovery_message_proofs_current(p_tenant uuid, p_job uuid, p_pack_sources jsonb) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce((SELECT array_agg(t.x ORDER BY t.x) FROM (
    SELECT 'evidence_object:'||e.id::text AS x FROM app.evidence_object e
    JOIN app.evidence_upload u ON u.tenant_id=e.tenant_id AND u.id=e.upload_id AND u.job_id=e.job_id
    WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.kind='original' AND u.state='verified' AND u.object_version_id=e.object_version_id
      AND NOT EXISTS (SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=e.tenant_id AND i.evidence_id=e.id)) t)
  IS NOT DISTINCT FROM
  (SELECT array_agg(t.x ORDER BY t.x) FROM (
    SELECT s->>'sourceId' AS x FROM jsonb_array_elements(p_pack_sources) s WHERE s->>'sourceId' ~ '^evidence_object:[0-9a-f-]{36}$') t), false)
$$;

-- The effect boundary: a practice delivery is recorded only while its action is executing, its approval and approver are
-- live, and the case, pack and proofs are still exactly what was approved.
CREATE FUNCTION app.guard_recovery_message_sink() RETURNS trigger LANGUAGE plpgsql AS $$
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
ALTER FUNCTION app.recovery_message_source_refs(text) OWNER TO jobguard_migration;
ALTER FUNCTION app.recovery_message_canonical_content(uuid,uuid,text,integer,bigint,uuid,integer,text,text,text,text,text,text,jsonb) OWNER TO jobguard_migration;
ALTER FUNCTION app.recovery_message_proofs_current(uuid,uuid,jsonb) OWNER TO jobguard_migration;
-- Invoker functions only. The snapshot is readable by the runtime role through its own row security; the guards are trigger-only.
REVOKE ALL ON FUNCTION app.recovery_message_case_snapshot(uuid,uuid,uuid), app.guard_recovery_message(), app.guard_recovery_message_approval(), app.guard_recovery_message_event(), app.guard_recovery_message_sink(),
 app.recovery_message_source_refs(text), app.recovery_message_canonical_content(uuid,uuid,text,integer,bigint,uuid,integer,text,text,text,text,text,text,jsonb), app.recovery_message_proofs_current(uuid,uuid,jsonb) FROM PUBLIC;
-- The snapshot and the pure content and proof helpers are evaluated by CHECK constraints and guards that run as the runtime role.
GRANT EXECUTE ON FUNCTION app.recovery_message_case_snapshot(uuid,uuid,uuid), app.recovery_message_source_refs(text),
 app.recovery_message_canonical_content(uuid,uuid,text,integer,bigint,uuid,integer,text,text,text,text,text,text,jsonb), app.recovery_message_proofs_current(uuid,uuid,jsonb) TO jobguard_runtime;
ALTER FUNCTION app.lock_recovery_message_sources(uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_recovery_message_source_write() OWNER TO jobguard_migration;
ALTER FUNCTION app.recovery_message_sources_current(uuid,uuid,uuid,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lock_recovery_message_sources(uuid),app.guard_recovery_message_source_write(),app.recovery_message_sources_current(uuid,uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_recovery_message_sources(uuid),app.recovery_message_sources_current(uuid,uuid,uuid,jsonb) TO jobguard_runtime;
COMMIT;
