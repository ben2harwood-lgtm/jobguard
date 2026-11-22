# Sourced by the fixture-only Postgres image entrypoint.
psql --set ON_ERROR_STOP=1 --username postgres >/dev/null <<'SQL'
\getenv runtime_password FIXTURE_RUNTIME_PASSWORD
\getenv identity_password FIXTURE_IDENTITY_PASSWORD
\getenv worker_password FIXTURE_WORKER_PASSWORD
\getenv queue_password FIXTURE_QUEUE_PASSWORD
\getenv backup_password FIXTURE_BACKUP_PASSWORD
CREATE ROLE jobguard_runtime LOGIN PASSWORD :'runtime_password';
CREATE ROLE jobguard_identity LOGIN PASSWORD :'identity_password';
CREATE ROLE jobguard_pilot_worker_login LOGIN PASSWORD :'worker_password';
CREATE ROLE jobguard_pilot_queue_login LOGIN PASSWORD :'queue_password';
CREATE ROLE fixture_backup LOGIN PASSWORD :'backup_password';
CREATE DATABASE jobguard_pilot_fixture;
CREATE DATABASE jobguard_pilot_queue;
REVOKE CONNECT ON DATABASE jobguard_pilot_fixture FROM PUBLIC;
REVOKE CONNECT ON DATABASE jobguard_pilot_queue FROM PUBLIC;
GRANT CONNECT ON DATABASE jobguard_pilot_fixture TO jobguard_runtime, jobguard_identity, jobguard_pilot_worker_login, fixture_backup;
GRANT CONNECT, CREATE ON DATABASE jobguard_pilot_queue TO jobguard_pilot_queue_login;
\connect jobguard_pilot_queue
CREATE SCHEMA jobguard_pilot_queue AUTHORIZATION jobguard_pilot_queue_login;
\connect jobguard_pilot_fixture
CREATE TABLE public.fixture_recovery (payload text NOT NULL);
INSERT INTO public.fixture_recovery VALUES ('fictional-recovery-sentinel');
GRANT SELECT ON public.fixture_recovery TO fixture_backup;
SQL
