BEGIN;
-- SV-5 separable synthetic result persistence. Q4/Q5 invoice gates and Q6 scheduling are not changed.
ALTER TABLE app.shadow_signal_classification ADD CONSTRAINT final_check_classification_job_identity UNIQUE(tenant_id,job_id,id);
ALTER TABLE app.shadow_signal_disposition ADD CONSTRAINT final_check_disposition_job_identity UNIQUE(tenant_id,job_id,id);
-- C239: 0204 owns both manifest tables, their generated inventory, RLS and grants.
-- Nullable extension fields preserve every pre-0205 manifest byte and the prerequisite writer.
ALTER TABLE app.final_check_manifest
 ADD COLUMN policy_version text CHECK(policy_version='final-check.reconciliation.v1'),
 ADD COLUMN manifest_hash char(64) CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
 ADD COLUMN processing_source_count integer CHECK(processing_source_count>=0),
 ADD COLUMN frozen_comparisons jsonb,
 ADD COLUMN audit_event_id uuid;
ALTER TABLE app.final_check_manifest ADD CONSTRAINT final_check_manifest_processing_metadata CHECK(
 (policy_version IS NULL AND manifest_hash IS NULL AND processing_source_count IS NULL AND frozen_comparisons IS NULL AND audit_event_id IS NULL)
 OR (policy_version IS NOT NULL AND manifest_hash IS NOT NULL AND processing_source_count IS NOT NULL AND frozen_comparisons IS NOT NULL AND audit_event_id IS NOT NULL AND policy_version=reconciliation_version)
);
ALTER TABLE app.final_check_manifest ADD CONSTRAINT final_check_manifest_processing_audit
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE app.final_check_manifest ADD CONSTRAINT final_check_manifest_processing_identity
 UNIQUE(tenant_id,job_id,id,lock_id,evidence_cutoff_at,manifest_hash);
CREATE TABLE app.final_check_processing_source (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,manifest_id uuid NOT NULL,id uuid NOT NULL,
 source_kind text NOT NULL,source_ref uuid NOT NULL,evidence_id uuid,object_version_id varchar(1024),sha256 char(64),
 source_received_at timestamptz NOT NULL,adapter_version text NOT NULL CHECK(adapter_version='synthetic-observation.v1'),
 input_hash char(64) NOT NULL CHECK(input_hash ~ '^[a-f0-9]{64}$'),processable boolean NOT NULL, frozen_input jsonb NOT NULL,
 PRIMARY KEY(tenant_id,job_id,manifest_id,id),CONSTRAINT final_check_processing_source_identity UNIQUE(tenant_id,job_id,manifest_id,source_kind,source_ref),
 FOREIGN KEY(tenant_id,job_id,manifest_id) REFERENCES app.final_check_manifest(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,evidence_id,object_version_id,sha256,source_received_at) REFERENCES app.evidence_object(tenant_id,job_id,id,object_version_id,sha256,server_received_at),
 CHECK((evidence_id IS NULL)=(object_version_id IS NULL)),CHECK((evidence_id IS NULL)=(sha256 IS NULL)),CHECK(NOT processable OR evidence_id IS NOT NULL)
);
CREATE TABLE app.final_check_source_attempt (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,manifest_id uuid NOT NULL,source_id uuid NOT NULL,id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence>0),input_hash char(64) NOT NULL,processing_version text NOT NULL CHECK(processing_version='final-check.source-result.v1'),
 status text NOT NULL CHECK(status IN('failed','unsupported','zero_result','detected')),failure_code text,
 signal_ids jsonb NOT NULL CHECK(jsonb_typeof(signal_ids)='array'),result_hash char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),audit_event_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,manifest_id,source_id,sequence),
 FOREIGN KEY(tenant_id,job_id,manifest_id,source_id) REFERENCES app.final_check_processing_source(tenant_id,job_id,manifest_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((status IN('failed','unsupported'))=(failure_code IS NOT NULL)),
 CHECK((status='detected')=(jsonb_array_length(signal_ids)>0))
);
CREATE TABLE app.final_check_run_binding (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,run_id uuid NOT NULL,manifest_id uuid NOT NULL,lock_id uuid NOT NULL,
 evidence_cutoff_at timestamptz NOT NULL,manifest_hash char(64) NOT NULL,result_hash char(64) NOT NULL,
 zero_result boolean NOT NULL,classifications jsonb NOT NULL,available_at timestamptz NOT NULL DEFAULT clock_timestamp(),audit_event_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,job_id,run_id),UNIQUE(tenant_id,job_id,manifest_id),UNIQUE(tenant_id,job_id,run_id,lock_id),
 FOREIGN KEY(tenant_id,job_id,run_id) REFERENCES app.shadow_reconciliation_run(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,manifest_id,lock_id,evidence_cutoff_at,manifest_hash) REFERENCES app.final_check_manifest(tenant_id,job_id,id,lock_id,evidence_cutoff_at,manifest_hash),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE app.final_check_reveal_proof (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,run_id uuid NOT NULL,signal_id uuid NOT NULL,lock_id uuid NOT NULL,
 signal_revision integer NOT NULL,classification_id uuid NOT NULL,comparison_version text NOT NULL CHECK(comparison_version='final-check.reconciliation.v1'),
 capture_register_hash char(64) NOT NULL,line_set_hash char(64) NOT NULL,baseline_hash char(64) NOT NULL,
 comparisons jsonb NOT NULL,reference_ids jsonb NOT NULL,evidence jsonb NOT NULL,evidence_set_hash char(64) NOT NULL,
 description text NOT NULL,first_available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id,run_id,signal_id),
 FOREIGN KEY(tenant_id,job_id,run_id,lock_id) REFERENCES app.final_check_run_binding(tenant_id,job_id,run_id,lock_id),
 FOREIGN KEY(tenant_id,job_id,run_id,signal_id) REFERENCES app.shadow_signal_classification(tenant_id,job_id,run_id,signal_id),
 FOREIGN KEY(tenant_id,job_id,classification_id) REFERENCES app.shadow_signal_classification(tenant_id,job_id,id)
);
CREATE TABLE app.final_check_disposition_binding (
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,disposition_id uuid NOT NULL,run_id uuid NOT NULL,signal_id uuid NOT NULL,lock_id uuid NOT NULL,
 expected_signal_revision integer NOT NULL,command_id uuid NOT NULL,actor_membership_id uuid NOT NULL,identity_user_id uuid NOT NULL,
 answer text NOT NULL CHECK(answer IN('already_included','in_original_scope','not_completed','not_chargeable','wrong_job_or_evidence')),
 selected_reference_id uuid,selected_reference_kind text CHECK(selected_reference_kind IN('line','baseline')),request_hash char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),audit_event_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,job_id,disposition_id),UNIQUE(tenant_id,command_id),UNIQUE(tenant_id,job_id,signal_id),
 FOREIGN KEY(tenant_id,job_id,disposition_id) REFERENCES app.shadow_signal_disposition(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,run_id,signal_id) REFERENCES app.final_check_reveal_proof(tenant_id,job_id,run_id,signal_id),
 FOREIGN KEY(tenant_id,job_id,run_id,lock_id) REFERENCES app.final_check_run_binding(tenant_id,job_id,run_id,lock_id),
 FOREIGN KEY(tenant_id,actor_membership_id,identity_user_id) REFERENCES app.membership(tenant_id,id,identity_user_id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((selected_reference_id IS NULL)=(selected_reference_kind IS NULL))
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['final_check_processing_source','final_check_source_attempt','final_check_run_binding','final_check_reveal_proof','final_check_disposition_binding'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access',n);
  EXECUTE format('CREATE TRIGGER final_check_no_mutation BEFORE UPDATE OR DELETE OR TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;

CREATE FUNCTION app.final_check_context(t uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE context_id uuid;
BEGIN
 BEGIN context_id:=nullif(current_setting('app.tenant_id',true),'')::uuid; EXCEPTION WHEN invalid_text_representation THEN context_id:=NULL; END;
 IF t IS NULL OR context_id IS DISTINCT FROM t THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION app.final_check_worker(t uuid,j uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.final_check_context(t);
 IF NOT pg_has_role(session_user,'jobguard_shadow','USAGE') OR pg_has_role(session_user,'jobguard_runtime','USAGE') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo')
 OR NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Acquire prerequisite job/advisory locks before shadow locks and any audit allocation.
 PERFORM app.final_check_require_worker(t,j);
END $$;
-- Current session and identity are checked inside each controlled builder operation. No supplied actor.
CREATE FUNCTION app.final_check_builder(t uuid,j uuid,d text,locking boolean DEFAULT false)
 RETURNS TABLE(member_id uuid,user_id uuid) LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE a record; owned boolean;
BEGIN
 PERFORM app.final_check_context(t);
 IF NOT pg_has_role(session_user,'jobguard_runtime','USAGE') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF locking THEN PERFORM 1 FROM control_plane.practice_session WHERE token_digest=d FOR SHARE; END IF;
 SELECT * INTO a FROM app.authenticate_practice_session(d,t);
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF locking THEN PERFORM 1 FROM app.membership WHERE tenant_id=t AND id=a.membership_id AND identity_user_id=a.identity_user_id FOR SHARE; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=a.membership_id AND identity_user_id=a.identity_user_id AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 WITH RECURSIVE owned_jobs AS (
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
  UNION SELECT child.id FROM owned_jobs source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
  JOIN app.job child ON child.tenant_id=e.tenant_id AND child.id::text=e.subject_ref AND child.provenance='imported' AND child.practice_session_digest IS NULL
 ) SELECT EXISTS(SELECT 1 FROM owned_jobs WHERE id=j) INTO owned;
 IF NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT owned OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF locking THEN
  PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
  -- Recheck deadlines after every wait before replay or effects.
  IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) s WHERE s.membership_id=a.membership_id AND s.identity_user_id=a.identity_user_id) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN QUERY SELECT a.membership_id::uuid,a.identity_user_id::uuid;
END $$;
CREATE FUNCTION app.append_final_check_audit(e uuid,actor text,j uuid,k text,refs jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;seq bigint;prev text;ts timestamptz;payload jsonb;ph text;eh text;
BEGIN
 SELECT sequence,event_hash INTO seq,prev FROM app.lock_audit_head();seq:=seq+1;ts:=date_trunc('milliseconds',clock_timestamp());
 payload:=jsonb_build_object('references',refs,'hashes','{}'::jsonb);ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,actor,k,'job',j::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(prev,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(e,t,seq,'audit.v1',actor,k,'job',j::text,ts,payload,ph,prev,eh);PERFORM app.advance_audit_head(seq,eh);
END $$;

CREATE FUNCTION app.read_final_check_manifest(t uuid,j uuid,m uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE manifest app.final_check_manifest;inventory jsonb;
BEGIN
 PERFORM app.final_check_worker(t,j);
 SELECT * INTO manifest FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND id=m;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF manifest.manifest_hash IS NULL THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'evidenceId',s.evidence_id,'sourceKind',s.source_kind,'sourceRef',s.source_ref,'objectVersionId',s.object_version_id,'sha256',s.sha256,
  'receivedAt',to_char(s.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'inputHash',s.input_hash,'processable',s.processable,'input',s.frozen_input,
  'status',coalesce(a.status,'pending')) ORDER BY s.id),'[]') INTO inventory FROM app.final_check_processing_source s
 LEFT JOIN LATERAL(SELECT status FROM app.final_check_source_attempt WHERE tenant_id=t AND job_id=j AND manifest_id=m AND source_id=s.id ORDER BY sequence DESC LIMIT 1)a ON true
 WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=m;
 RETURN jsonb_build_object('version','final-check.manifest.v1','id',manifest.id,'lockId',manifest.lock_id,'cutoff',to_char(manifest.evidence_cutoff_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'hash',manifest.manifest_hash,'detectorVersion',manifest.detector_version,'policyVersion',manifest.policy_version,'sources',inventory,'excludedUploads',(SELECT coalesce(jsonb_agg(jsonb_build_object('uploadId',ms.upload_id,'state',ms.excluded_state,'reason',ms.excluded_reason) ORDER BY ms.upload_id),'[]') FROM app.final_check_manifest_source ms WHERE ms.tenant_id=t AND ms.job_id=j AND ms.manifest_id=m AND ms.excluded_state IS NOT NULL),'comparisons',manifest.frozen_comparisons,'result',(SELECT jsonb_build_object('runId',b.run_id,'lockId',b.lock_id,'zeroResult',b.zero_result,'classifications',b.classifications) FROM app.final_check_run_binding b WHERE b.tenant_id=t AND b.job_id=j AND b.manifest_id=m),'signals',(SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',s.id,'revision',s.revision,'description',s.description,'scopeItemId',s.matched_scope_item_id,'coalescedIntoSignalId',s.coalesced_into_signal_id,'permanentExclusion',s.disclosed_before_lock OR s.state='surfaced_early' OR EXISTS(SELECT 1 FROM app.shadow_signal_ineligibility i WHERE i.tenant_id=t AND i.job_id=j AND i.signal_id=s.id AND i.reason IN('disclosed_before_lock','surfaced_early','pre_adoption_evidence','attribution_disputed')) OR EXISTS(SELECT 1 FROM app.shadow_signal_disposition prior WHERE prior.tenant_id=t AND prior.job_id=j AND prior.signal_id=s.id),'evidenceIds',(SELECT coalesce(jsonb_agg(e.evidence_id ORDER BY e.evidence_id),'[]') FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at<=manifest.evidence_cutoff_at)) ORDER BY s.id),'[]') FROM app.shadow_commercial_signal s WHERE s.tenant_id=t AND s.job_id=j));
END $$;
CREATE FUNCTION app.begin_final_check(t uuid,j uuid,detector text,policy text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE l app.final_account_lock;m app.final_check_manifest;inventory jsonb;comparison jsonb;entry jsonb;result jsonb;mid uuid:=gen_random_uuid();event uuid:=gen_random_uuid();
BEGIN
 PERFORM app.final_check_worker(t,j);
 IF detector IS NULL OR length(detector) NOT BETWEEN 1 AND 80 OR policy IS DISTINCT FROM 'final-check.reconciliation.v1' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('shadow-detection:'||t::text||':'||j::text,0));
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 SELECT * INTO m FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND lock_id=l.id;
 IF FOUND THEN
  IF m.detector_version<>detector OR m.reconciliation_version<>policy THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  IF m.manifest_hash IS NULL THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
  RETURN app.read_final_check_manifest(t,j,m.id);
 END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY x->>'source_ref',x->>'kind'),'[]') INTO inventory FROM (
  SELECT jsonb_build_object('source_ref',e.id,'kind',e.evidence_type,'evidence_id',e.id,'object_version_id',e.object_version_id,'sha256',e.sha256,'received_at',e.server_received_at,
   'processable',NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.id) AND NOT EXISTS(SELECT 1 FROM app.job imported WHERE imported.tenant_id=t AND imported.id=j AND imported.provenance='imported'),'input',to_jsonb(e)) x
  FROM app.evidence_object e WHERE e.tenant_id=t AND e.job_id=j AND e.kind='original' AND e.server_received_at<=l.locked_at AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE u.tenant_id=t AND u.job_id=j AND u.id=e.upload_id AND u.state='verified')
  UNION ALL SELECT jsonb_build_object('source_ref',u.id,'kind','pending_upload','evidence_id',NULL,'object_version_id',NULL,'sha256',NULL,'received_at',u.server_received_at,'processable',false,'input',to_jsonb(u))
  FROM app.evidence_upload u WHERE u.tenant_id=t AND u.job_id=j AND u.server_received_at<=l.locked_at AND u.state<>'rejected' AND NOT(u.state='pending' AND u.expires_at<=clock_timestamp()) AND NOT EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=t AND e.upload_id=u.id AND e.server_received_at<=l.locked_at)

  UNION ALL SELECT jsonb_build_object('source_ref',v.id,'kind','unlinked_supplier_version','evidence_id',NULL,'object_version_id',NULL,'sha256',NULL,'received_at',v.created_at,'processable',false,'input',to_jsonb(v))
  FROM app.supplier_document_version v WHERE v.tenant_id=t AND v.job_id=j AND v.created_at<=l.locked_at
  UNION ALL SELECT jsonb_build_object('source_ref',d.id,'kind','unlinked_supplier_document','evidence_id',NULL,'object_version_id',NULL,'sha256',NULL,'received_at',d.created_at,'processable',false,'input',to_jsonb(d))
  FROM app.supplier_document d WHERE d.tenant_id=t AND d.job_id=j AND d.created_at<=l.locked_at AND NOT EXISTS(SELECT 1 FROM app.supplier_document_version v WHERE v.tenant_id=t AND v.job_id=j AND v.document_id=d.id AND v.created_at<=l.locked_at)
  UNION ALL SELECT jsonb_build_object('source_ref',v.id,'kind','unlinked_purchase_order','evidence_id',NULL,'object_version_id',NULL,'sha256',NULL,'received_at',v.created_at,'processable',false,'input',to_jsonb(v))
  FROM app.purchase_order_revision v WHERE v.tenant_id=t AND v.job_id=j AND v.created_at<=l.locked_at
  UNION ALL SELECT DISTINCT jsonb_build_object('source_ref',c.id,'kind','unlinked_capture_source','evidence_id',NULL,'object_version_id',NULL,'sha256',NULL,'received_at',c.created_at,'processable',false,'input',to_jsonb(c))
  FROM app.capture_source c JOIN app.job_record_proposal p ON(p.tenant_id,p.source_id)=(c.tenant_id,c.id) WHERE p.tenant_id=t AND p.job_id=j AND c.created_at<=l.locked_at AND p.created_at<=l.locked_at
 ) sources;
 comparison:=jsonb_build_object('tenantId',t,'jobId',j,'captures',l.snapshot->'captureRegister','baselineItemIds',l.snapshot->'baselineScopeItemIds','lines',l.snapshot->'lines',
  'baselineRecordedAt',to_char((SELECT created_at FROM app.quote_version WHERE tenant_id=t AND job_id=j AND id=l.baseline_quote_version_id) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'baseline',(SELECT coalesce(jsonb_agg(to_jsonb(line) ORDER BY line.id),'[]') FROM app.final_account_line line WHERE line.tenant_id=t AND line.job_id=j AND line.final_account_revision_id=l.final_account_revision_id AND line.line_kind='baseline'));
 INSERT INTO app.final_check_manifest(tenant_id,job_id,id,lock_id,evidence_cutoff_at,detector_version,reconciliation_version,policy_version,manifest_hash,processing_source_count,frozen_comparisons,audit_event_id)
 VALUES(t,j,mid,l.id,l.locked_at,detector,policy,policy,app.final_lock_hash(jsonb_build_object('lock',l.snapshot_digest,'cutoff',l.locked_at,'detector',detector,'policy',policy,'sources',inventory,'comparisons',comparison)),jsonb_array_length(inventory),comparison,event);
 FOR entry IN SELECT value FROM jsonb_array_elements(inventory) LOOP
  INSERT INTO app.final_check_processing_source(tenant_id,job_id,manifest_id,id,source_kind,source_ref,evidence_id,object_version_id,sha256,source_received_at,adapter_version,input_hash,processable,frozen_input)
  VALUES(t,j,mid,gen_random_uuid(),entry->>'kind',(entry->>'source_ref')::uuid,(entry->>'evidence_id')::uuid,entry->>'object_version_id',entry->>'sha256',(entry->>'received_at')::timestamptz,'synthetic-observation.v1',app.final_lock_hash(entry->'input'),(entry->>'processable')::boolean,entry->'input');
 END LOOP;
 result:=app.read_final_check_manifest(t,j,mid);
 PERFORM app.append_final_check_audit(event,'system:final-check',j,'final_check.manifest_frozen',jsonb_build_object('manifestId',mid,'lockId',l.id));
 RETURN result;
END $$;

CREATE FUNCTION app.record_final_check_source_result(t uuid,j uuid,m uuid,s uuid,attempt uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE source app.final_check_processing_source;prior app.final_check_source_attempt;digest text;seq integer;sid text;event uuid:=gen_random_uuid();
BEGIN
 PERFORM app.final_check_worker(t,j);
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('shadow-detection:'||t::text||':'||j::text,0));
 SELECT * INTO source FROM app.final_check_processing_source WHERE tenant_id=t AND job_id=j AND manifest_id=m AND id=s;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 IF attempt IS NULL OR p->>'version' IS DISTINCT FROM 'final-check.source-result.v1'
 OR (SELECT count(*) FROM jsonb_object_keys(p))<>5 OR NOT p ?& ARRAY['version','inputHash','status','failureCode','signalIds']
 OR jsonb_typeof(p->'version') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'inputHash') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'status') IS DISTINCT FROM 'string'

 OR p->>'status' IS NULL OR p->>'status' NOT IN('failed','unsupported','zero_result','detected') OR jsonb_typeof(p->'signalIds') IS DISTINCT FROM 'array'
 OR (p->>'status' IN('failed','unsupported')) IS DISTINCT FROM (p->>'failureCode' IS NOT NULL)
 OR (p->>'failureCode' IS NOT NULL AND p->>'failureCode' NOT IN('UNSUPPORTED_SOURCE','SOURCE_INVALID','PROCESSING_FAILED'))
 OR (p->>'status'='detected') IS DISTINCT FROM (jsonb_array_length(p->'signalIds')>0) THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'signalIds') x WHERE jsonb_typeof(x.value)<>'string') THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 IF p->>'inputHash' IS DISTINCT FROM source.input_hash THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 digest:=app.final_lock_hash(jsonb_build_object('manifest',m,'source',s,'payload',p));
 SELECT * INTO prior FROM app.final_check_source_attempt WHERE tenant_id=t AND id=attempt;
 IF FOUND THEN IF prior.job_id<>j OR prior.result_hash<>digest THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF; RETURN jsonb_build_object('attemptId',prior.id,'status',prior.status); END IF;
 IF EXISTS(SELECT 1 FROM app.final_check_run_binding WHERE tenant_id=t AND job_id=j AND manifest_id=m) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 IF p->>'status' IN('zero_result','detected') AND (NOT source.processable OR NOT EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=t AND e.job_id=j AND e.id=source.evidence_id AND app.final_lock_hash(to_jsonb(e))=source.input_hash)
 OR EXISTS(SELECT 1 FROM app.evidence_invalidation WHERE tenant_id=t AND evidence_id=source.evidence_id)) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 FOR sid IN SELECT value FROM jsonb_array_elements_text(p->'signalIds') LOOP
  IF NOT EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sid::uuid AND e.evidence_id=source.evidence_id AND e.object_version_id=source.object_version_id AND e.sha256=source.sha256 AND e.source_received_at=source.source_received_at) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 END LOOP;
 -- A zero-result cannot silently ignore a linked detection already emitted for this exact source.
 IF p->>'status'='zero_result' AND EXISTS(SELECT 1 FROM app.shadow_signal_evidence WHERE tenant_id=t AND job_id=j AND evidence_id=source.evidence_id AND object_version_id=source.object_version_id) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 SELECT coalesce(max(sequence),0)+1 INTO seq FROM app.final_check_source_attempt WHERE tenant_id=t AND job_id=j AND manifest_id=m AND source_id=s;
 INSERT INTO app.final_check_source_attempt(tenant_id,job_id,manifest_id,source_id,id,sequence,input_hash,processing_version,status,failure_code,signal_ids,result_hash,audit_event_id)
 VALUES(t,j,m,s,attempt,seq,source.input_hash,'final-check.source-result.v1',p->>'status',p->>'failureCode',p->'signalIds',digest,event);
 PERFORM app.append_final_check_audit(event,'system:final-check',j,'final_check.source_processed',jsonb_build_object('manifestId',m,'sourceId',s,'attemptId',attempt));
 RETURN jsonb_build_object('attemptId',attempt,'status',p->>'status');
END $$;

CREATE FUNCTION app.complete_final_check(t uuid,j uuid,m uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE manifest app.final_check_manifest;l app.final_account_lock;prior app.final_check_run_binding;item jsonb;sig app.shadow_commercial_signal;refs jsonb;proof jsonb;ev jsonb;digest text;
 run uuid:=gen_random_uuid();event uuid:=gen_random_uuid();classification uuid;chosen_outcome text;next_revision integer;
BEGIN
 PERFORM app.final_check_worker(t,j);
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('shadow-detection:'||t::text||':'||j::text,0));
 SELECT * INTO manifest FROM app.final_check_manifest WHERE tenant_id=t AND job_id=j AND id=m;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF manifest.manifest_hash IS NULL THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'signalId'),'[]') INTO p FROM jsonb_array_elements(p);
 digest:=app.final_lock_hash(p);
 SELECT * INTO prior FROM app.final_check_run_binding WHERE tenant_id=t AND job_id=j AND manifest_id=m;
 IF FOUND THEN IF prior.result_hash<>digest THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;RETURN jsonb_build_object('runId',prior.run_id,'lockId',prior.lock_id,'zeroResult',prior.zero_result); END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=manifest.lock_id AND locked_at=manifest.evidence_cutoff_at;
 IF NOT FOUND OR manifest.processing_source_count<>(SELECT count(*) FROM app.final_check_processing_source WHERE tenant_id=t AND job_id=j AND manifest_id=m) THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_check_processing_source s LEFT JOIN LATERAL(SELECT status,input_hash FROM app.final_check_source_attempt WHERE tenant_id=t AND job_id=j AND manifest_id=m AND source_id=s.id ORDER BY sequence DESC LIMIT 1)a ON true
  WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=m AND (a.status IS NULL OR a.status NOT IN('zero_result','detected') OR a.input_hash<>s.input_hash OR NOT s.processable
   OR NOT EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=t AND e.job_id=j AND e.id=s.evidence_id AND app.final_lock_hash(to_jsonb(e))=s.input_hash)
   OR EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=s.evidence_id))) THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 PERFORM 1 FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j ORDER BY id FOR UPDATE;
 -- Every source-linked detection must be accounted for, including coalesced identities and explicit exclusions.
 IF jsonb_array_length(p)<>(SELECT count(*) FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j)
 OR jsonb_array_length(p)<>(SELECT count(DISTINCT value->>'signalId') FROM jsonb_array_elements(p)) THEN RAISE EXCEPTION 'FINAL_CHECK_PENDING'; END IF;
 INSERT INTO app.shadow_reconciliation_run(tenant_id,job_id,id,policy_version,evidence_cutoff_at,status) VALUES(t,j,run,manifest.policy_version,manifest.evidence_cutoff_at,'completed');
 INSERT INTO app.final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,manifest_hash,result_hash,zero_result,classifications,audit_event_id)
 VALUES(t,j,run,m,l.id,l.locked_at,manifest.manifest_hash,digest,jsonb_array_length(p)=0,p,event);
 FOR item IN SELECT value FROM jsonb_array_elements(p) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(item))<>5 OR NOT item ?& ARRAY['signalId','expectedRevision','outcome','references','comparisons']
   OR jsonb_typeof(item->'signalId') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'outcome') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'expectedRevision') IS DISTINCT FROM 'number' OR item->>'expectedRevision' !~ '^[0-9]+$'
   OR jsonb_typeof(item->'references') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
  SELECT * INTO sig FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j AND id=(item->>'signalId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF sig.revision IS DISTINCT FROM (item->>'expectedRevision')::integer THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
  chosen_outcome:=item->>'outcome';refs:=item->'references';
  IF chosen_outcome IS NULL OR chosen_outcome NOT IN('already_in_original_scope','builder_captured','already_on_final_account','duplicate_signal','not_enough_evidence','reveal') THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
  proof:=jsonb_build_object('baselineItemIds',manifest.frozen_comparisons->'baselineItemIds','captureIds',(SELECT coalesce(jsonb_agg(value->'id' ORDER BY value->>'id'),'[]') FROM jsonb_array_elements(manifest.frozen_comparisons->'captures')),
   'lockedLineIds',(SELECT coalesce(jsonb_agg(value->'id' ORDER BY value->>'id'),'[]') FROM jsonb_array_elements(manifest.frozen_comparisons->'lines')));
  IF item->'comparisons' IS DISTINCT FROM proof THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF sig.coalesced_into_signal_id IS NOT NULL AND (chosen_outcome<>'duplicate_signal' OR refs<>jsonb_build_array(sig.coalesced_into_signal_id)) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF (sig.disclosed_before_lock OR sig.state='surfaced_early') AND chosen_outcome='reveal' THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF chosen_outcome='already_in_original_scope' AND (jsonb_array_length(refs)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(refs) r WHERE NOT manifest.frozen_comparisons->'baselineItemIds' ? r.value)) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF chosen_outcome='builder_captured' AND (jsonb_array_length(refs)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(refs) r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(manifest.frozen_comparisons->'captures') c WHERE c.value->>'id'=r.value))) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF chosen_outcome='already_on_final_account' AND (jsonb_array_length(refs)=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(refs) r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(manifest.frozen_comparisons->'lines') line WHERE line.value->>'id'=r.value))) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.evidence_id,'objectVersionId',e.object_version_id,'sha256',e.sha256,'receivedAt',to_char(e.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'source',o.evidence_type,'evidenceAfterLock',e.source_received_at>l.locked_at) ORDER BY e.evidence_id,e.object_version_id),'[]') INTO ev FROM app.shadow_signal_evidence e JOIN app.evidence_object o
    ON(o.tenant_id,o.job_id,o.id,o.object_version_id,o.sha256,o.server_received_at)=(e.tenant_id,e.job_id,e.evidence_id,e.object_version_id,e.sha256,e.source_received_at)
    WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id;
  IF chosen_outcome='reveal' AND (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(ev) x WHERE NOT (x->>'evidenceAfterLock')::boolean) OR EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=sig.id AND EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id))
   OR sig.matched_scope_item_id IN(SELECT value::uuid FROM jsonb_array_elements_text(manifest.frozen_comparisons->'baselineItemIds'))
   OR sig.matched_variation_id IN(SELECT (value->>'id')::uuid FROM jsonb_array_elements(manifest.frozen_comparisons->'captures'))) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  classification:=gen_random_uuid();
  INSERT INTO app.shadow_signal_classification(tenant_id,job_id,id,run_id,signal_id,outcome) VALUES(t,j,classification,run,sig.id,chosen_outcome);
  next_revision:=sig.revision;
  IF sig.state<>'surfaced_early' AND sig.state IN('candidate','held_for_final_check','reconciled') THEN
   next_revision:=sig.revision+1;
   UPDATE app.shadow_commercial_signal SET state=CASE WHEN chosen_outcome='reveal' THEN 'revealed' ELSE 'reconciled' END,
    outcome=CASE WHEN chosen_outcome='reveal' THEN NULL ELSE chosen_outcome END,revision=next_revision,
    first_builder_visible_at=CASE WHEN chosen_outcome='reveal' THEN coalesce(first_builder_visible_at,clock_timestamp()) ELSE first_builder_visible_at END
    WHERE tenant_id=t AND job_id=j AND id=sig.id;
  END IF;
  INSERT INTO app.final_check_reveal_proof(tenant_id,job_id,run_id,signal_id,lock_id,signal_revision,classification_id,comparison_version,capture_register_hash,line_set_hash,baseline_hash,comparisons,reference_ids,evidence,evidence_set_hash,description)
  VALUES(t,j,run,sig.id,l.id,next_revision,classification,manifest.policy_version,l.capture_register_hash,l.line_set_hash,app.final_lock_hash(manifest.frozen_comparisons->'baseline'),proof,refs,ev,app.final_lock_hash(ev),sig.description);
  INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref)
  SELECT t,j,gen_random_uuid(),sig.id,'evidence_after_lock',e->>'id' FROM jsonb_array_elements(ev)e WHERE (e->>'evidenceAfterLock')::boolean ON CONFLICT DO NOTHING;
 END LOOP;
 PERFORM app.append_final_check_audit(event,'system:final-check',j,'final_check.result_available',jsonb_build_object('manifestId',m,'runId',run,'lockId',l.id));
 -- Bridge exact successful processing into 0204's independently checked proof path.
 -- The prerequisite upload hash and source identity are never replaced by processing hashes.
 FOR item IN SELECT jsonb_build_object('source',ms.id,'hash',ms.frozen_input_hash,'evidence',ps.evidence_id,'object',ps.object_version_id,'sha',ps.sha256,'received',ps.source_received_at,'result',a.result_hash,'signals',a.signal_ids)
  FROM app.final_check_manifest_source ms JOIN app.final_check_processing_source ps ON ps.tenant_id=ms.tenant_id AND ps.job_id=ms.job_id AND ps.manifest_id=ms.manifest_id AND ps.evidence_id=ms.evidence_id
  JOIN LATERAL(SELECT * FROM app.final_check_source_attempt WHERE tenant_id=t AND job_id=j AND manifest_id=m AND source_id=ps.id ORDER BY sequence DESC LIMIT 1)a ON true
  WHERE ms.tenant_id=t AND ms.job_id=j AND ms.manifest_id=m AND ms.excluded_state IS NULL LOOP
  INSERT INTO app.shadow_final_check_source_attempt(tenant_id,job_id,manifest_id,source_id,id,execution_id,stage,version,input_hash,outcome,result_hash,result_signal_ids,evidence_id,object_version_id,sha256,source_received_at)
  SELECT t,j,m,(item->>'source')::uuid,gen_random_uuid(),run,stage,CASE stage WHEN 'detection' THEN manifest.detector_version ELSE manifest.reconciliation_version END,
   CASE stage WHEN 'detection' THEN item->>'hash' ELSE item->>'result' END,'succeeded',item->>'result',ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(item->'signals')),
   (item->>'evidence')::uuid,item->>'object',item->>'sha',(item->>'received')::timestamptz FROM unnest(ARRAY['detection','reconciliation']) stage ORDER BY stage;
 END LOOP;
 INSERT INTO app.shadow_final_check_reveal_proof(tenant_id,job_id,run_id,id,signal_id,classification_id,projection_version,result_descriptor)
 SELECT t,j,run,gen_random_uuid(),c.signal_id,c.id,'final-check-result.v1',jsonb_build_object('version','final-check-result.v1','signalId',c.signal_id,'classificationId',c.id,'outcome',c.outcome)
 FROM app.shadow_signal_classification c WHERE c.tenant_id=t AND c.job_id=j AND c.run_id=run;
 IF jsonb_array_length(p)=0 THEN
  INSERT INTO app.shadow_final_check_reveal_proof(tenant_id,job_id,run_id,id,projection_version,result_descriptor)
  VALUES(t,j,run,gen_random_uuid(),'final-check-result.v1','{"version":"final-check-result.v1","outcome":"zero_result"}');
 END IF;
 INSERT INTO app.shadow_final_check_run_binding(tenant_id,job_id,run_id,manifest_id,lock_id,evidence_cutoff_at,execution_id,detector_version,reconciliation_version)
 VALUES(t,j,run,m,l.id,l.locked_at,run,manifest.detector_version,manifest.reconciliation_version);
 -- Verification is mandatory even though certificate publication remains an explicit worker action.
 PERFORM app.verify_final_check_run(t,j,run,l.id,l.locked_at);
 RETURN jsonb_build_object('runId',run,'lockId',l.id,'zeroResult',jsonb_array_length(p)=0);
END $$;

CREATE FUNCTION app.read_final_check_reveal(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE l app.final_account_lock;b app.final_check_run_binding;items jsonb;post_items jsonb;
BEGIN
 PERFORM app.final_check_builder(t,j,d);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 -- Fixed pre-lock branch never reads a shadow or final_check fact relation.
 IF NOT FOUND THEN RETURN jsonb_build_object('state','unlocked','items','[]'::jsonb); END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',s.id,'description',s.description,'evidenceAfterLock',true,'evidence',
  (SELECT jsonb_agg(jsonb_build_object('id',e.evidence_id,'objectVersionId',e.object_version_id,'sha256',e.sha256,'receivedAt',to_char(e.source_received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'source',o.evidence_type) ORDER BY e.evidence_id)
   FROM app.shadow_signal_evidence e JOIN app.evidence_object o ON(o.tenant_id,o.job_id,o.id,o.object_version_id,o.sha256,o.server_received_at)=(e.tenant_id,e.job_id,e.evidence_id,e.object_version_id,e.sha256,e.source_received_at)
   WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id))) ORDER BY s.id),'[]') INTO post_items
 FROM app.shadow_commercial_signal s WHERE s.tenant_id=t AND s.job_id=j AND s.coalesced_into_signal_id IS NULL
 AND EXISTS(SELECT 1 FROM app.shadow_signal_evidence e WHERE e.tenant_id=t AND e.job_id=j AND e.signal_id=s.id AND e.source_received_at>l.locked_at AND NOT EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=e.evidence_id));
 SELECT * INTO b FROM app.final_check_run_binding WHERE tenant_id=t AND job_id=j AND lock_id=l.id AND evidence_cutoff_at=l.locked_at;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state',CASE WHEN EXISTS(SELECT 1 FROM app.final_check_source_attempt a JOIN app.final_check_manifest m ON(m.tenant_id,m.job_id,m.id)=(a.tenant_id,a.job_id,a.manifest_id) WHERE a.tenant_id=t AND a.job_id=j AND m.lock_id=l.id AND a.status IN('failed','unsupported') AND a.sequence=(SELECT max(x.sequence) FROM app.final_check_source_attempt x WHERE (x.tenant_id,x.job_id,x.manifest_id,x.source_id)=(a.tenant_id,a.job_id,a.manifest_id,a.source_id))) THEN 'failed' ELSE 'pending' END,'lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 IF EXISTS(SELECT 1 FROM app.final_check_processing_source s WHERE s.tenant_id=t AND s.job_id=j AND s.manifest_id=b.manifest_id AND EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=s.evidence_id)) THEN
  RETURN jsonb_build_object('state','failed','lockId',l.id,'items','[]'::jsonb,'postLockItems',post_items);
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('signalId',p.signal_id,'signalRevision',p.signal_revision,'description',p.description,'evidence',p.evidence,'comparisons',p.comparisons,
  'baselineHash',p.baseline_hash,'captureRegisterHash',p.capture_register_hash,'lineSetHash',p.line_set_hash,'evidenceSetHash',p.evidence_set_hash,'disposition',s.disposition,'answer',db.answer,'dispositionId',db.disposition_id) ORDER BY p.signal_id),'[]') INTO items
 FROM app.final_check_reveal_proof p JOIN app.shadow_signal_classification c ON(c.tenant_id,c.job_id,c.run_id,c.signal_id)=(p.tenant_id,p.job_id,p.run_id,p.signal_id)
 LEFT JOIN app.final_check_disposition_binding db ON(db.tenant_id,db.job_id,db.run_id,db.signal_id)=(p.tenant_id,p.job_id,p.run_id,p.signal_id)
 LEFT JOIN app.shadow_signal_disposition s ON(s.tenant_id,s.id)=(db.tenant_id,db.disposition_id)
 WHERE p.tenant_id=t AND p.job_id=j AND p.run_id=b.run_id AND c.outcome='reveal';
 RETURN jsonb_build_object('state','completed','lockId',l.id,'runId',b.run_id,'items',items,'postLockItems',post_items);
END $$;
CREATE FUNCTION app.record_final_check_disposition(t uuid,j uuid,d text,p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE actor record;prior app.command_receipt;proof app.final_check_reveal_proof;sig app.shadow_commercial_signal;l app.final_account_lock;cid uuid;ref uuid;kind text;
 answer text;resolved text;request_digest text;result jsonb;disposition uuid:=gen_random_uuid();event uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO actor FROM app.final_check_builder(t,j,d,true);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 -- Authority and its locks precede subject parsing and replay.
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 IF p->>'version' IS DISTINCT FROM 'final-check.disposition.v1' OR (SELECT count(*) FROM jsonb_object_keys(p))<>8
 OR NOT p ?& ARRAY['version','commandId','lockId','runId','signalId','expectedSignalRevision','answer','referenceId']
 OR jsonb_typeof(p->'version') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'commandId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'lockId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'runId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'signalId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'expectedSignalRevision') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'answer') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p->'referenceId') NOT IN('string','null')
 OR p->>'answer' IS NULL OR p->>'answer' NOT IN('already_included','in_original_scope','not_completed','not_chargeable','wrong_job_or_evidence')
 OR (p->>'expectedSignalRevision') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 cid:=(p->>'commandId')::uuid;answer:=p->>'answer';ref:=(p->>'referenceId')::uuid;
 IF cid IS NULL OR p->>'lockId' IS NULL OR p->>'runId' IS NULL OR p->>'signalId' IS NULL OR p->>'expectedSignalRevision' IS NULL
 OR (answer NOT IN('already_included','in_original_scope') AND ref IS NOT NULL) THEN RAISE EXCEPTION 'INVALID_FINAL_CHECK_INPUT'; END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('job',j,'actor',actor.member_id,'identity',actor.user_id,'payload',p));
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text||':'||cid::text,145));
 IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) a WHERE a.membership_id=actor.member_id AND a.identity_user_id=actor.user_id) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND command_id=cid;
 IF FOUND THEN IF prior.command_type<>'RecordFinalCheckDisposition' OR prior.request_hash<>request_digest OR prior.actor_membership_id<>actor.member_id THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;RETURN prior.result; END IF;
 SELECT * INTO proof FROM app.final_check_reveal_proof WHERE tenant_id=t AND job_id=j AND run_id=(p->>'runId')::uuid AND signal_id=(p->>'signalId')::uuid AND lock_id=(p->>'lockId')::uuid;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.shadow_signal_classification WHERE tenant_id=t AND job_id=j AND run_id=proof.run_id AND signal_id=proof.signal_id AND outcome='reveal') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO sig FROM app.shadow_commercial_signal WHERE tenant_id=t AND job_id=j AND id=proof.signal_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) a WHERE a.membership_id=actor.member_id AND a.identity_user_id=actor.user_id) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF sig.state<>'revealed' OR sig.revision<>(p->>'expectedSignalRevision')::integer OR proof.signal_revision<>sig.revision THEN RAISE EXCEPTION 'STALE_REVISION' USING ERRCODE='40001'; END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j AND id=proof.lock_id;
 IF ref IS NOT NULL THEN
  IF l.snapshot->'baselineScopeItemIds' ? ref::text THEN kind:='baseline';
  ELSIF answer='already_included' AND EXISTS(SELECT 1 FROM jsonb_array_elements(l.snapshot->'lines') line WHERE line.value->>'id'=ref::text) THEN kind:='line';
  ELSE RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 resolved:=CASE WHEN answer IN('already_included','in_original_scope') AND ref IS NULL THEN 'attribution_disputed' ELSE answer END;
 INSERT INTO app.shadow_signal_disposition(tenant_id,job_id,id,run_id,signal_id,disposition) VALUES(t,j,disposition,proof.run_id,proof.signal_id,resolved);
 INSERT INTO app.final_check_disposition_binding(tenant_id,job_id,disposition_id,run_id,signal_id,lock_id,expected_signal_revision,command_id,actor_membership_id,identity_user_id,answer,selected_reference_id,selected_reference_kind,request_hash,audit_event_id)
 VALUES(t,j,disposition,proof.run_id,proof.signal_id,l.id,sig.revision,cid,actor.member_id,actor.user_id,answer,ref,kind,request_digest,event);
 UPDATE app.shadow_commercial_signal SET state=CASE WHEN resolved='attribution_disputed' THEN 'attribution_disputed' ELSE 'dismissed' END,revision=revision+1 WHERE tenant_id=t AND job_id=j AND id=sig.id;
 IF resolved='attribution_disputed' THEN INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref) VALUES(t,j,gen_random_uuid(),sig.id,'attribution_disputed',disposition::text); END IF;
 result:=jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'runId',proof.run_id,'lockId',l.id,'disposition',resolved);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(t,cid,'RecordFinalCheckDisposition',j::text,request_digest,'succeeded',result,actor.member_id,clock_timestamp());
 PERFORM app.append_final_check_audit(event,'membership:'||actor.member_id::text,j,'final_check.disposition_recorded',jsonb_build_object('dispositionId',disposition,'signalId',sig.id,'commandId',cid,'runId',proof.run_id));
 RETURN result;
END $$;
CREATE FUNCTION app.read_final_check_disputes(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.final_check_builder(t,j,d);
 IF NOT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN RETURN '[]'::jsonb; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('dispositionId',b.disposition_id,'signalId',b.signal_id,'runId',b.run_id,'lockId',b.lock_id,'answer',b.answer) ORDER BY b.disposition_id),'[]')
 FROM app.final_check_disposition_binding b JOIN app.shadow_signal_disposition s ON(s.tenant_id,s.id)=(b.tenant_id,b.disposition_id) WHERE b.tenant_id=t AND b.job_id=j AND s.disposition='attribution_disputed');
END $$;

DO $$ DECLARE sig text; BEGIN
 FOREACH sig IN ARRAY ARRAY['final_check_context(uuid)','final_check_worker(uuid,uuid)','final_check_builder(uuid,uuid,text,boolean)','append_final_check_audit(uuid,text,uuid,text,jsonb)',
 'begin_final_check(uuid,uuid,text,text)','read_final_check_manifest(uuid,uuid,uuid)','record_final_check_source_result(uuid,uuid,uuid,uuid,uuid,jsonb)','complete_final_check(uuid,uuid,uuid,jsonb)',
 'read_final_check_reveal(uuid,uuid,text)','record_final_check_disposition(uuid,uuid,text,jsonb)','read_final_check_disputes(uuid,uuid,text)'] LOOP
  EXECUTE 'ALTER FUNCTION app.'||sig||' OWNER TO jobguard_migration';
  EXECUTE 'REVOKE ALL ON FUNCTION app.'||sig||' FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access';
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.begin_final_check(uuid,uuid,text,text) TO jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.read_final_check_manifest(uuid,uuid,uuid) TO jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.record_final_check_source_result(uuid,uuid,uuid,uuid,uuid,jsonb) TO jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.complete_final_check(uuid,uuid,uuid,jsonb) TO jobguard_shadow;
GRANT EXECUTE ON FUNCTION app.read_final_check_reveal(uuid,uuid,text) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.record_final_check_disposition(uuid,uuid,text,jsonb) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.read_final_check_disputes(uuid,uuid,text) TO jobguard_runtime;

-- Immutable receive time and existing lock determine the exclusion; no worker or client date can clear it.
CREATE FUNCTION app.final_check_post_lock_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE previous_context text:=current_setting('app.tenant_id',true);
BEGIN
 IF NOT pg_has_role(session_user,'jobguard_shadow','USAGE') AND NOT pg_has_role(session_user,'jobguard_migration','USAGE') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Migration-owned fixture/backfill writes may be unscoped; business shadow writes must retain verified tenant RLS context.
 IF NOT pg_has_role(session_user,'jobguard_migration','USAGE') THEN PERFORM app.final_check_context(NEW.tenant_id); END IF;
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 IF EXISTS(SELECT 1 FROM app.final_account_lock l WHERE l.tenant_id=NEW.tenant_id AND l.job_id=NEW.job_id AND NEW.source_received_at>l.locked_at) THEN
  INSERT INTO app.shadow_signal_ineligibility(tenant_id,job_id,id,signal_id,reason,source_ref) VALUES(NEW.tenant_id,NEW.job_id,gen_random_uuid(),NEW.signal_id,'evidence_after_lock',NEW.evidence_id::text) ON CONFLICT DO NOTHING;
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(previous_context,''),true);
 RETURN NEW;
END $$;
ALTER FUNCTION app.final_check_post_lock_link() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_post_lock_link() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
CREATE TRIGGER final_check_post_lock_link AFTER INSERT ON app.shadow_signal_evidence FOR EACH ROW EXECUTE FUNCTION app.final_check_post_lock_link();


CREATE FUNCTION app.final_check_guard_fact() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE m app.final_check_manifest;l app.final_account_lock;s app.shadow_signal_disposition;c app.shadow_signal_classification;
BEGIN
 IF TG_TABLE_NAME='final_check_processing_source' THEN
  SELECT * INTO m FROM app.final_check_manifest WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.manifest_id;
  IF NOT FOUND OR NEW.source_received_at>m.evidence_cutoff_at OR NEW.input_hash<>app.final_lock_hash(NEW.frozen_input) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  IF NEW.evidence_id IS NULL THEN
   IF NEW.processable OR NOT (
    (NEW.source_kind='pending_upload' AND EXISTS(SELECT 1 FROM app.evidence_upload u WHERE u.tenant_id=NEW.tenant_id AND u.job_id=NEW.job_id AND u.id=NEW.source_ref AND u.server_received_at=NEW.source_received_at AND to_jsonb(u)=NEW.frozen_input)) OR
    (NEW.source_kind='unlinked_supplier_version' AND EXISTS(SELECT 1 FROM app.supplier_document_version v WHERE v.tenant_id=NEW.tenant_id AND v.job_id=NEW.job_id AND v.id=NEW.source_ref AND v.created_at=NEW.source_received_at AND to_jsonb(v)=NEW.frozen_input)) OR
    (NEW.source_kind='unlinked_supplier_document' AND EXISTS(SELECT 1 FROM app.supplier_document v WHERE v.tenant_id=NEW.tenant_id AND v.job_id=NEW.job_id AND v.id=NEW.source_ref AND v.created_at=NEW.source_received_at AND to_jsonb(v)=NEW.frozen_input)) OR
    (NEW.source_kind='unlinked_purchase_order' AND EXISTS(SELECT 1 FROM app.purchase_order_revision v WHERE v.tenant_id=NEW.tenant_id AND v.job_id=NEW.job_id AND v.id=NEW.source_ref AND v.created_at=NEW.source_received_at AND to_jsonb(v)=NEW.frozen_input)) OR
    (NEW.source_kind='unlinked_capture_source' AND EXISTS(SELECT 1 FROM app.capture_source v JOIN app.job_record_proposal p ON(p.tenant_id,p.source_id)=(v.tenant_id,v.id) WHERE p.tenant_id=NEW.tenant_id AND p.job_id=NEW.job_id AND v.id=NEW.source_ref AND v.created_at=NEW.source_received_at AND to_jsonb(v)=NEW.frozen_input))
   ) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
  ELSIF NEW.evidence_id<>NEW.source_ref OR NOT EXISTS(SELECT 1 FROM app.evidence_object e WHERE e.tenant_id=NEW.tenant_id AND e.job_id=NEW.job_id AND e.id=NEW.evidence_id AND e.kind='original' AND to_jsonb(e)=NEW.frozen_input) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 ELSIF TG_TABLE_NAME='final_check_reveal_proof' THEN
  SELECT * INTO c FROM app.shadow_signal_classification WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.classification_id AND run_id=NEW.run_id AND signal_id=NEW.signal_id;
  SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.lock_id;
  IF c.id IS NULL OR l.id IS NULL OR NEW.capture_register_hash<>l.capture_register_hash OR NEW.line_set_hash<>l.line_set_hash OR NEW.evidence_set_hash<>app.final_lock_hash(NEW.evidence) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 ELSIF TG_TABLE_NAME='final_check_disposition_binding' THEN
  SELECT * INTO s FROM app.shadow_signal_disposition WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.disposition_id AND run_id=NEW.run_id AND signal_id=NEW.signal_id;
  SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.lock_id;
  IF s.id IS NULL OR l.id IS NULL OR s.disposition NOT IN(NEW.answer,'attribution_disputed') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NEW.selected_reference_kind='baseline' AND NOT l.snapshot->'baselineScopeItemIds' ? NEW.selected_reference_id::text THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF NEW.selected_reference_kind='line' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(l.snapshot->'lines') line WHERE line.value->>'id'=NEW.selected_reference_id::text) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.final_check_guard_fact() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_guard_fact() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
CREATE TRIGGER final_check_source_identity BEFORE INSERT ON app.final_check_processing_source FOR EACH ROW EXECUTE FUNCTION app.final_check_guard_fact();
CREATE TRIGGER final_check_proof_identity BEFORE INSERT ON app.final_check_reveal_proof FOR EACH ROW EXECUTE FUNCTION app.final_check_guard_fact();
CREATE TRIGGER final_check_disposition_identity BEFORE INSERT ON app.final_check_disposition_binding FOR EACH ROW EXECUTE FUNCTION app.final_check_guard_fact();
CREATE FUNCTION app.final_check_guard_manifest() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app SET timezone='UTC' AS $$
DECLARE l app.final_account_lock;inventory jsonb;
BEGIN
 IF NEW.manifest_hash IS NULL THEN RETURN NULL; END IF;
 PERFORM app.final_check_context(NEW.tenant_id);
 IF NOT pg_has_role(session_user,'jobguard_shadow','USAGE') AND NOT pg_has_role(session_user,'jobguard_migration','USAGE') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.lock_id;
 IF l.id IS NULL OR NEW.evidence_cutoff_at<>l.locked_at OR NEW.frozen_comparisons->'captures' IS DISTINCT FROM l.snapshot->'captureRegister' OR NEW.frozen_comparisons->'lines' IS DISTINCT FROM l.snapshot->'lines'
 OR NEW.frozen_comparisons->'baselineItemIds' IS DISTINCT FROM l.snapshot->'baselineScopeItemIds' OR NEW.processing_source_count<>(SELECT count(*) FROM app.final_check_processing_source WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND manifest_id=NEW.id) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_check_manifest_source ms WHERE ms.tenant_id=NEW.tenant_id AND ms.job_id=NEW.job_id AND ms.manifest_id=NEW.id AND ms.excluded_state IS NULL
  AND NOT EXISTS(SELECT 1 FROM app.final_check_processing_source ps LEFT JOIN app.evidence_object e ON e.tenant_id=ps.tenant_id AND e.job_id=ps.job_id AND e.id=ps.evidence_id
   WHERE ps.tenant_id=ms.tenant_id AND ps.job_id=ms.job_id AND ps.manifest_id=ms.manifest_id AND (e.upload_id=ms.upload_id OR (ps.source_kind='pending_upload' AND ps.source_ref=ms.upload_id)))) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('source_ref',s.source_ref,'kind',s.source_kind,'evidence_id',s.evidence_id,'object_version_id',s.object_version_id,'sha256',s.sha256,'received_at',s.source_received_at,'processable',s.processable,'input',s.frozen_input) ORDER BY s.source_ref,s.source_kind),'[]') INTO inventory
 FROM app.final_check_processing_source s WHERE s.tenant_id=NEW.tenant_id AND s.job_id=NEW.job_id AND s.manifest_id=NEW.id;
 IF NEW.manifest_hash<>app.final_lock_hash(jsonb_build_object('lock',l.snapshot_digest,'cutoff',l.locked_at,'detector',NEW.detector_version,'policy',NEW.policy_version,'sources',inventory,'comparisons',NEW.frozen_comparisons)) THEN RAISE EXCEPTION 'FINAL_CHECK_SOURCE_CHANGED'; END IF;
 RETURN NULL;
END $$;
ALTER FUNCTION app.final_check_guard_manifest() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_guard_manifest() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
CREATE CONSTRAINT TRIGGER final_check_manifest_frozen AFTER INSERT ON app.final_check_manifest DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.final_check_guard_manifest();

CREATE FUNCTION app.final_check_refuse_held_case() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF NEW.case_type='missed_variation_final_account' THEN RAISE EXCEPTION 'FINAL_CHECK_CONFIRMATION_HELD' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.final_check_refuse_held_case() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_refuse_held_case() FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
-- Keep the server-time pin first among BEFORE INSERT row triggers.
CREATE TRIGGER final_check_held_case BEFORE INSERT ON app.recovery_case FOR EACH ROW EXECUTE FUNCTION app.final_check_refuse_held_case();

-- Category only. Q2 still forbids creating a catch case or selecting its initial claim.
ALTER TABLE app.recovery_case DROP CONSTRAINT recovery_case_case_type_check;
ALTER TABLE app.recovery_case ADD CONSTRAINT recovery_case_case_type_check CHECK(case_type IN('merchant_overcharge','withheld_customer_payment','prevention','duplicate_supplier_payment','missed_variation_final_account'));
COMMIT;
