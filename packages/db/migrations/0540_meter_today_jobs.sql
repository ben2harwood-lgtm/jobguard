BEGIN;
-- Read only. Authenticate before looking at any company ledger facts.
-- Deliberately no job, evidence, billing or shadow table reads here.
CREATE FUNCTION app.mon1_today_jobs(t uuid,digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE ledger_snapshot app.meter_work_ledger;
BEGIN
 PERFORM app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 PERFORM app.mon1_company_actor(t,digest);
 SELECT * INTO ledger_snapshot FROM app.meter_work_ledger
 WHERE tenant_id=t AND london_date=(clock_timestamp() AT TIME ZONE 'Europe/London')::date
 ORDER BY recorded_at DESC,source_hash DESC LIMIT 1;
 IF ledger_snapshot.source_hash IS NULL THEN RAISE EXCEPTION 'METER_UNAVAILABLE'; END IF;
 RETURN jsonb_build_object('date',ledger_snapshot.london_date::text,'plan',ledger_snapshot.plan,'jobs',ledger_snapshot.jobs);
END $$;
ALTER FUNCTION app.mon1_today_jobs(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_today_jobs(uuid,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon1_today_jobs(uuid,text) TO jobguard_runtime;
COMMIT;
