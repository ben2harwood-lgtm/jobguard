BEGIN;
-- Synthetic, immutable matching snapshots. No source table or financial routine is changed.
CREATE TABLE app.supplier_line_match_snapshot (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL,
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 facts jsonb NOT NULL CHECK(coalesce(facts->>'version'='supplier-line-match-input.v1'
   AND facts->>'environment'='synthetic_demo' AND facts->>'tenantId'=tenant_id::text AND facts->>'jobId'=job_id::text,false)),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 audit_event_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,audit_event_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE app.supplier_line_match_correction (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, snapshot_id uuid NOT NULL,
 command_id uuid NOT NULL, revision integer NOT NULL CHECK(revision>0), actor_membership_id uuid NOT NULL,
 correction jsonb NOT NULL CHECK(coalesce(correction->>'version'='supplier-line-correction.v1',false)),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 audit_event_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), CONSTRAINT slmc_revision UNIQUE(tenant_id,snapshot_id,revision), UNIQUE(tenant_id,audit_event_id),
 FOREIGN KEY(tenant_id,job_id,snapshot_id) REFERENCES app.supplier_line_match_snapshot(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE FUNCTION app.supplier_line_match_audit_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE facts jsonb; latest integer;
BEGIN
 IF TG_WHEN='BEFORE' THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=NEW.tenant_id AND m.id=NEW.actor_membership_id
    AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()))
  THEN RAISE EXCEPTION 'MATCH_FORBIDDEN' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='supplier_line_match_correction' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':supplier-line-snapshot:'||NEW.snapshot_id::text,0));
   SELECT s.facts INTO facts FROM app.supplier_line_match_snapshot s
    WHERE (s.tenant_id,s.job_id,s.id)=(NEW.tenant_id,NEW.job_id,NEW.snapshot_id);
   IF facts IS NULL THEN RAISE EXCEPTION 'MATCH_NOT_FOUND' USING ERRCODE='23503'; END IF;
   SELECT coalesce(max(c.revision),0) INTO latest FROM app.supplier_line_match_correction c
    WHERE c.tenant_id=NEW.tenant_id AND c.snapshot_id=NEW.snapshot_id;
   IF NEW.revision<>latest+1 OR (NEW.correction->>'expectedRevision')::integer IS DISTINCT FROM latest
    THEN RAISE EXCEPTION 'MATCH_REVISION_CONFLICT' USING ERRCODE='23514'; END IF;
   IF NEW.correction->>'snapshotId' IS DISTINCT FROM NEW.snapshot_id::text
    OR NEW.correction->>'commandId' IS DISTINCT FROM NEW.command_id::text
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements((facts->'receipts')||(facts->'bills')) x WHERE x->>'versionId'=NEW.correction->>'sourceVersionId')
    OR NOT (NEW.correction ? 'orderVersionId')
    OR (NEW.correction->>'orderVersionId' IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM jsonb_array_elements(facts->'orders') x WHERE x->>'versionId'=NEW.correction->>'orderVersionId'))
    THEN RAISE EXCEPTION 'MATCH_SOURCE_VERSION_CONFLICT' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.audit_event e WHERE e.tenant_id=NEW.tenant_id AND e.id=NEW.audit_event_id
   AND e.actor_ref='membership:'||NEW.actor_membership_id::text
   AND e.event_type= (CASE WHEN TG_TABLE_NAME='supplier_line_match_snapshot' THEN 'supplier_line_match.created' ELSE 'supplier_line_match.corrected' END)
   AND e.subject_type='supplier_line_match' AND e.subject_ref=NEW.id::text
   AND e.payload->'references'->>'commandId'=NEW.command_id::text
   AND e.payload->'hashes'->>'requestHash'=NEW.request_hash)
 THEN RAISE EXCEPTION 'MATCH_AUDIT_BINDING_REQUIRED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.supplier_line_match_audit_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.supplier_line_match_audit_guard() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['supplier_line_match_snapshot','supplier_line_match_correction'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
  EXECUTE format('CREATE TRIGGER no_truncate BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
  EXECUTE format('CREATE TRIGGER validate_insert BEFORE INSERT ON app.%I FOR EACH ROW EXECUTE FUNCTION app.supplier_line_match_audit_guard()',n);
  EXECUTE format('CREATE CONSTRAINT TRIGGER audit_binding AFTER INSERT ON app.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.supplier_line_match_audit_guard()',n);
 END LOOP;
END $$;
COMMIT;
