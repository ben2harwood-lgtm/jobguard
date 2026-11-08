BEGIN;
-- LATER-SAFETY-109: audit references alone cannot confer practice ownership.
-- Preserve each current routine; anchor every ancestry edge to the definer-written import.

-- Latest definition: 0171_evidence_proof_rework.sql
CREATE OR REPLACE FUNCTION app.guard_practice_material_requirement() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.tenant_id='11111111-1111-4111-8111-111111111111'::uuid AND NOT EXISTS(
  WITH RECURSIVE owned(id) AS (
   SELECT id FROM app.job WHERE tenant_id=NEW.tenant_id AND practice_session_digest IS NOT DISTINCT FROM nullif(current_setting('app.practice_material_digest',true),'')
   UNION
   SELECT j.id FROM owned source JOIN app.audit_event e ON e.tenant_id=NEW.tenant_id
    AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested'
    AND e.payload->'references'->>'sourceJobId'=source.id::text
   JOIN app.job j ON j.tenant_id=e.tenant_id AND j.id::text=e.subject_ref
    AND j.provenance='imported' AND j.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=NEW.tenant_id AND iv.job_id=j.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=NEW.tenant_id AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||j.id::text AND rv.result->>'jobId'=j.id::text AND rv.result->>'sourceJobId'=source.id::text))
  )
  SELECT 1 FROM owned JOIN app.merchant_sku s ON s.tenant_id=NEW.tenant_id
   WHERE owned.id=NEW.job_id AND s.id=NEW.sku_id
    AND s.practice_session_digest IS NOT DISTINCT FROM nullif(current_setting('app.practice_material_digest',true),'')
 ) THEN RAISE EXCEPTION 'PRACTICE_MATERIAL_NOT_FOUND' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;

-- Latest definition: 0523_ch4_company_workspace_read.sql
CREATE OR REPLACE FUNCTION app.ch4_read_work_facts(t uuid,j uuid,digest text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE events jsonb; links jsonb; lock jsonb;
BEGIN
 -- Company membership is derived from the authenticated server session, as on
 -- the existing command path. Reuse its current owner/job/track checks and facts.
 IF digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN
  RETURN app.ch4_command_work_facts(t,j,digest);
 END IF;
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t)) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(WITH RECURSIVE owned(id) AS(
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
  UNION SELECT job.id FROM owned source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
   JOIN app.job job ON job.tenant_id=e.tenant_id AND job.id::text=e.subject_ref AND job.provenance='imported' AND job.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=job.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||job.id::text AND rv.result->>'jobId'=job.id::text AND rv.result->>'sourceJobId'=source.id::text))
 ) SELECT 1 FROM owned JOIN app.job_commercial_track track ON track.tenant_id=t AND track.job_id=owned.id WHERE owned.id=j AND track.job_track='small_builder' AND track.environment='synthetic_demo') THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('version',version,'id',id,'jobId',job_id,'sequence',sequence,'kind',kind,'factAt',to_char(fact_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'recordedAt',to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sourceReceiptId',source_receipt_id,'commandId',command_id,'predecessorId',predecessor_id,'closeReason',close_reason,'closeNote',close_note) ORDER BY fact_at,id),'[]') INTO events FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j;
 SELECT jsonb_build_object('id',id,'lockedAt',to_char(locked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) INTO lock FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'predecessorJobId',l.predecessor_job_id,'successorJobId',l.successor_job_id,'linkedAt',to_char(l.linked_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY l.linked_at,l.id),'[]') INTO links FROM app.job_link l JOIN app.job predecessor ON predecessor.tenant_id=t AND predecessor.id=l.predecessor_job_id JOIN app.job successor ON successor.tenant_id=t AND successor.id=l.successor_job_id WHERE l.tenant_id=t AND (l.predecessor_job_id=j OR l.successor_job_id=j) AND predecessor.practice_session_digest=digest AND successor.practice_session_digest=digest;
 RETURN jsonb_build_object('version','job-work-state-read.v1','jobId',j,'events',events,'links',links,'lock',lock,'environment','synthetic_demo','realExternalActions',0);
END $$;

-- Latest definition: 0164_job_sources.sql
CREATE OR REPLACE FUNCTION app.read_job_sources(t uuid,j uuid,digest text,source text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE records jsonb;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(digest,t)) THEN RAISE EXCEPTION 'JOB_SOURCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(WITH RECURSIVE owned(id) AS(
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
  UNION SELECT job.id FROM owned source_job JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source_job.id::text
   JOIN app.job job ON job.tenant_id=e.tenant_id AND job.id::text=e.subject_ref AND job.provenance='imported' AND job.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=job.id AND iv.source_job_id=source_job.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||job.id::text AND rv.result->>'jobId'=job.id::text AND rv.result->>'sourceJobId'=source_job.id::text))
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

-- Latest definition: 0201_job_work_state_commands.sql
CREATE OR REPLACE FUNCTION app.ch4_require_command_owner(t uuid,j uuid,digest text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Trusted server membership IDs use the same authority boundary as final-lock
 -- commands. Practice digests still authenticate their persisted session.
 IF digest ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN
  actor:=digest::uuid;
 ELSE
  SELECT a.membership_id INTO actor FROM app.authenticate_practice_session(digest,t) a;
  IF NOT EXISTS(WITH RECURSIVE owned(id) AS(
   SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=digest
   UNION SELECT job.id FROM owned source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
    JOIN app.job job ON job.tenant_id=e.tenant_id AND job.id::text=e.subject_ref AND job.provenance='imported' AND job.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=job.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||job.id::text AND rv.result->>'jobId'=job.id::text AND rv.result->>'sourceJobId'=source.id::text))
  ) SELECT 1 FROM owned WHERE id=j) THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM app.job x JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(x.tenant_id,x.id) WHERE x.tenant_id=t AND x.id=j AND c.job_track='small_builder' AND c.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN
  PERFORM app.final_lock_require_owner(t,actor);
 EXCEPTION WHEN insufficient_privilege THEN
  RAISE EXCEPTION 'WORK_STATE_FORBIDDEN' USING ERRCODE='42501';
 END;
 RETURN actor;
END $$;

-- Latest definition: 0238_final_check.sql
CREATE OR REPLACE FUNCTION app.final_check_builder(t uuid,j uuid,d text,locking boolean DEFAULT false)
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
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=child.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||child.id::text AND rv.result->>'jobId'=child.id::text AND rv.result->>'sourceJobId'=source.id::text))
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

-- Latest definition: 0306_evidence_pack_v3.sql
CREATE OR REPLACE FUNCTION app.evidence_pack_v3_owner(t uuid,c uuid,d text) RETURNS uuid
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE j uuid; a record; owned boolean;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 SELECT * INTO a FROM app.authenticate_practice_session(d,t);
 IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
 SELECT job_id INTO j FROM app.recovery_case WHERE tenant_id=t AND id=c AND synthetic;
 WITH RECURSIVE owned_jobs AS (
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
  UNION SELECT child.id FROM owned_jobs source JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
  JOIN app.job child ON child.tenant_id=e.tenant_id AND child.id::text=e.subject_ref AND child.provenance='imported' AND child.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=child.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||child.id::text AND rv.result->>'jobId'=child.id::text AND rv.result->>'sourceJobId'=source.id::text))
 ) SELECT EXISTS(SELECT 1 FROM owned_jobs WHERE id=j) INTO owned;
 IF NOT owned OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND environment='synthetic_demo' AND job_track='small_builder')
 OR NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 RETURN j;
END $$;

-- Latest definition: 0625_company_import_once.sql
CREATE OR REPLACE FUNCTION app.adopt_invoiced_job_v3(t uuid, source_job uuid, d text, cmd uuid, auth uuid, approved jsonb, request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE admitted app.meter_work_ledger; places integer; outcome text; stage text:=approved->>'lifecyclePoint'; actor uuid; b app.job_party_binding; expected jsonb; h text; target uuid;
 iid uuid:=gen_random_uuid(); terms uuid:=gen_random_uuid(); baseline uuid:=gen_random_uuid();
 binding uuid:=gen_random_uuid(); scope uuid:=gen_random_uuid(); exclusion uuid:=gen_random_uuid(); links jsonb; receipt jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 IF t IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t='11111111-1111-4111-8111-111111111111'::uuid THEN SELECT membership_id INTO actor FROM app.authenticate_practice_session(d,t);
 ELSE actor:=app.ch5_import_actor(t,d); END IF;
 IF stage IS NULL OR stage NOT IN('live','invoiced') THEN RAISE EXCEPTION 'INVALID_IMPORT'; END IF;
 IF stage='live' AND t='11111111-1111-4111-8111-111111111111'::uuid THEN RAISE EXCEPTION 'CAPACITY_ADMISSION_UNAVAILABLE'; END IF;
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT (t<>'11111111-1111-4111-8111-111111111111'::uuid AND EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=source_job AND practice_session_digest IS NULL)) AND NOT EXISTS(
 WITH RECURSIVE owned AS (
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
  UNION SELECT j.id FROM owned s JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job'
   AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=s.id::text
   JOIN app.job j ON j.tenant_id=t AND j.id::text=e.subject_ref AND j.provenance='imported' AND j.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=t AND iv.job_id=j.id AND iv.source_job_id=s.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=t AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||j.id::text AND rv.result->>'jobId'=j.id::text AND rv.result->>'sourceJobId'=s.id::text))
 ) SELECT 1 FROM owned WHERE id=source_job) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=source_job AND job_track<>'small_builder') THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=source_job FOR UPDATE;
 -- An owned imported job remains readable but is never another import source.
 IF EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=source_job AND provenance='imported') THEN
  RAISE EXCEPTION 'IMPORT_ALREADY_ADOPTED'; END IF;
 SELECT x.* INTO b FROM app.job_party_current c JOIN app.job_party_binding x ON(x.tenant_id,x.job_id,x.id)=(c.tenant_id,c.job_id,c.binding_id)
 WHERE c.tenant_id=t AND c.job_id=source_job;
 IF b.id IS NULL THEN RAISE EXCEPTION 'REVISION_CONFLICT'; END IF;
 expected:=jsonb_build_object('version','adopt-job.v3','fixtureId','fictional-extension-v3','sourceJobId',source_job,
  'parties',jsonb_build_object('bindingId',b.id,'customerRevisionId',b.customer_revision_id,'siteRevisionId',b.site_revision_id,'payingPartyRevisionId',b.paying_party_revision_id),
  'lifecyclePoint',stage,'baseline',jsonb_build_object('sourceBaselineId','c5500000-0000-4000-8000-000000000001',
   'sourceHash',encode(public.digest(convert_to('fictional-extension-v3:baseline:1','UTF8'),'sha256'),'hex'),
   'description','Fictional agreed extension baseline','acceptedNetPence',300000,'lines',jsonb_build_array(jsonb_build_object(
    'sourceLineId','c5500000-0000-4000-8000-000000000002','description','Fictional agreed extension works','netPence',300000))),
  'terms',jsonb_build_object('version','synthetic_demo_import.v3','policyVersion','reference_fee_policy_v3','commercialTrack','small_builder'),
  'attestation',jsonb_build_object('version','import-attestation.v3','wording','I attest that this fictional baseline describes work already agreed. Its lineage is builder-attested, not customer acceptance.','attest',true),
  'historyManifest','[]'::jsonb);
 IF approved IS DISTINCT FROM expected OR request_hash IS NULL OR request_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'EXACT_IMPORT_AUTHORIZATION_MISMATCH'; END IF;
 -- All snapshot keys and fixture text are ASCII. Reuse the existing canonical JSON encoder.
 h:=encode(public.digest(convert_to(app.final_lock_canonical(expected),'UTF8'),'sha256'),'hex');
 SELECT subject_ref::uuid INTO target FROM app.command_receipt r JOIN app.decision x ON x.tenant_id=r.tenant_id
  JOIN app.action_authorization a ON(a.tenant_id,a.decision_id)=(x.tenant_id,x.id)
  JOIN app.decision_resolution resolution ON(resolution.tenant_id,resolution.id)=(a.tenant_id,a.resolution_id)
 WHERE r.tenant_id=t AND r.command_id=cmd AND r.status='processing' AND r.command_type='job.adopt_in_flight_v3'
  AND r.semantic_key='import-v3:'||cmd::text AND r.actor_membership_id=actor
  AND a.id=auth AND a.actor_membership_id=actor AND resolution.actor_membership_id=actor AND resolution.resolution='approved'
  AND x.subject_type='job' AND x.action_type='job.adopt_in_flight_v3' AND a.action_type='job.adopt_in_flight_v3'
  AND a.content_hash=h AND a.recipient IS NULL AND a.amount_pence=300000 AND a.currency='GBP' AND a.aggregate_revision=0
  AND a.policy_version='synthetic_demo_import.v3' AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp();
 IF target IS NULL THEN RAISE EXCEPTION 'AUTHORIZATION_INVALID' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM app.job_import_v3 WHERE tenant_id=t AND source_job_id=source_job
  AND (t<>'11111111-1111-4111-8111-111111111111'::uuid OR session_digest=d)) THEN
  RAISE EXCEPTION 'IMPORT_ALREADY_ADOPTED'; END IF;
 -- Link only current overlapping jobs visible to this session, by stable customer/site identities.
 SELECT coalesce(jsonb_agg(j.id ORDER BY j.id),'[]'::jsonb) INTO links FROM app.job j
 JOIN app.job_party_current c ON(c.tenant_id,c.job_id)=(j.tenant_id,j.id)
 JOIN app.job_party_binding p ON(p.tenant_id,p.job_id,p.id)=(c.tenant_id,c.job_id,c.binding_id)
 WHERE j.tenant_id=t AND (j.practice_session_digest=d OR (t<>'11111111-1111-4111-8111-111111111111'::uuid AND j.practice_session_digest IS NULL)) AND j.status='live' AND p.customer_id=b.customer_id AND p.site_id=b.site_id;
 -- LP-2's guard consumes this exact, transaction-bound permit. Authorization was checked above.
 INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,insert_shape,actor_membership_id,command_id,authorization_id)
 VALUES(t,target,pg_backend_pid(),pg_current_xact_id(),'adoption',
  app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object('tenant_id',t,'id',target,
   'title','Fictional imported job','status','draft','revision',1,'provenance','imported',
   'accepted_net_value_pence',300000,'fee_policy_version','reference_fee_policy_v3'))),actor,cmd,auth);
 PERFORM set_config('app.import_command','enabled',true);
 INSERT INTO app.job(tenant_id,id,title,status,revision,provenance,accepted_net_value_pence,fee_policy_version)
 VALUES(t,target,'Fictional imported job','draft',1,'imported',300000,'reference_fee_policy_v3');
 INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance,source_id)
 VALUES(t,target,'small_builder','synthetic_demo','adoption_import',iid);
 INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)
 VALUES(t,binding,target,1,b.customer_id,b.customer_revision_id,b.paying_party_id,b.paying_party_revision_id,b.site_id,b.site_revision_id,'entered');
 INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES(t,target,binding);
 UPDATE app.job SET status=stage WHERE tenant_id=t AND id=target;
 INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES(t,scope,target,'confirmed');
 receipt:=jsonb_build_object('version','job-import-result.v3','importId',iid,'jobId',target,'termsId',terms,'baselineId',baseline,
  'provenance','imported','lineageStrength','builder_attested_weaker','lifecyclePoint',stage,'linkedJobIds',links,
  'meterResultRef',exclusion,'actionHash',h,'environment','synthetic_demo','realExternalActions',0,
  'baseline',jsonb_build_object('acceptedNetPence',300000,'lines',jsonb_build_array(jsonb_build_object(
   'sourceLineId','c5500000-0000-4000-8000-000000000002','scopeItemId',scope,'netPence',300000,'origin','builder_baseline'))));
 INSERT INTO app.job_import_v3(tenant_id,id,job_id,source_job_id,session_digest,command_id,public_request_hash,fixture_id,snapshot,result,meter_exclusion_id,meter_reason,counted_places)
 VALUES(t,iid,target,source_job,d,cmd,request_hash,'fictional-extension-v3',expected,receipt,exclusion,CASE WHEN stage='invoiced' THEN 'imported_at_invoiced_stage' ELSE 'ordinary_start_rule' END,CASE WHEN stage='invoiced' THEN 0 ELSE NULL END);
 IF stage='live' THEN
  PERFORM app.ch4_admit_place(t,target,'switch_live');
  admitted:=app.mon1_refresh_work_ledger(t);
  -- Advisory outcome from the admitted, immutable server ledger. This does
  -- not alter a plan, monthly maximum, obligation or allocation.
  WITH grouped AS (
   SELECT value->>'customerId' customer,value->>'siteId' site,bool_and((value->>'small')::boolean) small
   FROM jsonb_array_elements(admitted.jobs) WHERE (value->>'committed')::boolean GROUP BY 1,2
  ) SELECT count(*)-least(count(*) FILTER(WHERE small),(CASE WHEN admitted.plan='Solo' THEN 4 ELSE 7 END)) INTO places FROM grouped;
  outcome:=CASE WHEN admitted.plan='Builder' AND places>13 THEN 'track_review_due'
   WHEN (admitted.plan='Solo' AND places=6) OR (admitted.plan='Builder' AND places=13) THEN 'grace_place'
   ELSE 'admitted' END;
  -- The command stores the unchanged public result; its existing audit batch
  -- records the admission hash/outcome, so replays never reassess old imports.
  RETURN jsonb_build_object('result',receipt,'admission',jsonb_build_object('sourceHash',admitted.source_hash,'outcome',outcome));
 END IF;
 RETURN receipt;
END $$;

-- Latest definition: 0506_recovery_timeline_store.sql
CREATE OR REPLACE FUNCTION app.apply_recovery_timeline_signal(p_tenant uuid,p_signal jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE
 f app.recovery_follow_up%ROWTYPE;
 incoming_signal_id uuid; event_id uuid; signal_kind text; fingerprint text; previous_hash text; next_state text;
 session_digest text := nullif(current_setting('app.practice_material_digest',true),'');
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR p_tenant IS NULL
    OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- No fingerprint, state or arbitrary extra field is an input to this boundary.
 IF p_signal IS NULL OR jsonb_typeof(p_signal) IS DISTINCT FROM 'object'
    OR NOT (p_signal ?& ARRAY['version','signalId','eventId','kind','ref'])
    OR p_signal - ARRAY['version','signalId','eventId','kind','ref'] <> '{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_each(p_signal - 'ref') e WHERE jsonb_typeof(e.value)<>'string')
    OR p_signal->>'version' NOT IN ('recovery-timeline-signal.v1','recovery-timeline-signal.v2')
    OR p_signal->>'kind' NOT IN ('timer','builder_response','evidence_complete','cancel','close')
    OR jsonb_typeof(p_signal->'ref') IS DISTINCT FROM 'object'
    OR NOT ((p_signal->'ref') ?& ARRAY['tenantId','jobId','caseId','runId','followUpId'])
    OR (p_signal->'ref') - ARRAY['tenantId','jobId','caseId','runId','followUpId'] <> '{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_each(p_signal->'ref') e WHERE jsonb_typeof(e.value)<>'string') THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 incoming_signal_id := (p_signal->>'signalId')::uuid;
 event_id := (p_signal->>'eventId')::uuid;
 signal_kind := p_signal->>'kind';
 IF incoming_signal_id IS NULL OR event_id IS NULL OR signal_kind IS NULL THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('recovery-timeline:'||p_tenant||':signal:'||incoming_signal_id,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('recovery-timeline:'||p_tenant||':intent:'||(p_signal->'ref'->>'followUpId')::uuid,0));
 SELECT * INTO f FROM app.recovery_follow_up
 WHERE tenant_id=p_tenant AND id=(p_signal->'ref'->>'followUpId')::uuid;
 IF NOT FOUND OR f.environment<>'synthetic_demo'
    OR (p_signal->'ref'->>'tenantId')::uuid IS DISTINCT FROM f.tenant_id
    OR (p_signal->'ref'->>'jobId')::uuid IS DISTINCT FROM f.job_id
    OR (p_signal->'ref'->>'caseId')::uuid IS DISTINCT FROM f.case_id
    OR (p_signal->'ref'->>'runId')::uuid IS DISTINCT FROM f.run_id THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 -- Reuse the existing persisted practice-session and immutable ownership checks.
 -- A tenant setting or an invented digest alone cannot authorize a history write.
 IF session_digest IS NULL OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(session_digest,p_tenant))
    OR NOT EXISTS(
     WITH RECURSIVE owned_job AS (
      SELECT j.id FROM app.job j WHERE j.tenant_id=p_tenant AND j.practice_session_digest=session_digest
      UNION
      SELECT j.id FROM owned_job source
      JOIN app.audit_event e ON e.tenant_id=p_tenant AND e.subject_type='job'
       AND e.event_type='job.imported_baseline_attested' AND e.payload->'references'->>'sourceJobId'=source.id::text
      JOIN app.job j ON j.tenant_id=e.tenant_id AND j.id::text=e.subject_ref
       AND j.provenance='imported' AND j.practice_session_digest IS NULL
    AND (EXISTS (SELECT 1 FROM app.job_import_v3 iv WHERE iv.tenant_id=p_tenant AND iv.job_id=j.id AND iv.source_job_id=source.id)
     OR EXISTS (SELECT 1 FROM app.command_receipt rv WHERE rv.tenant_id=p_tenant AND rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'
      AND rv.semantic_key='import:'||j.id::text AND rv.result->>'jobId'=j.id::text AND rv.result->>'sourceJobId'=source.id::text))
     ) SELECT 1 FROM owned_job WHERE id=f.job_id
    ) THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- References come from the immutable follow-up, not a caller-supplied run/hash/state.
 fingerprint := encode(sha256(convert_to(jsonb_build_object(
  'version','recovery-timeline-signal.v2','signalId',incoming_signal_id,'eventId',event_id,'kind',signal_kind,
  'ref',jsonb_build_object('tenantId',f.tenant_id,'jobId',f.job_id,'caseId',f.case_id,
    'runId',f.run_id,'followUpId',f.id))::text,'UTF8')),'hex');
 SELECT s.fingerprint INTO previous_hash FROM app.recovery_timeline_signal s
 WHERE s.tenant_id=p_tenant AND s.signal_id=incoming_signal_id;
 IF previous_hash IS NOT NULL AND previous_hash<>fingerprint THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_CONFLICT' USING ERRCODE='23514';
 END IF;
 next_state := CASE
  WHEN app.recovery_follow_up_stop_reason(p_tenant,f.id) IS NOT NULL THEN 'stopped'
  WHEN EXISTS(SELECT 1 FROM app.recovery_follow_up_due d WHERE d.tenant_id=p_tenant AND d.follow_up_id=f.id) THEN 'review'
  ELSE 'waiting' END;
 INSERT INTO app.recovery_timeline_run AS r(tenant_id,follow_up_id,job_id,case_id,run_id,state)
 VALUES(p_tenant,f.id,f.job_id,f.case_id,f.run_id,next_state)
 ON CONFLICT(tenant_id,follow_up_id) DO UPDATE SET state=CASE WHEN r.state='stopped' THEN 'stopped' ELSE excluded.state END
 RETURNING state INTO next_state;
 IF previous_hash IS NULL THEN
  PERFORM app.record_recovery_timeline_signal(p_tenant,incoming_signal_id,f.id,fingerprint);
 END IF;
 RETURN next_state;
END $$;

COMMIT;
