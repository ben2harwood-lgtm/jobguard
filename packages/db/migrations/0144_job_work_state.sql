BEGIN;
-- CH-4: synthetic immutable fact storage. No lifecycle/link/snagging command admission.
-- No historical reconstruction, timer policy, eligibility policy, money or provider work.
ALTER TABLE app.stage_completion ADD CONSTRAINT ch4_stage_job_identity UNIQUE(tenant_id,job_id,id);
-- Validate stage identity, original server time and evidence binding through a
-- composite FK. PostgreSQL's referential check needs no new reader policy on
-- the older FORCE-RLS source table, and runtime retains exactly its old grants.
ALTER TABLE app.stage_completion ADD CONSTRAINT ch4_stage_source_identity
 UNIQUE(tenant_id,job_id,id,completed_at,evidence_link_id);
CREATE TABLE app.job_site_source_receipt (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL,
 version text NOT NULL DEFAULT 'job-site-source-receipt.v1' CHECK(version='job-site-source-receipt.v1'),
 source_kind text NOT NULL CHECK(source_kind IN('photo','delivery_note','goods_receipt','builder_extra','stage_completion')),
 fact_key text NOT NULL CHECK(length(fact_key) BETWEEN 1 AND 200),
 received_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 source_hash char(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'), object_version_id text,
 evidence_id uuid, upload_id uuid, document_id uuid, document_version_id uuid, goods_receipt_id uuid,
 variation_id uuid, extra_track varchar(16), extra_kind varchar(32), stage_completion_id uuid, stage_evidence_link_id uuid,
 actor_membership_id uuid, provenance text NOT NULL CHECK(provenance IN('source_command','server_source')),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,job_id,fact_key),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,upload_id) REFERENCES app.evidence_upload(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,document_id) REFERENCES app.supplier_document(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,document_version_id) REFERENCES app.supplier_document_version(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,goods_receipt_id) REFERENCES app.goods_receipt(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,variation_id,extra_track,extra_kind) REFERENCES app.extra_origin(tenant_id,job_id,variation_id,job_track,kind),
 FOREIGN KEY(tenant_id,job_id,stage_completion_id) REFERENCES app.stage_completion(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,stage_completion_id,received_at,stage_evidence_link_id) REFERENCES app.stage_completion(tenant_id,job_id,id,completed_at,evidence_link_id),
 CHECK((source_kind='stage_completion')=(stage_evidence_link_id IS NOT NULL)),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK((source_kind='photo' AND object_version_id IS NOT NULL AND evidence_id IS NOT NULL AND upload_id IS NOT NULL AND length(object_version_id)>0 AND document_id IS NULL AND document_version_id IS NULL AND goods_receipt_id IS NULL AND variation_id IS NULL AND stage_completion_id IS NULL AND extra_track IS NULL AND extra_kind IS NULL)
 OR (source_kind='delivery_note' AND document_id IS NOT NULL AND document_version_id IS NOT NULL AND evidence_id IS NULL AND upload_id IS NULL AND object_version_id IS NULL AND goods_receipt_id IS NULL AND variation_id IS NULL AND stage_completion_id IS NULL AND extra_track IS NULL AND extra_kind IS NULL)
 OR (source_kind='goods_receipt' AND goods_receipt_id IS NOT NULL AND document_id IS NOT NULL AND evidence_id IS NULL AND upload_id IS NULL AND object_version_id IS NULL AND variation_id IS NULL AND stage_completion_id IS NULL AND extra_track IS NULL AND extra_kind IS NULL)
 OR (source_kind='builder_extra' AND variation_id IS NOT NULL AND extra_track='small_builder' AND extra_kind='builder_logged' AND actor_membership_id IS NOT NULL AND evidence_id IS NULL AND upload_id IS NULL AND object_version_id IS NULL AND document_id IS NULL AND document_version_id IS NULL AND goods_receipt_id IS NULL AND stage_completion_id IS NULL)
 OR (source_kind='stage_completion' AND stage_completion_id IS NOT NULL AND evidence_id IS NULL AND upload_id IS NULL AND object_version_id IS NULL AND document_id IS NULL AND document_version_id IS NULL AND goods_receipt_id IS NULL AND variation_id IS NULL AND extra_track IS NULL AND extra_kind IS NULL))
);
CREATE TABLE app.job_work_state_event (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, sequence bigint NOT NULL CHECK(sequence BETWEEN 1 AND 9007199254740991),
 version text NOT NULL DEFAULT 'job-work-state-event.v1' CHECK(version='job-work-state-event.v1'),
 kind text NOT NULL CHECK(kind IN('first_site_evidence','site_activity','finished_on_site','finished_cancelled','closed','reopened','resumed')),
 fact_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_membership_id uuid,
 command_id uuid, source_receipt_id uuid, predecessor_id uuid, close_reason text, close_note text,
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'), audit_event_id uuid NOT NULL,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,id), UNIQUE(tenant_id,job_id,sequence), UNIQUE(tenant_id,command_id),
 UNIQUE(tenant_id,job_id,source_receipt_id,kind),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,source_receipt_id) REFERENCES app.job_site_source_receipt(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,predecessor_id) REFERENCES app.job_work_state_event(tenant_id,job_id,id),
 CHECK(predecessor_id IS NULL OR predecessor_id<>id),
 CHECK((kind IN('finished_cancelled','reopened'))=(predecessor_id IS NOT NULL)),
 CHECK((kind='closed' AND close_reason IS NOT NULL AND close_reason IN('cancelled_by_customer','abandoned','completed_outside_jobguard','other') AND close_note IS NOT NULL AND length(btrim(close_note,E' \t\r\n')) BETWEEN 1 AND 2000)
 OR (kind<>'closed' AND close_reason IS NULL AND close_note IS NULL)),
 CHECK((kind IN('first_site_evidence','site_activity') AND source_receipt_id IS NOT NULL AND command_id IS NULL)
 OR (kind='finished_cancelled' AND (source_receipt_id IS NOT NULL)<>(command_id IS NOT NULL))
 OR (kind IN('finished_on_site','closed','reopened','resumed') AND command_id IS NOT NULL AND source_receipt_id IS NULL AND actor_membership_id IS NOT NULL))
);
CREATE UNIQUE INDEX job_source_one_activity ON app.job_work_state_event(tenant_id,source_receipt_id) WHERE kind IN('first_site_evidence','site_activity');
CREATE TABLE app.job_photo_purpose (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, upload_id uuid NOT NULL, evidence_id uuid NOT NULL,
 purpose text NOT NULL CHECK(purpose IN('progress','proof','snagging')), object_version_id text NOT NULL CHECK(length(object_version_id)>0),
 sha256 char(64) NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), actor_membership_id uuid NOT NULL,
 command_id uuid NOT NULL, fixed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,upload_id), UNIQUE(tenant_id,job_id,upload_id), UNIQUE(tenant_id,evidence_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,upload_id) REFERENCES app.evidence_upload(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id) REFERENCES app.evidence_object(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
CREATE TABLE app.job_link (
 tenant_id uuid NOT NULL, id uuid NOT NULL, predecessor_job_id uuid NOT NULL, successor_job_id uuid NOT NULL,
 predecessor_binding_id uuid NOT NULL, successor_binding_id uuid NOT NULL, customer_id uuid NOT NULL, site_id uuid NOT NULL, paying_party_id uuid NOT NULL,
 link_kind text NOT NULL DEFAULT 'post_lock_continuation' CHECK(link_kind='post_lock_continuation'),
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL, linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'), audit_event_id uuid NOT NULL,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,predecessor_job_id,successor_job_id),
 CHECK(predecessor_job_id<>successor_job_id),
 FOREIGN KEY(tenant_id,predecessor_job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,successor_job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,predecessor_job_id,predecessor_binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,successor_job_id,successor_binding_id) REFERENCES app.job_party_binding(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['job_work_state_event','job_site_source_receipt','job_photo_purpose','job_link'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',n);
  EXECUTE format('CREATE TRIGGER ch4_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
GRANT SELECT ON app.job_work_state_event TO jobguard_runtime;
GRANT SELECT ON app.job_site_source_receipt TO jobguard_runtime;
GRANT SELECT ON app.job_photo_purpose TO jobguard_runtime;
GRANT SELECT ON app.job_link TO jobguard_runtime;

CREATE FUNCTION app.ch4_fact_id(v text) RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT (substr(md5(v),1,12)||'4'||substr(md5(v),14,3)||'8'||substr(md5(v),18,15))::uuid
$$;
-- Existing source authority only; this helper grants no CH-4 command permission.
CREATE FUNCTION app.ch4_source_job(t uuid,j uuid) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE job app.job; track app.job_commercial_track;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO track FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j;
 IF track.job_track IS DISTINCT FROM 'small_builder' OR track.environment IS DISTINCT FROM 'synthetic_demo' THEN RETURN false; END IF;
 SELECT * INTO job FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 IF job.id IS NULL THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Recheck the persisted practice principal AFTER a wait. Unowned synthetic fixture paths retain existing authority.
 IF job.practice_session_digest IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(job.practice_session_digest,t)) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN true;
END $$;
CREATE FUNCTION app.ch4_guard_new_site_work() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE applies boolean:=true;
BEGIN
 IF TG_TABLE_NAME='supplier_document' THEN applies:=NEW.document_type='invoice'; END IF;
 IF TG_TABLE_NAME='supplier_document_intake' THEN applies:=EXISTS(SELECT 1 FROM app.supplier_document d WHERE (d.tenant_id,d.job_id,d.id)=(NEW.tenant_id,NEW.job_id,NEW.document_id) AND d.document_type='invoice'); END IF;
 IF TG_TABLE_NAME='variation' THEN applies:=NEW.origin='builder_logged' AND NEW.job_track='small_builder'; END IF;
 IF TG_TABLE_NAME='evidence_upload' THEN
  applies:=NEW.expected_content_type IN('image/png','image/jpeg','image/webp');
  -- The existing begin-upload replay still reaches INSERT ... ON CONFLICT. Match only the existing request contract.
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE (u.tenant_id,u.job_id,u.id)=(NEW.tenant_id,NEW.job_id,NEW.id)
   AND u.scope_item_id IS NOT DISTINCT FROM NEW.scope_item_id AND u.object_key=NEW.object_key AND u.expected_sha256=NEW.expected_sha256 AND u.expected_content_type=NEW.expected_content_type
   AND u.maximum_bytes=NEW.maximum_bytes AND u.retention_class=NEW.retention_class AND u.device_captured_at IS NOT DISTINCT FROM NEW.device_captured_at) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.state NOT IN('quarantined','verified') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NEW.state=OLD.state AND NEW.object_version_id IS NOT DISTINCT FROM OLD.object_version_id THEN RETURN NEW; END IF;
 END IF;
 IF TG_TABLE_NAME='scope_progress' THEN applies:=NEW.stage IN('in_progress','complete') AND NEW.stage IS DISTINCT FROM OLD.stage; END IF;
 -- Proof evidence types: packages/core/src/proof.ts (proofEvidenceTypeSchema).
 IF TG_TABLE_NAME='evidence_object' THEN applies:=NEW.kind='original' AND NEW.evidence_type IN('pre_cover_photo','completion_photo','excavation_photo','electrical_certificate'); END IF;
 IF NOT applies THEN RETURN NEW; END IF;
 IF NOT app.ch4_source_job(NEW.tenant_id,NEW.job_id) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN
  RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB' USING ERRCODE='P0001', DETAIL=(SELECT jsonb_build_object('version','job-linked-offer.v1','code','POST_LOCK_WORK_REQUIRES_LINKED_JOB','message','Start a linked job for this customer and site','jobId',NEW.job_id,'customerId',b.customer_id,'siteId',b.site_id)::text FROM app.job_party_current c JOIN app.job_party_binding b ON(b.tenant_id,b.job_id,b.id)=(c.tenant_id,c.job_id,c.binding_id) WHERE c.tenant_id=NEW.tenant_id AND c.job_id=NEW.job_id);
 END IF;
 RETURN NEW;
END $$;
-- Table integrity only. Runtime has no INSERT; no held admission routine is created.
CREATE FUNCTION app.ch4_storage_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE latest app.job_work_state_event; p app.job_party_binding; s app.job_party_binding; old_context text:=current_setting('app.tenant_id',true);
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(old_context,'')::uuid THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF TG_TABLE_NAME='job_link' THEN
  PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id IN(NEW.predecessor_job_id,NEW.successor_job_id) ORDER BY id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,145));
  IF (SELECT count(*) FROM app.job_commercial_track WHERE tenant_id=NEW.tenant_id AND job_id IN(NEW.predecessor_job_id,NEW.successor_job_id) AND job_track='small_builder' AND environment='synthetic_demo')<>2 THEN RAISE EXCEPTION 'INVALID_JOB_LINK'; END IF;
  SELECT * INTO p FROM app.job_party_binding WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.predecessor_job_id,NEW.predecessor_binding_id);
  SELECT * INTO s FROM app.job_party_binding WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.successor_job_id,NEW.successor_binding_id);
  IF p.id IS NULL OR s.id IS NULL OR (p.customer_id,p.site_id,p.paying_party_id) IS DISTINCT FROM (s.customer_id,s.site_id,s.paying_party_id)
   OR (p.customer_id,p.site_id,p.paying_party_id) IS DISTINCT FROM (NEW.customer_id,NEW.site_id,NEW.paying_party_id)
   OR NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.predecessor_job_id)
   OR (SELECT practice_session_digest FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.predecessor_job_id) IS DISTINCT FROM (SELECT practice_session_digest FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.successor_job_id)
  THEN RAISE EXCEPTION 'INVALID_JOB_LINK'; END IF;
  IF EXISTS(WITH RECURSIVE descendants(id) AS(SELECT NEW.successor_job_id UNION SELECT l.successor_job_id FROM app.job_link l JOIN descendants d ON d.id=l.predecessor_job_id WHERE l.tenant_id=NEW.tenant_id) SELECT 1 FROM descendants WHERE id=NEW.predecessor_job_id) THEN RAISE EXCEPTION 'JOB_LINK_CYCLE'; END IF;
  RETURN NEW;
 END IF;
 IF TG_TABLE_NAME='job_work_state_event' THEN IF NEW.source_receipt_id IS NULL THEN PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR UPDATE; END IF; END IF;
 IF NOT app.ch4_source_job(NEW.tenant_id,NEW.job_id) THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED'; END IF;
 IF TG_TABLE_NAME='job_photo_purpose' THEN
  IF NOT EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
   WHERE (e.tenant_id,e.job_id,e.id,e.upload_id)=(NEW.tenant_id,NEW.job_id,NEW.evidence_id,NEW.upload_id) AND e.kind='original' AND u.state='verified' AND e.sha256=NEW.sha256 AND e.object_version_id=NEW.object_version_id AND u.object_version_id=NEW.object_version_id)
  THEN RAISE EXCEPTION 'INVALID_PHOTO_PURPOSE'; END IF;
  -- Q-03 held: even a fixture cannot reclassify an existing progress source as snagging.
  IF NEW.purpose='snagging' AND EXISTS(SELECT 1 FROM app.job_site_source_receipt WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND evidence_id=NEW.evidence_id) THEN RAISE EXCEPTION 'INVALID_PHOTO_PURPOSE'; END IF;
 END IF;
 IF TG_TABLE_NAME='job_work_state_event' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||':'||NEW.job_id::text,144));
  IF NEW.sequence<>(SELECT coalesce(max(sequence),0)+1 FROM app.job_work_state_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'INVALID_WORK_SEQUENCE'; END IF;
  IF NEW.source_receipt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.job_site_source_receipt r WHERE (r.tenant_id,r.job_id,r.id,r.received_at,r.source_hash)=(NEW.tenant_id,NEW.job_id,NEW.source_receipt_id,NEW.fact_at,NEW.request_hash)) THEN RAISE EXCEPTION 'INVALID_WORK_SOURCE'; END IF;
  IF NEW.kind IN('finished_cancelled','reopened') THEN
   SELECT * INTO latest FROM app.job_work_state_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND kind IN(CASE WHEN NEW.kind='finished_cancelled' THEN 'finished_on_site' ELSE 'closed' END,NEW.kind) ORDER BY sequence DESC LIMIT 1;
   IF (NEW.kind='finished_cancelled' AND latest.fact_at>NEW.fact_at) OR latest.id IS DISTINCT FROM NEW.predecessor_id OR latest.kind IS DISTINCT FROM (CASE WHEN NEW.kind='finished_cancelled' THEN 'finished_on_site' ELSE 'closed' END) THEN RAISE EXCEPTION 'INVALID_WORK_PREDECESSOR'; END IF;
  END IF;
  IF NEW.kind IN('first_site_evidence','site_activity','resumed','finished_on_site') AND EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ch4_event_integrity BEFORE INSERT ON app.job_work_state_event FOR EACH ROW EXECUTE FUNCTION app.ch4_storage_integrity();
CREATE TRIGGER ch4_photo_integrity BEFORE INSERT ON app.job_photo_purpose FOR EACH ROW EXECUTE FUNCTION app.ch4_storage_integrity();
CREATE TRIGGER ch4_link_integrity BEFORE INSERT ON app.job_link FOR EACH ROW EXECUTE FUNCTION app.ch4_storage_integrity();


CREATE FUNCTION app.ch4_receipt_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT app.ch4_source_job(NEW.tenant_id,NEW.job_id) THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED'; END IF;
 IF NEW.source_kind='photo' THEN
  IF NOT EXISTS(SELECT 1 FROM app.evidence_object e JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
   WHERE (e.tenant_id,e.job_id,e.id,e.upload_id)=(NEW.tenant_id,NEW.job_id,NEW.evidence_id,NEW.upload_id) AND e.kind='original' AND u.state='verified' AND e.object_version_id=NEW.object_version_id AND u.object_version_id=NEW.object_version_id AND e.sha256=NEW.source_hash AND u.server_received_at=NEW.received_at AND e.byte_length>0)
  THEN RAISE EXCEPTION 'INVALID_WORK_SOURCE'; END IF;
 ELSIF NEW.source_kind='delivery_note' THEN
  IF NOT EXISTS(SELECT 1 FROM app.supplier_document d JOIN app.supplier_document_version v ON(v.tenant_id,v.job_id,v.document_id)=(d.tenant_id,d.job_id,d.id)
   WHERE (d.tenant_id,d.job_id,d.id,v.id)=(NEW.tenant_id,NEW.job_id,NEW.document_id,NEW.document_version_id) AND d.document_type='delivery' AND d.status='ready' AND v.parent_version_id IS NULL AND v.content_hash=NEW.source_hash AND d.created_at=NEW.received_at)
  THEN RAISE EXCEPTION 'INVALID_WORK_SOURCE'; END IF;
 ELSIF NEW.source_kind='goods_receipt' THEN
  IF NOT EXISTS(SELECT 1 FROM app.goods_receipt g JOIN app.supplier_document d ON(d.tenant_id,d.job_id,d.id)=(g.tenant_id,g.job_id,g.document_id)
   WHERE (g.tenant_id,g.job_id,g.id,g.document_id)=(NEW.tenant_id,NEW.job_id,NEW.goods_receipt_id,NEW.document_id) AND d.content_hash=NEW.source_hash AND NEW.received_at=CASE WHEN d.document_type='delivery' AND d.status='ready' THEN d.created_at ELSE g.created_at END)
   OR (NEW.document_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.supplier_document_version WHERE (tenant_id,job_id,document_id,id)=(NEW.tenant_id,NEW.job_id,NEW.document_id,NEW.document_version_id))) THEN RAISE EXCEPTION 'INVALID_WORK_SOURCE'; END IF;
 ELSIF NEW.source_kind='builder_extra' THEN
  IF NOT EXISTS(SELECT 1 FROM app.extra_origin o WHERE (o.tenant_id,o.job_id,o.variation_id)=(NEW.tenant_id,NEW.job_id,NEW.variation_id) AND o.kind='builder_logged' AND o.provenance='command' AND o.raising_membership_id=NEW.actor_membership_id AND o.source_capture_hash=NEW.source_hash AND o.server_recorded_at=NEW.received_at) THEN RAISE EXCEPTION 'INVALID_WORK_SOURCE'; END IF;
 ELSIF NEW.source_kind='stage_completion' THEN
  -- The composite FK checks the row/time/link even when source RLS hides it.
  IF NEW.source_hash IS DISTINCT FROM encode(sha256(convert_to(NEW.stage_completion_id::text||':'||NEW.stage_evidence_link_id::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'INVALID_WORK_SOURCE'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ch4_receipt_integrity BEFORE INSERT ON app.job_site_source_receipt FOR EACH ROW EXECUTE FUNCTION app.ch4_receipt_integrity();

-- One activity candidate per immutable received fact. The earliest qualifying candidate is a projection, never a rewritten row.
CREATE FUNCTION app.ch4_capture_site_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r app.job_site_source_receipt; evidence app.evidence_object; upload app.evidence_upload; doc app.supplier_document; ver app.supplier_document_version;
 actor uuid; marker app.job_work_state_event; seq bigint; prior_context text:=current_setting('app.tenant_id',true);
BEGIN
 -- Excluded billing/catch/office facts return BEFORE any business lock, including when their existing command already appended audit.
 IF TG_TABLE_NAME='evidence_object' THEN
  IF NEW.kind<>'original' OR NEW.evidence_type NOT IN('pre_cover_photo','completion_photo','excavation_photo','electrical_certificate') OR NEW.byte_length<=0 THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='extra_origin' THEN
  IF NEW.kind<>'builder_logged' OR NEW.provenance<>'command' OR NEW.job_track<>'small_builder' THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='supplier_document_version' THEN
  SELECT * INTO doc FROM app.supplier_document WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.document_id);
  IF doc.document_type<>'delivery' OR doc.status<>'ready' OR NEW.parent_version_id IS NOT NULL OR NEW.version<>1 THEN RETURN NEW; END IF;
 END IF;
 IF NOT app.ch4_source_job(NEW.tenant_id,NEW.job_id) THEN RETURN NEW; END IF;
 r.tenant_id:=NEW.tenant_id; r.job_id:=NEW.job_id; r.environment:='synthetic_demo'; r.provenance:='server_source'; r.version:='job-site-source-receipt.v1';
 IF TG_TABLE_NAME='evidence_object' THEN
  IF NEW.kind<>'original' OR NEW.evidence_type NOT IN('pre_cover_photo','completion_photo','excavation_photo','electrical_certificate') OR NEW.byte_length<=0 THEN RETURN NEW; END IF;
  SELECT * INTO upload FROM app.evidence_upload WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.upload_id) AND state='verified';
  IF upload.id IS NULL OR NEW.sha256<>upload.expected_sha256 OR NEW.object_version_id<>upload.object_version_id OR EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=NEW.tenant_id AND evidence_id=NEW.id) THEN RETURN NEW; END IF;
  IF EXISTS(SELECT 1 FROM app.job_photo_purpose WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND evidence_id=NEW.id AND purpose='snagging') THEN RETURN NEW; END IF;
  r.source_kind:='photo'; r.evidence_id:=NEW.id; r.upload_id:=NEW.upload_id; r.received_at:=upload.server_received_at; r.source_hash:=NEW.sha256; r.object_version_id:=NEW.object_version_id; r.fact_key:='photo:'||NEW.upload_id::text;
 ELSIF TG_TABLE_NAME='supplier_document_version' THEN
  SELECT * INTO doc FROM app.supplier_document WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.document_id);
  IF doc.document_type<>'delivery' OR doc.status<>'ready' OR NEW.parent_version_id IS NOT NULL OR NEW.version<>1 THEN RETURN NEW; END IF;
  r.source_kind:='delivery_note'; r.document_id:=doc.id; r.document_version_id:=NEW.id; r.received_at:=doc.created_at; r.source_hash:=NEW.content_hash; r.fact_key:='document:'||doc.id::text;
 ELSIF TG_TABLE_NAME='goods_receipt' THEN
  SELECT * INTO doc FROM app.supplier_document WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.document_id);
  SELECT * INTO ver FROM app.supplier_document_version WHERE (tenant_id,job_id,document_id)=(NEW.tenant_id,NEW.job_id,NEW.document_id) AND parent_version_id IS NULL ORDER BY version,id LIMIT 1;
  r.source_kind:='goods_receipt'; r.goods_receipt_id:=NEW.id; r.document_id:=NEW.document_id; r.document_version_id:=ver.id; r.received_at:=CASE WHEN doc.document_type='delivery' AND doc.status='ready' THEN doc.created_at ELSE NEW.created_at END; r.source_hash:=doc.content_hash; r.fact_key:='document:'||NEW.document_id::text;
 ELSIF TG_TABLE_NAME='extra_origin' THEN
  IF NEW.kind<>'builder_logged' OR NEW.provenance<>'command' THEN RETURN NEW; END IF;
  IF NOT EXISTS(SELECT 1 FROM app.command_receipt c JOIN app.membership m ON(m.tenant_id,m.id)=(c.tenant_id,c.actor_membership_id) WHERE c.tenant_id=NEW.tenant_id AND c.command_id=NEW.command_id AND c.command_type='LogBuilderExtra' AND m.id=NEW.raising_membership_id AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  r.source_kind:='builder_extra'; r.variation_id:=NEW.variation_id; r.extra_track:='small_builder'; r.extra_kind:='builder_logged'; r.received_at:=NEW.server_recorded_at; r.source_hash:=NEW.source_capture_hash; r.fact_key:='builder_extra:'||NEW.variation_id::text; r.actor_membership_id:=NEW.raising_membership_id; r.provenance:='source_command';
 ELSIF TG_TABLE_NAME='stage_completion' THEN
  SELECT c.actor_membership_id INTO actor FROM app.command_receipt c WHERE c.tenant_id=NEW.tenant_id AND c.command_id=NEW.command_id AND c.command_type='proof.complete';
  IF actor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=NEW.tenant_id AND id=actor AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  r.source_kind:='stage_completion'; r.stage_completion_id:=NEW.id; r.stage_evidence_link_id:=NEW.evidence_link_id; r.received_at:=NEW.completed_at; r.source_hash:=encode(sha256(convert_to(NEW.id::text||':'||NEW.evidence_link_id::text,'UTF8')),'hex'); r.fact_key:='stage_completion:'||NEW.id::text; r.actor_membership_id:=actor;
 ELSE RETURN NEW;
 END IF;
 IF r.actor_membership_id IS NULL THEN
  SELECT auth.membership_id INTO r.actor_membership_id FROM app.job job CROSS JOIN LATERAL app.authenticate_practice_session(job.practice_session_digest,job.tenant_id) auth WHERE job.tenant_id=r.tenant_id AND job.id=r.job_id AND job.practice_session_digest IS NOT NULL;
  IF r.actor_membership_id IS NOT NULL THEN r.provenance:='source_command'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(r.tenant_id::text||':'||r.job_id::text,144));
 IF EXISTS(SELECT 1 FROM app.job_site_source_receipt WHERE tenant_id=r.tenant_id AND job_id=r.job_id AND fact_key=r.fact_key) THEN RETURN NEW; END IF;
 r.id:=app.ch4_fact_id(r.tenant_id::text||':'||r.job_id::text||':'||r.fact_key); r.recorded_at:=clock_timestamp();
 INSERT INTO app.job_site_source_receipt SELECT r.*;
 SELECT coalesce(max(sequence),0) INTO seq FROM app.job_work_state_event WHERE tenant_id=r.tenant_id AND job_id=r.job_id;
 SELECT * INTO marker FROM app.job_work_state_event WHERE tenant_id=r.tenant_id AND job_id=r.job_id AND kind IN('finished_on_site','finished_cancelled') ORDER BY sequence DESC LIMIT 1;
 IF marker.kind='finished_on_site' AND (r.received_at>marker.fact_at OR (r.received_at=marker.fact_at AND r.id>marker.id)) THEN
  seq:=seq+1;
  INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,actor_membership_id,source_receipt_id,predecessor_id,request_hash,audit_event_id)
   VALUES(r.tenant_id,r.job_id,app.ch4_fact_id(r.id::text||':cancel'),seq,'finished_cancelled',r.received_at,r.actor_membership_id,r.id,marker.id,r.source_hash,app.ch4_fact_id(r.id::text||':cancel:audit'));
 END IF;
 INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,actor_membership_id,source_receipt_id,request_hash,audit_event_id)
 VALUES(r.tenant_id,r.job_id,r.id,seq+1,CASE WHEN r.source_kind IN('photo','delivery_note','goods_receipt') THEN 'first_site_evidence' ELSE 'site_activity' END,r.received_at,r.actor_membership_id,r.id,r.source_hash,app.ch4_fact_id(r.id::text||':audit'));
 RETURN NEW;
END $$;
CREATE TRIGGER ch4_photo_received AFTER INSERT ON app.evidence_object FOR EACH ROW EXECUTE FUNCTION app.ch4_capture_site_source();
CREATE TRIGGER ch4_delivery_received AFTER INSERT ON app.supplier_document_version FOR EACH ROW EXECUTE FUNCTION app.ch4_capture_site_source();
CREATE TRIGGER ch4_goods_received AFTER INSERT ON app.goods_receipt FOR EACH ROW EXECUTE FUNCTION app.ch4_capture_site_source();
CREATE TRIGGER ch4_capture_received AFTER INSERT ON app.extra_origin FOR EACH ROW EXECUTE FUNCTION app.ch4_capture_site_source();
CREATE TRIGGER ch4_stage_received AFTER INSERT ON app.stage_completion FOR EACH ROW EXECUTE FUNCTION app.ch4_capture_site_source();
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['purchase_order_draft','purchase_order_revision','purchase_order_placement','supplier_document','supplier_document_intake','evidence_link','evidence_upload','evidence_object','variation','stage_completion'] LOOP
  EXECUTE format('CREATE TRIGGER "A1_ch4_new_work" BEFORE INSERT ON app.%I FOR EACH ROW EXECUTE FUNCTION app.ch4_guard_new_site_work()',n);
 END LOOP;
END $$;
CREATE TRIGGER "A1_ch4_verify_new_work" BEFORE UPDATE ON app.evidence_upload FOR EACH ROW EXECUTE FUNCTION app.ch4_guard_new_site_work();
CREATE TRIGGER "A1_ch4_stage_work" BEFORE UPDATE ON app.scope_progress FOR EACH ROW EXECUTE FUNCTION app.ch4_guard_new_site_work();

-- Rechecks existing source permission with plain reads only, including after an audit-head wait.
CREATE FUNCTION app.ch4_recheck_source_actor(t uuid,j uuid,rid uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE receipt app.job_site_source_receipt; owner_digest text;
BEGIN
 SELECT * INTO receipt FROM app.job_site_source_receipt WHERE (tenant_id,job_id,id)=(t,j,rid);
 IF receipt.id IS NULL THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT practice_session_digest INTO owner_digest FROM app.job WHERE tenant_id=t AND id=j;
 IF owner_digest IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(owner_digest,t)) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF receipt.actor_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=receipt.actor_membership_id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) AND (receipt.source_kind<>'builder_extra' OR role='owner')) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;

-- Audit is deferred until all source-command business locks have been acquired. No business lock is acquired here.
CREATE FUNCTION app.ch4_append_fact_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=NEW.tenant_id; seq bigint; prev text; ts timestamptz; payload jsonb; ph text; eh text; actor text; typ text; subject uuid;
 old_context text:=current_setting('app.tenant_id',true);
BEGIN
 PERFORM set_config('app.tenant_id',t::text,true);
 actor:=CASE WHEN NEW.actor_membership_id IS NULL THEN 'system:site-source' ELSE 'membership:'||NEW.actor_membership_id::text END;
 IF TG_TABLE_NAME='job_link' THEN typ:='job.work_state.linked'; subject:=NEW.predecessor_job_id; payload:=jsonb_build_object('references',jsonb_build_object('linkId',NEW.id,'successorJobId',NEW.successor_job_id),'hashes',jsonb_build_object('request',NEW.request_hash));
 ELSE typ:='job.work_state.'||NEW.kind; subject:=NEW.job_id; payload:=jsonb_build_object('references',jsonb_build_object('eventId',NEW.id,'jobId',NEW.job_id),'hashes',jsonb_build_object('request',NEW.request_hash)); END IF;
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head(); seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp()); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,actor,typ,'job',subject::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash) VALUES(NEW.audit_event_id,t,seq,'audit.v1',actor,typ,'job',subject::text,ts,payload,ph,prev,eh);
 IF TG_TABLE_NAME='job_work_state_event' THEN IF NEW.source_receipt_id IS NOT NULL THEN PERFORM app.ch4_recheck_source_actor(t,NEW.job_id,NEW.source_receipt_id); END IF; END IF;
 PERFORM app.advance_audit_head(seq,eh); PERFORM set_config('app.tenant_id',coalesce(old_context,''),true); RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER "A0_ch4_event_audit" AFTER INSERT ON app.job_work_state_event DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ch4_append_fact_audit();
CREATE CONSTRAINT TRIGGER "A0_ch4_link_audit" AFTER INSERT ON app.job_link DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.ch4_append_fact_audit();
ALTER TABLE app.job_work_state_event ADD FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE app.job_link ADD FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;

-- Only new lock/new pending-run admission is gated. Earlier/running/completed consequences remain held under Q-01.
CREATE FUNCTION app.ch4_guard_final_check_admission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE latest text; old_context text:=current_setting('app.tenant_id',true);
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM nullif(old_context,'')::uuid AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname=session_user) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 -- NEW has different row types on these two tables. A combined AND expression
 -- still resolves the missing status field on final_account_lock.
 IF TG_TABLE_NAME='final_account_lock_check' THEN
  IF NEW.status<>'pending' THEN PERFORM set_config('app.tenant_id',coalesce(old_context,''),true); RETURN NEW; END IF;
 END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id FOR UPDATE;
 SELECT kind INTO latest FROM app.job_work_state_event WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND kind IN('closed','reopened') ORDER BY sequence DESC LIMIT 1;
 IF latest='closed' THEN RAISE EXCEPTION 'JOB_WORK_CLOSED'; END IF;
 PERFORM set_config('app.tenant_id',coalesce(old_context,''),true); RETURN NEW;
END $$;
CREATE TRIGGER "A0_ch4_lock_admission" BEFORE INSERT ON app.final_account_lock FOR EACH ROW EXECUTE FUNCTION app.ch4_guard_final_check_admission();
CREATE TRIGGER "A0_ch4_check_admission" BEFORE INSERT ON app.final_account_lock_check FOR EACH ROW EXECUTE FUNCTION app.ch4_guard_final_check_admission();

CREATE FUNCTION app.ch4_read_work_facts(t uuid,j uuid,digest text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE events jsonb; links jsonb; lock jsonb;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t)) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(WITH RECURSIVE owned(id) AS(
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
  UNION SELECT job.id FROM owned source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
   JOIN app.job job ON job.tenant_id=e.tenant_id AND job.id::text=e.subject_ref AND job.provenance='imported' AND job.practice_session_digest IS NULL
 ) SELECT 1 FROM owned JOIN app.job_commercial_track track ON track.tenant_id=t AND track.job_id=owned.id WHERE owned.id=j AND track.job_track='small_builder' AND track.environment='synthetic_demo') THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'id',id,'jobId',job_id,'sequence',sequence,'kind',kind,'factAt',to_char(fact_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'recordedAt',to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sourceReceiptId',source_receipt_id,'commandId',command_id,'predecessorId',predecessor_id,'closeReason',close_reason,'closeNote',close_note) ORDER BY fact_at,id),'[]') INTO events FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j;
 SELECT jsonb_build_object('id',id,'lockedAt',to_char(locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) INTO lock FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'predecessorJobId',l.predecessor_job_id,'successorJobId',l.successor_job_id,'linkedAt',to_char(l.linked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY l.linked_at,l.id),'[]') INTO links FROM app.job_link l JOIN app.job predecessor ON predecessor.tenant_id=t AND predecessor.id=l.predecessor_job_id JOIN app.job successor ON successor.tenant_id=t AND successor.id=l.successor_job_id WHERE l.tenant_id=t AND (l.predecessor_job_id=j OR l.successor_job_id=j) AND predecessor.practice_session_digest=digest AND successor.practice_session_digest=digest;
 RETURN jsonb_build_object('version','job-work-state-read.v1','jobId',j,'events',events,'links',links,'lock',lock,'environment','synthetic_demo','realExternalActions',0);
END $$;
DO $$ DECLARE fn regprocedure; BEGIN
 FOR fn IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname IN('ch4_fact_id','ch4_source_job','ch4_recheck_source_actor','ch4_receipt_integrity','ch4_guard_new_site_work','ch4_storage_integrity','ch4_capture_site_source','ch4_append_fact_audit','ch4_guard_final_check_admission','ch4_read_work_facts') LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',fn);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access',fn);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.ch4_read_work_facts(uuid,uuid,text) TO jobguard_runtime;
COMMIT;
