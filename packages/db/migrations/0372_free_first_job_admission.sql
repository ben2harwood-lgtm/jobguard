BEGIN;
-- MON-3-P-B: fictional server facts only. No clock, trial grant or conversion.
CREATE TABLE app.trial_business_verification (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), id uuid NOT NULL,
 version text NOT NULL CHECK(version='trial-business-verification.v1'),
 environment text NOT NULL CHECK(environment='synthetic_demo'),
 source text NOT NULL CHECK(source='fictional_verified_fixture.v1'),
 company_number text CHECK(company_number COLLATE "C" ~ '^[!-~]{1,200}$'),
 normalized_phone text CHECK(normalized_phone COLLATE "C" ~ '^[!-~]{1,200}$'),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id),
 CHECK(company_number IS NOT NULL OR normalized_phone IS NOT NULL)
);
CREATE TABLE app.trial_card_attempt (
 tenant_id uuid NOT NULL, id uuid NOT NULL, verification_id uuid NOT NULL,
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 provider text NOT NULL DEFAULT 'simulated' CHECK(provider='simulated'),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,verification_id,id),
 FOREIGN KEY(tenant_id,verification_id) REFERENCES app.trial_business_verification(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE app.trial_card_result (
 tenant_id uuid NOT NULL, id uuid NOT NULL, attempt_id uuid NOT NULL, verification_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 outcome text NOT NULL CHECK(outcome IN('redirect_only','completed','failed','cancelled','outcome_unknown')),
 reference text CHECK(reference COLLATE "C" ~ '^sim_ref_[!-~]{1,180}$'),
 fingerprint text CHECK(fingerprint COLLATE "C" ~ '^sim_fp_[!-~]{1,180}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,attempt_id),
 FOREIGN KEY(tenant_id,verification_id,attempt_id) REFERENCES app.trial_card_attempt(tenant_id,verification_id,id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 CHECK((outcome='completed' AND reference IS NOT NULL AND fingerprint IS NOT NULL)
 OR(outcome<>'completed' AND reference IS NULL AND fingerprint IS NULL))
);
CREATE TABLE app.trial_admission (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, activation_id uuid NOT NULL, snapshot_id uuid,
 verification_id uuid NOT NULL, command_id uuid NOT NULL,
 admission_kind text NOT NULL CHECK(admission_kind IN('first','second')),
 admitted_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,job_id), UNIQUE(tenant_id,activation_id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id,activation_id) REFERENCES app.job_activation(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,activation_id,snapshot_id) REFERENCES app.trial_identity_snapshot(tenant_id,job_id,activation_id,id),
 FOREIGN KEY(tenant_id,verification_id) REFERENCES app.trial_business_verification(tenant_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((admission_kind='first')=(snapshot_id IS NOT NULL))
);
-- No business table gains a column. Runtime cannot read private identity or write facts.
DO $$ DECLARE tab text; role_row record; BEGIN
 FOREACH tab IN ARRAY ARRAY['trial_business_verification','trial_card_attempt','trial_card_result','trial_admission'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',tab);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I TO jobguard_migration USING(tenant_id::text=current_setting(''app.tenant_id'',true)) WITH CHECK(tenant_id::text=current_setting(''app.tenant_id'',true))',tab);
  EXECUTE format('REVOKE ALL ON TABLE app.%I FROM PUBLIC',tab);
  FOR role_row IN SELECT DISTINCT acl.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) acl WHERE c.oid=format('app.%I',tab)::regclass AND acl.grantee<>c.relowner AND acl.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL ON TABLE app.%I FROM %I',tab,pg_get_userbyid(role_row.grantee));
  END LOOP;
  EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',tab);
  EXECUTE format('CREATE TRIGGER no_truncate BEFORE TRUNCATE ON app.%I FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',tab);
 END LOOP;
END $$;
CREATE FUNCTION app.mon3_owner(t uuid,digest text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid;
BEGIN
 actor:=app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.mon1_company_actor(t,digest);
 IF NOT EXISTS(SELECT 1 FROM app.membership WHERE tenant_id=t AND id=actor AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp())) THEN
  RAISE EXCEPTION 'FREE_FIRST_JOB_ACCESS_DENIED' USING ERRCODE='42501';
 END IF;
 RETURN actor;
END $$;
-- Own audit namespace; payload contains only command references and hashes.
CREATE FUNCTION app.mon3_audit(t uuid,actor uuid,command uuid,kind text,hash text,result_hash text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE seq bigint; previous text; ts timestamptz; payload jsonb; ph text; eh text;
BEGIN
 SELECT sequence,event_hash INTO seq,previous FROM app.lock_audit_head();
 seq:=seq+1; ts:=date_trunc('milliseconds',clock_timestamp());
 payload:=jsonb_build_object('references',jsonb_build_object('commandId',command::text),'hashes',jsonb_build_object('request',hash,'result',result_hash)); ph:=app.final_lock_hash(payload);
 eh:=encode(sha256(convert_to(concat_ws(chr(31),'audit.v1',t::text,seq::text,'membership:'||actor::text,'free_first_job.'||kind,'tenant',t::text,to_char(ts AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),ph,coalesce(previous,'')),'UTF8')),'hex');
 INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
 VALUES(gen_random_uuid(),t,seq,'audit.v1','membership:'||actor::text,'free_first_job.'||kind,'tenant',t::text,ts,payload,ph,previous,eh);
 PERFORM app.advance_audit_head(seq,eh);
END $$;
CREATE FUNCTION app.mon3_request_card(t uuid,digest text,command_id uuid,v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE actor uuid; verification uuid; prior app.command_receipt; hash text; result jsonb; attempt uuid;
BEGIN
 actor:=app.mon3_owner(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.mon3_owner(t,digest);
 IF command_id IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR v IS DISTINCT FROM '{"version":"trial-card-request.v1"}'::jsonb THEN RAISE EXCEPTION 'INVALID_FREE_FIRST_JOB_INPUT' USING ERRCODE='22023'; END IF;
 hash:=app.final_lock_hash(jsonb_build_object('tenantId',t,'actorMembershipId',actor,'command',v));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=t AND app.command_receipt.command_id=mon3_request_card.command_id;
 IF prior.command_id IS NOT NULL THEN
  IF prior.request_hash<>hash OR prior.actor_membership_id<>actor OR prior.command_type<>'free_first_job.request_card' OR prior.status<>'succeeded' THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='22023'; END IF;
  RETURN prior.result;
 END IF;
 SELECT id INTO verification FROM app.trial_business_verification WHERE tenant_id=t;
 IF verification IS NULL THEN RAISE EXCEPTION 'TRIAL_IDENTITY_REQUIRED' USING ERRCODE='22023'; END IF;
 attempt:=gen_random_uuid();
 INSERT INTO app.trial_card_attempt(tenant_id,id,verification_id,command_id,actor_membership_id) VALUES(t,attempt,verification,command_id,actor);
 result:=jsonb_build_object('version','trial-card-attempt.v1','environment','synthetic_demo','hypothetical',true,'attemptId',attempt,'verificationId',verification,'status','requested');
 INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(command_id,t,'free_first_job.request_card',command_id::text,hash,'succeeded',result,actor,clock_timestamp());
 PERFORM app.mon3_audit(t,actor,command_id,'request_card',hash,app.final_lock_hash(result));
 RETURN result;
END $$;
-- Migration-owned fixture executor only. No runtime EXECUTE, browser outcome or raw card data.
CREATE FUNCTION app.mon3_record_card_fixture(t uuid,digest text,result_id uuid,v jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE actor uuid; a app.trial_card_attempt; previous app.trial_card_result; outcome text; ref text; fp text; hash text;
BEGIN
 actor:=app.mon3_owner(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.mon3_owner(t,digest);
 IF result_id IS NULL OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR NOT(v ?& ARRAY['version','attemptId','fixtureCard','outcome']) OR v-ARRAY['version','attemptId','fixtureCard','outcome']<>'{}'::jsonb
 OR v->>'version' IS DISTINCT FROM 'trial-card-fixture.v1' OR coalesce(v->>'fixtureCard','') NOT IN('card_a','card_b')
 OR coalesce(v->>'outcome','') NOT IN('completed','redirect_only','failed','cancelled','outcome_unknown') THEN RAISE EXCEPTION 'INVALID_FREE_FIRST_JOB_INPUT' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM app.trial_card_attempt WHERE tenant_id=t AND id=(v->>'attemptId')::uuid;
 IF a.id IS NULL THEN RAISE EXCEPTION 'TRIAL_CARD_ATTEMPT_REQUIRED' USING ERRCODE='22023'; END IF;
 hash:=app.final_lock_hash(jsonb_build_object('tenantId',t,'actorMembershipId',actor,'command',v));
 outcome:=v->>'outcome';
 IF outcome='completed' THEN ref:='sim_ref_'||a.id::text; fp:='sim_fp_'||(v->>'fixtureCard'); END IF;
 SELECT * INTO previous FROM app.trial_card_result WHERE tenant_id=t AND attempt_id=a.id;
 IF previous.id IS NOT NULL THEN
  IF (previous.id,previous.request_hash,previous.actor_membership_id) IS DISTINCT FROM (result_id,hash,actor) THEN RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='22023'; END IF;
  RETURN;
 END IF;
 INSERT INTO app.trial_card_result(tenant_id,id,attempt_id,verification_id,actor_membership_id,request_hash,outcome,reference,fingerprint) VALUES(t,result_id,a.id,a.verification_id,actor,hash,outcome,ref,fp);
 PERFORM app.mon3_audit(t,actor,result_id,'card_fixture_result',hash,app.final_lock_hash(jsonb_build_object('resultId',result_id,'outcome',outcome)));
END $$;
-- Intentionally no configuration flag or argument can open this boundary.
CREATE FUNCTION app.mon3_admit(t uuid,digest text,command_id uuid,v jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; b app.trial_business_verification; card app.trial_card_result;
 previous app.trial_admission; prior_count integer; snap uuid; terms app.job_activation_terms;
BEGIN
 actor:=app.mon3_owner(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 actor:=app.mon3_owner(t,digest);
 -- This unconditional stop precedes ALL commercial writes, including receipt/key consumption.
 -- C must replace the routine under its issued migration; no runtime switch exists.
 RAISE EXCEPTION 'FREE_FIRST_JOB_ADMISSION_DISABLED_AWAITING_C' USING ERRCODE='55000';
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
-- Installation normalizes default privileges for every new routine.
DO $$ DECLARE f regprocedure; r record; BEGIN
 FOREACH f IN ARRAY ARRAY['app.mon3_owner(uuid,text)'::regprocedure,'app.mon3_audit(uuid,uuid,uuid,text,text,text)'::regprocedure,'app.mon3_request_card(uuid,text,uuid,jsonb)'::regprocedure,'app.mon3_record_card_fixture(uuid,text,uuid,jsonb)'::regprocedure,'app.mon3_admit(uuid,text,uuid,jsonb)'::regprocedure] LOOP
  EXECUTE format('ALTER FUNCTION %s OWNER TO jobguard_migration',f);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f);
  FOR r IN SELECT DISTINCT a.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid=f AND a.grantee<>p.proowner AND a.grantee<>0 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f,pg_get_userbyid(r.grantee));
  END LOOP;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION app.mon3_owner(uuid,text), app.mon3_request_card(uuid,text,uuid,jsonb), app.mon3_admit(uuid,text,uuid,jsonb) TO jobguard_runtime;
COMMIT;
