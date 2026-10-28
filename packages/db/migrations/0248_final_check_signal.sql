BEGIN;
-- SV-5 Q6 (held until Ben answers): a final-account lock leaves a non-tenant signal for the worker,
-- exactly like infrastructure.outbox_signal. The worker's own login reads it and starts the check;
-- no request path gains shadow capability or queue access.
CREATE TABLE infrastructure.final_check_signal(lock_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, job_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), enqueued_at timestamptz);
ALTER TABLE infrastructure.final_check_signal OWNER TO jobguard_migration;
GRANT SELECT,UPDATE ON infrastructure.final_check_signal TO jobguard_infrastructure;
CREATE FUNCTION app.signal_final_check() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,infrastructure AS $$ BEGIN INSERT INTO infrastructure.final_check_signal(lock_id,tenant_id,job_id) VALUES(NEW.id,NEW.tenant_id,NEW.job_id) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
ALTER FUNCTION app.signal_final_check() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.signal_final_check() FROM PUBLIC;
CREATE TRIGGER final_account_lock_final_check_signal AFTER INSERT ON app.final_account_lock FOR EACH ROW EXECUTE FUNCTION app.signal_final_check();
COMMIT;
