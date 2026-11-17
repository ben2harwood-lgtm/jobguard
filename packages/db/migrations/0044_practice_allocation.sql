BEGIN;
-- Append-only synthetic allocation book. Existing posted production landing/fee
-- routines are deliberately untouched; these facts cannot qualify in production.
CREATE TABLE app.practice_allocation_command(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,session_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0),action text NOT NULL CHECK(action IN('prepare','approve','reverse','invalidate_evidence','dispute')),
 payload jsonb NOT NULL,payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 actor_membership_id uuid NOT NULL,environment text NOT NULL CHECK(environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,revision),UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE app.practice_allocation_setup(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,session_id uuid NOT NULL,command_id uuid NOT NULL,
 invoice_id uuid NOT NULL,case_ids uuid[] NOT NULL CHECK(cardinality(case_ids)=2 AND case_ids[1]<>case_ids[2]),
 evidence_ids uuid[] NOT NULL CHECK(cardinality(evidence_ids)=2),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id,command_id) REFERENCES app.practice_allocation_command(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,invoice_id) REFERENCES app.customer_invoice(tenant_id,job_id,id)
);
CREATE TABLE app.practice_allocation_movement(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,command_id uuid NOT NULL,
 source_event_id uuid,underlying_movement_id text NOT NULL,source_hash char(64) NOT NULL,
 gross_pence bigint NOT NULL CHECK(gross_pence IN(38400,300000)),currency char(3) NOT NULL CHECK(currency='GBP'),
 kind text NOT NULL CHECK(kind IN('feed_384','generated_3000')),environment text NOT NULL CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,id),UNIQUE(tenant_id,underlying_movement_id),UNIQUE(tenant_id,job_id,kind),
 FOREIGN KEY(tenant_id,job_id,command_id) REFERENCES app.practice_allocation_command(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,source_event_id) REFERENCES app.practice_feed_event(tenant_id,id)
);
CREATE TABLE app.practice_allocation(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,command_id uuid NOT NULL,movement_id uuid NOT NULL,
 representation_id text NOT NULL,case_id uuid NOT NULL,evidence_id uuid NOT NULL,
 net_pence bigint NOT NULL CHECK(net_pence>0 AND net_pence<=1000000000000 AND net_pence%5=0),
 tax_pence bigint NOT NULL CHECK(tax_pence>0),gross_pence bigint NOT NULL CHECK(gross_pence=net_pence+tax_pence AND tax_pence=net_pence/5),
 policy_version text NOT NULL CHECK(policy_version='reference-d03.v1'),reviewer_ref text NOT NULL,
 evidence_sha256 char(64) NOT NULL,evidence_version_id text NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,id),UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,command_id) REFERENCES app.practice_allocation_command(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,movement_id) REFERENCES app.practice_allocation_movement(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,evidence_id) REFERENCES app.evidence_object(tenant_id,id)
);
CREATE TABLE app.practice_allocation_change(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,command_id uuid NOT NULL,allocation_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('reverse','invalidate_evidence','dispute')),
 net_pence bigint NOT NULL CHECK(net_pence>=0),tax_pence bigint NOT NULL CHECK(tax_pence>=0),gross_pence bigint NOT NULL CHECK(gross_pence=net_pence+tax_pence),
 CHECK((kind='reverse' AND net_pence>0 AND net_pence%5=0 AND tax_pence=net_pence/5) OR(kind<>'reverse' AND gross_pence=0)),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,command_id) REFERENCES app.practice_allocation_command(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,allocation_id) REFERENCES app.practice_allocation(tenant_id,job_id,id)
);
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['practice_allocation_command','practice_allocation_setup','practice_allocation_movement','practice_allocation','practice_allocation_change'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
END LOOP; END $$;

CREATE FUNCTION app.guard_practice_allocation_command() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE latest integer;s app.practice_allocation_setup;
BEGIN
 PERFORM 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.job_id::text));
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR
 NEW.session_id IS DISTINCT FROM nullif(current_setting('app.practice_allocation_session',true),'')::uuid OR
 current_setting('app.practice_allocation_environment',true) IS DISTINCT FROM 'synthetic_demo' OR
 NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>transaction_timestamp())) OR
 EXISTS(SELECT 1 FROM app.job_activation WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND mode<>'synthetic_demo') OR
 EXISTS(SELECT 1 FROM app.sandbox_run WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND session_id<>NEW.session_id)
 THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(max(revision),0) INTO latest FROM app.practice_allocation_command WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id;
 IF NEW.revision<>latest+1 OR (NEW.payload->>'expectedRevision')::integer<>latest THEN RAISE EXCEPTION 'ALLOCATION_STALE_REVISION' USING ERRCODE='40001'; END IF;
 IF NEW.payload->>'version' IS DISTINCT FROM 'practice-allocation-command.v1' OR NEW.payload->>'action' IS DISTINCT FROM NEW.action OR NEW.payload->>'commandId' IS DISTINCT FROM NEW.id::text THEN RAISE EXCEPTION 'ALLOCATION_INVALID_COMMAND'; END IF;
 SELECT * INTO s FROM app.practice_allocation_setup WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id;
 IF (NEW.action='prepare')<>(latest=0) OR(latest>0 AND(s.id IS NULL OR s.session_id<>NEW.session_id)) THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_allocation_command_guard BEFORE INSERT ON app.practice_allocation_command FOR EACH ROW EXECUTE FUNCTION app.guard_practice_allocation_command();

CREATE FUNCTION app.guard_practice_allocation_fact() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE c app.practice_allocation_command;s app.practice_allocation_setup;m app.practice_allocation_movement;a app.practice_allocation;e app.evidence_object;f app.practice_feed_event;idx integer;used bigint;claimed bigint;reversed bigint;eligible app.recovery_eligibility_revision;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.job_id::text));
 SELECT * INTO c FROM app.practice_allocation_command WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.command_id;
 IF c.id IS NULL OR c.session_id IS DISTINCT FROM nullif(current_setting('app.practice_allocation_session',true),'')::uuid OR current_setting('app.practice_allocation_environment',true) IS DISTINCT FROM 'synthetic_demo' OR
 c.revision<>(SELECT max(revision) FROM app.practice_allocation_command WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) OR
 NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=c.actor_membership_id AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>transaction_timestamp())) OR
 EXISTS(SELECT 1 FROM app.job_activation WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND mode<>'synthetic_demo')
 THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='practice_allocation_setup' THEN
  IF c.action<>'prepare' OR NEW.session_id<>c.session_id OR NEW.invoice_id::text IS DISTINCT FROM c.payload->>'invoiceId' OR to_jsonb(NEW.case_ids) IS DISTINCT FROM c.payload->'caseIds' OR to_jsonb(NEW.evidence_ids) IS DISTINCT FROM c.payload->'evidenceIds' THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_MISMATCH'; END IF;
  FOR idx IN 1..2 LOOP
   IF NOT EXISTS(SELECT 1 FROM app.recovery_case rc WHERE rc.tenant_id=NEW.tenant_id AND rc.job_id=NEW.job_id AND rc.id=NEW.case_ids[idx] AND rc.synthetic AND rc.case_type<>'prevention' AND rc.book='builder_customer' AND rc.source_type='customer_invoice' AND rc.source_refs ? NEW.invoice_id::text) THEN RAISE EXCEPTION 'ALLOCATION_CASE_INVOICE_MISMATCH'; END IF;
   SELECT * INTO e FROM app.evidence_object WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.evidence_ids[idx] AND kind='original';
   IF e.id IS NULL OR EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=NEW.tenant_id AND evidence_id=e.id) THEN RAISE EXCEPTION 'ALLOCATION_EVIDENCE_INVALID'; END IF;
  END LOOP;
  RETURN NEW;
 END IF;
 SELECT * INTO s FROM app.practice_allocation_setup WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id;
 IF s.id IS NULL OR s.session_id<>c.session_id THEN RAISE EXCEPTION 'ALLOCATION_FORBIDDEN'; END IF;
 IF TG_TABLE_NAME='practice_allocation_movement' THEN
  IF c.action<>'prepare' THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_MISMATCH'; END IF;
  IF NEW.kind='feed_384' THEN
   SELECT ev.* INTO f FROM app.practice_feed_event ev JOIN app.practice_feed_account ac ON(ac.tenant_id,ac.id)=(ev.tenant_id,ev.account_id) WHERE ev.tenant_id=NEW.tenant_id AND ev.job_id=NEW.job_id AND ev.id=NEW.source_event_id AND ac.session_id=c.session_id AND ev.state='settled' AND ev.event_id='settled-384';
   IF f.id IS NULL OR NEW.gross_pence<>f.gross_pence OR NEW.underlying_movement_id<>f.account_id::text||':'||f.underlying_movement_id OR NEW.source_hash<>f.source_hash THEN RAISE EXCEPTION 'ALLOCATION_SETTLED_SOURCE_REQUIRED'; END IF;
  ELSE
   IF NEW.source_event_id IS NOT NULL OR NEW.gross_pence<>300000 OR NEW.underlying_movement_id<>'generated:'||NEW.job_id::text||':receipt-3000' OR NEW.source_hash<>encode(sha256(convert_to(NEW.underlying_movement_id||'|300000|GBP|settled|synthetic_demo','UTF8')),'hex') THEN RAISE EXCEPTION 'ALLOCATION_SETTLED_SOURCE_REQUIRED'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='practice_allocation' THEN
  IF c.action<>'approve' OR NEW.movement_id::text IS DISTINCT FROM c.payload->>'movementId' OR NEW.case_id::text IS DISTINCT FROM c.payload->>'caseId' OR NEW.evidence_id::text IS DISTINCT FROM c.payload->>'evidenceId' OR NEW.net_pence IS DISTINCT FROM (c.payload->>'netPence')::bigint OR NEW.representation_id IS DISTINCT FROM c.payload->>'representationId' OR NEW.reviewer_ref<>'membership:'||c.actor_membership_id::text THEN RAISE EXCEPTION 'ALLOCATION_APPROVAL_MISMATCH'; END IF;
  SELECT * INTO m FROM app.practice_allocation_movement WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.movement_id;
  idx:=CASE WHEN m.kind='feed_384' THEN 1 ELSE 2 END;
  IF m.id IS NULL OR NEW.case_id<>s.case_ids[idx] OR NEW.evidence_id<>s.evidence_ids[idx] THEN RAISE EXCEPTION 'ALLOCATION_SOURCE_MISMATCH'; END IF;
  IF m.kind='feed_384' THEN
   SELECT * INTO f FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND id=m.source_event_id;
   IF NOT EXISTS(SELECT 1 FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND account_id=f.account_id AND underlying_movement_id=f.underlying_movement_id AND representation_id=NEW.representation_id AND state='settled') OR
   (EXISTS(SELECT 1 FROM app.practice_feed_event WHERE tenant_id=NEW.tenant_id AND account_id=f.account_id AND state='possible_duplicate') AND NOT EXISTS(SELECT 1 FROM app.practice_feed_command WHERE tenant_id=NEW.tenant_id AND account_id=f.account_id AND action='reconcile_duplicate')) THEN RAISE EXCEPTION 'ALLOCATION_SETTLED_SOURCE_REQUIRED'; END IF;
  ELSIF NEW.representation_id<>'generated-3000' THEN RAISE EXCEPTION 'ALLOCATION_SETTLED_SOURCE_REQUIRED'; END IF;
  SELECT * INTO e FROM app.evidence_object WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.evidence_id AND kind='original';
  IF e.id IS NULL OR e.sha256<>NEW.evidence_sha256 OR e.object_version_id<>NEW.evidence_version_id OR EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=NEW.tenant_id AND evidence_id=e.id) OR EXISTS(SELECT 1 FROM app.practice_allocation_change ch JOIN app.practice_allocation al ON(al.tenant_id,al.id)=(ch.tenant_id,ch.allocation_id) WHERE al.tenant_id=NEW.tenant_id AND al.case_id=NEW.case_id AND ch.kind IN('invalidate_evidence','dispute')) THEN RAISE EXCEPTION 'ALLOCATION_EVIDENCE_INVALID'; END IF;
  SELECT * INTO eligible FROM app.recovery_eligibility_revision WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id ORDER BY revision DESC LIMIT 1;
  IF eligible.id IS NULL OR eligible.status<>'approved' OR eligible.classification<>'eligible_for_review' OR eligible.policy_version<>NEW.policy_version THEN RAISE EXCEPTION 'ALLOCATION_ELIGIBILITY_REQUIRED'; END IF;
  SELECT claimed_net_pence INTO claimed FROM app.recovery_claim_revision WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id ORDER BY revision DESC LIMIT 1;
  SELECT coalesce(sum(net_pence),0) INTO used FROM app.practice_allocation WHERE tenant_id=NEW.tenant_id AND case_id=NEW.case_id;
  -- Cash already attributed is never reusable, even after reversal/invalidation.
  IF used+NEW.net_pence>least(claimed,eligible.eligible_net_pence) THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_CLAIM'; END IF;
  SELECT coalesce(sum(gross_pence),0) INTO used FROM app.practice_allocation WHERE tenant_id=NEW.tenant_id AND movement_id=NEW.movement_id;
  IF used+NEW.gross_pence>m.gross_pence THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_AVAILABLE'; END IF;
  RETURN NEW;
 END IF;
 IF c.action<>NEW.kind OR NEW.allocation_id::text IS DISTINCT FROM c.payload->>'allocationId' THEN RAISE EXCEPTION 'ALLOCATION_APPROVAL_MISMATCH'; END IF;
 SELECT * INTO a FROM app.practice_allocation WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.allocation_id;
 IF a.id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND'; END IF;
 IF NEW.kind='reverse' THEN
  IF NEW.net_pence IS DISTINCT FROM (c.payload->>'netPence')::bigint THEN RAISE EXCEPTION 'ALLOCATION_APPROVAL_MISMATCH'; END IF;
  SELECT coalesce(sum(net_pence),0) INTO reversed FROM app.practice_allocation_change WHERE tenant_id=NEW.tenant_id AND allocation_id=NEW.allocation_id AND kind='reverse';
  IF reversed+NEW.net_pence>a.net_pence THEN RAISE EXCEPTION 'ALLOCATION_REVERSAL_EXCEEDS_AVAILABLE'; END IF;
 ELSIF EXISTS(SELECT 1 FROM app.practice_allocation_change WHERE tenant_id=NEW.tenant_id AND allocation_id=NEW.allocation_id AND kind=NEW.kind) THEN RAISE EXCEPTION 'ALLOCATION_CHANGE_ALREADY_RECORDED'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['practice_allocation_setup','practice_allocation_movement','practice_allocation','practice_allocation_change'] LOOP
 EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON app.%I FOR EACH ROW EXECUTE FUNCTION app.guard_practice_allocation_fact()',n||'_guard',n);
END LOOP; END $$;

CREATE FUNCTION app.require_practice_allocation_effect() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND subject_ref=NEW.job_id::text AND actor_ref='synthetic-session:'||NEW.session_id::text AND event_type='practice_allocation.'||NEW.action AND payload->'references'->>'commandId'=NEW.id::text AND payload->'hashes'->>'command'=NEW.payload_hash::text) THEN RAISE EXCEPTION 'ALLOCATION_AUDIT_REQUIRED'; END IF;
 IF NEW.action='prepare' AND (NOT EXISTS(SELECT 1 FROM app.practice_allocation_setup WHERE tenant_id=NEW.tenant_id AND command_id=NEW.id) OR (SELECT count(*) FROM app.practice_allocation_movement WHERE tenant_id=NEW.tenant_id AND command_id=NEW.id)<>2) THEN RAISE EXCEPTION 'ALLOCATION_EFFECT_REQUIRED'; END IF;
 IF NEW.action='approve' AND NOT EXISTS(SELECT 1 FROM app.practice_allocation WHERE tenant_id=NEW.tenant_id AND command_id=NEW.id) THEN RAISE EXCEPTION 'ALLOCATION_EFFECT_REQUIRED'; END IF;
 IF NEW.action IN('reverse','invalidate_evidence','dispute') AND NOT EXISTS(SELECT 1 FROM app.practice_allocation_change WHERE tenant_id=NEW.tenant_id AND command_id=NEW.id) THEN RAISE EXCEPTION 'ALLOCATION_EFFECT_REQUIRED'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER practice_allocation_effect AFTER INSERT ON app.practice_allocation_command DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.require_practice_allocation_effect();
ALTER FUNCTION app.guard_practice_allocation_command() OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_practice_allocation_fact() OWNER TO jobguard_migration;
ALTER FUNCTION app.require_practice_allocation_effect() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_practice_allocation_command(),app.guard_practice_allocation_fact(),app.require_practice_allocation_effect() FROM PUBLIC,jobguard_runtime;
COMMIT;
