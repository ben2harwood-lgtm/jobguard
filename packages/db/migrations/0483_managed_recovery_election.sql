BEGIN;
-- MON-9: synthetic election only. Never issues an invoice, fee or external work.
CREATE TABLE app.managed_recovery_election (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL,
 command_id uuid NOT NULL, actor_membership_id uuid NOT NULL, authorization_id uuid NOT NULL,
 service text NOT NULL, points integer NOT NULL,
 terms_version text NOT NULL CHECK(terms_version='managed-recovery.synthetic-terms.v1'),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 elected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,case_id), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,authorization_id),
 CHECK((service='drafted_for_you' AND points=5) OR (service='solicitor_letter' AND points=10)),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id),
 FOREIGN KEY(tenant_id,actor_membership_id) REFERENCES app.membership(tenant_id,id),
 FOREIGN KEY(tenant_id,authorization_id) REFERENCES app.action_authorization(tenant_id,id)
);
CREATE TABLE app.managed_recovery_pursuit (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,case_id),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['managed_recovery_election','managed_recovery_pursuit'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration,jobguard_runtime USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime',n);
  EXECUTE format('GRANT SELECT ON app.%I TO jobguard_runtime',n);
  EXECUTE format('CREATE TRIGGER managed_recovery_immutable BEFORE UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation()',n);
 END LOOP;
END $$;
-- Same advisory key as the existing case and message commands. Pin a durable
-- start even when delivery is later cancelled, fails or has an unknown outcome.
CREATE FUNCTION app.mon9_pursuit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(NEW.tenant_id::text),hashtext(NEW.case_id::text));
 INSERT INTO app.managed_recovery_pursuit(tenant_id,job_id,case_id)
 VALUES(NEW.tenant_id,NEW.job_id,NEW.case_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
ALTER FUNCTION app.mon9_pursuit_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon9_pursuit_guard() FROM PUBLIC,jobguard_runtime;
CREATE TRIGGER mon9_pursuit_start BEFORE INSERT ON app.recovery_case_event FOR EACH ROW
 WHEN(NEW.event_type NOT IN('opened','claim_amended','assemble_evidence')) EXECUTE FUNCTION app.mon9_pursuit_guard();
CREATE TRIGGER mon9_pursuit_start BEFORE INSERT ON app.recovery_message FOR EACH ROW EXECUTE FUNCTION app.mon9_pursuit_guard();
CREATE TRIGGER mon9_pursuit_start BEFORE INSERT ON app.recovery_message_approval FOR EACH ROW EXECUTE FUNCTION app.mon9_pursuit_guard();
CREATE TRIGGER mon9_pursuit_start BEFORE INSERT ON app.recovery_message_sink FOR EACH ROW EXECUTE FUNCTION app.mon9_pursuit_guard();
-- Preserve pre-migration starts without changing a single historical source row.
-- Migration connections have tenant-local forced RLS, so backfill each tenant.
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
   ) x GROUP BY x.job_id,x.case_id ON CONFLICT DO NOTHING;
 END LOOP;
 PERFORM set_config('app.tenant_id','',true);
END $$;
CREATE FUNCTION app.mon9_elect(j uuid,c uuid,actor uuid,command uuid,auth_id uuid,service text,points integer,terms text)
RETURNS app.managed_recovery_election LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; prior app.managed_recovery_election; h text;
BEGIN
 IF t IS NULL THEN RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext(t::text),hashtext(c::text));
 IF terms IS DISTINCT FROM 'managed-recovery.synthetic-terms.v1' OR
  ((service='drafted_for_you' AND points=5) OR (service='solicitor_letter' AND points=10)) IS NOT TRUE
 THEN RAISE EXCEPTION 'INVALID_MANAGED_RECOVERY' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.recovery_case r JOIN app.job job ON(job.tenant_id,job.id)=(r.tenant_id,r.job_id)
  JOIN app.job_commercial_track track ON(track.tenant_id,track.job_id)=(r.tenant_id,r.job_id)
  WHERE r.tenant_id=t AND r.job_id=j AND r.id=c AND r.synthetic AND r.environment='synthetic_demo'
   AND r.case_type='withheld_customer_payment' AND job.fee_policy_version='reference_fee_policy_v3'
   AND track.job_track='small_builder' AND track.environment='synthetic_demo')
 THEN RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 h:=encode(sha256(convert_to('managed-recovery-election-command.v1'||chr(10)||j::text||chr(10)||c::text||chr(10)||service||chr(10)||points::text||chr(10)||terms,'UTF8')),'hex');
 IF NOT EXISTS(SELECT 1 FROM app.command_receipt cr
  JOIN app.membership m ON(m.tenant_id,m.id)=(cr.tenant_id,cr.actor_membership_id)
  JOIN app.action_authorization a ON(a.tenant_id,a.actor_membership_id)=(cr.tenant_id,m.id)
  JOIN app.decision_resolution r ON(r.tenant_id,r.id)=(a.tenant_id,a.resolution_id)
  JOIN app.decision d ON(d.tenant_id,d.id)=(a.tenant_id,a.decision_id)
  WHERE cr.tenant_id=t AND cr.command_id=command AND cr.actor_membership_id=actor AND cr.status='processing'
   AND cr.command_type='managed_recovery.elect' AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND a.id=auth_id AND a.action_type='managed_recovery.elect' AND a.content_hash=h AND a.aggregate_revision=1
   AND a.policy_version=terms AND a.recipient IS NULL AND a.amount_pence IS NULL AND a.currency IS NULL
   AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND r.resolution='approved'
   AND r.decision_id=d.id AND r.actor_membership_id=actor AND d.action_type='managed_recovery.elect'
   AND d.subject_type='recovery_case' AND d.subject_ref=c::text)
 THEN RAISE EXCEPTION 'MANAGED_RECOVERY_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM app.managed_recovery_election e WHERE e.tenant_id=t AND e.case_id=c;
 IF prior.case_id IS NOT NULL THEN RAISE EXCEPTION 'MANAGED_RECOVERY_CONFLICT' USING ERRCODE='40001'; END IF;
 IF EXISTS(SELECT 1 FROM app.managed_recovery_pursuit p WHERE p.tenant_id=t AND p.case_id=c)
  OR EXISTS(SELECT 1 FROM app.recovery_case r WHERE r.tenant_id=t AND r.job_id=j AND r.id=c AND r.state<>'identified')
  OR EXISTS(SELECT 1 FROM app.recovery_case_current r WHERE r.tenant_id=t AND r.job_id=j AND r.id=c AND r.state NOT IN('identified','evidence_assembled'))
 THEN RAISE EXCEPTION 'PURSUIT_ALREADY_STARTED' USING ERRCODE='23514'; END IF;
 INSERT INTO app.managed_recovery_election(tenant_id,job_id,case_id,command_id,actor_membership_id,authorization_id,service,points,terms_version)
 VALUES(t,j,c,command,actor,auth_id,service,points,terms) RETURNING * INTO prior;
 RETURN prior;
END $$;
ALTER FUNCTION app.mon9_elect(uuid,uuid,uuid,uuid,uuid,text,integer,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon9_elect(uuid,uuid,uuid,uuid,uuid,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mon9_elect(uuid,uuid,uuid,uuid,uuid,text,integer,text) TO jobguard_runtime;
-- Resolve the identity from the opaque session credential, never the supplied actor.
-- The membership bridge preserves the existing SSO restrictions; restore tenant
-- context after that bridge's membership walk before returning to business SQL.
CREATE FUNCTION app.mon9_session(digest text,actor uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; s identity.session; u uuid;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR t IS NULL OR digest !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 PERFORM 1 FROM identity.session se WHERE se.token_digest=digest FOR SHARE;
 SELECT * INTO s FROM identity.session se WHERE se.token_digest=digest
  AND se.environment='synthetic_demo' AND se.revoked_at IS NULL AND se.expires_at>clock_timestamp();
 IF s.id IS NULL THEN RETURN NULL; END IF;
 SELECT m.identity_user_id INTO u FROM identity.sso_session_memberships(s.user_id,s.id) m
  WHERE m.tenant_id=t AND m.id=actor AND m.role='owner';
 PERFORM set_config('app.tenant_id',t::text,true);
 RETURN u;
END $$;
ALTER FUNCTION app.mon9_session(text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.mon9_session(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mon9_session(text,uuid) TO jobguard_runtime;
COMMIT;
