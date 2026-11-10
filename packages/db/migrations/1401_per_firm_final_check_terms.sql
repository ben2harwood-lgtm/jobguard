BEGIN;
-- Forward-only: historical acceptances retain NULL scope and every original fact.
-- NULL in the shared tenant is history, never an acceptance by a practice firm.
ALTER TABLE app.final_check_terms_acceptance ADD COLUMN practice_session_digest char(64)
 REFERENCES control_plane.practice_session(token_digest);
CREATE INDEX final_check_terms_firm ON app.final_check_terms_acceptance(tenant_id,practice_session_digest,terms_version);

-- Compare against the private transaction binding without exposing its credential
-- or granting migration/runtime SELECT on request_binding. A GUC alone is no authority.
GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;
CREATE FUNCTION app.final_check_bound_practice(t uuid,d text) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b control_plane.request_binding;
BEGIN
 b:=app.lp6_bound_request();
 RETURN b.credential_kind='practice' AND b.tenant_id=t
  AND b.session_ref=encode(sha256(convert_to('lp6-home:'||d,'UTF8')),'hex');
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
ALTER FUNCTION app.final_check_bound_practice(uuid,text) OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.final_check_bound_practice(uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.final_check_bound_practice(uuid,text) TO jobguard_migration;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;

CREATE FUNCTION app.final_check_request_scope(t uuid) RETURNS text
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE d text:=nullif(current_setting('app.practice_material_digest',true),'');
BEGIN
 IF t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t<>'11111111-1111-4111-8111-111111111111'::uuid THEN RETURN NULL; END IF;
 IF d IS NULL THEN RETURN NULL; END IF;
 IF NOT app.final_check_bound_practice(t,d)
  OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t)) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN d;
END $$;
ALTER FUNCTION app.final_check_request_scope(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_request_scope(uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.final_check_request_scope(uuid) TO jobguard_runtime;

-- Retain the tenant-separated company path. Runtime SELECT cannot see another
-- practice firm's rows, even through an unchanged tenant-only repository query.
CREATE POLICY firm_read ON app.final_check_terms_acceptance AS RESTRICTIVE FOR SELECT TO jobguard_runtime
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND
  CASE WHEN tenant_id='11111111-1111-4111-8111-111111111111'::uuid
   THEN practice_session_digest=app.final_check_request_scope(tenant_id)
   ELSE practice_session_digest IS NULL END);

-- Workers resolve immutable ownership from the job, never from a browser setting.
-- Each import edge needs BOTH its attestation and the private import/receipt anchor.
-- UNION terminates cycles; ambiguous/missing roots fail closed in the shared tenant.
CREATE FUNCTION app.final_check_job_scope(t uuid,j uuid) RETURNS text
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE scopes text[];
BEGIN
 IF t<>'11111111-1111-4111-8111-111111111111'::uuid THEN RETURN NULL; END IF;
 WITH RECURSIVE parents(id) AS (
  SELECT id FROM app.job WHERE tenant_id=t AND id=j
  UNION SELECT parent.id FROM parents p
   JOIN app.job child ON child.tenant_id=t AND child.id=p.id AND child.provenance='imported' AND child.practice_session_digest IS NULL
   JOIN app.audit_event e ON e.tenant_id=t AND e.subject_type='job' AND e.event_type='job.imported_baseline_attested' AND e.subject_ref=child.id::text
   JOIN app.job parent ON parent.tenant_id=t AND parent.id::text=e.payload->'references'->>'sourceJobId'
    AND (EXISTS(SELECT 1 FROM app.job_import_v3 i WHERE i.tenant_id=t AND i.job_id=child.id AND i.source_job_id=parent.id)
     OR EXISTS(SELECT 1 FROM app.command_receipt r WHERE r.tenant_id=t AND r.command_type='job.adopt_in_flight' AND r.status='succeeded'
      AND r.semantic_key='import:'||child.id::text AND r.result->>'jobId'=child.id::text AND r.result->>'sourceJobId'=parent.id::text))
 ) SELECT array_agg(DISTINCT jb.practice_session_digest::text) FILTER(WHERE jb.practice_session_digest IS NOT NULL)
 INTO scopes FROM parents p JOIN app.job jb ON jb.tenant_id=t AND jb.id=p.id;
 IF cardinality(scopes) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN scopes[1];
END $$;
ALTER FUNCTION app.final_check_job_scope(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_job_scope(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

CREATE FUNCTION app.final_check_job_terms(t uuid,j uuid,v text,cutoff timestamptz DEFAULT 'infinity') RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE d text:=app.final_check_job_scope(t,j);
BEGIN
 RETURN EXISTS(SELECT 1 FROM app.final_check_terms_acceptance a WHERE a.tenant_id=t AND a.terms_version=v
  AND a.practice_session_digest IS NOT DISTINCT FROM d AND a.accepted_at<=cutoff);
END $$;
ALTER FUNCTION app.final_check_job_terms(uuid,uuid,text,timestamptz) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_job_terms(uuid,uuid,text,timestamptz) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

-- Boolean-only runtime admission: tenant comes from the transaction, never input.
-- Queued contexts have no database-verifiable worker marker. Request scopes, when
-- present, must match; no acceptance rows or private binding data are exposed.
CREATE FUNCTION app.final_check_runtime_job_terms(j uuid,v text) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 request_scope text; job_scope text;
BEGIN
 IF t IS NULL OR j IS NULL OR v IS NULL THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j) THEN RETURN false; END IF;
 request_scope:=app.final_check_request_scope(t);
 job_scope:=app.final_check_job_scope(t,j);
 IF request_scope IS NOT NULL AND request_scope IS DISTINCT FROM job_scope THEN RETURN false; END IF;
 RETURN app.final_check_job_terms(t,j,v);
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
ALTER FUNCTION app.final_check_runtime_job_terms(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_runtime_job_terms(uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.final_check_runtime_job_terms(uuid,text) TO jobguard_runtime;

CREATE OR REPLACE FUNCTION app.accept_final_check_terms(p_tenant uuid,p_actor uuid,p_command uuid,p_version text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE request_digest text; prior app.command_receipt; event_id uuid:=gen_random_uuid(); row_id uuid:=gen_random_uuid(); result jsonb;
 scope text:=app.final_check_request_scope(p_tenant);
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF p_tenant='11111111-1111-4111-8111-111111111111'::uuid AND scope IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_command IS NULL OR p_version IS DISTINCT FROM 'synthetic_final_check_terms.v1' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':final-check-terms',130));
 -- Company request hashes retain their existing bytes; practice hashes bind scope.
 request_digest:=app.final_lock_hash(jsonb_build_object('command','AcceptFinalCheckTerms','actor',p_actor,'version',p_version)
  ||CASE WHEN scope IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('practiceSessionDigest',scope) END);
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN IF prior.command_type<>'AcceptFinalCheckTerms' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF; RETURN prior.result; END IF;
 result:=jsonb_build_object('acceptanceId',row_id,'termsVersion',p_version);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'AcceptFinalCheckTerms',p_command::text,request_digest,'succeeded',result,p_actor,clock_timestamp());
 INSERT INTO app.final_check_terms_acceptance(tenant_id,id,terms_version,accepting_membership_id,accepted_at,command_id,audit_event_id,practice_session_digest)
 VALUES(p_tenant,row_id,p_version,p_actor,clock_timestamp(),p_command,event_id,scope);
 PERFORM app.append_final_lock_audit(event_id,p_actor,p_tenant,'final_check.terms_accepted',jsonb_build_object('acceptanceId',row_id,'commandId',p_command)
  ||CASE WHEN scope IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('practiceSessionDigest',scope) END);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION app.guard_final_lock_disclosure_terms() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT app.final_check_job_terms(NEW.tenant_id,NEW.job_id,NEW.onboarding_terms_version,NEW.locked_at)
 THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;

-- Surgical edits to INSTALLED definitions retain 0380/0667 command admission,
-- 0690 ancestry, 0698 retries and all other existing guards/ACLs. Fail on drift.
DO $$
DECLARE signature text; original text; changed text; predicate text; replacement text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'app.lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text)',
  'app.final_check_require_worker(uuid,uuid)', 'app.final_check_worker(uuid,uuid)',
  'app.final_check_builder(uuid,uuid,text,boolean)', 'app.evidence_pack_v3_owner(uuid,uuid,text)'
 ] LOOP
  original:=pg_get_functiondef(signature::regprocedure);
  IF signature LIKE 'app.lock_final_account%' OR signature LIKE 'app.final_check_require_worker%' THEN
   predicate:=$p$EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=p_tenant AND terms_version='synthetic_final_check_terms.v1')$p$;
   replacement:=$p$app.final_check_job_terms(p_tenant,p_job,'synthetic_final_check_terms.v1')$p$;
  ELSE
   predicate:=$p$EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1')$p$;
   replacement:=$p$app.final_check_job_terms(t,j,'synthetic_final_check_terms.v1')$p$;
  END IF;
  IF (length(original)-length(replace(original,predicate,'')))/length(predicate)<>1 THEN RAISE EXCEPTION 'unexpected per-firm terms anchor: %',signature; END IF;
  changed:=replace(original,predicate,replacement);
  IF signature LIKE 'app.lock_final_account%' THEN
   -- Before replay, verify bound scope equals job scope, including imports.
   predicate:='BEGIN'||chr(10)||' PERFORM app.final_lock_require_owner(p_tenant,p_actor);';
   replacement:=predicate||chr(10)||$p$ IF p_tenant='11111111-1111-4111-8111-111111111111'::uuid AND
    app.final_check_request_scope(p_tenant) IS DISTINCT FROM app.final_check_job_scope(p_tenant,p_job) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
   IF p_tenant='11111111-1111-4111-8111-111111111111'::uuid AND
    NOT app.final_check_job_terms(p_tenant,p_job,'synthetic_final_check_terms.v1') THEN
    RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;$p$;
   IF position(predicate in changed)=0 THEN RAISE EXCEPTION 'unexpected per-firm lock authority anchor'; END IF;
   changed:=replace(changed,predicate,replacement);
  END IF;
  EXECUTE changed;
 END LOOP;
END $$;

-- Must-surface remains mandatory; change only which firm's acceptance is checked.
DO $$ DECLARE original text; changed text;
 predicate text:=$p$EXECUTE 'SELECT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=$1 AND terms_version=$2)'
  INTO terms_accepted USING p_tenant,'synthetic_final_check_terms.v1';$p$;
BEGIN
 original:=pg_get_functiondef('app.surface_shadow_signal_early(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb)'::regprocedure);
 IF position(predicate in original)=0 THEN RAISE EXCEPTION 'unexpected must-surface terms anchor'; END IF;

   changed:=replace(original,predicate,$p$terms_accepted:=app.final_check_job_terms(p_tenant,p_job,'synthetic_final_check_terms.v1');$p$);
 EXECUTE changed;
END $$;
COMMIT;
