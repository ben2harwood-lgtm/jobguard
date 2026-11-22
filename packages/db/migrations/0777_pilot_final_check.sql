BEGIN;

-- Separate pilot entrypoints preserve the synthetic shadow role's grant set.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='jobguard_pilot_final_check') THEN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolcreaterole)) THEN
   RAISE EXCEPTION 'jobguard_pilot_final_check missing; run administrative ensureRoles' USING ERRCODE='42704';
  END IF;
  CREATE ROLE jobguard_pilot_final_check NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname='jobguard_pilot_final_check'
  AND (r.rolcanlogin OR r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolinherit OR r.rolreplication OR r.rolbypassrls
   OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid))) THEN
  RAISE EXCEPTION 'UNSAFE_PILOT_FINAL_CHECK_ROLE' USING ERRCODE='42501';
 END IF;
END $$;

CREATE FUNCTION app.pilot_final_check_login() RETURNS boolean
 LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT current_database() ~ '^jobguard_pilot(_[a-z0-9]+)*$'
  AND current_database() !~ '^jobguard_pilot_(queue|restore)(_|$)'
  AND session_user='jobguard_pilot_shadow_login'
  AND EXISTS(SELECT 1 FROM pg_roles r JOIN pg_database d ON d.datname=current_database()
   WHERE r.rolname=session_user AND r.rolcanlogin
    AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
    AND NOT pg_has_role(session_user,d.datdba,'MEMBER')
    AND NOT pg_has_role(session_user,'jobguard_runtime','MEMBER')
    AND NOT EXISTS(SELECT 1 FROM pg_shdepend dep WHERE dep.dbid=d.oid
     AND dep.refclassid='pg_authid'::regclass AND dep.refobjid=r.oid AND dep.deptype='o')
    AND (SELECT count(*) FROM pg_auth_members WHERE member=r.oid)=2
    AND (SELECT count(*) FROM pg_auth_members m WHERE m.member=r.oid
     AND m.roleid IN('jobguard_shadow'::regrole,'jobguard_pilot_final_check'::regrole)
     AND m.inherit_option AND NOT m.admin_option)=2)
$$;
ALTER FUNCTION app.pilot_final_check_login() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_final_check_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_final_check_login() TO jobguard_pilot_final_check,jobguard_session_lookup;

-- The queue and practice discovery roles cannot write or read this authority.
-- Its exact request and terms digest are captured by the bound pilot lock.
CREATE TABLE control_plane.pilot_final_check_binding (
 tenant_id uuid NOT NULL,
 job_id uuid NOT NULL,
 lock_id uuid NOT NULL,
 manifest_id uuid NOT NULL UNIQUE REFERENCES infrastructure.final_check_request(manifest_id),
 terms_sha256 text NOT NULL CHECK(terms_sha256 ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,job_id,lock_id),
 FOREIGN KEY(tenant_id,job_id,lock_id) REFERENCES app.final_account_lock(tenant_id,job_id,id)
);
ALTER TABLE control_plane.pilot_final_check_binding OWNER TO jobguard_migration;
ALTER TABLE control_plane.pilot_final_check_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_plane.pilot_final_check_binding FORCE ROW LEVEL SECURITY;
REVOKE ALL ON control_plane.pilot_final_check_binding FROM PUBLIC;
CREATE POLICY pilot_final_check_binding_select ON control_plane.pilot_final_check_binding FOR SELECT TO jobguard_migration
 USING (app.pilot_final_check_login());
CREATE POLICY pilot_final_check_binding_insert ON control_plane.pilot_final_check_binding FOR INSERT TO jobguard_migration
 WITH CHECK (tenant_id=app.lp11_policy_tenant());

CREATE POLICY pilot_terms_worker ON app.pilot_final_check_terms_approval FOR SELECT TO jobguard_migration
 USING (app.pilot_final_check_login() AND tenant_id=app.lp11_shadow_job_tenant(NULL,NULL,'audit'));

CREATE FUNCTION app.pilot_final_check_approved(t uuid,j uuid) RETURNS boolean
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT app.pilot_final_check_login() AND coalesce(app.lp11_shadow_job_tenant(j,NULL,'job')=t,false)
  AND EXISTS(
   SELECT 1 FROM infrastructure.final_check_request q JOIN control_plane.pilot_final_check_binding b
    USING(tenant_id,job_id,lock_id,manifest_id)
   JOIN app.final_account_lock l ON (l.tenant_id,l.job_id,l.id)=(q.tenant_id,q.job_id,q.lock_id)
   JOIN LATERAL (
    SELECT a.version,a.approval_sha256,a.approved_at FROM app.pilot_final_check_terms_approval a
    WHERE a.tenant_id=t AND a.approved_at<=clock_timestamp()
    ORDER BY a.approved_at DESC,a.version DESC LIMIT 1
   ) approved ON approved.version=l.onboarding_terms_version AND approved.approval_sha256=b.terms_sha256
     AND approved.approved_at<=l.locked_at
   WHERE (q.tenant_id,q.job_id,q.attempt)=(t,j,1))
$$;
ALTER FUNCTION app.pilot_final_check_approved(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_final_check_approved(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_final_check_approved(uuid,uuid) TO jobguard_session_lookup;

CREATE FUNCTION app.request_pilot_final_check_on_lock() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE terms_hash text; manifest uuid;
BEGIN
 IF NEW.onboarding_terms_version NOT LIKE 'pilot_final_check_terms.v%' THEN RETURN NEW; END IF;
 PERFORM app.pilot_final_account_owner(NEW.tenant_id,NEW.job_id,NEW.locking_membership_id,false);
 SELECT approval_sha256 INTO STRICT terms_hash FROM app.pilot_final_check_terms_approval
 WHERE tenant_id=NEW.tenant_id AND version=NEW.onboarding_terms_version AND approved_at<=NEW.locked_at;
 INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id)
 VALUES(NEW.id,NEW.tenant_id,NEW.job_id) RETURNING manifest_id INTO manifest;
 INSERT INTO control_plane.pilot_final_check_binding(tenant_id,job_id,lock_id,manifest_id,terms_sha256)
 VALUES(NEW.tenant_id,NEW.job_id,NEW.id,manifest,terms_hash);
 RETURN NEW;
END $$;
ALTER FUNCTION app.request_pilot_final_check_on_lock() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.request_pilot_final_check_on_lock() FROM PUBLIC;
CREATE TRIGGER pilot_final_check_request_after_lock AFTER INSERT ON app.final_account_lock
 FOR EACH ROW EXECUTE FUNCTION app.request_pilot_final_check_on_lock();

CREATE OR REPLACE FUNCTION app.lp11_bind_shadow_job(t uuid,j uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE prior control_plane.lp11_shadow_scope; owner_digest text; bound_tenant uuid:=app.lp11_policy_tenant();
 pilot boolean:=current_database()<>'jobguard_synthetic_demo';
BEGIN
 IF t IS NULL OR j IS NULL OR (pilot AND NOT app.pilot_final_check_login())
  OR (NOT pilot AND session_user='jobguard_pilot_shadow_login')
  OR NOT (pg_has_role(session_user,'jobguard_shadow','USAGE') OR pg_has_role(session_user,'jobguard_shadow_emergency_access','USAGE'))
  OR pg_has_role(session_user,'jobguard_runtime','USAGE') THEN
  RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF bound_tenant IS NOT NULL AND t IS DISTINCT FROM bound_tenant THEN
  RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO prior FROM control_plane.lp11_shadow_scope s WHERE s.transaction_id=pg_current_xact_id_if_assigned();
 IF FOUND THEN
  IF (prior.tenant_id,prior.job_id,prior.login) IS DISTINCT FROM (t,j,session_user)
   OR NOT prior.checked OR prior.expires_at<=clock_timestamp() THEN
   RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF pilot AND NOT app.pilot_final_check_approved(t,j) THEN
   RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  RETURN;
 END IF;
 DELETE FROM control_plane.lp11_shadow_scope WHERE expires_at<=clock_timestamp();
 INSERT INTO control_plane.lp11_shadow_scope(transaction_id,tenant_id,job_id,login,expires_at)
 VALUES(pg_current_xact_id(),t,j,session_user,clock_timestamp()+interval '5 minutes');
 SELECT x.practice_session_digest INTO owner_digest
 FROM app.job x JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(x.tenant_id,x.id)
 WHERE (x.tenant_id,x.id)=(t,j) AND tr.job_track='small_builder' AND (CASE WHEN pilot THEN tr.environment='pilot_no_charge' AND tr.provenance='pilot_capture'
   AND x.practice_session_digest IS NULL AND x.practice_scenario IS NULL
  ELSE tr.environment='synthetic_demo' END)
  AND x.status IN('live','invoiced','paid');
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 UPDATE control_plane.lp11_shadow_scope s SET checked=true,practice_digest=owner_digest
 WHERE s.transaction_id=pg_current_xact_id_if_assigned();
 IF pilot AND NOT app.pilot_final_check_approved(t,j) THEN
  RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION app.final_check_require_worker(p_tenant uuid, p_job uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'app'
AS $$
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid OR NOT pg_has_role(session_user,'jobguard_shadow','USAGE') THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF app.pilot_final_check_login() THEN
  PERFORM app.lp11_bind_shadow_job(p_tenant,p_job);
  PERFORM 1 FROM app.job WHERE tenant_id=p_tenant AND id=p_job FOR UPDATE;
  IF NOT FOUND OR NOT app.pilot_final_check_approved(p_tenant,p_job) THEN
   RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||':'||p_job::text,130));
  RETURN;
 END IF;
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
 PERFORM app.lp11_bind_shadow_job(t,j);
 IF NOT app.pilot_final_check_login() AND (NOT EXISTS(SELECT 1 FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND job_track='small_builder' AND environment='synthetic_demo')
 OR NOT app.final_check_job_terms(t,j,'synthetic_final_check_terms.v1')) THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- Acquire prerequisite job/advisory locks before shadow locks and any audit allocation.
 PERFORM app.final_check_require_worker(t,j);
END $$;

-- Discovery returns transport identifiers only. Graphile lives in a different
-- database, so acknowledgements follow the idempotently keyed queue insert.
CREATE FUNCTION app.pilot_final_check_requests() RETURNS TABLE(tenant_id uuid,job_id uuid,lock_id uuid,manifest_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT app.pilot_final_check_login() THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT q.tenant_id,q.job_id,q.lock_id,q.manifest_id FROM infrastructure.final_check_request q
  JOIN control_plane.pilot_final_check_binding b USING(tenant_id,job_id,lock_id,manifest_id)
  WHERE q.enqueued_at IS NULL ORDER BY q.requested_at,q.lock_id LIMIT 100;
END $$;
ALTER FUNCTION app.pilot_final_check_requests() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_final_check_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_final_check_requests() TO jobguard_pilot_final_check;

CREATE FUNCTION app.pilot_final_check_ack(t uuid,j uuid,l uuid,m uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT app.pilot_final_check_login() THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 UPDATE infrastructure.final_check_request q SET enqueued_at=clock_timestamp()
 FROM control_plane.pilot_final_check_binding b
 WHERE (q.tenant_id,q.job_id,q.lock_id,q.manifest_id)=(t,j,l,m)
  AND (b.tenant_id,b.job_id,b.lock_id,b.manifest_id)=(t,j,l,m) AND q.enqueued_at IS NULL;
END $$;
ALTER FUNCTION app.pilot_final_check_ack(uuid,uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.pilot_final_check_ack(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pilot_final_check_ack(uuid,uuid,uuid,uuid) TO jobguard_pilot_final_check;

-- Prevent the legacy explicit-manifest writer from replacing the reservation
-- or writing another attempt on the pilot path.
CREATE FUNCTION app.guard_pilot_final_check_manifest() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT app.pilot_final_check_login() THEN RETURN NEW; END IF;
 IF NOT app.pilot_final_check_approved(NEW.tenant_id,NEW.job_id) OR NOT EXISTS(
  SELECT 1 FROM control_plane.pilot_final_check_binding b
  WHERE (b.tenant_id,b.job_id,b.lock_id,b.manifest_id)=(NEW.tenant_id,NEW.job_id,NEW.lock_id,NEW.id)
   AND NEW.attempt=1 AND NEW.detector_version='pilot-final-check-fixture.v1')
 THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_pilot_final_check_manifest() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_pilot_final_check_manifest() FROM PUBLIC;
CREATE TRIGGER a_pilot_final_check_manifest BEFORE INSERT ON app.final_check_manifest
 FOR EACH ROW EXECUTE FUNCTION app.guard_pilot_final_check_manifest();

-- Use the reservation as the unique publication identity on every pilot path.
-- The existing certificate trigger still verifies the full persisted run.
CREATE FUNCTION app.guard_pilot_final_check_certificate() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF NOT app.pilot_final_check_login() THEN RETURN NEW; END IF;
 PERFORM app.final_check_worker(NEW.tenant_id,NEW.job_id);
 IF NEW.status IS DISTINCT FROM 'completed' OR NOT EXISTS(
  SELECT 1 FROM control_plane.pilot_final_check_binding b JOIN app.final_check_run_binding r
   USING(tenant_id,job_id,lock_id,manifest_id)
  WHERE (b.tenant_id,b.job_id,b.manifest_id,r.run_id)=(NEW.tenant_id,NEW.job_id,NEW.id,NEW.run_id))
 THEN RAISE EXCEPTION 'FINAL_CHECK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_pilot_final_check_certificate() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_pilot_final_check_certificate() FROM PUBLIC;
CREATE TRIGGER a0_pilot_final_check_certificate BEFORE INSERT ON app.final_account_lock_check
 FOR EACH ROW EXECUTE FUNCTION app.guard_pilot_final_check_certificate();

COMMIT;
