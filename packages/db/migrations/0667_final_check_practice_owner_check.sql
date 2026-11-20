BEGIN;

-- Only the private adoption writers create these tenant-qualified import edges.
-- UNION also terminates safely if privileged fixture/corrupt data contains a cycle.
CREATE FUNCTION app.final_check_practice_owns_job(t uuid,j uuid,d text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,app AS $$
 WITH RECURSIVE owned(id) AS (
  SELECT id FROM app.job WHERE tenant_id=t AND practice_session_digest=d
  UNION
  SELECT i.job_id FROM app.job_import_v3 i JOIN owned o ON o.id=i.source_job_id WHERE i.tenant_id=t
 )
 SELECT EXISTS(SELECT 1 FROM owned WHERE id=j)
$$;
ALTER FUNCTION app.final_check_practice_owns_job(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_practice_owns_job(uuid,uuid,text)
 FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;

CREATE OR REPLACE FUNCTION app.final_check_require_invoice_actor(p_tenant uuid,p_job uuid,p_actor uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,app AS $$
DECLARE scoped_digest text; supplied_digest text:=nullif(current_setting('app.practice_material_digest',true),''); session_actor uuid;
BEGIN
 PERFORM app.final_lock_require_owner(p_tenant,p_actor);
 IF supplied_digest IS NOT NULL THEN
  SELECT membership_id INTO session_actor FROM app.authenticate_practice_session(supplied_digest,p_tenant);
  IF session_actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT practice_session_digest INTO scoped_digest FROM app.job WHERE tenant_id=p_tenant AND id=p_job;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF supplied_digest IS NOT NULL THEN
  IF NOT app.final_check_practice_owns_job(p_tenant,p_job,supplied_digest) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSIF scoped_digest IS NOT NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION app.final_check_require_invoice_actor(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.final_check_require_invoice_actor(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_shadow,jobguard_shadow_emergency_access,jobguard_infrastructure;

-- Preserve the live body, including 0380's admission/lock order and later patches.
DO $$ DECLARE original text; changed text; anchor text; guard text; BEGIN
 original:=pg_get_functiondef('app.lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text)'::regprocedure);
 -- The owner check occurs more than once; only the first, at BEGIN, is the anchor.
 anchor:='BEGIN'||chr(10)||' PERFORM app.final_lock_require_owner(p_tenant,p_actor);';
 IF (length(original)-length(replace(original,anchor,'')))/length(anchor)<>1 THEN
  RAISE EXCEPTION 'unexpected final account practice owner anchor';
 END IF;
 guard:=chr(10)||$guard$ IF nullif(current_setting('app.practice_material_digest',true),'') IS NOT NULL
  AND NOT app.final_check_practice_owns_job(p_tenant,p_job,nullif(current_setting('app.practice_material_digest',true),'')) THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;$guard$;
 changed:=replace(original,anchor,anchor||guard);
 EXECUTE changed;
END $$;
ALTER FUNCTION app.lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text)
 FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text) TO jobguard_runtime;

-- Forward fix only: removing these checks would restore cross-session access.
COMMIT;
