BEGIN;
-- ENT-11a only. Additive fixture storage; no production policy or predecessor function replacement.
CREATE TABLE app.northside_run (
 tenant_id uuid PRIMARY KEY REFERENCES control_plane.tenant(id),
 session_ref uuid NOT NULL UNIQUE REFERENCES control_plane.contractor_practice_session(session_id),
 owner_membership_id uuid NOT NULL, owner_identity_user_id uuid NOT NULL,
 settings_version text NOT NULL CHECK(settings_version='northside-settings.v1'),
 settings_hash text NOT NULL CHECK(settings_hash ~ '^[a-f0-9]{64}$'), settings jsonb NOT NULL,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 classification text NOT NULL DEFAULT 'demo_settings' CHECK(classification='demo_settings'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,owner_membership_id,owner_identity_user_id) REFERENCES app.membership(tenant_id,id,identity_user_id),
 UNIQUE(tenant_id,settings_version,settings_hash),
 CHECK(settings->>'version'=settings_version AND settings->>'classification'='demo_settings'),
 CHECK(settings_hash=encode(sha256(convert_to(settings::text,'UTF8')),'hex'))
);
CREATE TABLE app.northside_action_attribution (
 tenant_id uuid NOT NULL, source_kind text NOT NULL CHECK(source_kind IN('command','import','upload','evidence','contract','sor')),
 source_id uuid NOT NULL, command_id uuid, import_batch_id uuid, upload_id uuid, evidence_id uuid, contract_version_id uuid, sor_version_id uuid,
 actor_membership_id uuid NOT NULL, actor_role text NOT NULL,
 tester_membership_id uuid NOT NULL, tester_identity_user_id uuid NOT NULL,
 session_ref uuid NOT NULL REFERENCES control_plane.contractor_practice_session(session_id),
 switch_id uuid REFERENCES control_plane.practice_worker_switch(id),
 settings_version text NOT NULL, settings_hash text NOT NULL,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 classification text NOT NULL DEFAULT 'demo_settings' CHECK(classification='demo_settings'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,source_kind,source_id),
 FOREIGN KEY(tenant_id,settings_version,settings_hash) REFERENCES app.northside_run(tenant_id,settings_version,settings_hash),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,tester_membership_id,tester_identity_user_id) REFERENCES app.membership(tenant_id,id,identity_user_id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,import_batch_id) REFERENCES app.import_batch(tenant_id,id),
 FOREIGN KEY(tenant_id,upload_id) REFERENCES app.evidence_upload(tenant_id,id),
 FOREIGN KEY(tenant_id,evidence_id) REFERENCES app.evidence_object(tenant_id,id),
 FOREIGN KEY(tenant_id,contract_version_id) REFERENCES app.client_contract_version(tenant_id,id),
 FOREIGN KEY(tenant_id,sor_version_id) REFERENCES app.sor_version(tenant_id,id),
 CHECK(num_nonnulls(command_id,import_batch_id,upload_id,evidence_id,contract_version_id,sor_version_id)=1),
 CHECK(CASE source_kind WHEN 'command' THEN source_id=command_id WHEN 'import' THEN source_id=import_batch_id
  WHEN 'upload' THEN source_id=upload_id WHEN 'evidence' THEN source_id=evidence_id WHEN 'contract' THEN source_id=contract_version_id WHEN 'sor' THEN source_id=sor_version_id ELSE false END IS TRUE),
 CHECK((switch_id IS NULL)=(actor_membership_id=tester_membership_id))
);
-- Derive the actual tester from the run's persisted owner session, never a request label or role assertion.
-- These trigger inserts occur during source mutation, before the existing command's final audit-head lock.
CREATE FUNCTION app.northside_capture_action() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE run app.northside_run; sw control_plane.practice_worker_switch; own control_plane.contractor_practice_session;
 actor uuid; actor_role text; kind text; source uuid; rule record;
BEGIN
 SELECT * INTO run FROM app.northside_run WHERE tenant_id=NEW.tenant_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR current_database()<>'jobguard_synthetic_demo'
 THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Read the persisted switch at source insertion. No new advisory/business lock follows the audit head.
 SELECT * INTO own FROM control_plane.contractor_practice_session WHERE session_id=run.session_ref;
 IF own.revoked_at IS NOT NULL OR own.expires_at<=clock_timestamp()
  OR app.contractor_practice_home_deadline(own.session_digest,clock_timestamp())<=clock_timestamp()
 THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT rule FROM app.practice_company_made_up(run.session_ref);
 IF rule.verdict IS DISTINCT FROM 'made_up' OR rule.owner_member IS DISTINCT FROM run.owner_membership_id
  OR rule.owner_user IS DISTINCT FROM run.owner_identity_user_id THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO sw FROM control_plane.practice_worker_switch WHERE session_ref=run.session_ref AND ended_at IS NULL;
 actor:=run.owner_membership_id;
 IF FOUND THEN
  IF sw.started_at>clock_timestamp() OR sw.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'NORTHSIDE_SWITCH_MUST_END' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT rule FROM app.practice_worker_switch_decision(run.session_ref,sw.worker_membership_id);
  IF rule.decision IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
  actor:=sw.worker_membership_id;
 END IF;
 SELECT role INTO STRICT actor_role FROM app.membership WHERE tenant_id=run.tenant_id AND id=actor;
 CASE TG_TABLE_NAME
  WHEN 'command_receipt' THEN
   IF NEW.actor_membership_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
   kind:='command'; source:=NEW.command_id;
  WHEN 'import_batch' THEN
   IF NEW.actor_membership_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
   kind:='import'; source:=NEW.id;
  WHEN 'evidence_upload' THEN kind:='upload'; source:=NEW.id;
  WHEN 'evidence_object' THEN kind:='evidence'; source:=NEW.id;
  WHEN 'client_contract_version' THEN kind:='contract'; source:=NEW.id;
  WHEN 'sor_version' THEN
   IF NEW.actor_membership_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
   kind:='sor'; source:=NEW.id;
  ELSE RAISE EXCEPTION 'NORTHSIDE_SOURCE_INVALID';
 END CASE;
 INSERT INTO app.northside_action_attribution(tenant_id,source_kind,source_id,command_id,import_batch_id,upload_id,evidence_id,contract_version_id,sor_version_id,
  actor_membership_id,actor_role,tester_membership_id,tester_identity_user_id,session_ref,switch_id,settings_version,settings_hash)
 VALUES(run.tenant_id,kind,source,CASE WHEN kind='command' THEN source END,CASE WHEN kind='import' THEN source END,
  CASE WHEN kind='upload' THEN source END,CASE WHEN kind='evidence' THEN source END,CASE WHEN kind='contract' THEN source END,CASE WHEN kind='sor' THEN source END,
  actor,actor_role,run.owner_membership_id,run.owner_identity_user_id,run.session_ref,sw.id,run.settings_version,run.settings_hash);
 RETURN NEW;
END $$;
CREATE TRIGGER northside_command_attribution AFTER INSERT ON app.command_receipt FOR EACH ROW EXECUTE FUNCTION app.northside_capture_action();
CREATE TRIGGER northside_import_attribution AFTER INSERT ON app.import_batch FOR EACH ROW EXECUTE FUNCTION app.northside_capture_action();
CREATE TRIGGER northside_upload_attribution AFTER INSERT ON app.evidence_upload FOR EACH ROW EXECUTE FUNCTION app.northside_capture_action();
CREATE TRIGGER northside_evidence_attribution AFTER INSERT ON app.evidence_object FOR EACH ROW EXECUTE FUNCTION app.northside_capture_action();
CREATE TRIGGER northside_sor_attribution AFTER INSERT ON app.sor_version FOR EACH ROW EXECUTE FUNCTION app.northside_capture_action();
CREATE TRIGGER northside_contract_settings AFTER INSERT ON app.client_contract_version FOR EACH ROW EXECUTE FUNCTION app.northside_capture_action();

CREATE FUNCTION app.northside_register(p_owner uuid,p_settings jsonb) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; own control_plane.contractor_practice_session; rule record; added integer;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO own FROM control_plane.contractor_practice_session WHERE tenant_id=t AND membership_id=p_owner;
 IF NOT FOUND OR own.revoked_at IS NOT NULL OR own.expires_at<=clock_timestamp()
  OR app.contractor_practice_home_deadline(own.session_digest,clock_timestamp())<=clock_timestamp()
 THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(own.session_id::text,16501));
 SELECT * INTO STRICT rule FROM app.practice_company_made_up(own.session_id);
 IF rule.verdict IS DISTINCT FROM 'made_up' OR EXISTS(SELECT 1 FROM control_plane.practice_worker_switch WHERE session_ref=own.session_id AND ended_at IS NULL)
 THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_settings->>'version' IS DISTINCT FROM 'northside-settings.v1' OR p_settings->>'classification' IS DISTINCT FROM 'demo_settings'
 THEN RAISE EXCEPTION 'NORTHSIDE_SETTINGS_INVALID' USING ERRCODE='22023'; END IF;
 INSERT INTO app.northside_run(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,settings_version,settings_hash,settings)
 VALUES(t,own.session_id,own.membership_id,own.identity_user_id,p_settings->>'version',encode(sha256(convert_to(p_settings::text,'UTF8')),'hex'),p_settings)
 ON CONFLICT(tenant_id) DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 IF NOT EXISTS(SELECT 1 FROM app.northside_run WHERE tenant_id=t AND settings=p_settings AND session_ref=own.session_id)
 THEN RAISE EXCEPTION 'NORTHSIDE_SETTINGS_CONFLICT' USING ERRCODE='23514'; END IF;
 RETURN added=1;
END $$;

CREATE FUNCTION app.northside_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'NORTHSIDE_HISTORY_IMMUTABLE' USING ERRCODE='55000'; END $$;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['northside_run','northside_action_attribution'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',tab);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY northside_tenant ON app.%I TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',tab);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',tab);
  EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',tab);
  EXECUTE format('CREATE TRIGGER northside_immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.northside_immutable()',tab);
  EXECUTE format('CREATE TRIGGER northside_no_truncate BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.northside_immutable()',tab);
 END LOOP;
END $$;
ALTER FUNCTION app.northside_capture_action() OWNER TO jobguard_migration;
ALTER FUNCTION app.northside_register(uuid,jsonb) OWNER TO jobguard_migration;
ALTER FUNCTION app.northside_immutable() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.northside_capture_action(),app.northside_register(uuid,jsonb),app.northside_immutable() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.northside_register(uuid,jsonb) TO jobguard_runtime;
COMMIT;
