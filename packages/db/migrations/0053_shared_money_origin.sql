BEGIN;
-- Expand-only foundation. Existing supported jobs are synthetic small-builder
-- fixtures; explicit pilot activations retain their already recorded mode.
CREATE TABLE app.job_commercial_track (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL,
 job_track varchar(16) NOT NULL CHECK(job_track IN ('small_builder','contractor')),
 environment varchar(24) NOT NULL CHECK(environment IN ('synthetic_demo','pilot_no_charge')),
 provenance varchar(40) NOT NULL CHECK(provenance IN ('backfilled_synthetic_fixture','quote_activation','adoption_import','legacy_synthetic_live_fixture','work_order_import')),
 source_id uuid, bound_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,job_id), UNIQUE(tenant_id,job_id,job_track),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
ALTER TABLE app.variation ADD COLUMN job_track varchar(16);
ALTER TABLE app.variation ADD COLUMN origin varchar(32);

CREATE TABLE app.extra_origin (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, variation_id uuid NOT NULL,
 job_track varchar(16) NOT NULL, kind varchar(32) NOT NULL,
 command_id uuid, raising_membership_id uuid, raising_role varchar(40) NOT NULL,
 server_recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 device_id varchar(200), device_captured_at timestamptz, evidence_hash char(64) CHECK(evidence_hash IS NULL OR evidence_hash ~ '^[0-9a-f]{64}$'),
 provenance varchar(40) NOT NULL CHECK(provenance IN ('command','backfilled_synthetic_fixture','legacy_synthetic_capture')),
 source_capture_kind varchar(32) NOT NULL, source_capture_hash char(64) NOT NULL CHECK(source_capture_hash ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(tenant_id,variation_id), UNIQUE(tenant_id,job_id,variation_id,job_track,kind),
 FOREIGN KEY(tenant_id,job_id,job_track) REFERENCES app.job_commercial_track(tenant_id,job_id,job_track),
 FOREIGN KEY(tenant_id,job_id,variation_id) REFERENCES app.variation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,raising_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK((job_track='small_builder' AND kind IN ('builder_logged','final_review','jobguard_catch')) OR
       (job_track='contractor' AND kind IN ('site_user','jobguard_surfaced_confirmed','office_entry','client_instruction'))),
 CHECK((provenance='command' AND command_id IS NOT NULL AND raising_membership_id IS NOT NULL) OR
       (provenance IN ('backfilled_synthetic_fixture','legacy_synthetic_capture') AND job_track='small_builder' AND kind='builder_logged' AND command_id IS NULL AND raising_role='legacy_unrecorded'))
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['job_commercial_track','extra_origin'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
  EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
 END LOOP;
END $$;
GRANT INSERT ON app.extra_origin TO jobguard_runtime;

-- SH-1 BACKFILL START: re-executable under the migration owner, per tenant.
DO $$ DECLARE t uuid; BEGIN
 FOR t IN SELECT id FROM control_plane.tenant LOOP
  PERFORM set_config('app.tenant_id',t::text,true);
  INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance,source_id,bound_at)
   SELECT j.tenant_id,j.id,'small_builder',coalesce(a.mode,'synthetic_demo'),'backfilled_synthetic_fixture',a.id,coalesce(a.recorded_at,j.created_at)
   FROM app.job j LEFT JOIN app.job_activation a ON (a.tenant_id,a.job_id)=(j.tenant_id,j.id)
   WHERE j.tenant_id=t ON CONFLICT(tenant_id,job_id) DO NOTHING;
  UPDATE app.variation SET job_track='small_builder',origin='builder_logged'
   WHERE tenant_id=t AND job_track IS NULL AND origin IS NULL;
  INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,raising_membership_id,raising_role,server_recorded_at,provenance,source_capture_kind,source_capture_hash)
   SELECT v.tenant_id,v.job_id,v.id,v.job_track,v.origin,
    NULL::uuid,
    'legacy_unrecorded',v.created_at,'backfilled_synthetic_fixture',v.capture_kind,encode(sha256(convert_to(v.capture_text,'UTF8')),'hex')
   FROM app.variation v WHERE v.tenant_id=t AND v.job_track='small_builder' AND v.origin='builder_logged'
   ON CONFLICT(tenant_id,variation_id) DO NOTHING;
 END LOOP;
END $$;
-- SH-1 BACKFILL END

ALTER TABLE app.variation ALTER COLUMN job_track SET NOT NULL;
ALTER TABLE app.variation ALTER COLUMN origin SET NOT NULL;
ALTER TABLE app.variation ADD CONSTRAINT variation_origin_track CHECK(
 (job_track='small_builder' AND origin IN ('builder_logged','final_review','jobguard_catch')) OR
 (job_track='contractor' AND origin IN ('site_user','jobguard_surfaced_confirmed','office_entry','client_instruction')));
ALTER TABLE app.variation ADD CONSTRAINT variation_job_track_fk FOREIGN KEY(tenant_id,job_id,job_track)
 REFERENCES app.job_commercial_track(tenant_id,job_id,job_track);
ALTER TABLE app.variation ADD CONSTRAINT variation_origin_identity UNIQUE(tenant_id,job_id,id,job_track,origin);
ALTER TABLE app.extra_origin ADD CONSTRAINT extra_origin_exact_variation_fk FOREIGN KEY(tenant_id,job_id,variation_id,job_track,kind)
 REFERENCES app.variation(tenant_id,job_id,id,job_track,origin);
-- Every variation has exactly one matching origin at commit, including contractor extras.
ALTER TABLE app.variation ADD CONSTRAINT variation_requires_origin FOREIGN KEY(tenant_id,job_id,id,job_track,origin)
 REFERENCES app.extra_origin(tenant_id,job_id,variation_id,job_track,kind) DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION app.bind_small_builder_track() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE j uuid; mode_value varchar; source_value varchar; previous_context text;
BEGIN
 IF TG_TABLE_NAME='job' THEN
  IF NEW.status NOT IN ('live','invoiced','paid') OR NEW.provenance='imported' THEN RETURN NEW; END IF;
  j:=NEW.id; mode_value:='synthetic_demo'; source_value:='legacy_synthetic_live_fixture';
 ELSIF TG_TABLE_NAME='job_activation' THEN
  j:=NEW.job_id; mode_value:=NEW.mode; source_value:='quote_activation';
 ELSE
  j:=NEW.job_id; mode_value:='synthetic_demo'; source_value:='adoption_import';
 END IF;
 previous_context:=current_setting('app.tenant_id',true);
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 -- Only existing small-builder entry paths call this trigger. No user-selectable track.
 INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance,source_id)
 VALUES(NEW.tenant_id,j,'small_builder',mode_value,source_value,NEW.id) ON CONFLICT(tenant_id,job_id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=NEW.tenant_id AND job_id=j AND job_track='small_builder') THEN
  RAISE EXCEPTION 'immutable job track conflict' USING ERRCODE='23514';
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(previous_context,''),true);
 RETURN NEW;
END $$;
CREATE TRIGGER job_legacy_live_track AFTER INSERT ON app.job FOR EACH ROW EXECUTE FUNCTION app.bind_small_builder_track();
CREATE TRIGGER job_activation_track AFTER INSERT ON app.job_activation FOR EACH ROW EXECUTE FUNCTION app.bind_small_builder_track();
CREATE TRIGGER imported_job_track AFTER INSERT ON app.imported_job_baseline FOR EACH ROW EXECUTE FUNCTION app.bind_small_builder_track();

CREATE FUNCTION app.guard_variation_origin() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.tenant_id,NEW.job_id,NEW.id,NEW.job_track,NEW.origin) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.job_id,OLD.id,OLD.job_track,OLD.origin) THEN
   RAISE EXCEPTION 'variation origin and track are immutable' USING ERRCODE='55000';
  END IF;
 ELSE
  IF NEW.job_track IS NULL THEN SELECT job_track INTO NEW.job_track FROM app.job_commercial_track WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id; END IF;
  IF NEW.origin IS NULL AND NEW.job_track='small_builder' THEN NEW.origin:='builder_logged'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER variation_origin_guard BEFORE INSERT OR UPDATE ON app.variation FOR EACH ROW EXECUTE FUNCTION app.guard_variation_origin();

-- Compatibility for the existing synthetic capture path, which has no command
-- receipt. Unknown actors/times remain explicitly unknown; never invent one.
CREATE FUNCTION app.record_legacy_builder_origin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE previous_context text;
BEGIN
 previous_context:=current_setting('app.tenant_id',true);
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 IF NEW.job_track='small_builder' AND NEW.origin='builder_logged' AND NOT EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=NEW.tenant_id AND command_type='LogBuilderExtra' AND semantic_key=('extra-origin:'||NEW.job_id::text||':'||NEW.id::text)) THEN
  INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,raising_role,server_recorded_at,provenance,source_capture_kind,source_capture_hash)
  VALUES(NEW.tenant_id,NEW.job_id,NEW.id,NEW.job_track,NEW.origin,'legacy_unrecorded',transaction_timestamp(),'legacy_synthetic_capture',NEW.capture_kind,encode(sha256(convert_to(NEW.capture_text,'UTF8')),'hex'));
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(previous_context,''),true);
 RETURN NEW;
END $$;
CREATE TRIGGER variation_legacy_origin AFTER INSERT ON app.variation FOR EACH ROW EXECUTE FUNCTION app.record_legacy_builder_origin();

CREATE FUNCTION app.validate_extra_origin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c app.command_receipt; expected_kind varchar; actual_role varchar;
BEGIN
 IF NEW.provenance<>'command' THEN
  IF current_user<>'jobguard_migration' AND NOT pg_has_role(current_user,'jobguard_migration','USAGE') THEN
   RAISE EXCEPTION 'legacy provenance is migration/trigger-only' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO c FROM app.command_receipt WHERE tenant_id=NEW.tenant_id AND command_id=NEW.command_id;
 expected_kind:=CASE c.command_type WHEN 'LogSiteExtra' THEN 'site_user' WHEN 'ConfirmPrompt' THEN 'jobguard_surfaced_confirmed'
  WHEN 'RecordOfficeExtra' THEN 'office_entry' WHEN 'RecordClientInstruction' THEN 'client_instruction'
  WHEN 'LogBuilderExtra' THEN 'builder_logged' WHEN 'AddFinalReviewExtra' THEN 'final_review' WHEN 'ConfirmJobGuardCatch' THEN 'jobguard_catch' END;
 SELECT role INTO actual_role FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.raising_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp());
 IF expected_kind IS NULL OR expected_kind<>NEW.kind OR c.status<>'processing' OR c.actor_membership_id IS DISTINCT FROM NEW.raising_membership_id
  OR actual_role IS DISTINCT FROM NEW.raising_role
  OR c.semantic_key<>('extra-origin:'||NEW.job_id::text||':'||NEW.variation_id::text) THEN
  RAISE EXCEPTION 'exact raising command and actor required' USING ERRCODE='23514';
 END IF;
 -- Ignore caller claims about authoritative server receive time or capture hash.
 NEW.server_recorded_at:=transaction_timestamp();
 SELECT capture_kind,encode(sha256(convert_to(capture_text,'UTF8')),'hex') INTO NEW.source_capture_kind,NEW.source_capture_hash
  FROM app.variation WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.variation_id;
 RETURN NEW;
END $$;
CREATE TRIGGER extra_origin_validate BEFORE INSERT ON app.extra_origin FOR EACH ROW EXECUTE FUNCTION app.validate_extra_origin();
CREATE TRIGGER extra_origin_immutable BEFORE UPDATE OR DELETE ON app.extra_origin FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER job_commercial_track_immutable BEFORE UPDATE OR DELETE ON app.job_commercial_track FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
ALTER FUNCTION app.bind_small_builder_track() OWNER TO jobguard_migration;
ALTER FUNCTION app.guard_variation_origin() OWNER TO jobguard_migration;
ALTER FUNCTION app.record_legacy_builder_origin() OWNER TO jobguard_migration;
ALTER FUNCTION app.validate_extra_origin() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.bind_small_builder_track(),app.guard_variation_origin(),app.record_legacy_builder_origin(),app.validate_extra_origin() FROM PUBLIC,jobguard_runtime;
COMMIT;
