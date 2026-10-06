BEGIN;
-- Close same-tenant cross-job links at shared order/proof boundaries. Existing
-- rows remain immutable; validation fails closed if legacy mislinks are found.
--
-- Adding a foreign key scans both tables as their owner (the migration role).
-- FORCE ROW LEVEL SECURITY makes that scan evaluate the tenant policies with no
-- tenant context: a strict policy raises "unrecognized configuration parameter
-- app.tenant_id", and a lenient one hides every row so a legacy mislink would
-- pass unseen. Suspend FORCE on exactly the tables involved, validate across
-- all tenants, and restore FORCE before COMMIT. The ALTER TABLE locks are
-- ACCESS EXCLUSIVE and held to the end of this transaction, so no runtime
-- session can read these tables while FORCE is suspended. Only the owner could
-- ever bypass RLS in that window; the runtime role is never exempt.
ALTER TABLE app.job NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.scope_identity NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.material_requirement NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.purchase_order_draft NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_upload NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_object NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_link NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.stage_completion NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.synthetic_evidence_original NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.purchase_order_draft ADD CONSTRAINT purchase_order_requirement_job_fk
  FOREIGN KEY (tenant_id,job_id,requirement_id) REFERENCES app.material_requirement(tenant_id,job_id,id);
ALTER TABLE app.evidence_upload ADD CONSTRAINT evidence_upload_job_identity_uq UNIQUE(tenant_id,job_id,id);
ALTER TABLE app.evidence_upload ADD CONSTRAINT evidence_upload_job_fk FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id);
ALTER TABLE app.evidence_upload ADD CONSTRAINT evidence_upload_scope_job_fk FOREIGN KEY(tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id);
ALTER TABLE app.evidence_object ADD CONSTRAINT evidence_object_job_identity_uq UNIQUE(tenant_id,job_id,id);
ALTER TABLE app.evidence_object ADD CONSTRAINT evidence_object_job_fk FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id);
ALTER TABLE app.evidence_object ADD CONSTRAINT evidence_object_scope_job_fk FOREIGN KEY(tenant_id,job_id,scope_item_id) REFERENCES app.scope_identity(tenant_id,job_id,id);
ALTER TABLE app.evidence_object ADD CONSTRAINT evidence_object_upload_job_fk FOREIGN KEY(tenant_id,job_id,upload_id) REFERENCES app.evidence_upload(tenant_id,job_id,id);
ALTER TABLE app.evidence_object ADD CONSTRAINT evidence_object_original_job_fk FOREIGN KEY(tenant_id,job_id,original_evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id);
ALTER TABLE app.evidence_link ADD CONSTRAINT evidence_link_job_identity_uq UNIQUE(tenant_id,job_id,scope_item_id,id);
ALTER TABLE app.evidence_link ADD CONSTRAINT evidence_link_evidence_job_fk FOREIGN KEY(tenant_id,job_id,evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id);
ALTER TABLE app.stage_completion ADD CONSTRAINT stage_completion_evidence_job_fk FOREIGN KEY(tenant_id,job_id,scope_item_id,evidence_link_id) REFERENCES app.evidence_link(tenant_id,job_id,scope_item_id,id);
ALTER TABLE app.synthetic_evidence_original ADD CONSTRAINT synthetic_original_upload_job_fk FOREIGN KEY(tenant_id,job_id,upload_id) REFERENCES app.evidence_upload(tenant_id,job_id,id);

ALTER TABLE app.job FORCE ROW LEVEL SECURITY;
ALTER TABLE app.scope_identity FORCE ROW LEVEL SECURITY;
ALTER TABLE app.material_requirement FORCE ROW LEVEL SECURITY;
ALTER TABLE app.purchase_order_draft FORCE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_upload FORCE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_object FORCE ROW LEVEL SECURITY;
ALTER TABLE app.evidence_link FORCE ROW LEVEL SECURITY;
ALTER TABLE app.stage_completion FORCE ROW LEVEL SECURITY;
ALTER TABLE app.synthetic_evidence_original FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='app' AND c.relname IN ('job','scope_identity','material_requirement','purchase_order_draft','evidence_upload','evidence_object','evidence_link','stage_completion','synthetic_evidence_original')
      AND NOT (c.relrowsecurity AND c.relforcerowsecurity))
  THEN RAISE EXCEPTION 'FORCE ROW LEVEL SECURITY was not restored'; END IF;
END $$;

-- Runtime has no UPDATE privilege on job, hence cannot take a locking read by
-- another path. This helper exposes only a tenant-bound share lock, no writes.
CREATE FUNCTION app.require_watchdog_live(p_job uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app AS $$
DECLARE tenant uuid; lifecycle text;
BEGIN
  tenant := nullif(current_setting('app.tenant_id', true), '')::uuid;
  IF tenant IS NULL THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  SELECT status INTO lifecycle FROM app.job WHERE tenant_id=tenant AND id=p_job FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF lifecycle <> 'live' THEN RAISE EXCEPTION 'JOB_NOT_LIVE' USING ERRCODE='P0001'; END IF;
END $$;
ALTER FUNCTION app.require_watchdog_live(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.require_watchdog_live(uuid) FROM PUBLIC, jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.require_watchdog_live(uuid) TO jobguard_runtime;

CREATE FUNCTION app.guard_watchdog_input() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, app AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  THEN RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE='42501'; END IF;
  -- These tables also hold non-watchdog bank evidence from the already
  -- controlled synthetic recovery routine. Only its migration-role execution
  -- may write its exact generated PDF class after live. Runtime cannot assume
  -- this role or gain the exception by forging a content type/key/mode.
  IF current_user='jobguard_migration' AND (to_jsonb(NEW)->>'scope_item_id') IS NULL
    AND (to_jsonb(NEW)->>'object_key') LIKE 'synthetic/recovery/%'
    AND ((TG_TABLE_NAME='evidence_upload' AND to_jsonb(NEW)->>'expected_content_type'='application/pdf' AND to_jsonb(NEW)->>'state'='verified')
      OR (TG_TABLE_NAME='evidence_object' AND to_jsonb(NEW)->>'evidence_type'='synthetic_bank_receipt' AND to_jsonb(NEW)->>'content_type'='application/pdf'))
  THEN RETURN NEW; END IF;
  PERFORM app.require_watchdog_live(NEW.job_id);
  RETURN NEW;
END $$;
ALTER FUNCTION app.guard_watchdog_input() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_watchdog_input() FROM PUBLIC, jobguard_runtime, jobguard_infrastructure;

-- One tenant-wide identity for every watchdog command, whichever store holds its result. A command claims its id here first, in the
-- transaction that completes it and before any audit lock, with its job, kind and request hash. The same id can never be reused for a
-- changed payload, another job or another kind of command, and a concurrent claim waits on the primary key and then conflicts.
-- Append-only for the runtime role.
CREATE TABLE app.watchdog_command_identity(
  tenant_id uuid NOT NULL,
  command_id uuid NOT NULL,
  job_id uuid NOT NULL,
  command_type text NOT NULL CHECK(command_type IN ('readiness.record','readiness.advance','things_to_check.evaluate','things_to_check.review','things_to_check.supersede','supplier_match.create','supplier_match.correct','inbox.seed','inbox.dismiss','purchase_order.revise','purchase_order.place','supplier_document.intake','supplier_document.receipt','supplier_document.confirm','evidence.begin_upload','evidence.finalize','proof.complete')),
  request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY(tenant_id,command_id),
  UNIQUE(tenant_id,command_id,job_id,command_type),
  FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id));
-- The exact result a command first returned, including a successful no-op, where the command has no receipt, object or row of its own.
CREATE TABLE app.watchdog_command_result(
  tenant_id uuid NOT NULL,
  command_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY(tenant_id,command_id),
  FOREIGN KEY(tenant_id,command_id) REFERENCES app.watchdog_command_identity(tenant_id,command_id));
-- The proof application's first answer to each of its three live-only commands (select a generated file, finalise it, complete the stage).
-- The answer is a projection of the job that changes as the job moves on, so it is recorded once, with the request it answered, bound by
-- foreign key to that command's claimed identity (hence its job and kind), and a replay returns it as recorded. Append-only for the
-- runtime role. It is the replay record of a command that already succeeded, not a watchdog input, so it has no live-job insert guard:
-- a job that has just left live must still be able to give the first answer back.
CREATE TABLE app.proof_application_response(
  tenant_id uuid NOT NULL,
  command_id uuid NOT NULL,
  job_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('select_generated','finalize','complete')),
  command_type text NOT NULL,
  request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY(tenant_id,command_id),
  CHECK((action='select_generated' AND command_type='evidence.begin_upload') OR (action='finalize' AND command_type='evidence.finalize') OR (action='complete' AND command_type='proof.complete')),
  FOREIGN KEY(tenant_id,command_id,job_id,command_type) REFERENCES app.watchdog_command_identity(tenant_id,command_id,job_id,command_type),
  FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id));
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['watchdog_command_identity','watchdog_command_result','proof_application_response'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
  EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP;END$$;
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.purchase_order_draft FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.purchase_order_revision FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.purchase_order_placement FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.supplier_document FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.supplier_document_version FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.supplier_document_intake FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.goods_receipt FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.supplier_fact_proposal FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.supplier_fact_revision FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.supplier_match_proposal FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.supplier_match_revision FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.supplier_match_allocation FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.discrepancy_finding_revision FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.discrepancy_review_outcome FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.supplier_bill_supersession FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.planned_work_revision FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.readiness_snapshot FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.readiness_decision FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.inbox_finding_revision FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.inbox_decision_revision FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.inbox_outcome_event FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.evidence_upload FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.evidence_object FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.evidence_link FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.synthetic_evidence_original FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.stage_completion FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
CREATE TRIGGER a_watchdog_live_before_insert BEFORE INSERT ON app.watchdog_command_identity FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_input();
-- Finalisation mutates the pending upload before registering its immutable
-- object. Keep that phase guarded too; cleanup/rejection remains possible.
CREATE FUNCTION app.guard_watchdog_upload_update() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
BEGIN
  IF (NEW.id,NEW.tenant_id,NEW.job_id,NEW.scope_item_id,NEW.object_key,NEW.expected_sha256,NEW.expected_content_type,NEW.maximum_bytes)
    IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.job_id,OLD.scope_item_id,OLD.object_key,OLD.expected_sha256,OLD.expected_content_type,OLD.maximum_bytes)
  THEN RAISE EXCEPTION 'evidence upload identity is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.state IN ('quarantined','verified') AND
    (NEW.state,NEW.object_version_id,NEW.server_verified_at) IS DISTINCT FROM (OLD.state,OLD.object_version_id,OLD.server_verified_at)
  THEN PERFORM app.require_watchdog_live(NEW.job_id); END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.guard_watchdog_upload_update() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_watchdog_upload_update() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER a_watchdog_live_before_update BEFORE UPDATE ON app.evidence_upload FOR EACH ROW EXECUTE FUNCTION app.guard_watchdog_upload_update();
REVOKE UPDATE ON app.evidence_upload FROM jobguard_runtime;
GRANT UPDATE(id,state,rejection_code,object_version_id,server_verified_at) ON app.evidence_upload TO jobguard_runtime;
-- An id the previous schema's stores hold is reserved for the command that persisted it (claimCommandIdentity reads them before it claims).
-- The reverse must hold at the database boundary too, for writers that never claim: during a mixed-version rollout, or after the
-- documented application rollback, the previous application still inserts into those stores. Each store therefore takes the same
-- per-id transaction lock the claim takes, then refuses an id already claimed for another kind of command or another job. A claim and
-- a previous-schema write of one id are serialised in either order: whichever commits first, the other sees it and conflicts.
CREATE FUNCTION app.reserve_watchdog_command_id() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE
  new_row jsonb := to_jsonb(NEW);
  cid uuid := (new_row->>TG_ARGV[1])::uuid;
  jid uuid := CASE WHEN TG_TABLE_NAME='command_receipt' THEN nullif(split_part(new_row->>'semantic_key',':',2),'')::uuid ELSE (new_row->>'job_id')::uuid END;
  claimed record;
BEGIN
  IF cid IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||NEW.tenant_id::text||':'||cid::text,0));
  SELECT command_type,job_id INTO claimed FROM app.watchdog_command_identity WHERE tenant_id=NEW.tenant_id AND command_id=cid;
  IF FOUND AND (NOT claimed.command_type=ANY(string_to_array(TG_ARGV[0],',')) OR claimed.job_id IS DISTINCT FROM jid)
  THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  -- A claimed command has its effects in the transaction that claimed it. A row under a claimed id from any other transaction is a
  -- second effect of a command that already completed, even of the same kind on the same job (e.g. a previous-schema retry after a
  -- claim that completed with no row of its own), so it is refused (Codex P2 4199348149). claimCommandIdentity notes its ids here.
  IF FOUND AND position(cid::text||',' IN coalesce(current_setting('app.watchdog_claims',true),''))=0
  THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN NEW;
END $$;
ALTER FUNCTION app.reserve_watchdog_command_id() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.reserve_watchdog_command_id() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.planned_work_revision FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('readiness.record','command_id');
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.readiness_decision FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('readiness.advance','command_id');
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.discrepancy_finding_revision FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('things_to_check.evaluate','command_id');
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.discrepancy_review_outcome FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('things_to_check.review','command_id');
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.supplier_bill_supersession FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('things_to_check.supersede','command_id');
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.supplier_match_revision FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('supplier_match.create,supplier_match.correct','command_id');
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.supplier_fact_revision FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('supplier_document.confirm','command_id');
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.inbox_outcome_event FOR EACH ROW WHEN (NEW.event_kind='dismissed') EXECUTE FUNCTION app.reserve_watchdog_command_id('inbox.dismiss','command_id');
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.command_receipt FOR EACH ROW WHEN (NEW.command_type='inbox.seed') EXECUTE FUNCTION app.reserve_watchdog_command_id('inbox.seed','command_id');
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.purchase_order_placement FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('purchase_order.place','command_id');
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.stage_completion FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('proof.complete','command_id');
CREATE TRIGGER b_watchdog_command_id_before_insert BEFORE INSERT ON app.evidence_upload FOR EACH ROW EXECUTE FUNCTION app.reserve_watchdog_command_id('evidence.begin_upload','id');
-- 0050 supplier-match revision check: every existing revision must already cite its own proposal's confirmed or corrected
-- event (Codex P2 4199041831); the trigger below only sees new rows. Both tables FORCE row-level security, so the scan suspends
-- FORCE for this transaction exactly like the foreign-key scans above, and restores it before anything else runs.
ALTER TABLE app.supplier_match_revision NO FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_event NO FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM app.supplier_match_revision r WHERE NOT EXISTS(SELECT 1 FROM app.audit_event ae
    WHERE (ae.tenant_id,ae.id)=(r.tenant_id,r.audit_event_id) AND ae.event_type IN('supplier_match.confirmed','supplier_match.corrected')
      AND ae.subject_type='supplier_match' AND ae.subject_ref=r.proposal_id::text
      AND (ae.event_type='supplier_match.confirmed' OR ae.payload->'hashes'->>'payloadHash'=rtrim(r.payload_hash))))
  THEN RAISE EXCEPTION 'a supplier match revision does not cite its own confirmed or corrected event' USING ERRCODE='23514'; END IF;
END $$;
ALTER TABLE app.supplier_match_revision FORCE ROW LEVEL SECURITY;
ALTER TABLE app.audit_event FORCE ROW LEVEL SECURITY;
-- Each confirmed or corrected event stands behind exactly one revision, so a revision cannot borrow an earlier event of its own
-- proposal (Codex P2 4199159015). A payload-hash binding cannot express this: a creation's revision hashes the derived correction,
-- its event the creation request. Building the index scans every existing row regardless of row-level security and fails the
-- upgrade on any duplicate.
ALTER TABLE app.supplier_match_revision ADD CONSTRAINT supplier_match_revision_audit_event_uq UNIQUE(tenant_id,audit_event_id);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='app' AND c.relname IN ('supplier_match_revision','audit_event') AND NOT (c.relrowsecurity AND c.relforcerowsecurity))
  THEN RAISE EXCEPTION 'FORCE ROW LEVEL SECURITY was not restored'; END IF;
END $$;
-- A supplier match revision is a creation's or a correction's, told apart only by its audit event (Codex P2 4197723875), which the
-- writer may append later in the same transaction (the reference is deferred). The insert trigger above already holds the id's lock
-- and admits either kind; this one runs at commit, when the event exists, and requires the claim's kind to be exactly that one.
CREATE FUNCTION app.reserve_supplier_match_kind() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,app AS $$
DECLARE kind text; claimed text;
BEGIN
  -- Only a creation's "confirmed" or a correction's "corrected" event can stand behind a revision; any other event is refused
  -- outright, claimed or not, so no revision can be bound to an effect it did not have (Codex P2 4197809983).
  -- The event must also be this revision's own: about this proposal (Codex P2 4199041823), not another proposal's or job's.
  -- A correction's event attests to the correction itself: it carries the revision's own payload hash (Codex P2 4199236808). A
  -- creation's event hashes the creation request, not the derived revision, so it is bound by subject and uniqueness alone.
  SELECT CASE event_type WHEN 'supplier_match.confirmed' THEN 'supplier_match.create' WHEN 'supplier_match.corrected' THEN 'supplier_match.correct' END INTO kind
    FROM app.audit_event WHERE tenant_id=NEW.tenant_id AND id=NEW.audit_event_id AND subject_type='supplier_match' AND subject_ref=NEW.proposal_id::text
      AND (event_type='supplier_match.confirmed' OR payload->'hashes'->>'payloadHash'=rtrim(NEW.payload_hash));
  IF kind IS NULL THEN RAISE EXCEPTION 'supplier match revision must cite its own proposal''s confirmed or corrected event' USING ERRCODE='23514'; END IF;
  SELECT command_type INTO claimed FROM app.watchdog_command_identity WHERE tenant_id=NEW.tenant_id AND command_id=NEW.command_id;
  IF claimed IS NOT NULL AND claimed IS DISTINCT FROM kind THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN NULL;
END $$;
ALTER FUNCTION app.reserve_supplier_match_kind() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.reserve_supplier_match_kind() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE CONSTRAINT TRIGGER c_watchdog_command_kind_at_commit AFTER INSERT ON app.supplier_match_revision DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.reserve_supplier_match_kind();
COMMIT;
