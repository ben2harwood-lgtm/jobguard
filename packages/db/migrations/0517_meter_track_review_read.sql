BEGIN;
-- The admission routine already raises this Decision on crossing Builder's grace place,
-- but nothing could read it. Reads only: no plan, track, charge or Decision changes.
CREATE FUNCTION app.mon1_track_review_decision(t uuid,digest text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE found uuid;
BEGIN
 PERFORM app.mon1_company_actor(t,digest);
 SELECT d.id INTO found FROM app.decision d WHERE d.tenant_id=t AND d.subject_type='subscription'
  AND d.subject_ref=t::text AND d.action_type='subscription.track_review'
  ORDER BY d.created_at,d.id LIMIT 1;
 RETURN found;
END $$;
ALTER FUNCTION app.mon1_track_review_decision(uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon1_track_review_decision(uuid,text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon1_track_review_decision(uuid,text) TO jobguard_runtime;
COMMIT;
