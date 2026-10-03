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
COMMIT;
