BEGIN;
-- Builder-submitted historical evidence only. No shadow, attribution eligibility,
-- recovery case, allocation or fee write is reachable from this exclusion adapter.
CREATE TABLE app.import_pre_adoption_evidence (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL,
 command_id uuid NOT NULL, evidence_id uuid NOT NULL, object_version_id text NOT NULL,
 source_received_at timestamptz NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), source_occurred_at timestamptz NOT NULL,
 classification text NOT NULL CHECK(classification='pre_adoption_evidence'),
 fee_pence integer NOT NULL CHECK(fee_pence=0), currency text NOT NULL CHECK(currency='GBP'),
 actor_id uuid NOT NULL, audit_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,job_id,evidence_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job_import_v3(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id,evidence_id,object_version_id,sha256,source_received_at)
 REFERENCES app.evidence_object(tenant_id,job_id,id,object_version_id,sha256,server_received_at),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE app.import_pre_adoption_evidence OWNER TO jobguard_migration;
ALTER TABLE app.import_pre_adoption_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.import_pre_adoption_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.import_pre_adoption_evidence FOR ALL TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.import_pre_adoption_evidence FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
CREATE TRIGGER import_pre_adoption_immutable BEFORE UPDATE OR DELETE ON app.import_pre_adoption_evidence
 FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

CREATE FUNCTION app.ch5_history_audit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.audit_event a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.audit_id
  AND a.actor_ref='membership:'||NEW.actor_id::text AND a.event_type='job.imported_historical_evidence'
  AND a.subject_type='job' AND a.subject_ref=NEW.job_id::text
  AND a.payload#>>'{references,evidenceId}'=NEW.evidence_id::text
  AND a.payload#>>'{references,historyId}'=NEW.id::text
  AND a.payload#>>'{references,reason}'='pre_adoption_evidence')
 THEN RAISE EXCEPTION 'IMPORT_HISTORY_AUDIT_REQUIRED'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.ch5_history_audit_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ch5_history_audit_guard() FROM PUBLIC,jobguard_runtime;
CREATE CONSTRAINT TRIGGER import_pre_adoption_audited AFTER INSERT ON app.import_pre_adoption_evidence
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ch5_history_audit_guard();

-- Shared practice imports bind to the exact adopting session; company imports
-- also require a fresh owner session. Authentication runs even for a replay.
CREATE FUNCTION app.ch5_history_actor(t uuid,j uuid,d text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t='11111111-1111-4111-8111-111111111111'::uuid THEN
  SELECT membership_id INTO actor FROM app.authenticate_practice_session(d,t);
 ELSE actor:=app.ch5_import_actor(t,d); END IF;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM app.job_import_v3 i JOIN app.job_commercial_track c
  ON(c.tenant_id,c.job_id)=(i.tenant_id,i.job_id)
  WHERE i.tenant_id=t AND i.job_id=j AND i.session_digest=d AND c.job_track='small_builder' AND c.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
ALTER FUNCTION app.ch5_history_actor(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ch5_history_actor(uuid,uuid,text) FROM PUBLIC,jobguard_runtime;

CREATE FUNCTION app.ch5_write_history(t uuid,j uuid,d text,cmd uuid,eid uuid,aid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; prior app.import_pre_adoption_evidence; e app.evidence_object; adopted timestamptz; rid uuid:=gen_random_uuid();
BEGIN
 actor:=app.ch5_history_actor(t,j,d);
 IF cmd IS NULL OR eid IS NULL OR aid IS NULL THEN RAISE EXCEPTION 'INVALID_IMPORT_HISTORY'; END IF;
 -- One lock before the eventual audit-head lock, for duplicate source/command races.
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 actor:=app.ch5_history_actor(t,j,d);
 SELECT * INTO prior FROM app.import_pre_adoption_evidence WHERE tenant_id=t AND command_id=cmd;
 IF prior.id IS NOT NULL AND (prior.job_id<>j OR prior.evidence_id<>eid) THEN RAISE EXCEPTION 'COMMAND_CONFLICT'; END IF;
 SELECT * INTO e FROM app.evidence_object WHERE tenant_id=t AND job_id=j AND id=eid AND kind='original';
 SELECT adopted_at INTO adopted FROM app.job_import_v3 WHERE tenant_id=t AND job_id=j;
 IF e.id IS NULL OR e.server_verified_at IS NULL OR e.device_captured_at IS NULL
  OR e.device_captured_at>=adopted OR e.device_captured_at>e.server_received_at
  OR NOT EXISTS(SELECT 1 FROM app.evidence_upload u WHERE u.tenant_id=t AND u.job_id=j AND u.id=e.upload_id
   AND u.state='verified' AND u.server_verified_at IS NOT NULL AND u.object_version_id=e.object_version_id)
  OR EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=t AND evidence_id=eid)
 THEN RAISE EXCEPTION 'PRE_ADOPTION_SOURCE_REQUIRED'; END IF;
 IF prior.id IS NULL AND EXISTS(SELECT 1 FROM app.import_pre_adoption_evidence WHERE tenant_id=t AND job_id=j AND evidence_id=eid)
 THEN RAISE EXCEPTION 'IMPORT_HISTORY_ALREADY_RECORDED'; END IF;
 IF prior.id IS NOT NULL THEN RETURN jsonb_build_object('id',prior.id,'inserted',false,'actorId',actor); END IF;
 INSERT INTO app.import_pre_adoption_evidence(tenant_id,job_id,id,command_id,evidence_id,object_version_id,sha256,source_received_at,source_occurred_at,classification,fee_pence,currency,actor_id,audit_id)
 VALUES(t,j,rid,cmd,eid,e.object_version_id,e.sha256,e.server_received_at,e.device_captured_at,'pre_adoption_evidence',0,'GBP',actor,aid);
 RETURN jsonb_build_object('id',rid,'inserted',true,'actorId',actor);
END $$;
ALTER FUNCTION app.ch5_write_history(uuid,uuid,text,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ch5_write_history(uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ch5_write_history(uuid,uuid,text,uuid,uuid,uuid) TO jobguard_runtime;

CREATE FUNCTION app.ch5_imported_catch(t uuid,j uuid,d text,b uuid,eid uuid,cmd uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE h app.import_pre_adoption_evidence;
BEGIN
 PERFORM app.ch5_history_actor(t,j,d);
 IF b IS NULL OR b::text IS DISTINCT FROM (SELECT result->>'baselineId' FROM app.job_import_v3 WHERE tenant_id=t AND job_id=j)
 THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 IF EXISTS(SELECT 1 FROM app.import_pre_adoption_evidence WHERE tenant_id=t AND command_id=cmd AND (job_id<>j OR evidence_id<>eid))
 THEN RAISE EXCEPTION 'COMMAND_CONFLICT'; END IF;
 SELECT x.* INTO h FROM app.import_pre_adoption_evidence x JOIN app.evidence_object e
 ON(e.tenant_id,e.job_id,e.id)=(x.tenant_id,x.job_id,x.evidence_id)
 WHERE x.tenant_id=t AND x.job_id=j AND x.evidence_id=eid AND x.command_id=cmd AND e.object_version_id=x.object_version_id AND e.sha256=x.sha256
 AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=t AND evidence_id=eid);
 IF h.id IS NULL THEN RAISE EXCEPTION 'PRE_ADOPTION_SOURCE_REQUIRED'; END IF;
 RETURN jsonb_build_object('version','import-catch-result.v1','catchId',h.id,'jobId',j,'evidenceId',eid,
  'fee',jsonb_build_object('pence',0,'currency','GBP'),'reason','pre_adoption_evidence',
  'explanation','Evidence from before adoption is permanently excluded','environment','synthetic_demo','realExternalActions',0);
END $$;
ALTER FUNCTION app.ch5_imported_catch(uuid,uuid,text,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ch5_imported_catch(uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.ch5_imported_catch(uuid,uuid,text,uuid,uuid,uuid) TO jobguard_runtime;

-- Defence at the shadow sink: a caller cannot strip the import label and
-- repurpose these originals as fee-bearing detector evidence.
CREATE FUNCTION app.ch5_refuse_historical_shadow_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.job_import_v3 i
 ON(i.tenant_id,i.job_id)=(e.tenant_id,e.job_id)
 WHERE e.tenant_id=NEW.tenant_id AND e.job_id=NEW.job_id AND e.id=NEW.evidence_id
 AND e.device_captured_at<i.adopted_at)
 OR EXISTS(SELECT 1 FROM app.import_pre_adoption_evidence h WHERE h.tenant_id=NEW.tenant_id
  AND h.job_id=NEW.job_id AND h.sha256=NEW.sha256)
 THEN RAISE EXCEPTION 'PRE_ADOPTION_SOURCE_EXCLUDED'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.ch5_refuse_historical_shadow_source() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ch5_refuse_historical_shadow_source() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER ch5_historical_source_guard BEFORE INSERT ON app.shadow_signal_evidence
 FOR EACH ROW EXECUTE FUNCTION app.ch5_refuse_historical_shadow_source();
COMMIT;
