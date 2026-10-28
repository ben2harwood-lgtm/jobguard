BEGIN;
-- SV-7A intake writer: one checked routine for off-site diary notes and owner-entered fictional
-- customer messages on live, unlocked synthetic small-builder jobs. Safest synthetic choices
-- (Ben, 23 Oct): an on-site note is first site evidence and waits for MON-1 place admission, so it
-- is refused like "resume"; any new source after the final-account lock gets the linked-job refusal.
-- No shadow table is read or written and no detection is scheduled from here.
-- Extend only the existing command-identity kind list (last set in 0201), keeping every value.
ALTER TABLE app.watchdog_command_identity DROP CONSTRAINT watchdog_command_identity_command_type_check;
ALTER TABLE app.watchdog_command_identity ADD CONSTRAINT watchdog_command_identity_command_type_check CHECK(command_type IN(
 'readiness.record','readiness.advance','things_to_check.evaluate','things_to_check.review','things_to_check.supersede',
 'supplier_match.create','supplier_match.correct','inbox.seed','inbox.dismiss','purchase_order.revise','purchase_order.place',
 'supplier_document.intake','supplier_document.receipt','supplier_document.confirm','evidence.begin_upload','evidence.finalize','proof.complete',
 'WorkState.finish','WorkState.cancel_finish','WorkState.close','WorkState.reopen','WorkState.link',
 'JobSource.diary','JobSource.customer_message'));
CREATE FUNCTION app.sv7a_intake_job_source(t uuid,j uuid,digest text,source text,input jsonb) RETURNS jsonb
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
 IF source='diary' AND (input->>'onSite')::boolean THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 PERFORM app.require_watchdog_live(j);
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
  VALUES(t,j,sid,cid,actor,input->>'entryMode',false,ev,ver,h,at_time);
 ELSE
  INSERT INTO app.customer_message_source(tenant_id,job_id,id,command_id,actor_membership_id,fictional_role_name,evidence_id,object_version_id,sha256,source_received_at)
  VALUES(t,j,sid,cid,actor,input->'fictionalCustomer'->>'name',ev,ver,h,at_time);
 END IF;
 rec_json:=jsonb_build_object('id',sid,'commandId',cid,'text',txt,'actualTesterMembershipId',actor,
  'evidence',jsonb_build_object('id',ev,'objectVersionId',ver,'sha256',h,'serverReceivedAt',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
  ||CASE WHEN source='diary' THEN jsonb_build_object('entryMode',input->>'entryMode','onSite',false)
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
ALTER FUNCTION app.sv7a_intake_job_source(uuid,uuid,text,text,jsonb) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.sv7a_intake_job_source(uuid,uuid,text,text,jsonb) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.sv7a_intake_job_source(uuid,uuid,text,text,jsonb) TO jobguard_runtime;
COMMIT;
