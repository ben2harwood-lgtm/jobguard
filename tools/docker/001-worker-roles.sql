-- Synthetic local-only login separation. Production credentials come from secret management.
DO $$ BEGIN CREATE ROLE jobguard_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE jobguard_infrastructure NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE ROLE jobguard_runtime_login LOGIN PASSWORD 'dev-runtime-only' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
CREATE ROLE jobguard_infrastructure_login LOGIN PASSWORD 'dev-infrastructure-only' NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS;
GRANT jobguard_runtime TO jobguard_runtime_login;
GRANT jobguard_infrastructure TO jobguard_infrastructure_login;
