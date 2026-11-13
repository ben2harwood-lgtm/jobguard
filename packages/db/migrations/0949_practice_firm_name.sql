BEGIN;
-- Forward-only; no rows, issued documents, approvals or existing ACLs are changed.
CREATE OR REPLACE FUNCTION app.current_firm_profile_key() RETURNS text
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b jsonb; scopes text[]; d text;
BEGIN
 b:=app.bound_context_reader();
 IF b IS NULL THEN RETURN NULL; END IF;
 IF (b->>'tenant_id')::uuid IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 -- Resolve canonical ownership from protected binding, never a presented digest.
 IF (b->>'tenant_id')::uuid='11111111-1111-4111-8111-111111111111'::uuid
  AND current_database()='jobguard_synthetic_demo' THEN
  SELECT array_agg(s.token_digest::text) INTO scopes
   FROM control_plane.blank_practice_session s
   WHERE app.final_check_bound_practice((b->>'tenant_id')::uuid,s.token_digest::text);
  IF cardinality(scopes)>1 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF cardinality(scopes)=1 THEN
   d:=scopes[1];
   IF NOT EXISTS(SELECT 1 FROM control_plane.blank_practice_session s WHERE s.token_digest=d AND s.replaced_by IS NULL)
    OR NOT EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,(b->>'tenant_id')::uuid)) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
   RETURN 'practice:'||d;
  END IF;
 END IF;
 -- Match 0700's real-company boundary, including historical practice sessions.
 IF (b->>'tenant_id')::uuid IN ('11111111-1111-4111-8111-111111111111'::uuid,'33333333-3333-4333-8333-333333333333'::uuid)
  OR EXISTS(SELECT 1 FROM control_plane.contractor_practice_session s WHERE s.tenant_id=(b->>'tenant_id')::uuid)
  OR EXISTS(SELECT 1 FROM control_plane.practice_company_marker k WHERE k.tenant_id=(b->>'tenant_id')::uuid)
 THEN RETURN NULL; END IF;
 RETURN b->>'tenant_id';
END $$;

-- CREATE OR REPLACE retains 0726's owner, fixed path and exact ACL.
-- FORCE RLS also applies to the definer owner. Give this read capability the
-- same bound-key SELECT predicate as runtime; no write policy/grant is added.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid='app.firm_profile'::regclass AND polname='firm_profile_bound_reader') THEN
  CREATE POLICY firm_profile_bound_reader ON app.firm_profile FOR SELECT TO jobguard_migration
   USING(app.firm_profile_access(tenant_id,company_key,false));
 END IF;
END $$;
-- Job-bound read capability: no caller-supplied namespace or credential.
CREATE OR REPLACE FUNCTION app.job_saved_firm_name(j uuid) RETURNS text
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE k text; t uuid; d text; name text;
BEGIN
 k:=app.current_firm_profile_key();
 t:=app.current_tenant();
 IF t IS NULL OR NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF t='11111111-1111-4111-8111-111111111111'::uuid THEN
  d:=app.final_check_job_scope(t,j);
  -- Unattributed seeded examples keep their existing wording.
  IF d IS NULL THEN RETURN NULL; END IF;
  -- Legacy sample sessions keep the fallback on their own attributed jobs.
  IF k IS NULL AND app.final_check_bound_practice(t,d)
   AND EXISTS(SELECT 1 FROM app.authenticate_practice_session(d,t)) THEN RETURN NULL; END IF;
  IF k IS DISTINCT FROM 'practice:'||d THEN
   RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 IF k IS NULL OR NOT app.firm_profile_access(t,k,false) THEN RETURN NULL; END IF;
 SELECT trading_name INTO name FROM app.firm_profile WHERE tenant_id=t AND company_key=k;
 RETURN name;
END $$;
ALTER FUNCTION app.job_saved_firm_name(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.job_saved_firm_name(uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.job_saved_firm_name(uuid) TO jobguard_runtime;
-- Forward fix: replace these routines in a later migration; retain every profile
-- and every immutable document. Reapplication changes no data or existing ACL.
COMMIT;
