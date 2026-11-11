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
-- Edges are exactly main's ownership edges (0701 final_check_practice_owns_job): a
-- job_import_v3 record, or app.trusted_import_edge's adoption receipt. UNION ends
-- cycles. Several firms, or an import whose firm is missing, fail closed. A job that
-- was never imported and has no firm (privileged synthetic fixtures only) stays
-- unattributed (NULL): no firm scope can act on it, as 0667 already refuses.
CREATE FUNCTION app.final_check_job_scope(t uuid,j uuid) RETURNS text
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE scopes text[]; ancestors integer; imported boolean;
BEGIN
 IF t<>'11111111-1111-4111-8111-111111111111'::uuid THEN RETURN NULL; END IF;
 WITH RECURSIVE parents(id) AS (
  SELECT id FROM app.job WHERE tenant_id=t AND id=j
  UNION SELECT parent.id FROM parents p
   CROSS JOIN LATERAL (
    SELECT i.source_job_id src FROM app.job_import_v3 i WHERE i.tenant_id=t AND i.job_id=p.id
    UNION SELECT (r.result->>'sourceJobId')::uuid FROM app.job child JOIN app.command_receipt r ON r.tenant_id=t
      AND r.command_type='job.adopt_in_flight' AND r.status='succeeded' AND r.semantic_key='import:'||child.id::text
      AND r.result->>'jobId'=child.id::text
     WHERE child.tenant_id=t AND child.id=p.id AND child.provenance='imported' AND child.practice_session_digest IS NULL
   ) e
   JOIN app.job parent ON parent.tenant_id=t AND parent.id=e.src
 ) SELECT array_agg(DISTINCT jb.practice_session_digest::text) FILTER(WHERE jb.practice_session_digest IS NOT NULL),count(*)
 INTO scopes,ancestors FROM parents p JOIN app.job jb ON jb.tenant_id=t AND jb.id=p.id;
 SELECT coalesce(provenance='imported',false) INTO imported FROM app.job WHERE tenant_id=t AND id=j;
 IF scopes IS NULL AND ancestors=1 AND NOT imported THEN RETURN NULL; END IF;
 IF cardinality(scopes) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN scopes[1];
END $$;
ALTER FUNCTION app.final_check_job_scope(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_job_scope(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

CREATE FUNCTION app.final_check_job_terms(t uuid,j uuid,v text,cutoff timestamptz DEFAULT 'infinity') RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE d text;
BEGIN
 d:=app.final_check_job_scope(t,j);
 RETURN EXISTS(SELECT 1 FROM app.final_check_terms_acceptance a WHERE a.tenant_id=t AND a.terms_version=v
  AND a.practice_session_digest IS NOT DISTINCT FROM d AND a.accepted_at<=cutoff)
 -- A job locked before this migration keeps the unattributed acceptance it was locked
 -- under. A new lock cannot use it: the lock row is not yet visible to its own checks.
  OR EXISTS(SELECT 1 FROM app.final_account_lock l JOIN app.final_check_terms_acceptance a
   ON a.tenant_id=l.tenant_id AND a.terms_version=v AND a.practice_session_digest IS NULL
    AND a.accepted_at<=l.locked_at AND a.accepted_at<=cutoff
   WHERE l.tenant_id=t AND l.job_id=j);
-- An ambiguous or missing firm is never accepted; callers keep their own refusal codes.
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
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

-- Full latest bodies (main through 0728: 0237/0238/0306/0380/0632/0667/0690/0698 and
-- every later guard), changed only to check the job's own firm acceptance and, for
-- lock_final_account, to refuse a firm's job before replay unless the request is bound
-- as that firm or carries a checked material scope (0667's owner guard, kept below,
-- then refuses a different firm). A firm-scoped request also checks its terms first;
-- other requests keep main's order, where the job's own firm terms are checked.
-- CREATE OR REPLACE keeps each owner and ACL unchanged.
CREATE OR REPLACE FUNCTION app.lock_final_account(p_tenant uuid, p_job uuid, p_actor uuid, p_command uuid, p_revision uuid, p_expected integer, p_declaration text)
 RETURNS app.final_account_lock
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $$
DECLARE request_digest text; prior app.command_receipt; existing_lock app.final_account_lock; r app.final_account_revision; sources jsonb; s jsonb;
 row_id uuid:=gen_random_uuid(); event_id uuid:=gen_random_uuid(); server_time timestamptz; result jsonb;
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF p_tenant='11111111-1111-4111-8111-111111111111'::uuid AND
    app.final_check_request_scope(p_tenant) IS NULL AND app.final_check_job_scope(p_tenant,p_job) IS NOT NULL AND
    NOT app.final_check_bound_practice(p_tenant,app.final_check_job_scope(p_tenant,p_job)) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF nullif(current_setting('app.practice_material_digest',true),'') IS NOT NULL
  AND NOT app.final_check_practice_owns_job(p_tenant,p_job,nullif(current_setting('app.practice_material_digest',true),'')) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_tenant='11111111-1111-4111-8111-111111111111'::uuid AND app.final_check_request_scope(p_tenant) IS NOT NULL AND
    NOT app.final_check_job_terms(p_tenant,p_job,'synthetic_final_check_terms.v1') THEN
    RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('final-review-command:'||p_tenant::text||':'||p_command::text,0));
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 -- Always the job first, as in SV-2 reveal/disclosure; audit allocation is last.
 PERFORM 1 FROM app.job j JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(j.tenant_id,j.id)
 WHERE j.tenant_id=p_tenant AND j.id=p_job AND j.status IN ('live','invoiced','paid') AND t.job_track='small_builder'
 AND t.environment='synthetic_demo' FOR UPDATE OF j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF p_command IS NULL OR p_revision IS NULL OR p_expected IS NULL OR p_expected<0 OR p_declaration IS DISTINCT FROM 'final_account_declaration.v1' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('command','LockFinalAccount','job',p_job,'actor',p_actor,'revision',p_revision,'expected',p_expected,'declaration',p_declaration));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF prior.command_type<>'LockFinalAccount' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  SELECT * INTO existing_lock FROM app.final_account_lock WHERE tenant_id=p_tenant AND command_id=p_command; RETURN existing_lock;
 END IF;
 SELECT * INTO existing_lock FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_ALREADY_LOCKED' USING ERRCODE='23505',DETAIL=existing_lock.id::text; END IF;
 SELECT x.* INTO r FROM app.final_account_revision x JOIN app.final_account_draft d ON(d.tenant_id,d.job_id,d.current_revision_id)=(x.tenant_id,x.job_id,x.id)
 WHERE x.tenant_id=p_tenant AND x.job_id=p_job AND x.id=p_revision AND x.revision=p_expected AND NOT x.issue_blocked;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT' USING ERRCODE='40001'; END IF;
 -- C135 / R1: a site photo begun before the lock must finish its check first. After the lock the job-work-state rule refuses any
 -- verification of a photo upload, so an unfinished one could never be checked and the final check could never complete.
 -- Quarantined is also the temporary scan state; no final-quarantine discriminator exists, so all quarantine blocks.
 IF EXISTS(SELECT 1 FROM app.evidence_upload u WHERE u.tenant_id=p_tenant AND u.job_id=p_job
  AND (u.state='quarantined' OR (u.state='pending'
   AND u.expires_at>clock_timestamp()))) THEN RAISE EXCEPTION 'FINAL_ACCOUNT_UPLOADS_IN_PROGRESS' USING ERRCODE='55000'; END IF;
 PERFORM 1 FROM app.variation WHERE tenant_id=p_tenant AND job_id=p_job ORDER BY id FOR UPDATE;
 -- Both directions matter: missing, replaced, duplicated or spurious approved lines require reassembly.
 -- Approval writers lock their variation before inserting approval, so this statement runs after all waits.
 IF EXISTS(
  WITH effective AS (
   -- Keep this SQL alias distinct from the final-account record variable r.
   SELECT DISTINCT ON (a.variation_id) approved_revision.id source_id,approved_revision.scope_item_id,approved_revision.id commercial_revision_id,
    a.id approval_id,approved_revision.signed_delta_pence net_pence,approved_revision.description
   FROM app.variation_approval a
   JOIN app.variation_revision approved_revision ON(approved_revision.tenant_id,approved_revision.job_id,approved_revision.id)=(a.tenant_id,a.job_id,a.revision_id)
   WHERE a.tenant_id=p_tenant AND a.job_id=p_job
   ORDER BY a.variation_id,approved_revision.revision DESC
  ), actual AS (
   SELECT source_id,scope_item_id,commercial_revision_id,approval_id,net_pence,description
   FROM app.final_account_line WHERE tenant_id=p_tenant AND job_id=p_job
    AND final_account_revision_id=p_revision AND line_kind='variation'
  )
  SELECT * FROM (TABLE effective EXCEPT ALL TABLE actual) missing
  UNION ALL SELECT * FROM (TABLE actual EXCEPT ALL TABLE effective) obsolete
 ) THEN RAISE EXCEPTION 'STALE_OR_BLOCKED_FINAL_ACCOUNT' USING ERRCODE='40001'; END IF;
 sources:=app.read_final_account_lock_sources(p_tenant,p_job,p_revision);
 IF jsonb_array_length(sources->'captureRegister')<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(sources->'captureRegister')) THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'captureRegister') c WHERE length(c.value->>'description') NOT BETWEEN 1 AND 4000 OR (c.value->>'valuePence')::numeric>1000000000000)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'lines') l WHERE (l.value->>'netPence')::numeric>1000000000000) THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 IF jsonb_array_length(sources->'baselineScopeItemIds')=0 OR jsonb_array_length(sources->'scopeDispositions')<>jsonb_array_length(sources->'baselineScopeItemIds') THEN RAISE EXCEPTION 'SCOPE_DISPOSITION_MISSING'; END IF;
 IF NOT app.final_check_job_terms(p_tenant,p_job,'synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text,184));
 server_time:=clock_timestamp();
 s:=sources||jsonb_build_object('version','shadow-lock.v1','tenantId',p_tenant,'jobId',p_job,'finalAccountRevisionId',p_revision,'baselineQuoteVersionId',r.baseline_quote_version_id,
  'declaration','I''ve reviewed the work and extras on this job and this is my complete final account.','declarationVersion',p_declaration,'onboardingTermsVersion','synthetic_final_check_terms.v1',
  'lockingMembershipId',p_actor,'serverTimestamp',to_char(server_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'commandId',p_command,'auditEventId',event_id);
 result:=jsonb_build_object('lockId',row_id);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'LockFinalAccount',p_job::text,request_digest,'succeeded',result,p_actor,server_time);
 INSERT INTO app.final_account_lock(tenant_id,job_id,id,final_account_revision_id,baseline_quote_version_id,capture_register_hash,line_set_hash,scope_disposition_hash,snapshot_digest,snapshot,
 declaration,declaration_version,onboarding_terms_version,locking_membership_id,locked_at,command_id,audit_event_id)
 VALUES(p_tenant,p_job,row_id,p_revision,r.baseline_quote_version_id,app.final_lock_hash(s->'captureRegister'),app.final_lock_hash(s->'lines'),app.final_lock_hash(s->'scopeDispositions'),app.final_lock_hash(s),s,
 s->>'declaration',p_declaration,'synthetic_final_check_terms.v1',p_actor,server_time,p_command,event_id) RETURNING * INTO existing_lock;
 PERFORM app.append_final_lock_audit(event_id,p_actor,p_job,'final_account.locked',jsonb_build_object('lockId',row_id,'commandId',p_command,'finalAccountRevisionId',p_revision),jsonb_build_object('snapshot',existing_lock.snapshot_digest));
 RETURN existing_lock;
END $$;

CREATE OR REPLACE FUNCTION app.final_check_require_worker(p_tenant uuid, p_job uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'app'
AS $$
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT pg_has_role(session_user,'jobguard_shadow','USAGE') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=p_tenant AND job_id=p_job AND job_track='small_builder' AND environment='synthetic_demo') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT app.final_check_job_terms(p_tenant,p_job,'synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_job::text,130));
END $$;

CREATE OR REPLACE FUNCTION app.final_check_worker(t uuid, j uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'app'
AS $$
BEGIN
 PERFORM app.final_check_context(t);
 IF NOT pg_has_role(session_user,'jobguard_shadow','USAGE') OR pg_has_role(session_user,'jobguard_runtime','USAGE') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo')
 OR NOT app.final_check_job_terms(t,j,'synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Acquire prerequisite job/advisory locks before shadow locks and any audit allocation.
 PERFORM app.final_check_require_worker(t,j);
END $$;

CREATE OR REPLACE FUNCTION app.final_check_builder(t uuid, j uuid, d text, locking boolean DEFAULT false)
 RETURNS TABLE(member_id uuid, user_id uuid)
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'app'
AS $$
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
 IF NOT app.final_check_job_terms(t,j,'synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF NOT owned OR NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo') THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF locking THEN
  PERFORM 1 FROM app.job WHERE tenant_id=t AND id=j FOR UPDATE;
  -- Recheck deadlines after every wait before replay or effects.
  IF NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t) s WHERE s.membership_id=a.membership_id AND s.identity_user_id=a.identity_user_id) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN QUERY SELECT a.membership_id::uuid,a.identity_user_id::uuid;
END $$;

CREATE OR REPLACE FUNCTION app.evidence_pack_v3_owner(t uuid, c uuid, d text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'app'
AS $$
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
 OR NOT app.final_check_job_terms(t,j,'synthetic_final_check_terms.v1') THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 RETURN j;
END $$;

CREATE OR REPLACE FUNCTION app.surface_shadow_signal_early(p_tenant uuid, p_job uuid, p_signal uuid, p_firing uuid, p_decision uuid, p_disclosure uuid, p_rule text, p_version text, p_source uuid, p_object_version text, p_facts jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $$
DECLARE s app.shadow_commercial_signal; prior app.shadow_must_surface_firing;
 request_hash text;finding uuid:=p_firing;audit_id uuid:=p_firing;locked boolean:=false;
 seq bigint;prev text;ts timestamptz;payload_text text;ph text;eh text;actor text:='role:'||session_user;fired boolean;terms_accepted boolean;
BEGIN
 IF p_tenant IS NULL OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';
 END IF;
 IF p_job IS NULL OR p_signal IS NULL OR p_firing IS NULL OR p_decision IS NULL OR p_disclosure IS NULL OR p_source IS NULL
  OR p_firing=p_disclosure OR p_version IS DISTINCT FROM 'shadow_attribution_policy_v3'
  OR p_rule IS NULL OR p_rule NOT IN('safety','prior_written_agreement','worsening_dispute','disclosure_duty')
  OR p_object_version IS NULL OR length(p_object_version) NOT BETWEEN 1 AND 300
  OR p_facts IS NULL OR jsonb_typeof(p_facts)<>'object' THEN RAISE EXCEPTION 'invalid must-surface firing' USING ERRCODE='22023'; END IF;
 -- Structured facts, never confidence, model recommendation or a value threshold.
 IF NOT p_facts ?& ARRAY['workReference','scopeArea','description','status','estimatedValuePence','safetyImplication','customerClearlyRequested','needsPriorWrittenAgreement','significantWork','activeDispute','silenceMateriallyWorsensDispute','disclosureDuty']
  OR (SELECT count(*) FROM jsonb_object_keys(p_facts))<>12
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['safetyImplication','customerClearlyRequested','needsPriorWrittenAgreement','activeDispute','silenceMateriallyWorsensDispute','disclosureDuty']) k WHERE jsonb_typeof(p_facts->k)<>'boolean') THEN
  RAISE EXCEPTION 'invalid structured rule facts' USING ERRCODE='22023';
 END IF;
 fired:=CASE p_rule WHEN 'safety' THEN (p_facts->>'safetyImplication')::boolean
  WHEN 'prior_written_agreement' THEN (p_facts->>'customerClearlyRequested')::boolean AND (p_facts->>'needsPriorWrittenAgreement')::boolean
   AND p_facts->'significantWork'->>'basis'='synthetic_fixture' AND p_facts->'significantWork'->>'significant'='true'
  WHEN 'worsening_dispute' THEN (p_facts->>'activeDispute')::boolean AND (p_facts->>'silenceMateriallyWorsensDispute')::boolean
  WHEN 'disclosure_duty' THEN (p_facts->>'disclosureDuty')::boolean END;
 IF fired IS DISTINCT FROM true THEN RAISE EXCEPTION 'rule did not fire' USING ERRCODE='23514'; END IF;
 request_hash:=encode(sha256(convert_to(jsonb_build_array(p_job,p_signal,p_firing,p_decision,p_disclosure,p_rule,p_version,p_source,p_object_version,p_facts,actor)::text,'UTF8')),'hex');
 -- Serialize with group coalescence/disclosure before taking the job or signal locks.
 PERFORM pg_advisory_xact_lock(hashtextextended('shadow-detection:'||p_tenant::text||':'||p_job::text,0));
 -- Consistent order: detection key, job, signal, business inserts, disclosure, audit head last.
 PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 SELECT * INTO s FROM app.shadow_commercial_signal WHERE tenant_id=p_tenant AND job_id=p_job AND id=p_signal FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow subject mismatch' USING ERRCODE='23503'; END IF;
 SELECT * INTO prior FROM app.shadow_must_surface_firing WHERE tenant_id=p_tenant AND
  (id=p_firing OR (job_id=p_job AND signal_id=p_signal AND rule=p_rule AND rule_version=p_version AND source_ref=p_source));
 IF FOUND THEN
  IF prior.request_hash<>request_hash THEN RAISE EXCEPTION 'must-surface replay conflict' USING ERRCODE='23505'; END IF;
  RETURN prior.decision_id;
 END IF;
 -- 0129 installs before SV-4 (0130); resolve its relation only at execution.
 -- No new privilege for the shadow login: only this migration-owned routine reads terms.
 IF to_regclass('app.final_check_terms_acceptance') IS NULL THEN
  RAISE EXCEPTION 'TERMS_RELATION_UNAVAILABLE' USING ERRCODE='55000';
 END IF;
 terms_accepted:=app.final_check_job_terms(p_tenant,p_job,'synthetic_final_check_terms.v1');
 IF terms_accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'TERMS_NOT_ACCEPTED' USING ERRCODE='55000'; END IF;
 IF to_regclass('app.final_account_lock') IS NOT NULL THEN
  EXECUTE 'SELECT EXISTS(SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2)' INTO locked USING p_tenant,p_job;
 END IF;
 IF locked THEN RAISE EXCEPTION 'early surface requires an unlocked job' USING ERRCODE='55000'; END IF;
 IF s.coalesced_into_signal_id IS NOT NULL OR s.state NOT IN('candidate','held_for_final_check','surfaced_early') THEN
  RAISE EXCEPTION 'invalid early-surface subject' USING ERRCODE='55000'; END IF;
 PERFORM 1 FROM app.shadow_signal_evidence WHERE tenant_id=p_tenant AND job_id=p_job AND signal_id=p_signal AND evidence_id=p_source AND object_version_id=p_object_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'shadow source mismatch' USING ERRCODE='23503'; END IF;
 INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type)
 VALUES(p_decision,p_tenant,'shadow_signal',p_signal::text,'review_must_surface_signal');
 -- Q4 wording remains held: stored description is the title; no invented reason or money display.
 INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,snapshot_revision)
 VALUES(finding,p_tenant,p_job,p_decision,request_hash,'must_surface_signal','mandatory',left(s.description,160),'',p_signal::text,'review_must_surface_signal',s.revision);
 INSERT INTO app.shadow_must_surface_firing(tenant_id,job_id,id,signal_id,rule,rule_version,source_ref,object_version_id,decision_id,finding_id,disclosure_event_id,audit_event_id,facts,request_hash,actor_ref)
 VALUES(p_tenant,p_job,p_firing,p_signal,p_rule,p_version,p_source,p_object_version,p_decision,finding,p_disclosure,audit_id,p_facts,request_hash,actor);
 -- SV-2 owns disclosure, monotonic provenance and its audit event. No business locks after this call.
 PERFORM app.record_shadow_disclosure(p_tenant,p_job,p_signal,p_disclosure,'must_surface_override');
 PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object('id',audit_id,'version','audit.v1','actorRef',actor,'eventType','shadow.must_surface_fired','subjectType','job','subjectRef',p_job::text,'payload',jsonb_build_object('classifications',jsonb_build_object('action','operational'),'references',jsonb_build_object('decisionId',p_decision,'firingId',p_firing,'jobId',p_job,'rule',p_rule,'ruleVersion',p_version,'signalId',p_signal)))),'checked_operation');
 RETURN p_decision;
END $$;
COMMIT;
