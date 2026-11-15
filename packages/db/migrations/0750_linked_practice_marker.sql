BEGIN;
-- The association is created only by identity.enter_linked_practice. Never infer
-- linkage from a credential/namespace digest comparison or a browser cookie.
CREATE FUNCTION app.is_linked_practice_session(d text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT current_database()='jobguard_synthetic_demo' AND EXISTS(
  SELECT 1 FROM control_plane.identity_practice_credential c WHERE c.token_digest=d
 )
$$;
ALTER FUNCTION app.is_linked_practice_session(text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.is_linked_practice_session(text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.is_linked_practice_session(text) TO jobguard_runtime;
COMMIT;
