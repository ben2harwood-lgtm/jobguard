BEGIN;
-- Advisory company reader only. No identity store, key claim, commercial write,
-- practice delegation, or change to 0206's unconditional admission refusal.
CREATE FUNCTION app.mon3_read_eligibility(t uuid,digest text,j uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; target app.job; business app.trial_business_verification;
 card app.trial_card_result; document app.quote_document_version; acceptance app.quote_acceptance;
 parties jsonb; terms uuid; prior_count integer; reasons text[]:='{}';
 keys text[]:='{}'; sources jsonb; target_status text:='unavailable';
 card_gate text; identity_state text; target_ok boolean:=true; local_conflict boolean:=false;
BEGIN
 -- ELIG-G01: persisted synthetic session + SSO + active owner, before job lookup.
 actor:=app.mon3_owner(t,digest);
 SELECT * INTO target FROM app.job WHERE tenant_id=t AND id=j;
 -- ELIG-G02: unknown, foreign and shared-practice targets disclose identically.
 IF target.id IS NULL OR target.practice_session_digest IS NOT NULL THEN
  RAISE EXCEPTION 'FREE_FIRST_JOB_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 -- ELIG-G03: never infer new-job eligibility from accepted status alone.
 IF target.provenance IS DISTINCT FROM 'system_generated_quote'
  OR EXISTS(SELECT 1 FROM app.imported_job_baseline WHERE tenant_id=t AND job_id=j) THEN
  reasons:=array_append(reasons,'IMPORTED_TARGET'); target_ok:=false;
 END IF;
 -- ELIG-G04: immutable activation and operational history outlive present status.
 IF target.saved_v1_sample OR target.baseline_quote_version_id IS NOT NULL
  OR EXISTS(SELECT 1 FROM app.job_activation WHERE tenant_id=t AND job_id=j)
  OR EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND provenance='legacy_synthetic_live_fixture')
  OR EXISTS(SELECT 1 FROM app.job_activation_terms WHERE tenant_id=t AND job_id=j)
  OR EXISTS(SELECT 1 FROM app.job_work_state_event WHERE tenant_id=t AND job_id=j AND kind IN('closed','reopened','resumed'))
  OR EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=t AND job_id=j) THEN
  reasons:=array_append(reasons,'HISTORICAL_TARGET'); target_ok:=false;
 END IF;
 -- ELIG-G05: pre-activation track may be absent; absence is unavailable, never synthetic by default.
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo') THEN
  reasons:=array_append(reasons,'SUPPORTED_TRACK_UNAVAILABLE'); target_ok:=false;
 END IF;
 SELECT * INTO document FROM app.quote_document_version WHERE tenant_id=t AND job_id=j AND id=target.accepted_quote_version_id;
 SELECT a.* INTO acceptance FROM app.quote_acceptance a
  LEFT JOIN app.quote_acceptance_sequence s ON(s.tenant_id,s.acceptance_id)=(a.tenant_id,a.id)
  WHERE a.tenant_id=t AND a.job_id=j AND a.document_id=document.id
  ORDER BY coalesce(s.acceptance_sequence,1) DESC,a.recorded_at DESC,a.id DESC LIMIT 1;
 SELECT p.snapshot INTO parties FROM app.job_party_snapshot p
  JOIN app.job_party_current c ON(c.tenant_id,c.job_id,c.binding_id)=(p.tenant_id,p.job_id,p.binding_id)
  WHERE p.tenant_id=t AND p.job_id=j;
 -- ELIG-G06: exact immutable document, latest uncancelled acceptance, price/tax and current party snapshot.
 IF target.status IS DISTINCT FROM 'accepted' OR document.id IS NULL OR acceptance.id IS NULL
  OR (acceptance.document_version,acceptance.document_hash) IS DISTINCT FROM (document.document_version,document.content_hash)
  OR NOT EXISTS(SELECT 1 FROM app.quote_version q WHERE q.tenant_id=t AND q.job_id=j AND q.id=document.id AND q.status='accepted'
   AND q.version=document.document_version AND q.content_hash=document.content_hash AND q.net_value_pence BETWEEN 0 AND 1000000000000
   AND q.net_value_pence=(document.snapshot->>'netPence')::bigint)
  OR NOT EXISTS(SELECT 1 FROM app.quote_revision q WHERE q.tenant_id=t AND q.job_id=j AND q.id=document.quote_revision_id AND q.issuable AND q.tax_policy_version='candidate_m1_standard_v1')
  OR NOT EXISTS(SELECT 1 FROM app.quote_send s WHERE s.tenant_id=t AND s.job_id=j AND s.document_id=document.id AND s.content_hash=document.content_hash)
  OR EXISTS(SELECT 1 FROM app.acceptance_event e WHERE e.tenant_id=t AND e.job_id=j AND e.document_id=document.id
   AND (e.kind='superseded' OR (e.kind='acceptance_cancelled' AND e.acceptance_id=acceptance.id)))
  OR parties IS NULL OR document.parties_snapshot IS DISTINCT FROM parties THEN
  reasons:=array_append(reasons,'STALE_QUOTE_OR_PARTIES'); target_ok:=false;
 END IF;
 SELECT * INTO business FROM app.trial_business_verification WHERE tenant_id=t;
 -- ELIG-G07: completion must join the same immutable business/attempt; no caller facts.
 SELECT r.* INTO card FROM app.trial_card_result r JOIN app.trial_card_attempt a
  ON(a.tenant_id,a.verification_id,a.id)=(r.tenant_id,r.verification_id,r.attempt_id)
  WHERE r.tenant_id=t AND r.verification_id=business.id AND r.outcome='completed'
  AND a.environment='synthetic_demo' AND a.provider='simulated'
  ORDER BY r.recorded_at,r.id LIMIT 1;
 -- ELIG-G08: sufficient verified identity; phone alone never qualifies a skip.
 identity_state:=CASE WHEN business.id IS NOT NULL AND (business.company_number IS NOT NULL OR (business.normalized_phone IS NOT NULL AND card.id IS NOT NULL)) THEN 'verified' ELSE 'unavailable' END;
 IF identity_state='unavailable' THEN reasons:=array_append(reasons,'IDENTITY_UNAVAILABLE'); END IF;
 SELECT count(DISTINCT job_id) INTO prior_count FROM app.job_activation WHERE tenant_id=t AND job_id<>j;
 card_gate:=CASE WHEN card.id IS NOT NULL THEN 'completed' WHEN prior_count>0 THEN 'add_card' ELSE 'optional_first' END;
 -- ELIG-G09: every distinct second job, independent of meter size or shared place.
 IF prior_count>0 AND card.id IS NULL THEN reasons:=array_append(reasons,'ADD_A_CARD'); END IF;
 -- Same byte tuples as A; check EVERY available tuple without writing/claiming.
 IF business.company_number IS NOT NULL THEN keys:=array_append(keys,array_to_json(ARRAY['free-first-job.v1','company',business.company_number])::text); END IF;
 IF business.normalized_phone IS NOT NULL AND card.id IS NOT NULL THEN keys:=array_append(keys,array_to_json(ARRAY['free-first-job.v1','phone_card',business.normalized_phone,'simulated',card.fingerprint])::text); END IF;
 SELECT EXISTS(SELECT 1 FROM app.trial_identity_key_claim WHERE tenant_id=t AND identity_key=ANY(keys)) INTO local_conflict;
 -- ELIG-G10: tenant-local absence NEVER means globally unclaimed under FORCE RLS.
 -- B supplies no checked global read seam. Identical safe unavailability for every
 -- global state; do not broaden A's policy, change tenant context, or probe by INSERT.
 reasons:=array_append(reasons,'KEY_CHECK_UNAVAILABLE');
 IF local_conflict THEN reasons:=array_append(reasons,'IDENTITY_UNAVAILABLE'); END IF;
 -- ELIG-G12: only an existing effective synthetic monthly agreement is a terms source.
 SELECT id INTO terms FROM app.subscription_agreement_revision WHERE tenant_id=t AND environment='synthetic_demo' AND cadence='monthly'
  AND effective_date<=(clock_timestamp() AT TIME ZONE 'Europe/London')::date ORDER BY revision DESC LIMIT 1;
 IF terms IS NULL THEN reasons:=array_append(reasons,'TERMS_UNAVAILABLE'); END IF;
 IF NOT target_ok OR local_conflict THEN target_status:='ineligible'; END IF;
 reasons:=array_append(reasons,'ADMISSION_DISABLED');
 sources:=jsonb_build_object('documentId',document.id,'acceptanceId',acceptance.id,'partyBindingId',parties->>'bindingId',
  'verificationId',business.id,'cardResultId',card.id,'termsId',terms);
 -- ELIG-G11: renew persisted authority before disclosing, after the owner lock wait.
 PERFORM app.mon3_owner(t,digest);
 RETURN jsonb_build_object('version','trial-eligibility-read.v1','environment','synthetic_demo','hypothetical',true,
  'jobId',j,'jobRevision',target.revision,'targetStatus',target_status,'reasons',to_jsonb(reasons),
  'identity',identity_state,'cardGate',card_gate,'cardAction',CASE WHEN card_gate='add_card' THEN 'Add a card' ELSE NULL END,
  'offerSkip',target_ok AND prior_count=0 AND identity_state='verified' AND card.id IS NULL AND NOT local_conflict,
  'keyCheck','unavailable','admission','disabled','sources',sources,
  'revisionDigest',app.final_lock_hash(jsonb_build_object('jobId',j,'revision',target.revision,'sources',sources,'reasons',reasons,'cardGate',card_gate)));
-- ELIG-G14: normalize authorization/context failures before disclosure.
EXCEPTION WHEN insufficient_privilege OR invalid_text_representation THEN
 -- All authority failures, malformed tenant context and undisclosed targets share one error.
 RAISE EXCEPTION 'FREE_FIRST_JOB_ACCESS_DENIED' USING ERRCODE='42501';
END $$;
-- ELIG-G13: narrow owner/EXECUTE boundary, including inherited default grants.
ALTER FUNCTION app.mon3_read_eligibility(uuid,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon3_read_eligibility(uuid,text,uuid) FROM PUBLIC;
-- Normalize inherited default grants as well as PUBLIC.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
  WHERE p.oid='app.mon3_read_eligibility(uuid,text,uuid)'::regprocedure AND a.grantee<>p.proowner AND a.grantee<>0 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION app.mon3_read_eligibility(uuid,text,uuid) FROM %I',pg_get_userbyid(r.grantee));
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.mon3_read_eligibility(uuid,text,uuid) TO jobguard_runtime;
COMMIT;
