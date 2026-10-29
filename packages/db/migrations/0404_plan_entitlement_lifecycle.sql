BEGIN;
-- Read-only bridge to MON-2A. No trial/payment state is a feature/read gate.
CREATE FUNCTION app.mon8_subscription_context(t uuid, digest text, j uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE agreement app.subscription_agreement_revision; track text;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'ENTITLEMENT_UNAVAILABLE';
 END IF;
 PERFORM app.mon1_company_actor(t,digest);
 -- Match the existing track and subscription writers, in that order. Retain
 -- both locks until the server consumes the facts in the repository callback.
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,184));
 PERFORM app.mon1_company_actor(t,digest);
 IF j IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=j AND practice_session_digest IS NULL) THEN
   RAISE EXCEPTION 'ENTITLEMENT_FORBIDDEN';
  END IF;
  SELECT job_track INTO track FROM app.job_commercial_track WHERE tenant_id=t AND job_id=j AND environment='synthetic_demo';
  IF track IS NULL THEN RAISE EXCEPTION 'ENTITLEMENT_UNAVAILABLE'; END IF;
 ELSE
  SELECT commercial_track INTO track FROM app.commercial_track_assignment WHERE tenant_id=t AND environment='synthetic_demo' ORDER BY revision DESC LIMIT 1;
  -- Existing MON-2A companies predate explicit track assignments.
  track:=coalesce(track,'small_builder');
 END IF;
 IF track='contractor' THEN
  -- Positive contractor capabilities still require their separate agreement authority.
  RETURN jsonb_build_object('version','plan-entitlement-facts.v1','track',track,'agreementAuthority','held');
 END IF;
 SELECT * INTO agreement FROM app.subscription_agreement_revision WHERE tenant_id=t AND environment='synthetic_demo'
  AND effective_date<=(clock_timestamp() AT TIME ZONE 'Europe/London')::date ORDER BY effective_date DESC,revision DESC LIMIT 1;
 IF agreement.id IS NULL THEN RAISE EXCEPTION 'ENTITLEMENT_UNAVAILABLE'; END IF;
 RETURN jsonb_build_object('version','plan-entitlement-facts.v1','track',track,'plan',agreement.plan,'catalogueVersion',agreement.catalogue_version);
END $$;
ALTER FUNCTION app.mon8_subscription_context(uuid,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon8_subscription_context(uuid,text,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.mon8_subscription_context(uuid,text,uuid) TO jobguard_runtime;
COMMIT;
