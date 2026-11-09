BEGIN;
-- PROPOSAL, NEEDS BEN. Read-only bridge for migration-owned definer callers.
-- Ownership transfer uses the existing administrative migration provisioner.
GRANT CREATE ON SCHEMA app TO jobguard_binding_owner;
CREATE FUNCTION app.bound_context_reader() RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE bound control_plane.request_binding;
BEGIN
 bound := app.lp6_bound_request();
 RETURN jsonb_build_object('actor_id',bound.actor_id,'tenant_id',bound.tenant_id);
EXCEPTION WHEN insufficient_privilege THEN
 IF SQLERRM = 'REQUEST_BINDING_REFUSED' THEN
  RETURN NULL;
 END IF;
 RAISE;
END $$;
ALTER FUNCTION app.bound_context_reader() OWNER TO jobguard_binding_owner;
REVOKE ALL ON FUNCTION app.bound_context_reader() FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.bound_context_reader() TO jobguard_migration;
REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner;
COMMIT;
