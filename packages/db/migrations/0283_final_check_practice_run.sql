BEGIN;
-- SV-5 Q6 (Ben, 28 Oct): a practice "Run the final check" request. The owner's checked routine leaves only
-- identifiers in a non-tenant request table, like infrastructure.outbox_signal; the worker's queue login reads
-- and marks it, and the worker alone (never a request path) freezes the manifest and runs the check.
CREATE TABLE infrastructure.final_check_request(lock_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, job_id uuid NOT NULL, requested_at timestamptz NOT NULL DEFAULT clock_timestamp(), enqueued_at timestamptz);
ALTER TABLE infrastructure.final_check_request OWNER TO jobguard_migration;
GRANT SELECT,UPDATE ON infrastructure.final_check_request TO jobguard_infrastructure;

CREATE FUNCTION app.request_final_check_run(t uuid,j uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app,infrastructure AS $$
DECLARE actor record;l app.final_account_lock;
BEGIN
 -- Same owner, practice-session, synthetic small-builder and accepted-terms authority as the builder reads.
 SELECT * INTO actor FROM app.final_check_builder(t,j,d);
 SELECT * INTO l FROM app.final_account_lock WHERE tenant_id=t AND job_id=j;
 IF NOT FOUND THEN RAISE EXCEPTION 'FINAL_ACCOUNT_LOCK_REQUIRED'; END IF;
 INSERT INTO infrastructure.final_check_request(lock_id,tenant_id,job_id) VALUES(l.id,t,j) ON CONFLICT DO NOTHING;
 RETURN jsonb_build_object('version','final-check-run-request.v1','lockId',l.id,'state','requested','environment','synthetic_demo');
END $$;
ALTER FUNCTION app.request_final_check_run(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.request_final_check_run(uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_shadow,jobguard_infrastructure,jobguard_shadow_emergency_access;
GRANT EXECUTE ON FUNCTION app.request_final_check_run(uuid,uuid,text) TO jobguard_runtime;
COMMIT;
