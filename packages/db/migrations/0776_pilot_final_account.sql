BEGIN;

-- PILOT-16 owns recording approvals. Request and worker logins have no
-- privileges on this table and this migration installs no approval writer.
CREATE TABLE app.pilot_final_check_terms_approval (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
 version text NOT NULL CHECK(version ~ '^pilot_final_check_terms[.]v[1-9][0-9]{0,8}$'),
 approval_sha256 text NOT NULL CHECK(approval_sha256 ~ '^[a-f0-9]{64}$'),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,version)
);
ALTER TABLE app.pilot_final_check_terms_approval OWNER TO jobguard_migration;
ALTER TABLE app.pilot_final_check_terms_approval ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.pilot_final_check_terms_approval FORCE ROW LEVEL SECURITY;
CREATE POLICY pilot_terms_owner ON app.pilot_final_check_terms_approval TO jobguard_migration
 USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.pilot_final_check_terms_approval FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_identity,jobguard_infrastructure;
CREATE TRIGGER pilot_terms_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON app.pilot_final_check_terms_approval
 FOR EACH STATEMENT EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

ALTER TABLE app.final_account_lock DROP CONSTRAINT final_account_lock_onboarding_terms_version_check;
ALTER TABLE app.final_account_lock ADD CONSTRAINT final_account_lock_onboarding_terms_version_check
 CHECK(onboarding_terms_version='synthetic_final_check_terms.v1'
   OR onboarding_terms_version ~ '^pilot_final_check_terms[.]v[1-9][0-9]{0,8}$');

CREATE FUNCTION app.pilot_final_account_job(t uuid,j uuid) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 SELECT current_database() ~ '^jobguard_pilot(_[a-z0-9]+)*$'
  AND current_database() !~ '^jobguard_pilot_(queue|restore)(_|$)'
  AND EXISTS(SELECT 1 FROM app.job_commercial_track tr JOIN app.job jb ON (jb.tenant_id,jb.id)=(tr.tenant_id,tr.job_id)
   WHERE (tr.tenant_id,tr.job_id)=(t,j) AND tr.job_track='small_builder' AND tr.environment='pilot_no_charge'
   AND tr.provenance='pilot_capture' AND jb.practice_session_digest IS NULL AND jb.practice_scenario IS NULL)
$$;

CREATE FUNCTION app.pilot_final_account_owner(t uuid,j uuid,actor uuid,locking boolean) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
BEGIN
 IF NOT pg_has_role(session_user,'jobguard_runtime','USAGE')
  OR t IS DISTINCT FROM app.current_tenant() OR actor IS DISTINCT FROM app.current_actor()
  OR app.pilot_capture_real_binding(t) IS DISTINCT FROM TRUE
  OR app.pilot_final_account_job(t,j) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF locking THEN
  PERFORM 1 FROM app.job WHERE (tenant_id,id)=(t,j) FOR UPDATE;
 END IF;
 PERFORM app.final_lock_require_owner(t,actor);
END $$;

CREATE FUNCTION app.pilot_final_account_terms(t uuid,j uuid) RETURNS text
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.pilot_final_account_owner(t,j,app.current_actor(),false);
 RETURN (SELECT version FROM app.pilot_final_check_terms_approval
  WHERE tenant_id=t AND approved_at<=clock_timestamp() ORDER BY approved_at DESC,version DESC LIMIT 1);
END $$;

CREATE FUNCTION app.pilot_final_account_has_terms(t uuid,j uuid,v text,cutoff timestamptz) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,app AS $$
 SELECT app.pilot_final_account_job(t,j) AND EXISTS(SELECT 1 FROM app.pilot_final_check_terms_approval a
  WHERE a.tenant_id=t AND a.version=v AND a.approved_at<=cutoff)
$$;

CREATE OR REPLACE FUNCTION app.guard_final_lock_disclosure_terms() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF NEW.onboarding_terms_version='synthetic_final_check_terms.v1' THEN
  IF EXISTS(SELECT 1 FROM app.job_commercial_track WHERE (tenant_id,job_id)=(NEW.tenant_id,NEW.job_id)
   AND job_track='small_builder' AND environment='synthetic_demo')
   AND app.final_check_job_terms(NEW.tenant_id,NEW.job_id,NEW.onboarding_terms_version,NEW.locked_at)
  THEN RETURN NEW; END IF;
 ELSIF app.pilot_final_account_has_terms(NEW.tenant_id,NEW.job_id,NEW.onboarding_terms_version,NEW.locked_at) THEN
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED' USING ERRCODE='23514';
END $$;

CREATE FUNCTION app.pilot_lock_final_account(p_tenant uuid, p_job uuid, p_actor uuid, p_command uuid, p_revision uuid, p_expected integer, p_declaration text)
 RETURNS app.final_account_lock
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'app'
AS $$
DECLARE request_digest text; prior app.command_receipt; existing_lock app.final_account_lock; r app.final_account_revision; sources jsonb; s jsonb;
 row_id uuid:=gen_random_uuid(); event_id uuid:=gen_random_uuid(); server_time timestamptz; result jsonb; terms text;
BEGIN
 PERFORM app.pilot_final_account_owner(p_tenant,p_job,p_actor,false);
 PERFORM pg_advisory_xact_lock(hashtextextended('final-review-command:'||p_tenant::text||':'||p_command::text,0));
 PERFORM app.pilot_final_account_owner(p_tenant,p_job,p_actor,true);
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE (tenant_id,id)=(p_tenant,p_job) AND status IN ('live','invoiced','paid'))
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_command IS NULL OR p_revision IS NULL OR p_expected IS NULL OR p_expected<0 OR p_declaration IS DISTINCT FROM 'final_account_declaration.v1' THEN RAISE EXCEPTION 'INVALID_FINAL_ACCOUNT_LOCK_INPUT'; END IF;
 request_digest:=app.final_lock_hash(jsonb_build_object('command','LockFinalAccount','job',p_job,'actor',p_actor,'revision',p_revision,'expected',p_expected,'declaration',p_declaration));
 SELECT * INTO prior FROM app.command_receipt WHERE tenant_id=p_tenant AND command_id=p_command;
 IF FOUND THEN
  IF prior.command_type<>'LockFinalAccount' OR prior.request_hash<>request_digest THEN RAISE EXCEPTION 'IDEMPOTENCY_PAYLOAD_CONFLICT' USING ERRCODE='23505'; END IF;
  SELECT * INTO existing_lock FROM app.final_account_lock WHERE tenant_id=p_tenant AND command_id=p_command; RETURN existing_lock;
 END IF;
 SELECT * INTO existing_lock FROM app.final_account_lock WHERE tenant_id=p_tenant AND job_id=p_job;
 IF FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_ALREADY_LOCKED' USING ERRCODE='23505',DETAIL=existing_lock.id::text; END IF;
 terms:=app.pilot_final_account_terms(p_tenant,p_job);
 IF terms IS NULL THEN RAISE EXCEPTION 'DISCLOSURE_TERMS_NOT_ACCEPTED'; END IF;
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
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text,184));
 server_time:=clock_timestamp();
 s:=sources||jsonb_build_object('version','shadow-lock.v1','tenantId',p_tenant,'jobId',p_job,'finalAccountRevisionId',p_revision,'baselineQuoteVersionId',r.baseline_quote_version_id,
  'declaration','I''ve reviewed the work and extras on this job and this is my complete final account.','declarationVersion',p_declaration,'onboardingTermsVersion',terms,
  'lockingMembershipId',p_actor,'serverTimestamp',to_char(server_time AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'commandId',p_command,'auditEventId',event_id);
 result:=jsonb_build_object('lockId',row_id);
 INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
 VALUES(p_tenant,p_command,'LockFinalAccount',p_job::text,request_digest,'succeeded',result,p_actor,server_time);
 INSERT INTO app.final_account_lock(tenant_id,job_id,id,final_account_revision_id,baseline_quote_version_id,capture_register_hash,line_set_hash,scope_disposition_hash,snapshot_digest,snapshot,
 declaration,declaration_version,onboarding_terms_version,locking_membership_id,locked_at,command_id,audit_event_id)
 VALUES(p_tenant,p_job,row_id,p_revision,r.baseline_quote_version_id,app.final_lock_hash(s->'captureRegister'),app.final_lock_hash(s->'lines'),app.final_lock_hash(s->'scopeDispositions'),app.final_lock_hash(s),s,
 s->>'declaration',p_declaration,terms,p_actor,server_time,p_command,event_id) RETURNING * INTO existing_lock;
 PERFORM app.append_final_lock_audit(event_id,p_actor,p_job,'final_account.locked',jsonb_build_object('lockId',row_id,'commandId',p_command,'finalAccountRevisionId',p_revision),jsonb_build_object('snapshot',existing_lock.snapshot_digest));
 RETURN existing_lock;
END $$;

CREATE FUNCTION app.pilot_prepare_final_review_extra(t uuid,j uuid,actor uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.pilot_final_account_owner(t,j,actor,true);
 IF NOT EXISTS(SELECT 1 FROM app.job WHERE (tenant_id,id)=(t,j) AND status='live')
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM app.final_account_lock WHERE (tenant_id,job_id)=(t,j))
 THEN RAISE EXCEPTION 'FINAL_REVIEW_CLOSED'; END IF;
END $$;

CREATE FUNCTION app.pilot_record_final_account_disposition(t uuid,j uuid,actor uuid,command uuid,scope uuid,disposition text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM app.pilot_final_account_owner(t,j,actor,true);
 RETURN app.record_final_account_disposition(t,j,actor,command,scope,disposition);
END $$;

ALTER FUNCTION app.pilot_final_account_job(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_final_account_job(uuid,uuid) FROM PUBLIC;

ALTER FUNCTION app.pilot_final_account_owner(uuid,uuid,uuid,boolean) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_final_account_owner(uuid,uuid,uuid,boolean) FROM PUBLIC;

ALTER FUNCTION app.pilot_final_account_terms(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_final_account_terms(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_final_account_terms(uuid,uuid) TO jobguard_runtime;

ALTER FUNCTION app.pilot_final_account_has_terms(uuid,uuid,text,timestamptz) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_final_account_has_terms(uuid,uuid,text,timestamptz) FROM PUBLIC;

ALTER FUNCTION app.pilot_lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text) TO jobguard_runtime;

ALTER FUNCTION app.pilot_prepare_final_review_extra(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_prepare_final_review_extra(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_prepare_final_review_extra(uuid,uuid,uuid) TO jobguard_runtime;

ALTER FUNCTION app.pilot_record_final_account_disposition(uuid,uuid,uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_record_final_account_disposition(uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_record_final_account_disposition(uuid,uuid,uuid,uuid,uuid,text) TO jobguard_runtime;

COMMIT;
