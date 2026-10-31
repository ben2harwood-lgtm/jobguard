BEGIN;
-- SV-7A / CH-4: on-site diary evidence, using MON-1 0380 admission.
-- Latest predecessors: intake 0303, receipt integrity 0144, capture 0144 + 0380.
-- Preserve both existing source-kind checks and every other source shape.
DO $$ DECLARE c record; n integer:=0; BEGIN
 FOR c IN SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint
  WHERE conrelid='app.job_site_source_receipt'::regclass AND contype='c'
   AND pg_get_constraintdef(oid) LIKE '%source_kind%' AND pg_get_constraintdef(oid) LIKE '%''photo''%'
 LOOP
  EXECUTE format('ALTER TABLE app.job_site_source_receipt DROP CONSTRAINT %I',c.conname);
  EXECUTE format('ALTER TABLE app.job_site_source_receipt ADD CONSTRAINT %I CHECK ((%s) OR
   (source_kind=''diary'' AND object_version_id IS NOT NULL AND length(object_version_id)>0
    AND evidence_id IS NOT NULL AND upload_id IS NOT NULL AND actor_membership_id IS NOT NULL
    AND provenance=''source_command'' AND document_id IS NULL AND document_version_id IS NULL
    AND goods_receipt_id IS NULL AND variation_id IS NULL AND stage_completion_id IS NULL
    AND extra_track IS NULL AND extra_kind IS NULL))',c.conname,substr(c.definition,7));
  n:=n+1;
 END LOOP;
 IF n<>2 THEN RAISE EXCEPTION 'unexpected CH4 source constraints'; END IF;
END $$;

CREATE OR REPLACE FUNCTION app.ch4_receipt_integrity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT app.ch4_source_job(NEW.tenant_id,NEW.job_id) THEN RAISE EXCEPTION 'SYNTHETIC_MODE_REQUIRED'; END IF;
 IF NEW.source_kind='diary' THEN
  IF NOT EXISTS(SELECT 1 FROM app.job_diary_entry d
   JOIN app.evidence_object e ON(e.tenant_id,e.job_id,e.id)=(d.tenant_id,d.job_id,d.evidence_id)
   JOIN app.evidence_upload u ON(u.tenant_id,u.job_id,u.id)=(e.tenant_id,e.job_id,e.upload_id)
   WHERE (d.tenant_id,d.job_id,d.evidence_id,d.object_version_id,d.sha256,d.source_received_at,d.actor_membership_id)
    =(NEW.tenant_id,NEW.job_id,NEW.evidence_id,NEW.object_version_id,NEW.source_hash,NEW.received_at,NEW.actor_membership_id)
    AND d.on_site AND NEW.fact_key='diary:'||d.id::text AND NEW.provenance='source_command'
    AND e.kind='original' AND e.evidence_type='job_diary_text' AND e.byte_length>0
    AND e.sha256=NEW.source_hash AND e.object_version_id=NEW.object_version_id AND e.server_received_at=NEW.received_at
    AND u.id=NEW.upload_id AND u.state='verified' AND u.expected_sha256=NEW.source_hash
    AND u.object_version_id=NEW.object_version_id AND u.server_received_at=NEW.received_at
    AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=NEW.tenant_id AND evidence_id=NEW.evidence_id))
  THEN RAISE EXCEPTION 'INVALID_WORK_SOURCE'; END IF;
 ELSIF NEW.source_kind='photo' THEN
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

CREATE OR REPLACE FUNCTION app.ch4_capture_site_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r app.job_site_source_receipt; evidence app.evidence_object; upload app.evidence_upload; doc app.supplier_document; ver app.supplier_document_version;
 actor uuid; marker app.job_work_state_event; seq bigint; prior_context text:=current_setting('app.tenant_id',true);
BEGIN
 -- Excluded billing/catch/office facts return BEFORE any business lock, including when their existing command already appended audit.
 IF TG_TABLE_NAME='job_diary_entry' THEN
  IF NOT NEW.on_site THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='evidence_object' THEN
  IF NEW.kind<>'original' OR NEW.evidence_type NOT IN('pre_cover_photo','completion_photo','excavation_photo','electrical_certificate') OR NEW.byte_length<=0 THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='extra_origin' THEN
  IF NEW.kind<>'builder_logged' OR NEW.provenance<>'command' OR NEW.job_track<>'small_builder' THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='supplier_document_version' THEN
  SELECT * INTO doc FROM app.supplier_document WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.document_id);
  IF doc.document_type<>'delivery' OR doc.status<>'ready' OR NEW.parent_version_id IS NOT NULL OR NEW.version<>1 THEN RETURN NEW; END IF;
 END IF;
 IF NOT app.ch4_source_job(NEW.tenant_id,NEW.job_id) THEN RETURN NEW; END IF;
 r.tenant_id:=NEW.tenant_id; r.job_id:=NEW.job_id; r.environment:='synthetic_demo'; r.provenance:='server_source'; r.version:='job-site-source-receipt.v1';
 IF TG_TABLE_NAME='job_diary_entry' THEN
  r.source_kind:='diary'; r.evidence_id:=NEW.evidence_id;
  SELECT upload_id INTO r.upload_id FROM app.evidence_object WHERE (tenant_id,job_id,id)=(NEW.tenant_id,NEW.job_id,NEW.evidence_id);
  r.received_at:=NEW.source_received_at; r.source_hash:=NEW.sha256; r.object_version_id:=NEW.object_version_id;
  r.fact_key:='diary:'||NEW.id::text; r.actor_membership_id:=NEW.actor_membership_id; r.provenance:='source_command';
 ELSIF TG_TABLE_NAME='evidence_object' THEN
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
 PERFORM pg_advisory_xact_lock(hashtextextended(r.tenant_id::text,184));
 IF r.source_kind='diary' THEN PERFORM app.ch4_admit_place(r.tenant_id,r.job_id,'restart'); END IF;
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
 VALUES(r.tenant_id,r.job_id,r.id,seq+1,CASE WHEN r.source_kind IN('photo','delivery_note','goods_receipt','diary') THEN 'first_site_evidence' ELSE 'site_activity' END,r.received_at,r.actor_membership_id,r.id,r.source_hash,app.ch4_fact_id(r.id::text||':audit'));
 RETURN NEW;
END $$;
CREATE TRIGGER ch4_diary_received AFTER INSERT ON app.job_diary_entry FOR EACH ROW EXECUTE FUNCTION app.ch4_capture_site_source();

CREATE OR REPLACE FUNCTION app.sv7a_intake_job_source(t uuid,j uuid,digest text,source text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; cid uuid; request_digest text; prior app.command_receipt; allowed text[]; txt text; raw bytea; h text;
 sid uuid:=gen_random_uuid(); ev uuid:=gen_random_uuid(); ver text:=gen_random_uuid()::text; audit_id uuid:=gen_random_uuid();
 at_time timestamptz; ref text; okey text; ctype text; rec_json jsonb; out_result jsonb;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Strict versioned shape; server selects tenant, actor, time, hashes and fixture reference.
 IF source IS NULL OR source NOT IN('diary','customer_message') OR jsonb_typeof(input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END IF;
 allowed:=CASE WHEN source='diary' THEN ARRAY['version','commandId','entryMode','onSite','text'] ELSE ARRAY['version','commandId','fictionalCustomer','text'] END;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(input) k WHERE NOT k=ANY(allowed)) OR EXISTS(SELECT 1 FROM unnest(allowed) k WHERE NOT input ? k)
  OR input->>'version' IS DISTINCT FROM (CASE WHEN source='diary' THEN 'job-diary-input.v1' ELSE 'customer-message-input.v1' END)
  OR jsonb_typeof(input->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(input->'text') IS DISTINCT FROM 'string'
  OR (source='diary' AND (input->>'entryMode' IS NULL OR input->>'entryMode' NOT IN('typed','dictated_text') OR jsonb_typeof(input->'onSite') IS DISTINCT FROM 'boolean'))
  OR (source='customer_message' AND (jsonb_typeof(input->'fictionalCustomer') IS DISTINCT FROM 'object'
   OR (SELECT count(*) FROM jsonb_object_keys(input->'fictionalCustomer'))<>2 OR input->'fictionalCustomer'->>'kind' IS DISTINCT FROM 'named_fictional_customer'
   OR jsonb_typeof(input->'fictionalCustomer'->'name') IS DISTINCT FROM 'string' OR length(btrim(input->'fictionalCustomer'->>'name')) NOT BETWEEN 1 AND 160 OR char_length(input->'fictionalCustomer'->>'name')>160))
 THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END IF;
 txt:=input->>'text';
 IF char_length(txt) NOT BETWEEN 1 AND 8000 OR octet_length(convert_to(txt,'UTF8'))>32000 OR length(btrim(txt,E' \t\r\n'))=0 THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END IF;
 BEGIN cid:=(input->>'commandId')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT'; END;
 ctype:=CASE WHEN source='diary' THEN 'JobSource.diary' ELSE 'JobSource.customer_message' END;
 -- Authority before any informative read; rechecked after every wait (same seam as CH-4 commands).
 BEGIN actor:=app.ch4_require_command_owner(t,j,digest); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 -- Evidence registration holds SHARE on the job, matching the merged watchdog live guard.
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||t::text||':'||cid::text,0));
 BEGIN actor:=app.ch4_require_command_owner(t,j,digest); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 request_digest:=app.final_lock_hash(jsonb_build_object('jobId',j,'actor',actor,'sessionDigest',digest,'source',source,'input',input));
 IF EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND command_id=cid AND (job_id<>j OR command_type<>ctype OR request_hash<>request_digest))
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.command_type IS DISTINCT FROM ctype OR prior.request_hash IS DISTINCT FROM request_digest OR prior.actor_membership_id IS DISTINCT FROM actor OR prior.status<>'succeeded' THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 -- New writes only below. Holds precede every effect.
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 PERFORM app.require_watchdog_live(j);
 IF source='diary' AND (input->>'onSite')::boolean THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
  PERFORM app.ch4_require_open(t,j);
  PERFORM app.ch4_admit_place(t,j,'restart');
 END IF;
 IF app.ch4_legacy_command_owned(t,cid) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id)
 VALUES(t,cid,ctype,cid::text,request_digest,'processing',actor);
 INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash) VALUES(t,cid,j,ctype,request_digest);
 at_time:=clock_timestamp(); raw:=convert_to(txt,'UTF8'); h:=encode(pg_catalog.sha256(raw),'hex'); okey:='synthetic/job-sources/'||sid::text;
 -- Only the reviewed fictional originals carry a decoder reference; exact text and kind, chosen by the server.
 ref:=CASE WHEN source='diary' AND txt='Fitted outside tap.' THEN 'job-source:outside-tap.v1' WHEN source='customer_message' AND txt='Please fit an outside tap.' THEN 'job-source:request-tap.v1' END;
 INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
 VALUES(ev,t,j,okey,h,'text/plain; charset=utf-8',32000,'standard_evidence',at_time+interval '1 day','verified',ver,at_time,clock_timestamp());
 INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
 VALUES(ev,t,ev,j,'original',CASE WHEN source='diary' THEN 'job_diary_text' ELSE 'customer_message_text' END,okey,ver,h,octet_length(raw),'text/plain; charset=utf-8','standard_evidence',at_time,clock_timestamp());
 INSERT INTO app.job_source_original(tenant_id,job_id,evidence_id,source_kind,source_id,object_key,object_version_id,bytes,sha256,byte_length,source_received_at,verified_at,synthetic_fixture_ref)
 VALUES(t,j,ev,source,sid,okey,ver,raw,h,octet_length(raw),at_time,clock_timestamp(),ref);
 IF source='diary' THEN
  INSERT INTO app.job_diary_entry(tenant_id,job_id,id,command_id,actor_membership_id,entry_mode,on_site,evidence_id,object_version_id,sha256,source_received_at)
  VALUES(t,j,sid,cid,actor,input->>'entryMode',(input->>'onSite')::boolean,ev,ver,h,at_time);
 ELSE
  INSERT INTO app.customer_message_source(tenant_id,job_id,id,command_id,actor_membership_id,fictional_role_name,evidence_id,object_version_id,sha256,source_received_at)
  VALUES(t,j,sid,cid,actor,input->'fictionalCustomer'->>'name',ev,ver,h,at_time);
 END IF;
 rec_json:=jsonb_build_object('id',sid,'commandId',cid,'text',txt,'actualTesterMembershipId',actor,
  'evidence',jsonb_build_object('id',ev,'objectVersionId',ver,'sha256',h,'serverReceivedAt',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
  ||CASE WHEN source='diary' THEN jsonb_build_object('entryMode',input->>'entryMode','onSite',(input->>'onSite')::boolean)
   ELSE jsonb_build_object('fictionalCustomer',jsonb_build_object('kind','named_fictional_customer','name',input->'fictionalCustomer'->>'name')) END;
 out_result:=jsonb_build_object('version','job-source-intake-receipt.v1','jobId',j,'sourceKind',source,'record',rec_json,'environment','synthetic_demo','realExternalActions',0)
  ||CASE WHEN source='diary' THEN jsonb_build_object('notice','Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.','noticeVersion','job-diary-notice.v1') ELSE '{}'::jsonb END;
 -- Identifiers and hashes only in the audit chain; never the note text.
 -- Same per-tenant chain as other lock/check events; this helper takes any event type (append_final_lock_audit allows only four).
 PERFORM app.append_final_check_audit(audit_id,'membership:'||actor::text,j,CASE WHEN source='diary' THEN 'job_source.diary_recorded' ELSE 'job_source.customer_message_recorded' END,
  jsonb_build_object('commandId',cid,'sourceId',sid,'evidenceId',ev,'sha256',h));
 UPDATE app.command_receipt SET status='succeeded',result=out_result,completed_at=clock_timestamp() WHERE tenant_id=t AND command_id=cid;
 BEGIN PERFORM app.ch4_require_command_owner(t,j,digest); EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END;
 RETURN out_result;
END $$;
COMMIT;
