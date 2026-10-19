BEGIN;
-- SV5PRE: all proof writes are private-trigger checked. Runtime receives no DML.
CREATE TABLE app.final_check_manifest (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,id uuid NOT NULL,lock_id uuid NOT NULL,evidence_cutoff_at timestamptz NOT NULL,
 schema_version text NOT NULL DEFAULT 'final-check-manifest.v1' CHECK(schema_version='final-check-manifest.v1'),
 detector_version text NOT NULL CHECK(length(detector_version) BETWEEN 1 AND 80),reconciliation_version text NOT NULL CHECK(length(reconciliation_version) BETWEEN 1 AND 80),
 inventory_hash text NOT NULL DEFAULT repeat('0',64) CHECK(inventory_hash ~ '^[a-f0-9]{64}$'),source_count integer NOT NULL DEFAULT 0 CHECK(source_count>=0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,id),UNIQUE(tenant_id,job_id,lock_id),UNIQUE(tenant_id,job_id,id,lock_id,evidence_cutoff_at),
 FOREIGN KEY(tenant_id,job_id,lock_id,evidence_cutoff_at) REFERENCES app.final_account_lock(tenant_id,job_id,id,locked_at)
);
CREATE TABLE app.final_check_manifest_source (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,manifest_id uuid NOT NULL,id uuid NOT NULL,upload_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind='evidence_upload'),evidence_id uuid,object_version_id text,sha256 char(64),source_received_at timestamptz NOT NULL,evidence_received_at timestamptz,
 frozen_input_hash text NOT NULL CHECK(frozen_input_hash ~ '^[a-f0-9]{64}$'),adapter_version text NOT NULL,
 PRIMARY KEY(tenant_id,job_id,manifest_id,id),UNIQUE(tenant_id,job_id,manifest_id,upload_id),
 FOREIGN KEY(tenant_id,job_id,manifest_id) REFERENCES app.final_check_manifest(tenant_id,job_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,upload_id) REFERENCES app.evidence_upload(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id,object_version_id,sha256,evidence_received_at) REFERENCES app.evidence_object(tenant_id,job_id,id,object_version_id,sha256,server_received_at),
 CHECK((evidence_id IS NULL AND object_version_id IS NULL AND sha256 IS NULL AND evidence_received_at IS NULL) OR (evidence_id IS NOT NULL AND object_version_id IS NOT NULL AND sha256 IS NOT NULL AND evidence_received_at IS NOT NULL))
);
CREATE TABLE app.shadow_final_check_source_attempt (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,manifest_id uuid NOT NULL,source_id uuid NOT NULL,id uuid NOT NULL,execution_id uuid NOT NULL,
 stage text NOT NULL CHECK(stage IN ('detection','reconciliation')),version text NOT NULL CHECK(length(version) BETWEEN 1 AND 80),
 input_hash text NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),outcome text NOT NULL CHECK(outcome IN ('succeeded','failed','pending','invalidated')),
 failure_code text,result_hash text,result_signal_ids uuid[] NOT NULL DEFAULT '{}',evidence_id uuid,object_version_id text,sha256 char(64),source_received_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,manifest_id,source_id,stage,id),UNIQUE(tenant_id,job_id,manifest_id,source_id,execution_id,stage,created_at),
 FOREIGN KEY(tenant_id,job_id,manifest_id,source_id) REFERENCES app.final_check_manifest_source(tenant_id,job_id,manifest_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id,object_version_id,sha256,source_received_at) REFERENCES app.evidence_object(tenant_id,job_id,id,object_version_id,sha256,server_received_at),
 CHECK((outcome='succeeded' AND result_hash IS NOT NULL AND result_hash ~ '^[a-f0-9]{64}$' AND failure_code IS NULL AND evidence_id IS NOT NULL AND object_version_id IS NOT NULL AND sha256 IS NOT NULL AND source_received_at IS NOT NULL) OR (outcome<>'succeeded' AND failure_code IS NOT NULL AND result_hash IS NULL AND cardinality(result_signal_ids)=0))
);
CREATE TABLE app.shadow_final_check_run_binding (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,run_id uuid NOT NULL,manifest_id uuid NOT NULL,lock_id uuid NOT NULL,evidence_cutoff_at timestamptz NOT NULL,
 execution_id uuid NOT NULL,detector_version text NOT NULL,reconciliation_version text NOT NULL,result_manifest_hash text NOT NULL DEFAULT repeat('0',64),
 PRIMARY KEY(tenant_id,job_id,run_id),UNIQUE(tenant_id,job_id,execution_id),UNIQUE(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.shadow_reconciliation_run(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,manifest_id,lock_id,evidence_cutoff_at) REFERENCES app.final_check_manifest(tenant_id,job_id,id,lock_id,evidence_cutoff_at)
);
CREATE TABLE app.shadow_final_check_reveal_proof (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,run_id uuid NOT NULL,id uuid NOT NULL,signal_id uuid,classification_id uuid,
 projection_version text NOT NULL CHECK(projection_version='final-check-result.v1'),result_hash text NOT NULL DEFAULT repeat('0',64),result_descriptor jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,run_id,signal_id),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.shadow_reconciliation_run(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,run_id,signal_id) REFERENCES app.shadow_signal_classification(tenant_id,job_id,run_id,signal_id),
 CHECK((signal_id IS NULL AND classification_id IS NULL) OR (signal_id IS NOT NULL AND classification_id IS NOT NULL))
);
CREATE UNIQUE INDEX final_check_one_empty_descriptor ON app.shadow_final_check_reveal_proof(tenant_id,job_id,run_id) WHERE signal_id IS NULL;
CREATE TABLE app.shadow_final_check_completion (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,check_id uuid NOT NULL,run_id uuid NOT NULL,manifest_id uuid NOT NULL,lock_id uuid NOT NULL,
 evidence_cutoff_at timestamptz NOT NULL,result_hash text NOT NULL CHECK(result_hash ~ '^[a-f0-9]{64}$'),published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id,check_id),
 FOREIGN KEY(tenant_id,job_id,lock_id,check_id) REFERENCES app.final_account_lock_check(tenant_id,job_id,lock_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at) REFERENCES app.shadow_final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['final_check_manifest','final_check_manifest_source','shadow_final_check_source_attempt','shadow_final_check_run_binding','shadow_final_check_reveal_proof','shadow_final_check_completion'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure',n);
  EXECUTE format('CREATE TRIGGER final_check_no_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
  IF n NOT IN ('shadow_final_check_completion','final_check_manifest_source') THEN
   EXECUTE format('CREATE POLICY shadow_proof ON app.%I FOR ALL TO jobguard_shadow USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
   EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_shadow',n);
  ELSIF n='final_check_manifest_source' THEN
   EXECUTE format('CREATE POLICY shadow_source ON app.%I FOR SELECT TO jobguard_shadow USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
   EXECUTE format('GRANT SELECT ON app.%I TO jobguard_shadow',n);
  END IF;
 END LOOP;
END $$;
-- Generated rows have no independent writer path, including through an ordinary owner-login insert.
CREATE FUNCTION app.guard_final_check_generated_fact() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF current_user<>'jobguard_migration' OR pg_trigger_depth()<>2 OR NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER final_check_generated_source BEFORE INSERT ON app.final_check_manifest_source FOR EACH ROW EXECUTE FUNCTION app.guard_final_check_generated_fact();
CREATE TRIGGER final_check_generated_certificate BEFORE INSERT ON app.shadow_final_check_completion FOR EACH ROW EXECUTE FUNCTION app.guard_final_check_generated_fact();
-- Lock order: job row, check advisory lock, source rows (read only), invoice sequence, audit head.
CREATE FUNCTION app.final_check_require_worker(p_tenant uuid,p_job uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT pg_has_role(session_user,'jobguard_shadow','USAGE') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=p_tenant AND job_id=p_job AND job_track='small_builder' AND environment='synthetic_demo') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=p_tenant AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_job::text,130));
END $$;
CREATE FUNCTION app.serialize_final_check_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE prior text:=current_setting('app.tenant_id',true);
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(prior,'')::uuid AND NOT pg_has_role(session_user,'jobguard_migration','USAGE') AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 -- SHARE matches the watchdog live guard and blocks the exclusive lock/freeze/publication
 -- without upgrading concurrent evidence commands from SHARE to UPDATE.
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR SHARE;
 IF TG_TABLE_NAME='evidence_upload' THEN
  -- Preserve supplied receipts. A later insert cannot claim a place before an existing lock.
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND NEW.server_received_at<=locked_at) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_IDENTITY_CHANGED' USING ERRCODE='55000';
  ELSIF TG_OP='UPDATE' AND ROW(NEW.tenant_id,NEW.id,NEW.job_id,NEW.server_received_at,NEW.object_key,NEW.expected_sha256,NEW.expected_content_type) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.job_id,OLD.server_received_at,OLD.object_key,OLD.expected_sha256,OLD.expected_content_type) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_IDENTITY_CHANGED' USING ERRCODE='42501'; END IF;
 ELSIF NEW.kind='original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.evidence_upload WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.upload_id) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_IDENTITY_CHANGED' USING ERRCODE='23503'; END IF;
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(prior,''),true);RETURN NEW;
END $$;
CREATE TRIGGER a_final_check_inventory BEFORE INSERT OR UPDATE ON app.evidence_upload FOR EACH ROW EXECUTE FUNCTION app.serialize_final_check_evidence();
CREATE TRIGGER a_final_check_inventory BEFORE INSERT ON app.evidence_object FOR EACH ROW EXECUTE FUNCTION app.serialize_final_check_evidence();
CREATE FUNCTION app.serialize_final_check_invalidation() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE source_job uuid;prior text:=current_setting('app.tenant_id',true);
BEGIN
 -- Preserve the existing privileged maintenance/fixture write path, as for evidence registration.
 -- Ordinary sessions still require their own tenant context before any lookup or lock.
 IF NEW.tenant_id IS DISTINCT FROM nullif(prior,'')::uuid AND NOT pg_has_role(session_user,'jobguard_migration','USAGE') AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 SELECT job_id INTO source_job FROM app.evidence_object WHERE tenant_id=NEW.tenant_id AND id=NEW.evidence_id;
 -- SHARE is compatible with the watchdog live guard other commands already hold, so merged invalidation/completion races still
 -- reach their own upload-row lock; it still excludes the UPDATE-class lock/freeze/publication/invoice routines until commit.
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=source_job FOR SHARE;
 PERFORM set_config('app.tenant_id',coalesce(prior,''),true);
 RETURN NEW;
END $$;
CREATE TRIGGER a_final_check_invalidation BEFORE INSERT ON app.evidence_invalidation FOR EACH ROW EXECUTE FUNCTION app.serialize_final_check_invalidation();
CREATE FUNCTION app.guard_final_check_manifest() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE inventory jsonb;l app.final_account_lock;
BEGIN
 PERFORM app.final_check_require_worker(NEW.tenant_id,NEW.job_id);
 IF NEW.lock_id IS NULL AND NEW.evidence_cutoff_at IS NULL THEN SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id; NEW.lock_id:=l.id;NEW.evidence_cutoff_at:=l.locked_at; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE (tenant_id,job_id,id,locked_at)=(NEW.tenant_id,NEW.job_id,NEW.lock_id,NEW.evidence_cutoff_at)) THEN RAISE EXCEPTION 'FINAL_CHECK_LOCK_BINDING_INVALID' USING ERRCODE='23503'; END IF;
 INSERT INTO app.final_check_manifest_source(tenant_id,job_id,manifest_id,id,upload_id,source_kind,evidence_id,object_version_id,sha256,source_received_at,evidence_received_at,frozen_input_hash,adapter_version)
 SELECT u.tenant_id,u.job_id,NEW.id,u.id,u.id,'evidence_upload',e.id,e.object_version_id,e.sha256,u.server_received_at,e.server_received_at,
 app.final_lock_hash(jsonb_build_object('upload',u.id,'receivedAt',to_char(u.server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expectedHash',u.expected_sha256,'contentType',u.expected_content_type)),NEW.detector_version
 FROM app.evidence_upload u LEFT JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.upload_id,e.kind)=(u.tenant_id,u.job_id,u.id,'original')
 WHERE u.tenant_id=NEW.tenant_id AND u.job_id=NEW.job_id AND u.server_received_at<=NEW.evidence_cutoff_at;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'inputHash',frozen_input_hash) ORDER BY id),'[]'),count(*) INTO inventory,NEW.source_count FROM app.final_check_manifest_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND manifest_id=NEW.id;
 NEW.inventory_hash:=app.final_lock_hash(inventory);NEW.created_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER final_check_manifest_insert BEFORE INSERT ON app.final_check_manifest FOR EACH ROW EXECUTE FUNCTION app.guard_final_check_manifest();
CREATE FUNCTION app.guard_final_check_attempt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE s app.final_check_manifest_source; m app.final_check_manifest; prior app.shadow_final_check_source_attempt;
BEGIN
 PERFORM app.final_check_require_worker(NEW.tenant_id,NEW.job_id);
 SELECT * INTO prior FROM app.shadow_final_check_source_attempt WHERE tenant_id=NEW.tenant_id AND id=NEW.id;
 IF FOUND THEN IF (to_jsonb(prior)-'created_at') IS DISTINCT FROM (to_jsonb(NEW)-'created_at') THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; RETURN NULL; END IF;
 SELECT * INTO s FROM app.final_check_manifest_source WHERE (tenant_id,job_id,manifest_id,id)=(NEW.tenant_id,NEW.job_id,NEW.manifest_id,NEW.source_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_IDENTITY_CHANGED' USING ERRCODE='23503'; END IF;
 SELECT * INTO m FROM app.final_check_manifest WHERE (tenant_id,job_id,id)=(s.tenant_id,s.job_id,s.manifest_id);
 IF NEW.version IS DISTINCT FROM (CASE NEW.stage WHEN 'detection' THEN m.detector_version ELSE m.reconciliation_version END) THEN RAISE EXCEPTION 'FINAL_CHECK_INPUT_MISMATCH'; END IF;
 IF NEW.outcome='succeeded' THEN
  IF NOT EXISTS(SELECT 1 FROM app.evidence_upload u JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.upload_id)=(u.tenant_id,u.job_id,u.id)
   WHERE (u.tenant_id,u.job_id,u.id)=(s.tenant_id,s.job_id,s.upload_id) AND u.state='verified' AND e.kind='original'
   AND (e.id,e.object_version_id,e.sha256,e.server_received_at)=(NEW.evidence_id,NEW.object_version_id,NEW.sha256,NEW.source_received_at)
   AND e.sha256=u.expected_sha256 AND e.object_version_id=u.object_version_id AND e.server_received_at<=m.evidence_cutoff_at
   AND (s.evidence_id IS NULL OR (e.id,e.object_version_id,e.sha256,e.server_received_at)=(s.evidence_id,s.object_version_id,s.sha256,s.evidence_received_at)) AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=NEW.tenant_id AND x.evidence_id=e.id)) THEN RAISE EXCEPTION 'FINAL_CHECK_INPUT_UNAVAILABLE'; END IF;
  IF NEW.stage='detection' AND NEW.input_hash IS DISTINCT FROM s.frozen_input_hash THEN RAISE EXCEPTION 'FINAL_CHECK_INPUT_MISMATCH'; END IF;
  IF NEW.stage='reconciliation' AND NOT EXISTS(SELECT 1 FROM app.shadow_final_check_source_attempt d WHERE (d.tenant_id,d.job_id,d.manifest_id,d.source_id,d.execution_id,d.stage,d.outcome,d.result_hash)=(NEW.tenant_id,NEW.job_id,NEW.manifest_id,NEW.source_id,NEW.execution_id,'detection','succeeded',NEW.input_hash) AND d.result_signal_ids=NEW.result_signal_ids) THEN RAISE EXCEPTION 'FINAL_CHECK_DETECTION_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(NEW.result_signal_ids) sid WHERE NOT EXISTS(SELECT 1 FROM app.shadow_signal_evidence se WHERE (se.tenant_id,se.job_id,se.signal_id,se.evidence_id,se.object_version_id,se.sha256,se.source_received_at)=(NEW.tenant_id,NEW.job_id,sid,NEW.evidence_id,NEW.object_version_id,NEW.sha256,NEW.source_received_at))) THEN RAISE EXCEPTION 'FINAL_CHECK_SIGNAL_BINDING_INVALID'; END IF;
 END IF;
 NEW.created_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER final_check_attempt_insert BEFORE INSERT ON app.shadow_final_check_source_attempt FOR EACH ROW EXECUTE FUNCTION app.guard_final_check_attempt();
CREATE FUNCTION app.guard_final_check_result() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE c app.shadow_signal_classification; prior app.shadow_final_check_reveal_proof;
BEGIN
 PERFORM app.final_check_require_worker(NEW.tenant_id,NEW.job_id);
 SELECT * INTO prior FROM app.shadow_final_check_reveal_proof WHERE tenant_id=NEW.tenant_id AND id=NEW.id;
 IF FOUND THEN IF ROW(prior.job_id,prior.run_id,prior.signal_id,prior.classification_id,prior.projection_version,prior.result_descriptor) IS DISTINCT FROM ROW(NEW.job_id,NEW.run_id,NEW.signal_id,NEW.classification_id,NEW.projection_version,NEW.result_descriptor) THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; RETURN NULL; END IF;
 IF NEW.signal_id IS NULL THEN
  IF NEW.result_descriptor<>'{"version":"final-check-result.v1","outcome":"zero_result"}'::jsonb THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 ELSE
  SELECT * INTO c FROM app.shadow_signal_classification WHERE (tenant_id,job_id,run_id,signal_id,id)=(NEW.tenant_id,NEW.job_id,NEW.run_id,NEW.signal_id,NEW.classification_id);
  IF NOT FOUND OR NEW.result_descriptor<>jsonb_build_object('version','final-check-result.v1','signalId',c.signal_id,'classificationId',c.id,'outcome',c.outcome) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 END IF;
 NEW.result_hash:=app.final_lock_hash(NEW.result_descriptor);RETURN NEW;
END $$;
CREATE TRIGGER final_check_result_insert BEFORE INSERT ON app.shadow_final_check_reveal_proof FOR EACH ROW EXECUTE FUNCTION app.guard_final_check_result();
CREATE FUNCTION app.guard_final_check_binding() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE m app.final_check_manifest; prior app.shadow_final_check_run_binding;
BEGIN
 PERFORM app.final_check_require_worker(NEW.tenant_id,NEW.job_id);
 SELECT * INTO prior FROM app.shadow_final_check_run_binding WHERE (tenant_id,job_id,run_id)=(NEW.tenant_id,NEW.job_id,NEW.run_id);
 IF FOUND THEN IF ROW(prior.manifest_id,prior.lock_id,prior.evidence_cutoff_at,prior.execution_id,prior.detector_version,prior.reconciliation_version) IS DISTINCT FROM ROW(NEW.manifest_id,NEW.lock_id,NEW.evidence_cutoff_at,NEW.execution_id,NEW.detector_version,NEW.reconciliation_version) THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; RETURN NULL; END IF;
 SELECT * INTO m FROM app.final_check_manifest WHERE (tenant_id,job_id,id,lock_id,evidence_cutoff_at)=(NEW.tenant_id,NEW.job_id,NEW.manifest_id,NEW.lock_id,NEW.evidence_cutoff_at);
 IF NOT FOUND OR (NEW.detector_version,NEW.reconciliation_version) IS DISTINCT FROM (m.detector_version,m.reconciliation_version) THEN RAISE EXCEPTION 'FINAL_CHECK_LOCK_BINDING_INVALID' USING ERRCODE='23503'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.shadow_reconciliation_run WHERE (tenant_id,job_id,id,evidence_cutoff_at,status,policy_version)=(NEW.tenant_id,NEW.job_id,NEW.run_id,NEW.evidence_cutoff_at,'completed',NEW.reconciliation_version)) THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 SELECT app.final_lock_hash(coalesce(jsonb_agg(jsonb_build_object('signalId',signal_id,'resultHash',result_hash) ORDER BY signal_id NULLS FIRST),'[]')) INTO NEW.result_manifest_hash FROM app.shadow_final_check_reveal_proof WHERE (tenant_id,job_id,run_id)=(NEW.tenant_id,NEW.job_id,NEW.run_id);
 RETURN NEW;
END $$;
CREATE TRIGGER final_check_binding_insert BEFORE INSERT ON app.shadow_final_check_run_binding FOR EACH ROW EXECUTE FUNCTION app.guard_final_check_binding();
-- This predicate is private. It never takes caller-supplied completeness flags.
CREATE FUNCTION app.verify_final_check_run(p_tenant uuid,p_job uuid,p_run uuid,p_lock uuid,p_cutoff timestamptz) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE b app.shadow_final_check_run_binding;m app.final_check_manifest;s app.final_check_manifest_source;d app.shadow_final_check_source_attempt;r app.shadow_final_check_source_attempt;inventory jsonb;result_digest text;
BEGIN
 SELECT * INTO b FROM app.shadow_final_check_run_binding WHERE (tenant_id,job_id,run_id,lock_id,evidence_cutoff_at)=(p_tenant,p_job,p_run,p_lock,p_cutoff);
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 SELECT * INTO m FROM app.final_check_manifest WHERE (tenant_id,job_id,id,lock_id,evidence_cutoff_at)=(p_tenant,p_job,b.manifest_id,p_lock,p_cutoff);
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.shadow_reconciliation_run WHERE (tenant_id,job_id,id,evidence_cutoff_at,status,policy_version)=(p_tenant,p_job,p_run,p_cutoff,'completed',b.reconciliation_version)) THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'inputHash',frozen_input_hash) ORDER BY id),'[]') INTO inventory FROM app.final_check_manifest_source WHERE (tenant_id,job_id,manifest_id)=(p_tenant,p_job,m.id);
 IF m.inventory_hash<>app.final_lock_hash(inventory) OR m.source_count<>jsonb_array_length(inventory)
 OR m.source_count<>(SELECT count(*) FROM app.evidence_upload WHERE tenant_id=p_tenant AND job_id=p_job AND server_received_at<=p_cutoff)
 OR EXISTS(SELECT 1 FROM app.evidence_upload u WHERE u.tenant_id=p_tenant AND u.job_id=p_job AND u.server_received_at<=p_cutoff AND NOT EXISTS(SELECT 1 FROM app.final_check_manifest_source ms WHERE (ms.tenant_id,ms.job_id,ms.manifest_id,ms.upload_id,ms.source_received_at)=(p_tenant,p_job,m.id,u.id,u.server_received_at)))
 -- A supplied original-object receipt cannot introduce an unprocessed pre-cutoff source outside the frozen inventory.
 OR EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=p_tenant AND e.job_id=p_job AND e.kind='original' AND e.server_received_at<=p_cutoff AND NOT EXISTS(SELECT 1 FROM app.final_check_manifest_source ms WHERE (ms.tenant_id,ms.job_id,ms.manifest_id,ms.upload_id)=(p_tenant,p_job,m.id,e.upload_id))) THEN RAISE EXCEPTION 'FINAL_CHECK_INVENTORY_INCOMPLETE'; END IF;
 FOR s IN SELECT * FROM app.final_check_manifest_source WHERE (tenant_id,job_id,manifest_id)=(p_tenant,p_job,m.id) LOOP
  IF NOT EXISTS(SELECT 1 FROM app.evidence_upload u WHERE (u.tenant_id,u.job_id,u.id,u.server_received_at)=(p_tenant,p_job,s.upload_id,s.source_received_at)
   AND s.frozen_input_hash=app.final_lock_hash(jsonb_build_object('upload',u.id,'receivedAt',to_char(u.server_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'expectedHash',u.expected_sha256,'contentType',u.expected_content_type))) THEN RAISE EXCEPTION 'FINAL_CHECK_INPUT_MISMATCH'; END IF;
  SELECT * INTO d FROM app.shadow_final_check_source_attempt WHERE (tenant_id,job_id,manifest_id,source_id,execution_id,stage)=(p_tenant,p_job,m.id,s.id,b.execution_id,'detection') ORDER BY created_at DESC,id DESC LIMIT 1;
  SELECT * INTO r FROM app.shadow_final_check_source_attempt WHERE (tenant_id,job_id,manifest_id,source_id,execution_id,stage)=(p_tenant,p_job,m.id,s.id,b.execution_id,'reconciliation') ORDER BY created_at DESC,id DESC LIMIT 1;
  IF d.outcome IS DISTINCT FROM 'succeeded' OR r.outcome IS DISTINCT FROM 'succeeded' OR d.input_hash IS DISTINCT FROM s.frozen_input_hash OR d.version IS DISTINCT FROM b.detector_version OR r.version IS DISTINCT FROM b.reconciliation_version OR r.input_hash IS DISTINCT FROM d.result_hash OR r.result_signal_ids IS DISTINCT FROM d.result_signal_ids OR ROW(r.evidence_id,r.object_version_id,r.sha256,r.source_received_at) IS DISTINCT FROM ROW(d.evidence_id,d.object_version_id,d.sha256,d.source_received_at) THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.evidence_upload u JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.upload_id)=(u.tenant_id,u.job_id,u.id) WHERE (u.tenant_id,u.job_id,u.id,u.state)=(p_tenant,p_job,s.upload_id,'verified') AND e.kind='original' AND (e.id,e.object_version_id,e.sha256,e.server_received_at)=(d.evidence_id,d.object_version_id,d.sha256,d.source_received_at) AND e.sha256=u.expected_sha256 AND e.object_version_id=u.object_version_id AND e.server_received_at<=p_cutoff AND (s.evidence_id IS NULL OR (e.id,e.object_version_id,e.sha256,e.server_received_at)=(s.evidence_id,s.object_version_id,s.sha256,s.evidence_received_at)) AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation x WHERE x.tenant_id=p_tenant AND x.evidence_id=e.id)) THEN RAISE EXCEPTION 'FINAL_CHECK_INPUT_UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(d.result_signal_ids) sid WHERE NOT EXISTS(SELECT 1 FROM app.shadow_signal_classification c JOIN app.shadow_final_check_reveal_proof p ON(p.tenant_id,p.job_id,p.run_id,p.signal_id,p.classification_id)=(c.tenant_id,c.job_id,c.run_id,c.signal_id,c.id) WHERE (c.tenant_id,c.job_id,c.run_id,c.signal_id)=(p_tenant,p_job,p_run,sid))) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 END LOOP;
 -- All held, pre-cutoff evidence-linked signals need classification, independently of detector output lists.
 IF EXISTS(SELECT 1 FROM app.shadow_commercial_signal sig WHERE sig.tenant_id=p_tenant AND sig.job_id=p_job AND (sig.created_at<=p_cutoff OR EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE (e.tenant_id,e.job_id,e.signal_id)=(p_tenant,p_job,sig.id) AND e.source_received_at<=p_cutoff)) AND NOT EXISTS(SELECT 1 FROM app.shadow_signal_classification c JOIN app.shadow_final_check_reveal_proof p ON(p.tenant_id,p.job_id,p.run_id,p.signal_id,p.classification_id)=(c.tenant_id,c.job_id,c.run_id,c.signal_id,c.id) WHERE (c.tenant_id,c.job_id,c.run_id,c.signal_id)=(p_tenant,p_job,p_run,sig.id))) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.shadow_final_check_reveal_proof WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run)) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM app.shadow_final_check_reveal_proof WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run) AND signal_id IS NULL) AND EXISTS(SELECT 1 FROM app.shadow_signal_classification WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run)) THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 SELECT app.final_lock_hash(coalesce(jsonb_agg(jsonb_build_object('signalId',signal_id,'resultHash',result_hash) ORDER BY signal_id NULLS FIRST),'[]')) INTO result_digest FROM app.shadow_final_check_reveal_proof WHERE (tenant_id,job_id,run_id)=(p_tenant,p_job,p_run);
 IF result_digest<>b.result_manifest_hash THEN RAISE EXCEPTION 'FINAL_CHECK_RESULT_UNAVAILABLE'; END IF;
 RETURN result_digest;
END $$;
CREATE FUNCTION app.publish_final_check_certificate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE result_digest text;b app.shadow_final_check_run_binding;prior app.final_account_lock_check;seq bigint;prev text;ts timestamptz;payload jsonb;ph text;eh text;event_id uuid:=gen_random_uuid();
BEGIN
 -- Verify actual role/context, then qualified FK identity before job-specific completeness.
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT pg_has_role(session_user,'jobguard_shadow','USAGE') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NEW.lock_id IS NULL AND NEW.evidence_cutoff_at IS NULL THEN SELECT id,locked_at INTO NEW.lock_id,NEW.evidence_cutoff_at FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE (tenant_id,job_id,id,locked_at)=(NEW.tenant_id,NEW.job_id,NEW.lock_id,NEW.evidence_cutoff_at)) THEN RAISE EXCEPTION 'FINAL_CHECK_LOCK_BINDING_INVALID' USING ERRCODE='23503'; END IF;
 PERFORM app.final_check_require_worker(NEW.tenant_id,NEW.job_id);
 SELECT * INTO prior FROM app.final_account_lock_check WHERE tenant_id=NEW.tenant_id AND id=NEW.id;
 IF FOUND THEN
  IF ROW(prior.job_id,prior.lock_id,prior.evidence_cutoff_at,prior.run_id,prior.status) IS DISTINCT FROM ROW(NEW.job_id,NEW.lock_id,NEW.evidence_cutoff_at,NEW.run_id,NEW.status) THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN NULL;
 END IF;
 IF NEW.status<>'completed' THEN RETURN NEW; END IF;
 IF NEW.run_id IS NULL THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 result_digest:=app.verify_final_check_run(NEW.tenant_id,NEW.job_id,NEW.run_id,NEW.lock_id,NEW.evidence_cutoff_at);
 SELECT * INTO b FROM app.shadow_final_check_run_binding WHERE (tenant_id,job_id,run_id)=(NEW.tenant_id,NEW.job_id,NEW.run_id);
 INSERT INTO app.shadow_final_check_completion(tenant_id,job_id,check_id,run_id,manifest_id,lock_id,evidence_cutoff_at,result_hash) VALUES(NEW.tenant_id,NEW.job_id,NEW.id,NEW.run_id,b.manifest_id,NEW.lock_id,NEW.evidence_cutoff_at,result_digest);
 -- All business locks are already held before allocating this append-only audit head.
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();seq:=seq+1;ts:=date_trunc('milliseconds',clock_timestamp());
 -- Public completion is generic; the verified result digest remains in the private certificate.
 payload:=jsonb_build_object('references',jsonb_build_object('checkId',NEW.id,'runId',NEW.run_id,'lockId',NEW.lock_id));ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',NEW.tenant_id::text,seq::text,'system:final_check','final_check.completed','job',NEW.job_id::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash) VALUES(event_id,NEW.tenant_id,seq,'audit.v1','system:final_check','final_check.completed','job',NEW.job_id::text,ts,payload,ph,prev,eh);
 PERFORM app.advance_audit_head(seq,eh);RETURN NEW;
END $$;
-- This trigger sorts before the preserved INVOKER timestamp/role/advisory guard.
CREATE TRIGGER a_final_check_completion BEFORE INSERT ON app.final_account_lock_check FOR EACH ROW EXECUTE FUNCTION app.publish_final_check_certificate();
CREATE FUNCTION app.require_authoritative_final_check(p_tenant uuid,p_job uuid) RETURNS TABLE(complete boolean,check_id uuid,run_id uuid,lock_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE l app.final_account_lock;c app.final_account_lock_check;cert app.shadow_final_check_completion;proof_failure text;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 SELECT lc.* INTO c FROM app.final_account_lock_check lc WHERE (lc.tenant_id,lc.job_id,lc.lock_id,lc.evidence_cutoff_at)=(p_tenant,p_job,l.id,l.locked_at) ORDER BY lc.created_at DESC,lc.id DESC LIMIT 1;
 IF c.status='failed' THEN RAISE EXCEPTION 'FINAL_CHECK_FAILED'; END IF;
 IF c.status IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 SELECT sc.* INTO cert FROM app.shadow_final_check_completion sc WHERE (sc.tenant_id,sc.job_id,sc.check_id,sc.run_id,sc.lock_id,sc.evidence_cutoff_at)=(p_tenant,p_job,c.id,c.run_id,l.id,l.locked_at);
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 BEGIN
  IF cert.result_hash IS DISTINCT FROM app.verify_final_check_run(p_tenant,p_job,c.run_id,l.id,l.locked_at) THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
 EXCEPTION WHEN raise_exception THEN
  GET STACKED DIAGNOSTICS proof_failure=MESSAGE_TEXT;
  IF proof_failure IN ('FINAL_CHECK_NOT_COMPLETE','FINAL_CHECK_INVENTORY_INCOMPLETE','FINAL_CHECK_INPUT_UNAVAILABLE','FINAL_CHECK_INPUT_MISMATCH','FINAL_CHECK_DETECTION_REQUIRED','FINAL_CHECK_SIGNAL_BINDING_INVALID','FINAL_CHECK_RESULT_UNAVAILABLE') THEN RAISE EXCEPTION 'FINAL_CHECK_NOT_COMPLETE'; END IF;
  RAISE;
 END;
 RETURN QUERY SELECT true,c.id,c.run_id,l.id;
END $$;
DO $$ DECLARE sig text; BEGIN
 FOREACH sig IN ARRAY ARRAY['guard_final_check_generated_fact()','final_check_require_worker(uuid,uuid)','serialize_final_check_evidence()','serialize_final_check_invalidation()','guard_final_check_manifest()','guard_final_check_attempt()','guard_final_check_result()','guard_final_check_binding()','verify_final_check_run(uuid,uuid,uuid,uuid,timestamptz)','publish_final_check_certificate()','require_authoritative_final_check(uuid,uuid)'] LOOP
  EXECUTE 'ALTER FUNCTION app.'||sig||' OWNER TO jobguard_migration';
  EXECUTE 'REVOKE ALL ON FUNCTION app.'||sig||' FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure';
 END LOOP;
END $$;

CREATE FUNCTION app.final_check_require_invoice_actor(p_tenant uuid,p_job uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE scoped_digest text; supplied_digest text:=nullif(current_setting('app.practice_material_digest',true),''); session_actor uuid;
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF supplied_digest IS NOT NULL THEN
  SELECT membership_id INTO session_actor FROM app.authenticate_practice_session(supplied_digest,p_tenant);
  IF session_actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT practice_session_digest INTO scoped_digest FROM app.job WHERE tenant_id=p_tenant AND id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF scoped_digest IS NOT NULL AND scoped_digest IS DISTINCT FROM supplied_digest THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.final_check_require_invoice_actor(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_require_invoice_actor(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure;

-- Renumbered from 0147 (SV-5 repair, ruling C126). The two invoice routines below are 0187's bodies with only the final-check guards
-- of the original 0147 added (three-way merge of 0095/0132 base, 0147 guard edit and 0187), so 0187 cannot overwrite the guard.
CREATE OR REPLACE FUNCTION app.issue_practice_customer_invoice(
 p_tenant uuid,p_job uuid,p_final_revision uuid,p_actor uuid,p_command uuid,p_recipient text,p_issued_on date
) RETURNS TABLE(invoice_id uuid,invoice_number text,pdf_sha256 text,total_pence bigint,source_hash text,outbox_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE existing app.customer_invoice%ROWTYPE; final_row app.final_account_revision%ROWTYPE;
 n bigint; number text; artifact text; digest text; decision_id uuid:=gen_random_uuid();
 resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); new_invoice uuid:=gen_random_uuid();
 request_digest text:=encode(public.digest(convert_to(p_job::text||p_final_revision::text||p_recipient||p_issued_on::text,'UTF8'),'sha256'),'hex');
 prior jsonb; party_snapshot jsonb; check_row record; lock_row app.final_account_lock; item jsonb;

 -- ASCII PDF 1.4 objects: offsets and lengths below are byte counts of the stored artifact.
 pdf_rows text[]:=ARRAY[]::text[]; pdf_objects text[]; pdf_offsets bigint[]:=ARRAY[0::bigint];
 pdf_raw text; pdf_line text; pdf_stream text; pdf_kids text:=''; pdf_xref bigint;
 pdf_page integer; pdf_pages integer; pdf_i integer; pdf_j integer; pdf_content integer; pdf_font integer;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501'; END IF;
 PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor);
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_job::text,130));
 IF EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command AND (command_type<>'customer_invoice.issue' OR actor_membership_id<>p_actor)) THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT result INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
   IF (SELECT request_hash FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command)<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
   RETURN QUERY SELECT (prior->>'invoiceId')::uuid,prior->>'invoiceNumber',prior->>'pdfSha256',(prior->>'totalPence')::bigint,prior->>'sourceHash',prior->>'outboxStatus'; RETURN;
 END IF;
 IF p_recipient !~ '^[^@ ]+@example\.invalid$' THEN RAISE EXCEPTION 'SYNTHETIC_RECIPIENT_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=p_tenant AND id=p_actor AND role='owner' AND revoked_at IS NULL) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT r.* INTO final_row FROM app.final_account_revision r JOIN app.final_account_draft d ON(d.tenant_id,d.id)=(r.tenant_id,r.final_account_draft_id)
 WHERE r.tenant_id=p_tenant AND r.job_id=p_job AND r.id=p_final_revision AND d.current_revision_id=r.id AND NOT r.issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT'; END IF;
 SELECT * INTO existing FROM app.customer_invoice WHERE tenant_id=p_tenant AND final_account_revision_id=p_final_revision;
 IF FOUND THEN
  IF EXISTS(SELECT 1 FROM app.final_account_invoice_binding binding WHERE binding.tenant_id=p_tenant AND binding.job_id=p_job AND binding.invoice_id=existing.id AND binding.invoice_kind IN ('final','supplementary')) THEN RAISE EXCEPTION 'FINAL_INVOICE_ALREADY_ISSUED'; END IF;
  RETURN QUERY SELECT existing.id,existing.invoice_number::text,existing.pdf_sha256::text,existing.total_pence,existing.source_hash::text,'succeeded'::text; RETURN; END IF;
 SELECT * INTO check_row FROM app.require_authoritative_final_check(p_tenant,p_job);
 IF (SELECT count(*) FROM app.final_account_line WHERE tenant_id=p_tenant AND job_id=p_job AND final_account_revision_id=p_final_revision)=0 THEN RAISE EXCEPTION 'INVOICE_AMOUNT_INVALID'; END IF;
 IF final_row.net_pence IS DISTINCT FROM (SELECT sum(net_pence) FROM app.final_account_line WHERE tenant_id=p_tenant AND job_id=p_job AND final_account_revision_id=p_final_revision) OR final_row.tax_pence<>(final_row.net_pence+2)/5 OR final_row.total_pence<>final_row.net_pence+final_row.tax_pence THEN RAISE EXCEPTION 'FINAL_ACCOUNT_TOTAL_MISMATCH'; END IF;
 SELECT * INTO lock_row FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF p_final_revision<>lock_row.final_account_revision_id OR final_row.baseline_quote_version_id<>lock_row.baseline_quote_version_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final') THEN RAISE EXCEPTION 'FINAL_INVOICE_ALREADY_ISSUED'; END IF;
 party_snapshot:=app.require_current_job_parties(p_tenant,p_job);
 INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number)VALUES(gen_random_uuid(),p_tenant,2)
 ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_invoice_sequence.next_number+1 RETURNING next_number-1 INTO n;
 number:='DEMO-CUST-'||lpad(n::text,6,'0');
 artifact:='Number: '||number||chr(10)||'Issue date: '||p_issued_on::text||chr(10)||
  'Issuer: Fictional Builder Ltd ['||p_tenant::text||']'||chr(10)||'Recipient: '||p_recipient||chr(10)||
  'Reference tax version: '||final_row.tax_policy_version||chr(10)||'Frozen final account: '||final_row.id::text||chr(10)||
  'Source hash: '||final_row.source_hash||chr(10)||
  'Net GBP: '||to_char(final_row.net_pence::numeric/100,'FM999999999990.00')||chr(10)||
  'VAT GBP: '||to_char(final_row.tax_pence::numeric/100,'FM999999999990.00')||chr(10)||
  'Total GBP: '||to_char(final_row.total_pence::numeric/100,'FM999999999990.00')||chr(10)||
  coalesce((SELECT string_agg(l.description||' | Net GBP: '||to_char(l.net_pence::numeric/100,'FM999999999990.00'),chr(10) ORDER BY l.ordinal,l.id)
   FROM app.final_account_line l WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_final_revision),'')||chr(10)||
  party_snapshot::text;

 -- Convert the exact approved snapshot to printable, wrapped rows (same ASCII fallback as quote PDFs).
 FOREACH pdf_raw IN ARRAY string_to_array(artifact,chr(10)) LOOP
  pdf_raw:=regexp_replace(pdf_raw,'[^ -~]','?','g');
  IF length(pdf_raw)=0 THEN pdf_rows:=array_append(pdf_rows,''); END IF;
  pdf_i:=1;
  WHILE pdf_i<=length(pdf_raw) LOOP
   pdf_rows:=array_append(pdf_rows,substr(pdf_raw,pdf_i,90)); pdf_i:=pdf_i+90;
  END LOOP;
 END LOOP;
 pdf_pages:=greatest(1,(cardinality(pdf_rows)+53)/54); pdf_font:=3+pdf_pages*2;
 pdf_objects:=ARRAY['<< /Type /Catalog /Pages 2 0 R >>',''];
 FOR pdf_page IN 1..pdf_pages LOOP
  pdf_i:=3+(pdf_page-1)*2; pdf_content:=pdf_i+1;
  pdf_kids:=pdf_kids||pdf_i::text||' 0 R ';
  pdf_stream:='BT /F1 8 Tf 40 790 Td 12 TL'||chr(10)||
   '(SYNTHETIC - NOT A REAL INVOICE) Tj'||chr(10)||
   'T* (Practice sandbox - synthetic data; nothing is sent or charged) Tj'||chr(10)||
   'T* (Not a real tax invoice) Tj';
  FOR pdf_j IN ((pdf_page-1)*54+1)..least(pdf_page*54,cardinality(pdf_rows)) LOOP
   pdf_line:=replace(replace(replace(pdf_rows[pdf_j],chr(92),chr(92)||chr(92)),'(',chr(92)||'('),')',chr(92)||')');
   pdf_stream:=pdf_stream||chr(10)||'T* ('||pdf_line||') Tj';
  END LOOP;
  pdf_stream:=pdf_stream||chr(10)||'ET';
  pdf_objects:=array_append(pdf_objects,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '||pdf_font||' 0 R >> >> /Contents '||pdf_content||' 0 R >>');
  pdf_objects:=array_append(pdf_objects,'<< /Length '||octet_length(pdf_stream)||' >>'||chr(10)||'stream'||chr(10)||pdf_stream||chr(10)||'endstream');
 END LOOP;
 pdf_objects[2]:='<< /Type /Pages /Kids ['||pdf_kids||'] /Count '||pdf_pages||' >>';
 pdf_objects:=array_append(pdf_objects,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
 artifact:='%PDF-1.4'||chr(10);
 FOR pdf_i IN 1..cardinality(pdf_objects) LOOP
  pdf_offsets:=array_append(pdf_offsets,octet_length(artifact)::bigint);
  artifact:=artifact||pdf_i||' 0 obj'||chr(10)||pdf_objects[pdf_i]||chr(10)||'endobj'||chr(10);
 END LOOP;
 pdf_xref:=octet_length(artifact);
 artifact:=artifact||'xref'||chr(10)||'0 '||(cardinality(pdf_objects)+1)||chr(10)||'0000000000 65535 f '||chr(10);
 FOR pdf_i IN 2..cardinality(pdf_offsets) LOOP
  artifact:=artifact||lpad(pdf_offsets[pdf_i]::text,10,'0')||' 00000 n '||chr(10);
 END LOOP;
 artifact:=artifact||'trailer << /Size '||(cardinality(pdf_objects)+1)||' /Root 1 0 R >>'||chr(10)||'startxref'||chr(10)||pdf_xref||chr(10)||'%%EOF';
 digest:=encode(public.digest(convert_to(artifact,'UTF8'),'sha256'),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)VALUES(decision_id,p_tenant,'job',p_job::text,'final_account.issue');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id)VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'final_account.issue',p_recipient,digest,final_row.revision,final_row.total_pence,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
 VALUES(new_invoice,p_tenant,p_job,p_final_revision,authorization_id,number,p_issued_on,jsonb_build_object('legalName','Fictional Builder Ltd','runIdentity',p_tenant),final_row.tax_policy_version,'GBP',final_row.net_pence,final_row.tax_pence,final_row.total_pence,final_row.source_hash,digest,convert_to(artifact,'UTF8'),true,'SYNTHETIC - NOT A REAL INVOICE');
 INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,lock_id,revision_id,check_id) VALUES(p_tenant,p_job,new_invoice,'final',lock_row.id,p_final_revision,check_row.check_id);
 FOR item IN WITH weights AS(SELECT to_jsonb(l) value,abs(l.net_pence::numeric) weight FROM app.final_account_line l WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_final_revision),
 parts AS(SELECT value,CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE floor(final_row.tax_pence::numeric*weight/sum(weight) OVER()) END base,
 CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE mod(final_row.tax_pence::numeric*weight,sum(weight) OVER()) END remainder FROM weights),
 ranked AS(SELECT *,row_number() OVER(ORDER BY remainder DESC,value->>'id') rank,final_row.tax_pence-sum(base) OVER() left_over FROM parts)
 SELECT value||jsonb_build_object('allocated_tax',base+CASE WHEN rank<=left_over THEN 1 ELSE 0 END) FROM ranked LOOP
  INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
  VALUES(p_tenant,p_job,new_invoice,(item->>'id')::uuid,p_final_revision,(item->>'scope_item_id')::uuid,(item->>'commercial_revision_id')::uuid,item->>'line_kind',(item->>'source_id')::uuid,(item->>'net_pence')::bigint,(item->>'allocated_tax')::bigint,(item->>'net_pence')::bigint+(item->>'allocated_tax')::bigint);
 END LOOP;
 INSERT INTO app.customer_invoice_evidence(id,tenant_id,job_id,invoice_id,evidence_id,object_version_id,sha256,scope_item_id)
 SELECT gen_random_uuid(),p_tenant,p_job,new_invoice,evidence_id,object_version_id,sha256,scope_item_id FROM app.final_account_proof WHERE tenant_id=p_tenant AND final_account_revision_id=p_final_revision;
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at,status,completed_at)
 VALUES(gen_random_uuid(),p_tenant,authorization_id,'fake_invoice_delivery','practice-invoice:'||new_invoice,'final_account.issue',p_recipient,digest,artifact,final_row.revision,final_row.total_pence,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes','succeeded',transaction_timestamp());
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_command,p_tenant,'customer_invoice.issue','invoice:'||p_final_revision,request_digest,'succeeded',jsonb_build_object('invoiceId',new_invoice,'invoiceNumber',number,'pdfSha256',digest,'totalPence',final_row.total_pence,'sourceHash',final_row.source_hash,'outboxStatus','succeeded'),p_actor,transaction_timestamp());
 PERFORM app.append_final_lock_audit(gen_random_uuid(),p_actor,p_job,'customer_invoice.lock_bound_issued',jsonb_build_object('invoiceId',new_invoice,'lockId',lock_row.id,'checkId',check_row.check_id,'commandId',p_command),jsonb_build_object('pdf',digest));
 RETURN QUERY SELECT new_invoice,number,digest,final_row.total_pence,final_row.source_hash::text,'succeeded'::text;
END $$;

CREATE OR REPLACE FUNCTION app.issue_lock_bound_customer_invoice(p_tenant uuid,p_job uuid,p_revision uuid,p_actor uuid,p_command uuid,p_kind text,p_recipient text,p_issued_on date,p_source_hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE lock_row app.final_account_lock; check_row record; final_row app.final_account_revision; prior app.command_receipt;
 request_digest text; party_snapshot jsonb; n bigint; number text; artifact text; digest text; invoice_id uuid:=gen_random_uuid();
 decision_id uuid:=gen_random_uuid(); resolution_id uuid:=gen_random_uuid(); authorization_id uuid:=gen_random_uuid(); audit_id uuid:=gen_random_uuid();
 net bigint; tax bigint; gross bigint; selected_lines jsonb; result jsonb; item jsonb;

 -- ASCII PDF 1.4 objects: offsets and lengths below are byte counts of the stored artifact.
 pdf_rows text[]:=ARRAY[]::text[]; pdf_objects text[]; pdf_offsets bigint[]:=ARRAY[0::bigint];
 pdf_raw text; pdf_line text; pdf_stream text; pdf_kids text:=''; pdf_xref bigint;
 pdf_page integer; pdf_pages integer; pdf_i integer; pdf_j integer; pdf_content integer; pdf_font integer;
BEGIN
 PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor);
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_check_require_invoice_actor(p_tenant,p_job,p_actor);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_job::text,130));
 IF p_kind IS NULL OR p_kind NOT IN ('final','supplementary') OR p_command IS NULL OR p_issued_on IS NULL OR p_issued_on NOT BETWEEN '0001-01-01'::date AND '9999-12-31'::date OR p_recipient IS NULL OR p_recipient !~ '^[^@ ]+@example\.invalid$' OR p_source_hash IS NULL OR p_source_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('command','IssueLockBoundInvoice','job',p_job,'revision',p_revision,'actor',p_actor,'kind',p_kind,'recipient',p_recipient,'issuedOn',p_issued_on,'sourceHash',p_source_hash));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN IF prior.command_type<>'IssueLockBoundInvoice' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; RETURN prior.result; END IF;
 SELECT * INTO lock_row FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 SELECT * INTO check_row FROM app.require_authoritative_final_check(p_tenant,p_job);
 SELECT * INTO final_row FROM app.final_account_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_revision AND source_hash=p_source_hash AND NOT issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT' USING ERRCODE='40001'; END IF;
 IF final_row.baseline_quote_version_id<>lock_row.baseline_quote_version_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF p_kind='final' AND p_revision<>lock_row.final_account_revision_id THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
 IF p_kind='final' AND EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final') THEN RAISE EXCEPTION 'FINAL_INVOICE_ALREADY_ISSUED'; END IF;
 IF p_kind='supplementary' THEN
  IF p_revision=lock_row.final_account_revision_id OR NOT EXISTS(SELECT 1 FROM app.customer_invoice i LEFT JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id) WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(b.invoice_kind,'final')='final') THEN RAISE EXCEPTION 'SUPPLEMENTARY_INVOICE_BASE_REQUIRED'; END IF;
  IF NOT EXISTS(WITH RECURSIVE ancestors AS (SELECT id,previous_revision_id FROM app.final_account_revision WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_revision
   UNION ALL SELECT r.id,r.previous_revision_id FROM app.final_account_revision r JOIN ancestors a ON r.id=a.previous_revision_id WHERE r.tenant_id=p_tenant AND r.job_id=p_job) SELECT 1 FROM ancestors WHERE id=lock_row.final_account_revision_id) THEN RAISE EXCEPTION 'FINAL_INVOICE_REVISION_MISMATCH'; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.final_account_draft WHERE tenant_id=p_tenant AND job_id=p_job AND current_revision_id=p_revision) THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT'; END IF;
  -- A replacement/removal is a correction, not a newly added catch line. Fail closed until explicitly corrected.
  IF EXISTS(SELECT 1 FROM app.customer_invoice i JOIN app.final_account_line old ON(old.tenant_id,old.job_id,old.final_account_revision_id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
   LEFT JOIN app.final_account_invoice_binding binding ON(binding.tenant_id,binding.job_id,binding.invoice_id)=(i.tenant_id,i.job_id,i.id)
   WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND coalesce(binding.invoice_kind,'final') IN ('final','supplementary')
   AND NOT EXISTS(SELECT 1 FROM app.final_account_line current_line WHERE current_line.tenant_id=p_tenant AND current_line.job_id=p_job AND current_line.final_account_revision_id=p_revision
    AND (current_line.line_kind,current_line.source_id,current_line.commercial_revision_id,current_line.scope_item_id,current_line.net_pence)=(old.line_kind,old.source_id,old.commercial_revision_id,old.scope_item_id,old.net_pence))) THEN RAISE EXCEPTION 'INVOICE_SOURCE_CORRECTION_REQUIRED'; END IF;
 END IF;
 -- Account lines retain immutable commercial source identity across account revisions.
 SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'),coalesce(sum(l.net_pence),0) INTO selected_lines,net FROM app.final_account_line l
 WHERE l.tenant_id=p_tenant AND l.job_id=p_job AND l.final_account_revision_id=p_revision AND (
 p_kind='final' OR (NOT EXISTS(SELECT 1 FROM app.final_account_invoiced_line b WHERE b.tenant_id=p_tenant AND b.job_id=p_job AND b.line_kind=l.line_kind AND b.source_id=l.source_id AND b.commercial_revision_id=l.commercial_revision_id)
 AND NOT EXISTS(SELECT 1 FROM app.customer_invoice i JOIN app.final_account_line old ON(old.tenant_id,old.job_id,old.final_account_revision_id)=(i.tenant_id,i.job_id,i.final_account_revision_id)
 WHERE i.tenant_id=p_tenant AND i.job_id=p_job AND NOT EXISTS(SELECT 1 FROM app.final_account_invoice_binding b WHERE(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id))
 AND old.line_kind=l.line_kind AND old.source_id=l.source_id AND old.commercial_revision_id=l.commercial_revision_id)));
 IF jsonb_array_length(selected_lines)=0 OR net<0 OR net>1000000000000 THEN RAISE EXCEPTION 'INVOICE_AMOUNT_INVALID'; END IF;
 -- Same exact positive standard-rate candidate expression as merged 0028; no float arithmetic.
 tax:=(net+2)/5; gross:=net+tax;
 IF gross>1000000000000 THEN RAISE EXCEPTION 'INVOICE_AMOUNT_INVALID'; END IF;
 IF p_kind='final' AND ROW(net,tax,gross) IS DISTINCT FROM ROW(final_row.net_pence,final_row.tax_pence,final_row.total_pence) THEN RAISE EXCEPTION 'FINAL_ACCOUNT_TOTAL_MISMATCH'; END IF;
 party_snapshot:=app.require_current_job_parties(p_tenant,p_job);
 INSERT INTO app.customer_invoice_sequence(id,tenant_id,next_number) VALUES(gen_random_uuid(),p_tenant,2) ON CONFLICT(tenant_id) DO UPDATE SET next_number=app.customer_invoice_sequence.next_number+1 RETURNING next_number-1 INTO n;
 number:='DEMO-CUST-'||lpad(n::text,6,'0');
 artifact:='Number: '||number||chr(10)||'Issue date: '||p_issued_on::text||chr(10)||
  'Issuer: Fictional Builder Ltd ['||p_tenant::text||']'||chr(10)||'Recipient: '||p_recipient||chr(10)||
  'Reference tax version: '||final_row.tax_policy_version||chr(10)||'Frozen final account: '||final_row.id::text||chr(10)||
  'Source hash: '||final_row.source_hash||chr(10)||
  'Lock: '||lock_row.id::text||chr(10)||'Kind: '||p_kind||chr(10)||
  'Net GBP: '||to_char(net::numeric/100,'FM999999999990.00')||chr(10)||
  'VAT GBP: '||to_char(tax::numeric/100,'FM999999999990.00')||chr(10)||
  'Total GBP: '||to_char(gross::numeric/100,'FM999999999990.00')||chr(10)||
  coalesce((SELECT string_agg((l->>'description')||' | Net GBP: '||to_char((l->>'net_pence')::numeric/100,'FM999999999990.00'),chr(10) ORDER BY (l->>'ordinal')::integer,l->>'id')
   FROM jsonb_array_elements(selected_lines) l),'')||chr(10)||party_snapshot::text;

 -- Convert the exact approved snapshot to printable, wrapped rows (same ASCII fallback as quote PDFs).
 FOREACH pdf_raw IN ARRAY string_to_array(artifact,chr(10)) LOOP
  pdf_raw:=regexp_replace(pdf_raw,'[^ -~]','?','g');
  IF length(pdf_raw)=0 THEN pdf_rows:=array_append(pdf_rows,''); END IF;
  pdf_i:=1;
  WHILE pdf_i<=length(pdf_raw) LOOP
   pdf_rows:=array_append(pdf_rows,substr(pdf_raw,pdf_i,90)); pdf_i:=pdf_i+90;
  END LOOP;
 END LOOP;
 pdf_pages:=greatest(1,(cardinality(pdf_rows)+53)/54); pdf_font:=3+pdf_pages*2;
 pdf_objects:=ARRAY['<< /Type /Catalog /Pages 2 0 R >>',''];
 FOR pdf_page IN 1..pdf_pages LOOP
  pdf_i:=3+(pdf_page-1)*2; pdf_content:=pdf_i+1;
  pdf_kids:=pdf_kids||pdf_i::text||' 0 R ';
  pdf_stream:='BT /F1 8 Tf 40 790 Td 12 TL'||chr(10)||
   '(SYNTHETIC - NOT A REAL INVOICE) Tj'||chr(10)||
   'T* (Practice sandbox - synthetic data; nothing is sent or charged) Tj'||chr(10)||
   'T* (Not a real tax invoice) Tj';
  FOR pdf_j IN ((pdf_page-1)*54+1)..least(pdf_page*54,cardinality(pdf_rows)) LOOP
   pdf_line:=replace(replace(replace(pdf_rows[pdf_j],chr(92),chr(92)||chr(92)),'(',chr(92)||'('),')',chr(92)||')');
   pdf_stream:=pdf_stream||chr(10)||'T* ('||pdf_line||') Tj';
  END LOOP;
  pdf_stream:=pdf_stream||chr(10)||'ET';
  pdf_objects:=array_append(pdf_objects,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '||pdf_font||' 0 R >> >> /Contents '||pdf_content||' 0 R >>');
  pdf_objects:=array_append(pdf_objects,'<< /Length '||octet_length(pdf_stream)||' >>'||chr(10)||'stream'||chr(10)||pdf_stream||chr(10)||'endstream');
 END LOOP;
 pdf_objects[2]:='<< /Type /Pages /Kids ['||pdf_kids||'] /Count '||pdf_pages||' >>';
 pdf_objects:=array_append(pdf_objects,'<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>');
 artifact:='%PDF-1.4'||chr(10);
 FOR pdf_i IN 1..cardinality(pdf_objects) LOOP
  pdf_offsets:=array_append(pdf_offsets,octet_length(artifact)::bigint);
  artifact:=artifact||pdf_i||' 0 obj'||chr(10)||pdf_objects[pdf_i]||chr(10)||'endobj'||chr(10);
 END LOOP;
 pdf_xref:=octet_length(artifact);
 artifact:=artifact||'xref'||chr(10)||'0 '||(cardinality(pdf_objects)+1)||chr(10)||'0000000000 65535 f '||chr(10);
 FOR pdf_i IN 2..cardinality(pdf_offsets) LOOP
  artifact:=artifact||lpad(pdf_offsets[pdf_i]::text,10,'0')||' 00000 n '||chr(10);
 END LOOP;
 artifact:=artifact||'trailer << /Size '||(cardinality(pdf_objects)+1)||' /Root 1 0 R >>'||chr(10)||'startxref'||chr(10)||pdf_xref||chr(10)||'%%EOF';
 digest:=encode(sha256(convert_to(artifact,'UTF8')),'hex');
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision_id,p_tenant,'job',p_job::text,'final_account.issue');
 INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES(resolution_id,p_tenant,decision_id,'approved',p_actor);
 INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES(authorization_id,p_tenant,decision_id,resolution_id,p_actor,'final_account.issue',p_recipient,digest,final_row.revision,gross,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes');
 INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark)
 VALUES(invoice_id,p_tenant,p_job,p_revision,authorization_id,number,p_issued_on,jsonb_build_object('legalName','Fictional Builder Ltd','runIdentity',p_tenant),final_row.tax_policy_version,'GBP',net,tax,gross,final_row.source_hash,digest,convert_to(artifact,'UTF8'),true,'SYNTHETIC - NOT A REAL INVOICE');
 INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,lock_id,revision_id,check_id) VALUES(p_tenant,p_job,invoice_id,p_kind,lock_row.id,p_revision,check_row.check_id);
 -- Largest-remainder display allocation of the one group tax; tie-break by line ID, as core allocation.
 -- Display tax follows merged absolute-net weights; invoice totals use the one group calculation.
 FOR item IN WITH weights AS(SELECT value,abs((value->>'net_pence')::numeric) weight FROM jsonb_array_elements(selected_lines)),
 parts AS(SELECT value,CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE floor(tax::numeric*weight/sum(weight) OVER()) END base,
 CASE WHEN sum(weight) OVER()=0 THEN 0 ELSE mod(tax::numeric*weight,sum(weight) OVER()) END remainder FROM weights),
 ranked AS(SELECT *,row_number() OVER(ORDER BY remainder DESC,value->>'id') rank,tax-sum(base) OVER() left_over FROM parts)
 SELECT value||jsonb_build_object('allocated_tax',base+CASE WHEN rank<=left_over THEN 1 ELSE 0 END) FROM ranked LOOP
  INSERT INTO app.final_account_invoiced_line(tenant_id,job_id,invoice_id,final_account_line_id,revision_id,scope_item_id,commercial_revision_id,line_kind,source_id,net_pence,tax_pence,gross_pence)
  VALUES(p_tenant,p_job,invoice_id,(item->>'id')::uuid,p_revision,(item->>'scope_item_id')::uuid,(item->>'commercial_revision_id')::uuid,item->>'line_kind',(item->>'source_id')::uuid,(item->>'net_pence')::bigint,(item->>'allocated_tax')::bigint,(item->>'net_pence')::bigint+(item->>'allocated_tax')::bigint);
 END LOOP;
 INSERT INTO app.customer_invoice_evidence(id,tenant_id,job_id,invoice_id,evidence_id,object_version_id,sha256,scope_item_id)
 SELECT gen_random_uuid(),p_tenant,p_job,invoice_id,evidence_id,object_version_id,sha256,scope_item_id FROM app.final_account_proof WHERE tenant_id=p_tenant AND job_id=p_job AND final_account_revision_id=p_revision;
 INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at,status,completed_at)
 VALUES(gen_random_uuid(),p_tenant,authorization_id,'fake_invoice_delivery','lock-invoice:'||invoice_id,'final_account.issue',p_recipient,digest,artifact,final_row.revision,gross,'GBP','candidate_m1_standard_v1',transaction_timestamp()+interval '5 minutes','succeeded',transaction_timestamp());
 result:=jsonb_build_object('invoiceId',invoice_id,'invoiceNumber',number,'pdfSha256',digest,'netPence',net,'taxPence',tax,'totalPence',gross,'sourceHash',p_source_hash,'invoiceKind',p_kind,'lockId',lock_row.id);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'IssueLockBoundInvoice',p_revision::text,request_digest,'succeeded',result,p_actor,clock_timestamp());
 PERFORM app.append_final_lock_audit(audit_id,p_actor,p_job,'customer_invoice.lock_bound_issued',jsonb_build_object('invoiceId',invoice_id,'lockId',lock_row.id,'checkId',check_row.check_id,'commandId',p_command),jsonb_build_object('pdf',digest));
 RETURN result;
END $$;

COMMIT;
