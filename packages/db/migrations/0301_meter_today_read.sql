BEGIN;
-- Bootstrap assigns the existing narrow owner and enables SECURITY DEFINER.
-- Until then this invoker routine fails closed; no runtime table grants.
CREATE FUNCTION app.mon1_counted_meter_today(t uuid,digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE s app.meter_lifecycle_source; c app.meter_lifecycle_computation;
 d app.meter_lifecycle_day_ledger; today date := (clock_timestamp() AT TIME ZONE 'Europe/London')::date;
BEGIN
 PERFORM app.mon1_lifecycle_actor(t,digest,false);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));
 PERFORM app.mon1_lifecycle_actor(t,digest,false);
 SELECT * INTO s FROM app.meter_lifecycle_source
 WHERE tenant_id=t AND period_start<=today AND (source->>'endDateExclusive')::date>today
 ORDER BY period_start DESC,revision DESC LIMIT 1;
 IF s.id IS NULL THEN RAISE EXCEPTION 'METER_UNAVAILABLE'; END IF;
 SELECT * INTO c FROM app.meter_lifecycle_computation
 WHERE (tenant_id,scope_id,source_id)=(t,s.scope_id,s.id)
 AND recipe_version='london-midnight-stops.v1' AND status='counted';
 SELECT * INTO d FROM app.meter_lifecycle_day_ledger
 WHERE (tenant_id,scope_id,computation_id,date)=(t,s.scope_id,c.id,today) AND status='counted';
 IF d.computation_id IS NULL THEN RAISE EXCEPTION 'METER_UNAVAILABLE'; END IF;
 IF s.source_hash IS DISTINCT FROM encode(sha256(convert_to(s.source::text,'UTF8')),'hex')
 OR c.source_hash IS DISTINCT FROM s.source_hash OR d.source_hash IS DISTINCT FROM s.source_hash
 THEN RAISE EXCEPTION 'METER_PROJECTION_MISMATCH'; END IF;
 RETURN jsonb_build_object('version','meter-today-read.v1','hypothetical',true,
  'date',today::text,'plan',s.source->>'plan','countedPlaces',d.result->'countedPlaces',
  'freeSmallPlaces',d.result->'freeSmallPlaces');
END $$;
ALTER FUNCTION app.mon1_counted_meter_today(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_counted_meter_today(uuid,text) FROM PUBLIC,jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.mon1_counted_meter_today(uuid,text) TO jobguard_runtime;
COMMIT;
