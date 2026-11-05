-- M4-7 practice read only; no new table, role, token access or financial authority.
BEGIN;
CREATE FUNCTION app.ais_movement_read(t uuid,digest text,c uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; selected uuid; state jsonb; movements jsonb;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'AIS_DARK_ONLY' USING ERRCODE='42501'; END IF;
 actor:=app.mon1_company_actor(t,digest);
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,427));
 actor:=app.mon1_company_actor(t,digest);
 SELECT id INTO selected FROM app.ais_connection
  WHERE tenant_id=t AND owner_membership_id=actor AND (c IS NULL OR id=c)
  ORDER BY created_at DESC,id DESC LIMIT 1;
 IF selected IS NULL THEN
  IF c IS NOT NULL THEN RAISE EXCEPTION 'AIS_NOT_FOUND' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('version','ais-practice-view.v1','connection',NULL,'movements','[]'::jsonb);
 END IF;
 state:=app.dark_ais(t,digest,selected,'inspect','{}'::jsonb);
 -- Latest revision per stable movement, including earlier pulls after reconnecting
 -- the same fictional account. Never include another membership's observations.
 SELECT coalesce(jsonb_agg(jsonb_build_object('movementRef',movement_ref,'status',status,
  'pence',pence,'currency',currency,'bookedOn',booked_on) ORDER BY movement_ref),'[]'::jsonb)
 INTO movements FROM (
  SELECT DISTINCT ON(o.movement_ref) o.movement_ref,o.status,o.pence,o.currency,o.booked_on
  FROM app.ais_observation o JOIN app.ais_connection a ON a.tenant_id=o.tenant_id AND a.id=o.connection_id
  WHERE o.tenant_id=t AND a.owner_membership_id=actor AND o.account_ref=state->>'accountRef'
  ORDER BY o.movement_ref,o.revision DESC
 ) latest;
 RETURN jsonb_build_object('version','ais-practice-view.v1',
  'connection',jsonb_build_object('connectionId',selected,'status',state->>'status'),'movements',movements);
END $$;
ALTER FUNCTION app.ais_movement_read(uuid,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ais_movement_read(uuid,text,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ais_movement_read(uuid,text,uuid) TO jobguard_runtime;
COMMIT;
