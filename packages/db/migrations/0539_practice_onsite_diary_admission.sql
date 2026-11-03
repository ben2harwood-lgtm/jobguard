BEGIN;
-- SV-7A / CH-4: practice diary notes do not consume company capacity.
-- Patch the installed definitions, preserving 0522's intake command lifecycle.
-- ch4_admit_place itself must continue to reject practice jobs.
DO $$ DECLARE original text; changed text; BEGIN
 original:=pg_get_functiondef('app.ch4_capture_site_source()'::regprocedure);
 changed:=replace(original,'IF r.source_kind=''diary'' THEN PERFORM app.ch4_admit_place(r.tenant_id,r.job_id,''restart''); END IF;',
  'IF r.source_kind=''diary'' AND EXISTS(SELECT 1 FROM app.job x WHERE x.tenant_id=r.tenant_id AND x.id=r.job_id AND x.practice_session_digest IS NULL) THEN PERFORM app.ch4_admit_place(r.tenant_id,r.job_id,''restart''); END IF;');
 IF changed=original THEN RAISE EXCEPTION 'unexpected capture definition'; END IF;
 EXECUTE changed;
 original:=pg_get_functiondef('app.sv7a_intake_job_source(uuid,uuid,text,text,jsonb)'::regprocedure);
 changed:=replace(original,'PERFORM app.ch4_admit_place(t,j,''restart'');',
  'IF EXISTS(SELECT 1 FROM app.job x WHERE x.tenant_id=t AND x.id=j AND x.practice_session_digest IS NULL) THEN PERFORM app.ch4_admit_place(t,j,''restart''); END IF;');
 IF changed=original THEN RAISE EXCEPTION 'unexpected intake definition'; END IF;
 EXECUTE changed;
END $$;
COMMIT;
