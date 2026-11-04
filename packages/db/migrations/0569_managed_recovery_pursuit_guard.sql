BEGIN;
-- MON-9 guard repair only: synthetic preparation, no service offering or live authority.
CREATE OR REPLACE FUNCTION app.mon9_pursuit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 -- Eligibility is a property of the case, track and policy, never the database name.
 -- Legacy owner fixtures without tenant context keep their existing behavior;
 -- mon9_elect also checks immutable source history before allowing an election.
 IF NEW.tenant_id IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.recovery_case r
  JOIN app.job j ON(j.tenant_id,j.id)=(r.tenant_id,r.job_id)
  JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(r.tenant_id,r.job_id)
  WHERE (r.tenant_id,r.job_id,r.id)=(NEW.tenant_id,NEW.job_id,NEW.case_id)
   AND r.synthetic AND r.environment='synthetic_demo' AND r.case_type='withheld_customer_payment'
   AND j.fee_policy_version='reference_fee_policy_v3'
   AND track.job_track='small_builder' AND track.environment='synthetic_demo') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 INSERT INTO app.managed_recovery_pursuit(tenant_id,job_id,case_id)
 VALUES(NEW.tenant_id,NEW.job_id,NEW.case_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
ALTER FUNCTION app.mon9_pursuit_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon9_pursuit_guard() FROM PUBLIC,jobguard_runtime;
-- Recover starts missed by the old database-name guard. Source history is unchanged.
DO $$ DECLARE t uuid; BEGIN
 FOR t IN SELECT id FROM control_plane.tenant LOOP
  PERFORM set_config('app.tenant_id',t::text,true);
  INSERT INTO app.managed_recovery_pursuit(tenant_id,job_id,case_id,started_at)
   SELECT t,x.job_id,x.case_id,min(x.started_at) FROM (
    SELECT job_id,case_id,created_at started_at FROM app.recovery_case_event WHERE tenant_id=t AND event_type NOT IN('opened','claim_amended','assemble_evidence')
    UNION ALL SELECT job_id,case_id,created_at FROM app.recovery_message WHERE tenant_id=t
    UNION ALL SELECT job_id,case_id,created_at FROM app.recovery_message_approval WHERE tenant_id=t
    UNION ALL SELECT job_id,case_id,created_at FROM app.recovery_message_sink WHERE tenant_id=t
    UNION ALL SELECT job_id,id,created_at FROM app.recovery_case WHERE tenant_id=t AND state NOT IN('identified','evidence_assembled')
   ) x JOIN app.recovery_case r ON(r.tenant_id,r.job_id,r.id)=(t,x.job_id,x.case_id)
    JOIN app.job j ON(j.tenant_id,j.id)=(r.tenant_id,r.job_id)
    JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(r.tenant_id,r.job_id)
   WHERE r.synthetic AND r.environment='synthetic_demo'
    AND r.case_type='withheld_customer_payment' AND j.fee_policy_version='reference_fee_policy_v3'
    AND track.job_track='small_builder' AND track.environment='synthetic_demo'
   GROUP BY x.job_id,x.case_id ON CONFLICT DO NOTHING;
 END LOOP;
 PERFORM set_config('app.tenant_id','',true);
END $$;
COMMIT;
