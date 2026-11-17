BEGIN;
-- lock-order-418 (RED): latest mon3_activate is 0373. Only lock ordering changes.
-- CREATE OR REPLACE preserves the existing owner, SECURITY DEFINER and EXECUTE ACL.
CREATE OR REPLACE FUNCTION app.mon3_activate(t uuid,digest text,command_id uuid,v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; b app.trial_business_verification; card app.trial_card_result;
 previous app.trial_admission; prior_count integer; snap uuid; terms app.job_activation_terms; eligibility jsonb;
BEGIN
 -- Authenticate without taking the company lock; every entry point locks job first.
 actor:=app.mon1_company_actor(t,digest);

 -- Checked transaction seam, deliberately unreachable in B. Existing dispatcher owns
 -- exact owner approval, processing receipt/replay and audit-last. The v3 writer
 -- independently verifies that receipt, exact approval, accepted priced quote and parties.
 IF command_id IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object'
 OR NOT(v ?& ARRAY['version','activationId','termsId','jobId','acceptedDocumentId','acceptedDocumentVersion','acceptedDocumentHash','expectedJobRevision','authorizationId'])
 OR v-ARRAY['version','activationId','termsId','jobId','acceptedDocumentId','acceptedDocumentVersion','acceptedDocumentHash','expectedJobRevision','authorizationId']<>'{}'::jsonb
 OR v->>'version' IS DISTINCT FROM 'trial-admission.v1' THEN RAISE EXCEPTION 'INVALID_FREE_FIRST_JOB_INPUT' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=(v->>'jobId')::uuid FOR UPDATE;
 actor:=app.mon3_owner(t,digest);
 SELECT * INTO b FROM app.trial_business_verification WHERE tenant_id=t;
 IF b.id IS NULL THEN RAISE EXCEPTION 'TRIAL_IDENTITY_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT r.* INTO card FROM app.trial_card_result r JOIN app.trial_card_attempt a ON(a.tenant_id,a.verification_id,a.id)=(r.tenant_id,r.verification_id,r.attempt_id)
 WHERE r.tenant_id=t AND r.verification_id=b.id AND r.outcome='completed' ORDER BY r.recorded_at,r.id LIMIT 1;
 IF b.company_number IS NULL AND (b.normalized_phone IS NULL OR card.id IS NULL) THEN RAISE EXCEPTION 'TRIAL_IDENTITY_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO previous FROM app.trial_admission WHERE tenant_id=t AND job_id=(v->>'jobId')::uuid;
 IF previous.activation_id IS NOT NULL THEN RAISE EXCEPTION 'TRIAL_ADMISSION_REPLAY_REQUIRES_RECEIPT' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM app.job_activation a WHERE a.tenant_id=t AND NOT EXISTS(SELECT 1 FROM app.trial_admission d WHERE (d.tenant_id,d.activation_id)=(a.tenant_id,a.id))) THEN
  RAISE EXCEPTION 'TRIAL_LEGACY_POLICY_CONVERSION_FORBIDDEN' USING ERRCODE='55000';
 END IF;
 SELECT count(DISTINCT job_id) INTO prior_count FROM app.job_activation WHERE tenant_id=t AND job_id<>(v->>'jobId')::uuid;
 IF prior_count>0 AND card.id IS NULL THEN RAISE EXCEPTION 'TRIAL_COMPLETED_CARD_REQUIRED' USING ERRCODE='22023'; END IF;
 IF prior_count>0 AND NOT EXISTS(SELECT 1 FROM app.trial_start WHERE tenant_id=t) THEN RAISE EXCEPTION 'TRIAL_LEGACY_POLICY_CONVERSION_FORBIDDEN'; END IF;
 -- No import, historical reopen, practice identity or saved-v1 conversion.
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=(v->>'jobId')::uuid AND provenance='system_generated_quote' AND practice_session_digest IS NULL AND NOT saved_v1_sample)
 OR EXISTS(SELECT 1 FROM app.imported_job_baseline WHERE tenant_id=t AND job_id=(v->>'jobId')::uuid)
 OR EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=(v->>'jobId')::uuid)
 OR EXISTS(SELECT 1 FROM app.job_work_state_event WHERE tenant_id=t AND job_id=(v->>'jobId')::uuid) THEN
  RAISE EXCEPTION 'TRIAL_TARGET_UNAVAILABLE' USING ERRCODE='22023';
 END IF;
 -- Freeze the target while re-reading the advisory source's exact quote,
 -- latest uncancelled acceptance and current party binding. Key claims below,
 -- rather than a tenant-local advisory absence, arbitrate global entitlement.
 PERFORM app.mon3_owner(t,digest);
 eligibility:=app.mon3_read_eligibility(t,digest,(v->>'jobId')::uuid);
 IF (eligibility->'reasons') ?| ARRAY['IMPORTED_TARGET','HISTORICAL_TARGET','STALE_QUOTE_OR_PARTIES','IDENTITY_UNAVAILABLE']
 OR EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=(v->>'jobId')::uuid AND (job_track<>'small_builder' OR environment<>'synthetic_demo')) THEN
  RAISE EXCEPTION 'TRIAL_TARGET_UNAVAILABLE';
 END IF;
 IF prior_count>0 AND NOT EXISTS(SELECT 1 FROM app.subscription_agreement_revision WHERE tenant_id=t AND environment='synthetic_demo' AND cadence='monthly' AND effective_date<=(clock_timestamp() AT TIME ZONE 'Europe/London')::date) THEN
  RAISE EXCEPTION 'TRIAL_SUBSCRIPTION_TERMS_REQUIRED';
 END IF;
 -- Current main deliberately refuses here until MON-1 capacity is integrated.
 -- Card, identity and all-key checks cannot be bypassed by size/shared place.
 PERFORM app.ch4_admit_place(t,(v->>'jobId')::uuid,'switch_live');
 PERFORM app.mon3_owner(t,digest);
 SELECT * INTO terms FROM app.switch_job_live_v3(t,(v->>'activationId')::uuid,(v->>'termsId')::uuid,(v->>'jobId')::uuid,(v->>'acceptedDocumentId')::uuid,(v->>'acceptedDocumentVersion')::integer,(v->>'acceptedDocumentHash')::character(64),(v->>'expectedJobRevision')::integer,actor,command_id,(v->>'authorizationId')::uuid);
 IF prior_count=0 THEN
  snap:=gen_random_uuid();
  -- A's insert trigger derives EVERY stored key. No helper grant or caller-selected key list.
  INSERT INTO app.trial_identity_snapshot(tenant_id,id,job_id,activation_id,version,environment,verification_source,verification_id,verified_at,company_number,normalized_phone,card_fingerprint)
  VALUES(t,snap,terms.job_id,terms.activation_id,'free-first-job-identity.v1','synthetic_demo','fictional_verified_fixture.v1',b.id,b.verified_at,b.company_number,b.normalized_phone,card.fingerprint);
 END IF;
 INSERT INTO app.trial_admission(tenant_id,job_id,activation_id,snapshot_id,verification_id,command_id,admission_kind)
 VALUES(t,terms.job_id,terms.activation_id,snap,b.id,command_id,CASE WHEN prior_count=0 THEN 'first' ELSE 'second' END);
 RETURN jsonb_build_object('jobId',terms.job_id,'activationId',terms.activation_id,'termsId',terms.id,'snapshotId',snap,'state','live');
END $$;
-- Runtime cannot SELECT FOR UPDATE on app.job (0003/0096). Keep that boundary:
-- expose only the authenticated job-first lock and the existing owner check.
CREATE OR REPLACE FUNCTION app.mon3_lock_activation(t uuid,digest text,j uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM app.mon1_company_actor(t,digest);
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
 RETURN app.mon3_owner(t,digest);
END $$;
ALTER FUNCTION app.mon3_lock_activation(uuid,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon3_lock_activation(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mon3_lock_activation(uuid,text,uuid) TO jobguard_runtime;
COMMIT;
