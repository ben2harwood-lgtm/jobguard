BEGIN;
-- M4-17-S / C262. Availability only: upstream fee source contracts and run
-- authority remain held. No run table/writer/command/review is created.
CREATE FUNCTION app.read_money_trail_availability(p_job uuid,p_session text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- Reuse the accepted current-session/owner/owned synthetic small-builder v3
 -- read boundary. This permits dependency metadata only, never a run action.
 PERFORM app.read_success_fee_v3(p_job,p_session);
 RETURN jsonb_build_object('version','money-trail-availability.v1','jobId',p_job,
  'environment','synthetic_demo','state','dependency_bound',
  'dependency','accepted_money_trail_source_and_run_authority',
  'productionEnabled',false,'realExternalActions',0);
END $$;
ALTER FUNCTION app.read_money_trail_availability(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.read_money_trail_availability(uuid,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.read_money_trail_availability(uuid,text) TO jobguard_runtime;
COMMIT;
