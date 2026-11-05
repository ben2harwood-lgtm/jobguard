BEGIN;
-- Customer authority is disjoint from member authority. No existing row gains columns.
ALTER TABLE control_plane.request_binding DROP CONSTRAINT request_binding_credential_kind_check;
ALTER TABLE control_plane.request_binding ADD CONSTRAINT request_binding_credential_kind_check
 CHECK(credential_kind IN('real','practice','contractor_practice','customer'));

-- Existing resolver retains the sign-in/revoke/party lock order and synthetic gate.
CREATE FUNCTION app.lp6_customer_authority(t uuid,j uuid,c uuid,digest text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE s app.customer_portal_session; sponsor uuid;
BEGIN
 PERFORM identity.customer_portal_use(t,j,c,digest,NULL,'resolve');
 SELECT * INTO s FROM app.customer_portal_session WHERE tenant_id=t AND job_id=j AND customer_id=c AND token_digest=digest;
 SELECT issuer_membership_id INTO sponsor FROM app.customer_portal_grant WHERE tenant_id=t AND id=s.grant_id;
 IF s.id IS NULL OR sponsor IS NULL THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('sessionId',s.id,'sponsorMembershipId',sponsor,'expiresAt',s.expires_at);
END $$;
ALTER FUNCTION app.lp6_customer_authority(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp6_customer_authority(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.lp6_customer_authority(uuid,uuid,uuid,text) TO jobguard_binding_owner;
GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;
CREATE FUNCTION app.bind_customer_request(t uuid,j uuid,c uuid,digest text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE authority jsonb; previous control_plane.request_binding;
 environment_key text:=extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_database d WHERE d.datname=current_database());
 request_xid xid8:=pg_current_xact_id(); ref text;
BEGIN
 authority:=app.lp6_customer_authority(t,j,c,digest);
 ref:=(authority->>'sessionId')||':'||j::text;
 SELECT * INTO previous FROM control_plane.request_binding WHERE environment_id=environment_key AND transaction_id=request_xid;
 IF FOUND THEN
  IF (previous.credential_kind,previous.session_ref,previous.tenant_id,previous.actor_id)
   IS DISTINCT FROM ('customer',ref,t,c) THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 ELSE
  INSERT INTO control_plane.request_binding(environment_id,transaction_id,credential_kind,session_ref,tenant_id,actor_id,expires_at)
   VALUES(environment_key,request_xid,'customer',ref,t,c,(authority->>'expiresAt')::timestamptz);
 END IF;
 RETURN authority;
END $$;
ALTER FUNCTION app.bind_customer_request(uuid,uuid,uuid,text) OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.bind_customer_request(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.bind_customer_request(uuid,uuid,uuid,text) TO jobguard_migration;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;
CREATE OR REPLACE FUNCTION app.lp6_bound_request() RETURNS control_plane.request_binding
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE bound control_plane.request_binding;
BEGIN
 SELECT * INTO bound FROM control_plane.request_binding b
  WHERE b.environment_id=(extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database())) AND b.transaction_id=pg_current_xact_id_if_assigned();
 IF NOT FOUND OR bound.credential_kind='customer' OR bound.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
 RETURN bound;
END $$;

-- Separate immutable receipt/source: a customer never occupies a member actor column.
CREATE TABLE app.customer_portal_message_record (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, id uuid NOT NULL, command_id uuid NOT NULL,
 customer_id uuid NOT NULL, session_id uuid NOT NULL, sponsor_membership_id uuid NOT NULL,
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'), result jsonb NOT NULL,
 evidence_id uuid NOT NULL, object_version_id varchar(300) NOT NULL, sha256 char(64) NOT NULL,
 source_received_at timestamptz NOT NULL, bytes bytea NOT NULL,
 synthetic_fixture_ref varchar(160),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,session_id) REFERENCES app.customer_portal_session(tenant_id,id),
 FOREIGN KEY(tenant_id,sponsor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id,object_version_id,sha256,source_received_at)
 REFERENCES app.evidence_object(tenant_id,job_id,id,object_version_id,sha256,server_received_at),
 CHECK((result->'record'->'customerActor'->>'kind') IS NOT DISTINCT FROM 'customer'
 AND (result->'record'->'customerActor'->>'customerId') IS NOT DISTINCT FROM customer_id::text
 AND (result->'record'->'customerActor'->>'sessionId') IS NOT DISTINCT FROM session_id::text
 AND (result->>'jobId') IS NOT DISTINCT FROM job_id::text
 AND (result->'record'->>'id') IS NOT DISTINCT FROM id::text
 AND (result->'record'->>'commandId') IS NOT DISTINCT FROM command_id::text
 AND (result->'record'->>'text') IS NOT DISTINCT FROM convert_from(bytes,'UTF8')
 AND NOT (result->'record' ? 'actualTesterMembershipId')),
 CHECK(octet_length(bytes) BETWEEN 1 AND 32000 AND char_length(convert_from(bytes,'UTF8')) BETWEEN 1 AND 8000
 AND length(btrim(convert_from(bytes,'UTF8'),E' \t\r\n'))>0 AND sha256=encode(sha256(bytes),'hex'))
);
ALTER TABLE app.customer_portal_message_record OWNER TO jobguard_migration;
ALTER TABLE app.customer_portal_message_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.customer_portal_message_record FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.customer_portal_message_record FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.customer_portal_message_record FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT SELECT ON app.customer_portal_message_record TO jobguard_runtime;
CREATE TRIGGER customer_message_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.customer_portal_message_record
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

CREATE OR REPLACE FUNCTION identity.customer_portal_message(t uuid,j uuid,c uuid,digest text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE authority jsonb; prior app.customer_portal_message_record; cid uuid; h text; txt text; raw bytea;
 sid uuid:=gen_random_uuid(); ev uuid:=gen_random_uuid(); ver text:=gen_random_uuid()::text;
 at_time timestamptz; key text; content_hash text; result jsonb; ref text;
BEGIN
 -- First operation: verified customer binding, before input/history/business locks.
 authority:=app.bind_customer_request(t,j,c,digest);
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR input->>'version' IS DISTINCT FROM 'customer-portal-message.v1'
 OR (SELECT count(*) FROM jsonb_object_keys(input))<>4 OR NOT input ?& ARRAY['version','jobId','commandId','text']
 OR input->>'jobId' IS DISTINCT FROM j::text OR jsonb_typeof(input->'commandId') IS DISTINCT FROM 'string'
 OR jsonb_typeof(input->'text') IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 BEGIN cid:=(input->>'commandId')::uuid; EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END;
 txt:=input->>'text'; raw:=convert_to(txt,'UTF8');
 IF char_length(txt) NOT BETWEEN 1 AND 8000 OR octet_length(raw)>32000 OR length(btrim(txt,E' \t\r\n'))=0 THEN
  RAISE EXCEPTION 'INVALID_JOB_SOURCE_INPUT' USING ERRCODE='22023'; END IF;
 h:=encode(sha256(convert_to(jsonb_build_object('tenant',t,'job',j,'customer',c,'session',authority->>'sessionId','input',input)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('watchdog-command-id:'||t::text||':'||cid::text,0));
 authority:=app.bind_customer_request(t,j,c,digest);
 SELECT * INTO prior FROM app.customer_portal_message_record WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN
  IF prior.request_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 IF EXISTS(SELECT 1 FROM app.watchdog_command_identity WHERE tenant_id=t AND command_id=cid)
 OR EXISTS(SELECT 1 FROM app.command_receipt WHERE tenant_id=t AND command_id=cid)
 OR app.ch4_legacy_command_owned(t,cid) THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RAISE EXCEPTION 'POST_LOCK_WORK_REQUIRES_LINKED_JOB'; END IF;
 -- Same lifecycle check as the member writer, without borrowing member authority.
 IF NOT EXISTS(SELECT 1 FROM app.job x JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(x.tenant_id,x.id)
 WHERE x.tenant_id=t AND x.id=j AND x.status='live' AND tr.job_track='small_builder' AND tr.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'JOB_NOT_LIVE'; END IF;
 INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash) VALUES(t,cid,j,'JobSource.customer_message',h);
 at_time:=clock_timestamp(); content_hash:=encode(sha256(raw),'hex'); key:='synthetic/job-sources/'||sid::text;
 ref:=CASE WHEN txt='Please fit an outside tap.' THEN 'job-source:request-tap.v1'
 WHEN txt='There are exposed live wires beside the new socket.' THEN 'customer-message:exposed-wires.synthetic.v1' END;
 INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_received_at,server_verified_at)
 VALUES(ev,t,j,key,content_hash,'text/plain; charset=utf-8',32000,'standard_evidence',at_time+interval '1 day','verified',ver,at_time,clock_timestamp());
 INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
 VALUES(ev,t,ev,j,'original','customer_message_text',key,ver,content_hash,octet_length(raw),'text/plain; charset=utf-8','standard_evidence',at_time,clock_timestamp());
 result:=jsonb_build_object('version','job-source-intake-receipt.v1','jobId',j,'sourceKind','customer_message','environment','synthetic_demo','realExternalActions',0,
 'record',jsonb_build_object('id',sid,'commandId',cid,'text',txt,'fictionalCustomer',jsonb_build_object('kind','named_fictional_customer','name','Fictional customer'),
 'customerActor',jsonb_build_object('kind','customer','customerId',c,'sessionId',authority->>'sessionId'),
 'evidence',jsonb_build_object('id',ev,'objectVersionId',ver,'sha256',content_hash,'serverReceivedAt',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))));
 INSERT INTO app.customer_portal_message_record(tenant_id,job_id,id,command_id,customer_id,session_id,sponsor_membership_id,request_hash,result,evidence_id,object_version_id,sha256,source_received_at,bytes,synthetic_fixture_ref)
 VALUES(t,j,sid,cid,c,(authority->>'sessionId')::uuid,(authority->>'sponsorMembershipId')::uuid,h,result,ev,ver,content_hash,at_time,raw,ref);
 PERFORM app.append_final_check_audit(gen_random_uuid(),'customer-session:'||(authority->>'sessionId'),j,'customer_portal.message_recorded',
 jsonb_build_object('commandId',cid,'customerId',c,'sessionId',authority->>'sessionId','sourceId',sid,'evidenceId',ev,'sha256',content_hash,'sponsorMembershipId',authority->>'sponsorMembershipId'));
 PERFORM app.bind_customer_request(t,j,c,digest);
 SET CONSTRAINTS ALL IMMEDIATE;
 RETURN result;
END $$;

-- Withdraw the legacy sponsor-as-actor route even from member-bound callers.
CREATE OR REPLACE FUNCTION app.sv7a_require_source_owner(t uuid,j uuid,digest text,source text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF digest LIKE 'customer:%' THEN RAISE EXCEPTION 'CUSTOMER_REFUSED' USING ERRCODE='42501'; END IF;
 RETURN app.ch4_require_command_owner(t,j,digest);
END $$;
CREATE OR REPLACE FUNCTION app.read_job_sources(t uuid,j uuid,digest text,source text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF nullif(current_setting('app.tenant_id',true),'') IS DISTINCT FROM app.current_tenant()::text
  OR t IS DISTINCT FROM app.current_tenant()
  OR (CASE WHEN digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN (SELECT membership_id FROM app.contractor_session(digest::uuid)) ELSE (SELECT membership_id FROM app.authenticate_practice_session(digest,app.current_tenant())) END) IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
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
 SELECT records||coalesce(jsonb_agg(r.result->'record' ORDER BY r.source_received_at,r.id),'[]') INTO records
 FROM app.customer_portal_message_record r WHERE r.tenant_id=t AND r.job_id=j;
 RETURN jsonb_build_object('version','customer-message-read.v1','jobId',j,'messages',records,'environment','synthetic_demo','realExternalActions',0);
END;
END
$$;
CREATE OR REPLACE FUNCTION app.evidence_pack_v3_ordinary(t uuid,c uuid) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=pg_catalog,app SET timezone='UTC' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind','ordinary','sourceId',x.sid,'recordedAt',to_char(x.ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'content',x.body::text) ORDER BY x.sid),'[]')
 FROM app.recovery_case rc CROSS JOIN LATERAL (
 SELECT 'recovery_case:'||r.id::text sid,rc.created_at ts,to_jsonb(r) body FROM app.recovery_case r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND r.id=rc.id
 UNION ALL
 SELECT 'recovery_claim_revision:'||r.id::text sid,rc.created_at ts,to_jsonb(r) body FROM app.recovery_claim_revision r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND r.case_id=rc.id
 UNION ALL
 SELECT 'recovery_case_event:'||r.id::text sid,rc.created_at ts,to_jsonb(r) body FROM app.recovery_case_event r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND r.case_id=rc.id
 UNION ALL
 SELECT 'quote_document_version:'||r.id::text sid,r.created_at ts,to_jsonb(r) body FROM app.quote_document_version r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'quote_acceptance:'||r.id::text sid,r.recorded_at ts,to_jsonb(r) body FROM app.quote_acceptance r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'variation_revision:'||r.id::text sid,r.created_at ts,to_jsonb(r) body FROM app.variation_revision r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'variation_approval:'||r.id::text sid,r.created_at ts,to_jsonb(r) body FROM app.variation_approval r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'customer_invoice:'||r.id::text sid,rc.created_at ts,(to_jsonb(r)-'pdf_bytes')||jsonb_build_object('pdfBase64',encode(r.pdf_bytes,'base64')) body FROM app.customer_invoice r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'evidence_object:'||r.id::text sid,r.server_received_at ts,to_jsonb(r) body FROM app.evidence_object r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND r.kind='original' AND r.server_verified_at IS NOT NULL
 UNION ALL
 SELECT 'job_source_original:'||r.evidence_id::text sid,r.source_received_at ts,(to_jsonb(r)-'bytes')||jsonb_build_object('originalBytesBase64',encode(r.bytes,'base64')) body FROM app.job_source_original r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL
 SELECT 'customer_portal_message_record:'||r.id::text sid,r.source_received_at ts,(to_jsonb(r)-'bytes')||jsonb_build_object('originalBytesBase64',encode(r.bytes,'base64')) body FROM app.customer_portal_message_record r WHERE r.tenant_id=t AND r.job_id=rc.job_id
 UNION ALL
 SELECT 'synthetic_evidence_original:'||r.upload_id::text sid,rc.created_at ts,(to_jsonb(r)-'bytes')||jsonb_build_object('originalBytesBase64',encode(r.bytes,'base64')) body FROM app.synthetic_evidence_original r WHERE r.tenant_id=t AND r.job_id=rc.job_id AND true
 UNION ALL SELECT 'supplier_document_version:'||r.id::text,r.created_at,to_jsonb(r) FROM app.supplier_document_version r WHERE r.tenant_id=t AND r.job_id=rc.job_id
 UNION ALL SELECT 'purchase_order_revision:'||r.id::text,r.created_at,to_jsonb(r) FROM app.purchase_order_revision r WHERE r.tenant_id=t AND r.job_id=rc.job_id
 UNION ALL SELECT 'final_account_revision:'||r.id::text,r.created_at,to_jsonb(r) FROM app.final_account_revision r WHERE r.tenant_id=t AND r.job_id=rc.job_id
 UNION ALL SELECT 'final_account_line:'||r.id::text,rc.created_at,to_jsonb(r) FROM app.final_account_line r WHERE r.tenant_id=t AND r.job_id=rc.job_id
 UNION ALL SELECT 'extra_origin:'||r.variation_id::text,rc.created_at,to_jsonb(r) FROM app.extra_origin r WHERE r.tenant_id=t AND r.job_id=rc.job_id
 UNION ALL SELECT 'evidence_invalidation:'||r.id::text,r.invalidated_at,to_jsonb(r) FROM app.evidence_invalidation r
 WHERE r.tenant_id=t AND EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=t AND e.job_id=rc.job_id AND e.id=r.evidence_id)
 ) x WHERE rc.tenant_id=t AND rc.id=c
$$;
COMMIT;
