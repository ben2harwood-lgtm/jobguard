BEGIN;
-- M4-6-store: additive synthetic history; no scheduling owner, clock or commercial routine changes.
CREATE TABLE app.recovery_timeline_run (
 tenant_id uuid NOT NULL, follow_up_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL, run_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN ('waiting','review','stopped')),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 PRIMARY KEY(tenant_id,follow_up_id),
 FOREIGN KEY(tenant_id,job_id,case_id,follow_up_id) REFERENCES app.recovery_follow_up(tenant_id,job_id,case_id,id),
 FOREIGN KEY(tenant_id,follow_up_id,run_id) REFERENCES app.recovery_follow_up(tenant_id,id,run_id)
);
CREATE TABLE app.recovery_timeline_signal (
 tenant_id uuid NOT NULL, signal_id uuid NOT NULL, follow_up_id uuid NOT NULL,
 fingerprint char(64) NOT NULL CHECK(fingerprint ~ '^[0-9a-f]{64}$'),
 PRIMARY KEY(tenant_id,signal_id),
 FOREIGN KEY(tenant_id,follow_up_id) REFERENCES app.recovery_timeline_run(tenant_id,follow_up_id)
);
CREATE FUNCTION app.guard_recovery_timeline_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state='stopped' AND NEW.state<>'stopped' THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_STOPPED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER recovery_timeline_state_guard BEFORE UPDATE ON app.recovery_timeline_run
 FOR EACH ROW EXECUTE FUNCTION app.guard_recovery_timeline_state();
ALTER FUNCTION app.guard_recovery_timeline_state() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_recovery_timeline_state() FROM PUBLIC,jobguard_runtime;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['recovery_timeline_run','recovery_timeline_signal'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime',n);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 END LOOP;
END $$;
-- Runtime cannot pre-seed fingerprints by writing the table directly.
REVOKE INSERT ON app.recovery_timeline_signal FROM jobguard_runtime;
CREATE FUNCTION app.record_recovery_timeline_signal(p_tenant uuid,p_signal uuid,p_follow_up uuid,p_fingerprint text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_database()<>'jobguard_synthetic_demo'
    OR p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
    OR p_tenant IS NULL THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app.recovery_timeline_run r
   JOIN app.recovery_follow_up f ON (f.tenant_id,f.id,f.job_id,f.case_id,f.run_id)=
     (r.tenant_id,r.follow_up_id,r.job_id,r.case_id,r.run_id)
   WHERE r.tenant_id=p_tenant AND r.follow_up_id=p_follow_up) THEN
  RAISE EXCEPTION 'RECOVERY_TIMELINE_NOT_FOUND' USING ERRCODE='42501';
 END IF;
 INSERT INTO app.recovery_timeline_signal(tenant_id,signal_id,follow_up_id,fingerprint)
 VALUES(p_tenant,p_signal,p_follow_up,p_fingerprint);
END $$;
ALTER FUNCTION app.record_recovery_timeline_signal(uuid,uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.record_recovery_timeline_signal(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.record_recovery_timeline_signal(uuid,uuid,uuid,text) TO jobguard_runtime;
GRANT UPDATE(state) ON app.recovery_timeline_run TO jobguard_runtime;
COMMIT;
