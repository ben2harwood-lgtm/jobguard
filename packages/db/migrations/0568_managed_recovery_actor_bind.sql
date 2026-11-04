BEGIN;
-- MON-9: authenticate within the election boundary, even for direct runtime SQL.
-- Retain the existing checked body as a private implementation; no money rules change.
REVOKE ALL ON FUNCTION app.mon9_elect(uuid,uuid,uuid,uuid,uuid,text,integer,text) FROM PUBLIC,jobguard_runtime;
CREATE FUNCTION app.mon9_elect(digest text,j uuid,c uuid,actor uuid,command uuid,auth_id uuid,service text,points integer,terms text)
RETURNS app.managed_recovery_election LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 IF app.mon9_session(digest,actor) IS NULL THEN
  RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 RETURN app.mon9_elect(j,c,actor,command,auth_id,service,points,terms);
END $$;
ALTER FUNCTION app.mon9_elect(text,uuid,uuid,uuid,uuid,uuid,text,integer,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon9_elect(text,uuid,uuid,uuid,uuid,uuid,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mon9_elect(text,uuid,uuid,uuid,uuid,uuid,text,integer,text) TO jobguard_runtime;
COMMIT;
