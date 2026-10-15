BEGIN;
-- SV-7A independent storage/read slice. Both executable intake routines are HELD.
-- No earlier table, routine, grant, or fingerprint is changed.
CREATE TABLE app.job_source_original (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, evidence_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN('diary','customer_message')), source_id uuid NOT NULL,
 object_key varchar(1024) NOT NULL CHECK(object_key LIKE 'synthetic/job-sources/%'),
 object_version_id varchar(300) NOT NULL CHECK(length(object_version_id)>0),
 content_type text NOT NULL DEFAULT 'text/plain; charset=utf-8' CHECK(content_type='text/plain; charset=utf-8'),
 bytes bytea NOT NULL, sha256 char(64) NOT NULL, byte_length integer NOT NULL,
 source_received_at timestamptz NOT NULL, verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 synthetic_fixture_ref varchar(160),
 PRIMARY KEY(tenant_id,evidence_id),
 UNIQUE(tenant_id,job_id,source_kind,source_id),
 UNIQUE(tenant_id,job_id,source_kind,source_id,evidence_id,object_version_id,sha256,source_received_at),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id,object_version_id,sha256,source_received_at)
  REFERENCES app.evidence_object(tenant_id,job_id,id,object_version_id,sha256,server_received_at),
 CONSTRAINT job_source_original_bytes_ck CHECK(byte_length=octet_length(bytes) AND byte_length BETWEEN 1 AND 32000
  AND sha256=encode(pg_catalog.sha256(bytes),'hex') AND char_length(convert_from(bytes,'UTF8')) BETWEEN 1 AND 8000
  AND length(btrim(convert_from(bytes,'UTF8'),E' \t\r\n'))>0),
 CHECK(verified_at>=source_received_at)
);
CREATE TABLE app.job_diary_entry (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 source_kind text NOT NULL DEFAULT 'diary' CHECK(source_kind='diary'),
 entry_mode text NOT NULL CHECK(entry_mode IN('typed','dictated_text')), on_site boolean NOT NULL,
 evidence_id uuid NOT NULL, object_version_id varchar(300) NOT NULL, sha256 char(64) NOT NULL, source_received_at timestamptz NOT NULL,
 notice_version text NOT NULL DEFAULT 'job-diary-notice.v1' CHECK(notice_version='job-diary-notice.v1'),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,source_kind,id,evidence_id,object_version_id,sha256,source_received_at)
  REFERENCES app.job_source_original(tenant_id,job_id,source_kind,source_id,evidence_id,object_version_id,sha256,source_received_at)
);
CREATE TABLE app.customer_message_source (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 source_kind text NOT NULL DEFAULT 'customer_message' CHECK(source_kind='customer_message'),
 fictional_role_name varchar(160) NOT NULL CHECK(length(btrim(fictional_role_name))>0),
 evidence_id uuid NOT NULL, object_version_id varchar(300) NOT NULL, sha256 char(64) NOT NULL, source_received_at timestamptz NOT NULL,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,source_kind,id,evidence_id,object_version_id,sha256,source_received_at)
  REFERENCES app.job_source_original(tenant_id,job_id,source_kind,source_id,evidence_id,object_version_id,sha256,source_received_at)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['job_diary_entry','customer_message_source','job_source_original'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
  EXECUTE format('CREATE TRIGGER job_source_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
GRANT SELECT ON app.job_diary_entry TO jobguard_runtime;
GRANT SELECT ON app.customer_message_source TO jobguard_runtime;
GRANT SELECT ON app.job_source_original TO jobguard_runtime;

-- Private integrity seam, never a callable source-creation authority.
CREATE FUNCTION app.job_source_insert_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND job_track='small_builder' AND environment='synthetic_demo')
 THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME<>'job_source_original' THEN
  IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.actor_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 PERFORM app.require_watchdog_live(NEW.job_id);
 RETURN NEW;
END $$;
ALTER FUNCTION app.job_source_insert_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.job_source_insert_guard() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE TRIGGER job_source_live_binding BEFORE INSERT ON app.job_diary_entry FOR EACH ROW EXECUTE FUNCTION app.job_source_insert_guard();
CREATE TRIGGER job_source_live_binding BEFORE INSERT ON app.customer_message_source FOR EACH ROW EXECUTE FUNCTION app.job_source_insert_guard();
CREATE TRIGGER job_source_live_binding BEFORE INSERT ON app.job_source_original FOR EACH ROW EXECUTE FUNCTION app.job_source_insert_guard();

-- Deferred so a migration-role labelled fixture can install both sides atomically.
CREATE FUNCTION app.job_source_original_binding() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; command uuid;
BEGIN
 IF NEW.source_kind='diary' THEN
  SELECT actor_membership_id,command_id INTO actor,command FROM app.job_diary_entry WHERE (tenant_id,job_id,id,evidence_id,object_version_id,sha256,source_received_at)=(NEW.tenant_id,NEW.job_id,NEW.source_id,NEW.evidence_id,NEW.object_version_id,NEW.sha256,NEW.source_received_at);
 ELSE
  SELECT actor_membership_id,command_id INTO actor,command FROM app.customer_message_source WHERE (tenant_id,job_id,id,evidence_id,object_version_id,sha256,source_received_at)=(NEW.tenant_id,NEW.job_id,NEW.source_id,NEW.evidence_id,NEW.object_version_id,NEW.sha256,NEW.source_received_at);
 END IF;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=NEW.tenant_id AND r.command_id=command AND r.actor_membership_id=actor AND r.status='succeeded') THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_BINDING' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
  WHERE (e.tenant_id,e.job_id,e.id,e.object_version_id,e.sha256,e.server_received_at)=(NEW.tenant_id,NEW.job_id,NEW.evidence_id,NEW.object_version_id,NEW.sha256,NEW.source_received_at)
  AND e.kind='original' AND e.scope_item_id IS NULL AND e.content_type=NEW.content_type AND e.object_key=NEW.object_key AND e.byte_length=NEW.byte_length
  AND e.evidence_type=CASE WHEN NEW.source_kind='diary' THEN 'job_diary_text' ELSE 'customer_message_text' END
  AND u.state='verified' AND u.scope_item_id IS NULL AND u.object_key=NEW.object_key AND u.object_version_id=NEW.object_version_id AND u.expected_sha256=NEW.sha256
  AND u.expected_content_type=NEW.content_type AND u.server_received_at=NEW.source_received_at AND u.server_verified_at IS NOT NULL)
 THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_BINDING' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.job_source_original_binding() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.job_source_original_binding() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
CREATE CONSTRAINT TRIGGER job_source_exact_binding AFTER INSERT ON app.job_source_original DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.job_source_original_binding();

-- Read authority only, using the unchanged persisted practice ownership semantics.
CREATE FUNCTION app.read_job_sources(t uuid,j uuid,digest text,source text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE records jsonb;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t)) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(WITH RECURSIVE owned(id) AS(
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
  UNION SELECT job.id FROM owned source_job JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source_job.id::text
   JOIN app.job job ON job.tenant_id=e.tenant_id AND job.id::text=e.subject_ref AND job.provenance='imported' AND job.practice_session_digest IS NULL
 ) SELECT 1 FROM owned JOIN app.job_commercial_track track ON track.tenant_id=t AND track.job_id=owned.id WHERE owned.id=j AND track.job_track='small_builder' AND track.environment='synthetic_demo') THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF source NOT IN('diary','customer_message') OR source IS NULL THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT' USING ERRCODE='22023'; END IF;
 IF source='diary' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'commandId',s.command_id,'entryMode',s.entry_mode,'onSite',s.on_site,'actualTesterMembershipId',s.actor_membership_id,'text',convert_from(o.bytes,'UTF8'),'evidence',jsonb_build_object('id',s.evidence_id,'objectVersionId',s.object_version_id,'sha256',s.sha256,'serverReceivedAt',to_char(s.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))) ORDER BY s.source_received_at,s.id),'[]') INTO records
   FROM app.job_diary_entry s JOIN app.job_source_original o ON(o.tenant_id,o.job_id,o.source_kind,o.source_id,o.evidence_id,o.object_version_id,o.sha256,o.source_received_at)=(s.tenant_id,s.job_id,s.source_kind,s.id,s.evidence_id,s.object_version_id,s.sha256,s.source_received_at) WHERE s.tenant_id=t AND s.job_id=j;
  RETURN jsonb_build_object('version','job-diary-read.v1','jobId',j,'entries',records,'notice','Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.','noticeVersion','job-diary-notice.v1','environment','synthetic_demo','realExternalActions',0);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'commandId',s.command_id,'actualTesterMembershipId',s.actor_membership_id,'fictionalCustomer',jsonb_build_object('kind','named_fictional_customer','name',s.fictional_role_name),'text',convert_from(o.bytes,'UTF8'),'evidence',jsonb_build_object('id',s.evidence_id,'objectVersionId',s.object_version_id,'sha256',s.sha256,'serverReceivedAt',to_char(s.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))) ORDER BY s.source_received_at,s.id),'[]') INTO records
  FROM app.customer_message_source s JOIN app.job_source_original o ON(o.tenant_id,o.job_id,o.source_kind,o.source_id,o.evidence_id,o.object_version_id,o.sha256,o.source_received_at)=(s.tenant_id,s.job_id,s.source_kind,s.id,s.evidence_id,s.object_version_id,s.sha256,s.source_received_at) WHERE s.tenant_id=t AND s.job_id=j;
 RETURN jsonb_build_object('version','customer-message-read.v1','jobId',j,'messages',records,'environment','synthetic_demo','realExternalActions',0);
END $$;
ALTER FUNCTION app.read_job_sources(uuid,uuid,text,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_job_sources(uuid,uuid,text,text) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.read_job_sources(uuid,uuid,text,text) TO jobguard_runtime;
COMMIT;
