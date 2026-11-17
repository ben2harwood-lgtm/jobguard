BEGIN;

-- LP-1: withdraw the application login's direct authority writes. Keep SELECT
-- and the minimum PostgreSQL privilege required by the existing row-lock SQL.
-- BUILD_PLAN R1 / Ben decision 41: this replaces broad UPDATE with a strictly
-- smaller, immutable locking-column privilege; it adds no writable value.
REVOKE INSERT, UPDATE, DELETE ON app.account, app.membership FROM jobguard_runtime;
-- Table revocation does not withdraw independent column ACLs. Close those too.
REVOKE INSERT (id, tenant_id, name, created_at, updated_at),
       UPDATE (id, tenant_id, name, created_at, updated_at),
       REFERENCES (id, tenant_id, name, created_at, updated_at)
  ON app.account FROM jobguard_runtime;
REVOKE INSERT (id, tenant_id, account_id, identity_user_id, role, created_at, revoked_at, expires_at),
       UPDATE (id, tenant_id, account_id, identity_user_id, role, created_at, revoked_at, expires_at),
       REFERENCES (id, tenant_id, account_id, identity_user_id, role, created_at, revoked_at, expires_at)
  ON app.membership FROM jobguard_runtime;

-- Reject even no-op and empty-set UPDATE statements before any row trigger can
-- run. SELECT ... FOR UPDATE/SHARE does not execute UPDATE triggers. Invoker
-- execution is deliberate: no owner authority or callable write path is added.
CREATE FUNCTION app.lp1_reject_lock_column_update() RETURNS trigger
  LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'immutable locking column' USING ERRCODE='42501';
END;
$$;
ALTER FUNCTION app.lp1_reject_lock_column_update() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.lp1_reject_lock_column_update()
  FROM PUBLIC, jobguard_runtime, jobguard_identity, jobguard_infrastructure;
CREATE TRIGGER lp1_account_lock_column_immutable
  BEFORE UPDATE OF created_at ON app.account
  FOR EACH STATEMENT EXECUTE FUNCTION app.lp1_reject_lock_column_update();
CREATE TRIGGER lp1_membership_lock_column_immutable
  BEFORE UPDATE OF created_at ON app.membership
  FOR EACH STATEMENT EXECUTE FUNCTION app.lp1_reject_lock_column_update();

GRANT UPDATE (created_at) ON app.account TO jobguard_runtime;
GRANT UPDATE (created_at) ON app.membership TO jobguard_runtime;

-- No policy, owner, row, column, identity entry point or existing lock changes.
COMMIT;
