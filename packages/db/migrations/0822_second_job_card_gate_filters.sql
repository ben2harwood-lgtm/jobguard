BEGIN;
-- LATER-SAFETY-86: synthetic card provenance and fail-closed integrity family.
-- Replace latest bodies only; owner, ACLs and security settings are preserved.
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
 WHERE r.tenant_id=t AND r.verification_id=b.id AND r.outcome='completed'
 AND a.environment='synthetic_demo' AND a.provider='simulated' ORDER BY r.recorded_at,r.id LIMIT 1;
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
 -- A second job claims no key, so the company's own first-trial claim must not refuse it.
 -- Identity itself was already required above; only a first job can conflict on keys.
 IF (eligibility->'reasons') ?| ARRAY['IMPORTED_TARGET','HISTORICAL_TARGET','STALE_QUOTE_OR_PARTIES']
 OR (prior_count=0 AND (eligibility->'reasons') ? 'IDENTITY_UNAVAILABLE')
 OR EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=(v->>'jobId')::uuid AND (job_track<>'small_builder' OR environment<>'synthetic_demo')) THEN
  RAISE EXCEPTION 'TRIAL_TARGET_UNAVAILABLE';
 END IF;
 IF prior_count>0 AND NOT EXISTS(SELECT 1 FROM app.subscription_agreement_revision WHERE tenant_id=t AND environment='synthetic_demo' AND cadence='monthly' AND effective_date<=(clock_timestamp() AT TIME ZONE 'Europe/London')::date) THEN
  RAISE EXCEPTION 'TRIAL_SUBSCRIPTION_TERMS_REQUIRED';
 END IF;
 -- Capacity: mon1_live_admission (0380) admits this place when the v3 writer below inserts its terms,
 -- under the agreement this job is judged against. A first job with no agreement has no plan to count.
 -- Card, identity and all-key checks cannot be bypassed by size/shared place.
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

CREATE OR REPLACE FUNCTION app.ch6_integrity_family(t uuid,j uuid) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE r record;policies text[];v1 boolean;v3 boolean;
BEGIN
 SELECT x.saved_v1_sample,x.provenance,x.fee_policy_version job_policy,a.fee_policy_version activation_policy,
  q.policy_version terms_policy,q.commercial_track terms_track,c.job_track,c.environment INTO r
 FROM app.job x LEFT JOIN app.job_activation a ON(a.tenant_id,a.job_id)=(x.tenant_id,x.id)
 LEFT JOIN app.job_activation_terms q ON(q.tenant_id,q.job_id)=(x.tenant_id,x.id)
 LEFT JOIN app.job_commercial_track c ON(c.tenant_id,c.job_id)=(x.tenant_id,x.id)
 WHERE x.tenant_id=t AND x.id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='42501'; END IF;
 policies:=array_remove(ARRAY[r.job_policy,r.activation_policy,r.terms_policy],NULL);
 IF coalesce(r.environment,'')<>'synthetic_demo' OR
  (r.terms_track IS NOT NULL AND r.terms_track<>'small_builder') OR (r.job_track IS NOT NULL AND r.job_track<>'small_builder') OR
  EXISTS(SELECT 1 FROM unnest(policies) p WHERE p NOT IN ('reference_fee_policy_v1','reference_fee_policy_v3')) THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 v1:=r.saved_v1_sample OR 'reference_fee_policy_v1'=ANY(policies);v3:='reference_fee_policy_v3'=ANY(policies);
 IF v1 AND v3 THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 IF v1 THEN RETURN 'v1'; END IF;
 IF r.provenance<>'system_generated_quote' THEN RAISE EXCEPTION 'INTEGRITY_FAMILY_UNAVAILABLE'; END IF;
 RETURN 'v3';
END $$;
COMMIT;
