BEGIN;
-- MON-8 RED: job terms outlive company moves and the end of its one free trial.
-- Replace only the latest 0548 adapter; company answers and command guards stay unchanged.
CREATE OR REPLACE FUNCTION app.mon8_company_feature(digest text,feature text,job uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; actor uuid; result jsonb;
 fixed_track text; contractor_feature boolean; entitled boolean;
BEGIN
 actor:=app.mon1_company_actor(t,digest);
 result:=app.mon8_feature_decision(actor,feature);
 IF app.mon1_company_actor(t,digest) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF job IS NULL THEN RETURN result; END IF;
 SELECT tr.job_track INTO fixed_track FROM app.job j
 JOIN app.job_commercial_track tr ON(tr.tenant_id,tr.job_id)=(j.tenant_id,j.id)
 WHERE j.tenant_id=t AND j.id=job AND j.practice_session_digest IS NULL AND tr.environment='synthetic_demo';
 IF fixed_track IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 contractor_feature:=feature IN('operative_roles','site_origin_capture','approval_chains','work_orders','sso');
 IF (contractor_feature AND fixed_track='small_builder') OR (NOT contractor_feature AND fixed_track='contractor') THEN
  RETURN result || jsonb_build_object('entitlement','excluded','executable',false,'reason','track_forbidden');
 END IF;
 -- A contractor job can only narrow the company decision, never supply agreement authority.
 IF contractor_feature THEN RETURN result; END IF;
 -- The decision above holds organisation (54) and subscription/lifecycle (184) locks.
 -- Read effective terms after those waits; a pending change is not an agreement.
 entitled:=EXISTS(SELECT 1 FROM app.subscription_agreement_revision a WHERE a.tenant_id=t
  AND a.effective_date<=(clock_timestamp() AT TIME ZONE 'Europe/London')::date AND a.plan IN('Solo','Builder'))
  OR EXISTS(SELECT 1 FROM app.trial_start s WHERE s.tenant_id=t AND s.job_id=job);
 IF entitled THEN
  RETURN result || jsonb_build_object('entitlement','included','executable',feature NOT IN('pay_now','accounting_export'),
   'reason',CASE WHEN feature IN('pay_now','accounting_export') THEN 'feature_disabled' ELSE 'available' END);
 END IF;
 RETURN result || jsonb_build_object('entitlement','held','executable',false,'reason','agreement_authority_held');
END $$;
-- CREATE OR REPLACE preserves 0548's owner and ACL; no new entry point or grants.
COMMIT;
