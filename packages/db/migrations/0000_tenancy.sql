BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jobguard_runtime') THEN
    CREATE ROLE jobguard_runtime NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jobguard_migration') THEN
    CREATE ROLE jobguard_migration NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jobguard_infrastructure') THEN
    CREATE ROLE jobguard_infrastructure NOLOGIN NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS control_plane;
CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA identity, control_plane, app FROM PUBLIC;

CREATE TABLE IF NOT EXISTS identity.identity_user (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE TABLE IF NOT EXISTS control_plane.tenant (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
CREATE TABLE IF NOT EXISTS app.account (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  name varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT account_tenant_id_id_uq UNIQUE (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS account_tenant_id_idx ON app.account (tenant_id);

CREATE TABLE IF NOT EXISTS app.membership (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  account_id uuid NOT NULL,
  identity_user_id uuid NOT NULL REFERENCES identity.identity_user(id),
  role varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id, id),
  CONSTRAINT membership_tenant_account_fk
    FOREIGN KEY (tenant_id, account_id) REFERENCES app.account(tenant_id, id)
);

ALTER SCHEMA identity OWNER TO jobguard_migration;
ALTER SCHEMA control_plane OWNER TO jobguard_migration;
ALTER SCHEMA app OWNER TO jobguard_migration;
ALTER TABLE identity.identity_user OWNER TO jobguard_migration;
ALTER TABLE control_plane.tenant OWNER TO jobguard_migration;
ALTER TABLE app.account OWNER TO jobguard_migration;
ALTER TABLE app.membership OWNER TO jobguard_migration;
CREATE INDEX IF NOT EXISTS membership_tenant_user_idx
  ON app.membership (tenant_id, identity_user_id);

ALTER TABLE app.account ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.account FORCE ROW LEVEL SECURITY;
ALTER TABLE app.membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.membership FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON app.account;
CREATE POLICY tenant_isolation ON app.account
  FOR ALL TO jobguard_runtime
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS tenant_isolation ON app.membership;
CREATE POLICY tenant_isolation ON app.membership
  FOR ALL TO jobguard_runtime
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON ALL TABLES IN SCHEMA identity, control_plane, app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO jobguard_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.account, app.membership TO jobguard_runtime;
-- Explicitly deny destructive DDL and control-plane enumeration to business runtime.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON app.account, app.membership FROM jobguard_runtime;
REVOKE ALL ON SCHEMA identity, control_plane FROM jobguard_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA identity, control_plane FROM jobguard_runtime;
-- Worker infrastructure metadata is separate; this role receives no app-schema access.
REVOKE ALL ON SCHEMA app, identity, control_plane FROM jobguard_infrastructure;
REVOKE ALL ON ALL TABLES IN SCHEMA app, identity, control_plane FROM jobguard_infrastructure;

COMMIT;
