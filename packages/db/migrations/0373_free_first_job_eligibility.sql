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
 -- ELIG-G05: new system-generated quotes acquire small-builder terms in v3.
 -- An existing incompatible track is unavailable; absence is not an admission grant.
 IF EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j) AND NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo') THEN
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
-- MON-3C-END/CONV/WIRE. Synthetic-only source storage. No legacy backfill.
CREATE UNIQUE INDEX trial_admission_one_first ON app.trial_admission(tenant_id) WHERE admission_kind='first';
CREATE TABLE app.trial_start (
 tenant_id uuid NOT NULL, id uuid NOT NULL, job_id uuid NOT NULL, activation_id uuid NOT NULL,
 started_at timestamptz NOT NULL, deadline_at timestamptz NOT NULL,
 clock_policy text NOT NULL CHECK(clock_policy='london-midnight-day-90-exclusive-v1'),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,activation_id,id) REFERENCES app.trial_identity_snapshot(tenant_id,job_id,activation_id,id),
 CHECK(deadline_at>started_at)
);
CREATE TABLE app.trial_end_source (
 tenant_id uuid NOT NULL, trial_id uuid NOT NULL, source_id uuid NOT NULL, job_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('lock','close','second_activation')),
 effective_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,trial_id,source_id),
 FOREIGN KEY(tenant_id,trial_id) REFERENCES app.trial_start(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id), CHECK(recorded_at>=effective_at)
);
CREATE TABLE app.trial_subscription_source (
 tenant_id uuid NOT NULL, source_id uuid NOT NULL, trial_id uuid NOT NULL, input jsonb NOT NULL,
 conversion_date date, pinned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,source_id),
 FOREIGN KEY(tenant_id,source_id) REFERENCES app.meter_input_event(tenant_id,id),
 FOREIGN KEY(tenant_id,trial_id) REFERENCES app.trial_start(tenant_id,id)
);
DO $$ DECLARE tab text; r record; BEGIN
 FOREACH tab IN ARRAY ARRAY['trial_start','trial_end_source','trial_subscription_source'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',tab);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I TO jobguard_migration USING(tenant_id::text=current_setting(''app.tenant_id'',true)) WITH CHECK(tenant_id::text=current_setting(''app.tenant_id'',true))',tab);
  EXECUTE format('REVOKE ALL ON TABLE app.%I FROM PUBLIC',tab);
  FOR r IN SELECT DISTINCT a.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid=format('app.%I',tab)::regclass AND a.grantee<>c.relowner AND a.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL ON TABLE app.%I FROM %I',tab,pg_get_userbyid(r.grantee));
  END LOOP;
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',tab);
  EXECUTE format('CREATE TRIGGER no_truncate BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',tab);
 END LOOP;
END $$;
-- Sources are written only by source-table triggers; never by an HTTP timestamp.
CREATE FUNCTION app.mon3_capture_lifecycle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.trial_start; at_time timestamptz; source uuid; source_job uuid; source_kind text;
BEGIN
 IF TG_TABLE_NAME='trial_admission' THEN
  IF NEW.admission_kind='first' THEN
   SELECT activated_at INTO STRICT at_time FROM app.job_activation WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.activation_id;
   INSERT INTO app.trial_start(tenant_id,id,job_id,activation_id,started_at,deadline_at,clock_policy)
   VALUES(NEW.tenant_id,NEW.snapshot_id,NEW.job_id,NEW.activation_id,at_time,
    (((at_time AT TIME ZONE 'Europe/London')::date+90)::timestamp AT TIME ZONE 'Europe/London'),'london-midnight-day-90-exclusive-v1');
   RETURN NEW;
  END IF;
  source:=NEW.activation_id; source_job:=NEW.job_id; source_kind:='second_activation';
  SELECT activated_at INTO STRICT at_time FROM app.job_activation WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND id=NEW.activation_id;
 ELSIF TG_TABLE_NAME='final_account_lock' THEN
  source:=NEW.id; source_job:=NEW.job_id; source_kind:='lock'; at_time:=NEW.locked_at;
 ELSE
  IF NEW.kind<>'closed' THEN RETURN NEW; END IF;
  source:=NEW.id; source_job:=NEW.job_id; source_kind:='close'; at_time:=NEW.fact_at;
 END IF;
 SELECT * INTO s FROM app.trial_start WHERE tenant_id=NEW.tenant_id;
 IF s.id IS NULL OR (source_kind<>'second_activation' AND source_job<>s.job_id) THEN RETURN NEW; END IF;
 IF at_time<s.started_at OR (source_kind='second_activation' AND source_job=s.job_id) THEN RAISE EXCEPTION 'INVALID_TRIAL_SOURCE'; END IF;
 INSERT INTO app.trial_end_source(tenant_id,trial_id,source_id,job_id,kind,effective_at,recorded_at)
 VALUES(NEW.tenant_id,s.id,source,source_job,source_kind,at_time,greatest(at_time,clock_timestamp()));
 RETURN NEW;
END $$;
CREATE TRIGGER mon3_capture_start AFTER INSERT ON app.trial_admission FOR EACH ROW EXECUTE FUNCTION app.mon3_capture_lifecycle();
CREATE TRIGGER mon3_capture_lock AFTER INSERT ON app.final_account_lock FOR EACH ROW EXECUTE FUNCTION app.mon3_capture_lifecycle();
CREATE TRIGGER mon3_capture_close AFTER INSERT ON app.job_work_state_event FOR EACH ROW EXECUTE FUNCTION app.mon3_capture_lifecycle();
CREATE FUNCTION app.mon3_trial_date(t uuid,as_of timestamptz) RETURNS date LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE s app.trial_start; ended timestamptz;
BEGIN
 SELECT * INTO s FROM app.trial_start WHERE tenant_id=t;
 IF s.id IS NULL THEN RETURN NULL; END IF;
 SELECT least(s.deadline_at,min(effective_at)) INTO ended FROM app.trial_end_source WHERE tenant_id=t AND trial_id=s.id AND recorded_at<=as_of AND effective_at<=as_of;
 IF ended>as_of THEN RETURN NULL; END IF;
 -- Safest choice: lock/close day is free. Explicit second activation and the
 -- exclusive midnight deadline begin that date, including co-earliest sources.
 IF ended=s.deadline_at OR EXISTS(SELECT 1 FROM app.trial_end_source WHERE tenant_id=t AND trial_id=s.id AND effective_at=ended AND recorded_at<=as_of AND kind='second_activation') THEN
  RETURN (ended AT TIME ZONE 'Europe/London')::date;
 END IF;
 RETURN (ended AT TIME ZONE 'Europe/London')::date+1;
END $$;
CREATE FUNCTION app.mon3_read_lifecycle(t uuid,digest text,j uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s app.trial_start; events jsonb; at_time timestamptz:=clock_timestamp();
BEGIN
 PERFORM app.mon3_owner(t,digest);
 at_time:=clock_timestamp();
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j AND practice_session_digest IS NULL) THEN RAISE EXCEPTION 'FREE_FIRST_JOB_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM app.trial_start WHERE tenant_id=t AND job_id=j;
 SELECT coalesce(jsonb_agg(jsonb_build_object('sourceId',source_id,'kind',kind,'tenantId',tenant_id,'jobId',job_id,
  'effectiveAt',to_char(effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'recordedAt',to_char(recorded_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) ORDER BY effective_at,source_id),'[]') INTO events
 FROM app.trial_end_source WHERE tenant_id=t AND trial_id=s.id;
 PERFORM app.mon3_owner(t,digest);
 RETURN jsonb_build_object('version','trial-lifecycle-source.v1','environment','synthetic_demo','tenantId',t,'jobId',j,
  'asOf',to_char(at_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'target',(SELECT CASE WHEN d.id IS NULL OR j0.status<>'accepted' THEN NULL ELSE jsonb_build_object('acceptedDocumentId',d.id,'acceptedDocumentVersion',d.document_version,'acceptedDocumentHash',d.content_hash,'expectedJobRevision',j0.revision) END FROM app.job j0 LEFT JOIN app.quote_document_version d ON(d.tenant_id,d.job_id,d.id)=(j0.tenant_id,j0.id,j0.accepted_quote_version_id) WHERE j0.tenant_id=t AND j0.id=j),
  'start',CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('trialId',s.id,'activationId',s.activation_id,
   'startedAt',to_char(s.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
   'deadlineAt',to_char(s.deadline_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) END,'events',events);
END $$;
-- Public synthetic action chooses only the fixed simulated card. No caller
-- fingerprint, completion outcome, reference or verification data is accepted.
CREATE FUNCTION app.mon3_simulate_card(t uuid,digest text,command_id uuid,v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; attempt app.trial_card_attempt; existing app.trial_card_result; s app.trial_start; phone text; k text; claimed app.trial_identity_key_claim;
BEGIN
 actor:=app.mon3_owner(t,digest);
 IF v IS DISTINCT FROM '{"version":"trial-card-simulate.v1"}'::jsonb THEN RAISE EXCEPTION 'INVALID_FREE_FIRST_JOB_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO attempt FROM app.trial_card_attempt WHERE tenant_id=t AND trial_card_attempt.command_id=mon3_simulate_card.command_id AND actor_membership_id=actor;
 IF attempt.id IS NULL THEN RAISE EXCEPTION 'TRIAL_CARD_ATTEMPT_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO existing FROM app.trial_card_result WHERE tenant_id=t AND attempt_id=attempt.id;
 IF existing.id IS NOT NULL AND existing.outcome<>'completed' THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='22023'; END IF;
 -- A skipped first card has no phone/card key at start. Bind the newly
 -- available tuple to the original immutable snapshot BEFORE the audit lock.
 SELECT * INTO s FROM app.trial_start WHERE tenant_id=t;
 SELECT normalized_phone INTO phone FROM app.trial_business_verification WHERE tenant_id=t AND id=attempt.verification_id;
 IF s.id IS NOT NULL AND phone IS NOT NULL THEN
  k:=array_to_json(ARRAY['free-first-job.v1','phone_card',phone,'simulated','sim_fp_card_a'])::text;
  BEGIN
   INSERT INTO app.trial_identity_key_claim(identity_key,tenant_id,job_id,activation_id,snapshot_id) VALUES(k,t,s.job_id,s.activation_id,s.id);
  EXCEPTION WHEN unique_violation THEN
   SELECT * INTO claimed FROM app.trial_identity_key_claim WHERE identity_key=k;
   IF (claimed.tenant_id,claimed.snapshot_id) IS DISTINCT FROM (t,s.id) THEN RAISE EXCEPTION 'TRIAL_IDENTITY_CONFLICT' USING ERRCODE='23505'; END IF;
  END;
 END IF;
 PERFORM app.mon3_record_card_fixture(t,digest,coalesce(existing.id,attempt.id),jsonb_build_object('version','trial-card-fixture.v1','attemptId',attempt.id,'outcome','completed','fixtureCard','card_a'));
 RETURN jsonb_build_object('version','trial-card-simulated.v1','environment','synthetic_demo','hypothetical',true,'completed',true);
END $$;
-- New composed boundary. The original B denial routine remains a closed legacy
-- entrypoint; no previous callers become enabled by changing its signature.
CREATE FUNCTION app.mon3_activate(t uuid,digest text,command_id uuid,v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; b app.trial_business_verification; card app.trial_card_result;
 previous app.trial_admission; prior_count integer; snap uuid; terms app.job_activation_terms; eligibility jsonb;
BEGIN
 actor:=app.mon3_owner(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.mon3_owner(t,digest);

 -- Checked transaction seam, deliberately unreachable in B. Existing dispatcher owns
 -- exact owner approval, processing receipt/replay and audit-last. The v3 writer
 -- independently verifies that receipt, exact approval, accepted priced quote and parties.
 IF command_id IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object'
 OR NOT(v ?& ARRAY['version','activationId','termsId','jobId','acceptedDocumentId','acceptedDocumentVersion','acceptedDocumentHash','expectedJobRevision','authorizationId'])
 OR v-ARRAY['version','activationId','termsId','jobId','acceptedDocumentId','acceptedDocumentVersion','acceptedDocumentHash','expectedJobRevision','authorizationId']<>'{}'::jsonb
 OR v->>'version' IS DISTINCT FROM 'trial-admission.v1' THEN RAISE EXCEPTION 'INVALID_FREE_FIRST_JOB_INPUT' USING ERRCODE='22023'; END IF;
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
 PERFORM 1 FROM app.job WHERE tenant_id=t AND id=(v->>'jobId')::uuid FOR UPDATE;
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
CREATE FUNCTION app.mon3_require_registered_admission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE previous_context text:=current_setting('app.tenant_id',true);
BEGIN
 -- Deferred checks must inspect the inserted server row's tenant even if the
 -- caller changes/clears its transaction context before COMMIT. No context or
 -- business data is returned; restore the original setting on every exit.
 PERFORM set_config('app.tenant_id',NEW.tenant_id::text,true);
 IF EXISTS(SELECT 1 FROM app.trial_business_verification WHERE tenant_id=NEW.tenant_id)
 AND NOT EXISTS(SELECT 1 FROM app.trial_admission WHERE tenant_id=NEW.tenant_id AND job_id=NEW.job_id AND activation_id=NEW.id) THEN
  RAISE EXCEPTION 'TRIAL_CHECKED_ACTIVATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 PERFORM set_config('app.tenant_id',coalesce(previous_context,''),true);
 RETURN NULL;
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('app.tenant_id',coalesce(previous_context,''),true);
 RAISE;
END $$;
CREATE CONSTRAINT TRIGGER mon3_checked_activation AFTER INSERT ON app.job_activation DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.mon3_require_registered_admission();
CREATE FUNCTION app.mon3_build_source(t uuid,digest text,source_id uuid,as_of timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE src app.meter_input_event; day jsonb; selected_plan text; days jsonb:='[]'; s app.trial_start; conversion date;
BEGIN
 PERFORM app.mon1_company_actor(t,digest);
 SELECT * INTO src FROM app.meter_input_event WHERE tenant_id=t AND id=source_id;
 IF src.id IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM app.trial_start WHERE tenant_id=t;
 conversion:=app.mon3_trial_date(t,as_of);
 IF s.id IS NOT NULL AND (src.period_end<=(s.started_at AT TIME ZONE 'Europe/London')::date OR src.period_end>(as_of AT TIME ZONE 'Europe/London')::date) THEN RAISE EXCEPTION 'TRIAL_PERIOD_BOUNDARY_UNAVAILABLE'; END IF;
 FOR day IN SELECT value FROM jsonb_array_elements(src.input->'days') ORDER BY value->>'date' LOOP
  SELECT plan INTO selected_plan FROM app.subscription_agreement_revision WHERE tenant_id=t AND effective_date<=(day->>'date')::date ORDER BY effective_date DESC,revision DESC LIMIT 1;
  IF selected_plan IS NULL AND s.id IS NOT NULL AND (day->>'date')::date<(s.started_at AT TIME ZONE 'Europe/London')::date THEN
   -- Initial stub's pre-start days are free. The first accepted monthly plan
   -- supplies only an arithmetic label; it creates no earlier obligation.
   SELECT plan INTO selected_plan FROM app.subscription_agreement_revision WHERE tenant_id=t AND cadence='monthly' ORDER BY effective_date,revision LIMIT 1;
  END IF;
  IF selected_plan IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_TERMS_UNAVAILABLE' USING ERRCODE='22023'; END IF;
  days:=days||jsonb_build_array(day||jsonb_build_object('plan',selected_plan,'annualPrepaid',false,'trial',s.id IS NOT NULL AND (conversion IS NULL OR (day->>'date')::date<conversion)));
 END LOOP;
 RETURN src.input||jsonb_build_object('days',days);
END $$;
CREATE OR REPLACE FUNCTION app.mon2_source(t uuid,digest text,source_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved jsonb;
BEGIN
 PERFORM app.mon1_company_actor(t,digest);
 SELECT input INTO saved FROM app.trial_subscription_source WHERE tenant_id=t AND trial_subscription_source.source_id=mon2_source.source_id;
 IF saved IS NOT NULL THEN RETURN saved; END IF;
 RETURN app.mon3_build_source(t,digest,source_id,clock_timestamp());
END $$;
CREATE FUNCTION app.mon3_pin_source(t uuid,digest text,source uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE s app.trial_start; at_time timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO s FROM app.trial_start WHERE tenant_id=t;
 IF s.id IS NULL THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM app.meter_correction WHERE tenant_id=t AND apply_start=(SELECT period_start FROM app.meter_input_event WHERE tenant_id=t AND id=source)) THEN
  RAISE EXCEPTION 'TRIAL_CORRECTION_REVIEW_REQUIRED';
 END IF;
 INSERT INTO app.trial_subscription_source(tenant_id,source_id,trial_id,input,conversion_date,pinned_at)
 VALUES(t,source,s.id,app.mon3_build_source(t,digest,source,at_time),app.mon3_trial_date(t,at_time),at_time)
 ON CONFLICT(tenant_id,source_id) DO NOTHING;
END $$;
CREATE FUNCTION app.mon3_validate_billing(t uuid,authorization_id uuid) RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT NOT EXISTS(SELECT 1 FROM app.trial_start WHERE tenant_id=t)
 OR NOT EXISTS(SELECT 1 FROM app.action_authorization WHERE tenant_id=t AND id=authorization_id AND action_type='subscription.simulate' AND amount_pence>0)
 OR (EXISTS(SELECT 1 FROM app.trial_card_result r JOIN app.trial_business_verification b ON(b.tenant_id,b.id)=(r.tenant_id,r.verification_id) WHERE r.tenant_id=t AND r.outcome='completed')
 AND NOT EXISTS(SELECT 1 FROM app.subscription_simulated_work w
  JOIN app.platform_statement st ON(st.tenant_id,st.id)=(w.tenant_id,w.statement_id)
  JOIN app.subscription_period period ON(period.tenant_id,period.id)=(st.tenant_id,st.period_id)
  JOIN app.trial_subscription_source p ON(p.tenant_id,p.source_id)=(period.tenant_id,period.source_id)
  WHERE w.tenant_id=t AND w.authorization_id=mon3_validate_billing.authorization_id AND p.conversion_date IS DISTINCT FROM app.mon3_trial_date(t,clock_timestamp()))
 AND NOT EXISTS(SELECT 1 FROM app.meter_correction WHERE tenant_id=t))
$$;
CREATE OR REPLACE FUNCTION app.mon2_issue(t uuid,digest text,start_day date,revision integer) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE src app.meter_input_event; a app.subscription_agreement_revision; existing app.subscription_period;
 input jsonb; projected jsonb; day jsonb; g record; correction record; binding jsonb; line jsonb;
 bindings jsonb:='[]'; lines jsonb:='{}'; dispositions jsonb:='[]'; line_key text; place_key text; attribution text;
 included integer; cap integer; small_n integer; counted_n integer; denominator integer; amount bigint; maximum bigint; base_amount bigint;
 correction_value bigint; applied bigint; excess bigint; prior_source uuid; unallocated bigint; numerator bigint;
 period_id uuid:=gen_random_uuid(); statement_id uuid:=gen_random_uuid(); review_id uuid; decision_id uuid; card_id uuid;
 artifact text; immediate boolean:=false; sustained boolean:=false; busy integer; next_day date; content jsonb;
BEGIN
 SELECT * INTO existing FROM app.subscription_period WHERE tenant_id=t AND period_start=start_day;
 IF existing.id IS NOT NULL THEN
  RETURN jsonb_build_object('periodId',existing.id,'statementId',(SELECT id FROM app.platform_statement WHERE tenant_id=t AND platform_statement.period_id=existing.id),'amountPence',existing.principal_pence,'principalPence',existing.principal_pence,'basePrincipalPence',(existing.result->'principal'->>'pence')::bigint,'sourceId',existing.source_id,'artifactHash',existing.artifact_hash);
 END IF;
 SELECT * INTO a FROM app.subscription_agreement_revision WHERE tenant_id=t ORDER BY subscription_agreement_revision.revision DESC LIMIT 1;
 IF a.id IS NULL OR a.revision<>revision OR start_day<>app.mon2_boundary(start_day,a.anchor_day) THEN RAISE EXCEPTION 'SUBSCRIPTION_REVISION_OR_ANCHOR' USING ERRCODE='22023'; END IF;
 next_day:=app.mon2_boundary((date_trunc('month',start_day)+interval '1 month')::date,a.anchor_day);
 SELECT * INTO src FROM app.meter_input_event WHERE tenant_id=t AND period_start=start_day ORDER BY sequence DESC LIMIT 1;
 IF src.id IS NULL OR src.period_end<>next_day THEN RAISE EXCEPTION 'SUBSCRIPTION_SOURCE_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 PERFORM app.mon3_pin_source(t,digest,src.id);
 input:=app.mon2_source(t,digest,src.id); projected:=app.mon1_project(t,input);
 denominator:=next_day-start_day; base_amount:=(projected->'principal'->>'pence')::bigint;
 amount:=base_amount; maximum:=(projected->'maximum'->>'pence')::bigint;
 FOR day IN SELECT value FROM jsonb_array_elements(input->'days') ORDER BY value->>'date' LOOP
  included:=CASE WHEN day->>'plan'='Solo' THEN 4 ELSE 7 END; cap:=CASE WHEN included=4 THEN 1 ELSE 5 END;
  line_key:='plan:'||(day->>'plan');
  numerator:=coalesce((lines->line_key->>'numerator')::bigint,0)+CASE WHEN (day->>'trial')::boolean THEN 0 WHEN included=4 THEN 2900 ELSE 6900 END;
  lines:=jsonb_set(lines,ARRAY[line_key],jsonb_build_object('kind','plan','numerator',numerator));
  small_n:=0; counted_n:=0;
  -- Small allowance is assigned first by canonical place identity. All remaining
  -- places (including non-exempt small ones) then use canonical identity order.
  FOR g IN WITH grouped AS (
   SELECT (value->>'customerId')::uuid customer,(value->>'siteId')::uuid site,
    min((value->>'jobId')::uuid::text)::uuid representative,bool_and((value->>'small')::boolean) small
   FROM jsonb_array_elements(day->'jobs') GROUP BY (value->>'customerId')::uuid,(value->>'siteId')::uuid
  ), ranked AS (SELECT *,CASE WHEN small THEN row_number() OVER(PARTITION BY small ORDER BY customer,site) ELSE NULL END small_rank FROM grouped)
  SELECT * FROM ranked ORDER BY CASE WHEN small_rank<=included THEN 0 ELSE 1 END,customer,site LOOP
   place_key:=t::text||':'||g.customer::text||':'||g.site::text;
   IF g.small AND g.small_rank<=included THEN attribution:='small_allowance'; small_n:=small_n+1;
   ELSE
    counted_n:=counted_n+1;
    attribution:=CASE WHEN counted_n<=included THEN 'included' WHEN counted_n<=included+cap THEN 'paid_extra' ELSE 'grace' END;
   END IF;
   IF attribution='paid_extra' THEN
    line_key:='extra:'||place_key; numerator:=coalesce((lines->line_key->>'numerator')::bigint,0)+CASE WHEN (day->>'trial')::boolean THEN 0 ELSE 2000 END;
    lines:=jsonb_set(lines,ARRAY[line_key],jsonb_build_object('kind','extra','numerator',numerator));
   END IF;
   bindings:=bindings||jsonb_build_array(jsonb_build_object('date',day->>'date','placeKey',place_key,'customer',g.customer,'site',g.site,'representative',g.representative,'attribution',attribution));
  END LOOP;
  IF day->>'plan'='Builder' AND counted_n>13 THEN immediate:=true; END IF;
 END LOOP;
 -- Qualified MON-1 correction identities are retained; values are freshly
 -- derived from their immutable source and predecessor under accepted terms.
 FOR correction IN SELECT c.*,mc.source_id FROM app.meter_correction c JOIN app.meter_computation mc ON(mc.tenant_id,mc.id)=(c.tenant_id,c.computation_id)
 WHERE c.tenant_id=t AND c.apply_start=start_day ORDER BY c.id LOOP
  IF EXISTS(SELECT 1 FROM app.subscription_correction_disposition WHERE tenant_id=t AND correction_id=correction.id) THEN RAISE EXCEPTION 'SUBSCRIPTION_CORRECTION_REUSED'; END IF;
  SELECT old.source_id INTO prior_source FROM app.meter_computation old JOIN app.meter_input_event e ON(e.tenant_id,e.id)=(old.tenant_id,old.source_id)
  WHERE old.tenant_id=t AND old.period_start=correction.period_start AND e.sequence<(SELECT sequence FROM app.meter_input_event WHERE tenant_id=t AND id=correction.source_id)
  ORDER BY e.sequence DESC LIMIT 1;
  IF prior_source IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_CORRECTION_SOURCE_MISSING'; END IF;
  correction_value:=(app.mon1_project(t,app.mon2_source(t,digest,correction.source_id))->'principal'->>'pence')::bigint-(app.mon1_project(t,app.mon2_source(t,digest,prior_source))->'principal'->>'pence')::bigint;
  applied:=least(greatest(correction_value,0),maximum-amount); excess:=greatest(correction_value,0)-applied; amount:=amount+applied;
  dispositions:=dispositions||jsonb_build_array(jsonb_build_object('id',correction.id,'full',correction_value,'applied',applied,'excess',excess));
 END LOOP;
 -- Largest remainder: exactly one final rounding, deterministic key tie-break.
 SELECT base_amount-coalesce(sum((value->>'numerator')::bigint/denominator),0) INTO unallocated FROM jsonb_each(lines);
 SELECT jsonb_agg(jsonb_build_object('lineKey',key,'kind',value->>'kind','numeratorPence',value->>'numerator','denominatorDays',denominator,
  'amountPence',(value->>'numerator')::bigint/denominator+CASE WHEN rank<=unallocated THEN 1 ELSE 0 END) ORDER BY key)
 INTO content FROM (SELECT key,value,row_number() OVER(ORDER BY (value->>'numerator')::bigint%denominator DESC,key COLLATE "C") rank FROM jsonb_each(lines)) allocation;
 FOR line IN SELECT value FROM jsonb_array_elements(dispositions) LOOP
  content:=content||jsonb_build_array(jsonb_build_object('lineKey','correction:'||(line->>'id'),'kind','correction','numeratorPence',((line->>'applied')::bigint*denominator)::text,'denominatorDays',denominator,'amountPence',(line->>'applied')::bigint));
 END LOOP;
 -- Canonical ordering makes hashes independent of supplied array order. Input
 -- source identity/hash is retained separately, never smuggled into attribution.
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'date',value->>'placeKey'),'[]') INTO bindings FROM jsonb_array_elements(bindings);
 SELECT jsonb_agg(value ORDER BY value->>'lineKey') INTO content FROM jsonb_array_elements(content);
 artifact:=app.final_lock_hash(jsonb_build_object('version','subscription-statement.v1','tenantId',t,'periodStart',start_day::text,'periodEnd',next_day::text,'hypothetical',true,'amountPence',amount,'lines',content,'bindings',bindings));
 INSERT INTO app.subscription_period(tenant_id,id,period_start,period_end,source_id,agreement_revision,principal_pence,maximum_pence,result,artifact_hash)
 VALUES(t,period_id,start_day,next_day,src.id,revision,amount,maximum,projected,artifact);
 FOR binding IN SELECT value FROM jsonb_array_elements(bindings) LOOP
  INSERT INTO app.subscription_place VALUES(t,binding->>'placeKey',(binding->>'customer')::uuid,(binding->>'site')::uuid) ON CONFLICT DO NOTHING;
  INSERT INTO app.subscription_place_binding VALUES(t,period_id,src.id,(binding->>'date')::date,binding->>'placeKey',(binding->>'representative')::uuid,src.sequence,binding->>'attribution','canonical-place-and-job.v1');
 END LOOP;
 FOR line IN SELECT value FROM jsonb_array_elements(content) LOOP
  INSERT INTO app.subscription_period_line VALUES(t,period_id,line->>'lineKey',(line->>'numeratorPence')::bigint,denominator,(line->>'amountPence')::bigint,line->>'kind');
 END LOOP;
 FOR line IN SELECT value FROM jsonb_array_elements(dispositions) LOOP
  INSERT INTO app.subscription_correction_disposition VALUES(t,(line->>'id')::uuid,period_id,(line->>'full')::bigint,(line->>'applied')::bigint,(line->>'excess')::bigint);
  IF (line->>'excess')::bigint>0 THEN INSERT INTO app.subscription_alert VALUES(t,period_id,(line->>'id')::uuid,'CORRECTION_EXCESS_UNCOLLECTED'); END IF;
  IF (line->>'full')::bigint<0 THEN INSERT INTO app.subscription_alert VALUES(t,period_id,(line->>'id')::uuid,'NEGATIVE_CORRECTION_POLICY_HOLD'); END IF;
 END LOOP;
 INSERT INTO app.platform_statement VALUES(t,statement_id,period_id,'subscription.synthetic.v1',amount,'GBP',true,artifact);
 INSERT INTO app.platform_statement_line SELECT t,statement_id,period_id,l.line_key,l.amount_pence FROM app.subscription_period_line l WHERE l.tenant_id=t AND l.period_id=period_id;
 -- Sustained rule needs three consecutive issued periods, two with >=10 busy days.
 SELECT count(*)=3 AND count(*) FILTER(WHERE busy_days>=10)>=2 AND bool_and(previous_end IS NULL OR previous_end=period_start)
 INTO sustained FROM (SELECT period_start,lag(period_end) OVER(ORDER BY period_start) previous_end,
  (SELECT count(*) FROM jsonb_array_elements(result->'days') d WHERE (d->>'countedPlaces')::integer>7) busy_days
  FROM (SELECT * FROM app.subscription_period WHERE tenant_id=t AND period_start<=start_day ORDER BY period_start DESC LIMIT 3) latest) history;
 IF (immediate OR (a.plan='Builder' AND sustained)) AND NOT EXISTS(SELECT 1 FROM app.subscription_review WHERE tenant_id=t AND code='track_review_due') THEN
  review_id:=gen_random_uuid(); decision_id:=gen_random_uuid(); card_id:=gen_random_uuid();
  INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES(decision_id,t,'subscription',t::text,'subscription.track_review');
  INSERT INTO app.subscription_review VALUES(t,review_id,period_id,src.id,'track_review_due',decision_id,card_id,true,immediate,sustained);
  INSERT INTO app.subscription_operations_card VALUES(t,card_id,review_id,'open');
 END IF;
 RETURN jsonb_build_object('periodId',period_id,'statementId',statement_id,'amountPence',amount,'principalPence',amount,'basePrincipalPence',base_amount,'sourceId',src.id,'artifactHash',artifact);
END $$;
CREATE OR REPLACE FUNCTION app.mon2_authorized(t uuid,authorization_id uuid,expected_revision integer) RETURNS boolean LANGUAGE sql VOLATILE SET search_path=pg_catalog AS $$
 SELECT app.mon3_validate_billing(t,authorization_id) AND EXISTS(SELECT 1 FROM app.action_authorization a JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id)
 JOIN app.membership m ON(m.tenant_id,m.id)=(a.tenant_id,a.actor_membership_id)
 WHERE a.tenant_id=t AND a.id=authorization_id AND a.aggregate_revision=expected_revision AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp()
 AND r.resolution='approved' AND r.actor_membership_id=a.actor_membership_id AND r.decision_id=a.decision_id
 AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation revoked WHERE revoked.tenant_id=t AND revoked.membership_id=m.id))
$$;
-- Revoke inherited defaults on every own helper. Only four checked entrypoints
-- are public to the runtime; old subscription routine grants stay unchanged.
DO $$ DECLARE fn regprocedure; r record; BEGIN
 FOREACH fn IN ARRAY ARRAY[
 'app.mon3_capture_lifecycle()'::regprocedure,'app.mon3_trial_date(uuid,timestamptz)'::regprocedure,
 'app.mon3_read_lifecycle(uuid,text,uuid)'::regprocedure,'app.mon3_simulate_card(uuid,text,uuid,jsonb)'::regprocedure,
 'app.mon3_activate(uuid,text,uuid,jsonb)'::regprocedure,'app.mon3_require_registered_admission()'::regprocedure,
 'app.mon3_build_source(uuid,text,uuid,timestamptz)'::regprocedure,'app.mon3_pin_source(uuid,text,uuid)'::regprocedure,
 'app.mon3_validate_billing(uuid,uuid)'::regprocedure] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',fn);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn);
  FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=fn AND a.grantee<>p.proowner AND a.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn,pg_get_userbyid(r.grantee));
  END LOOP;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.mon3_read_lifecycle(uuid,text,uuid),app.mon3_simulate_card(uuid,text,uuid,jsonb),app.mon3_activate(uuid,text,uuid,jsonb) TO jobguard_runtime;

COMMIT;
