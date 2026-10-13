-- PROBE ONLY, never push. Structural stand-in for PRACTICE-WORKER-SWITCH.
BEGIN;
CREATE TABLE control_plane.practice_company_marker (
 tenant_id uuid PRIMARY KEY REFERENCES control_plane.tenant(id),
 session_ref uuid NOT NULL UNIQUE REFERENCES control_plane.contractor_practice_session(session_id),
 owner_membership_id uuid NOT NULL,
 owner_identity_user_id uuid NOT NULL UNIQUE,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 marked_at timestamptz NOT NULL,
 FOREIGN KEY(tenant_id,owner_membership_id,owner_identity_user_id) REFERENCES app.membership(tenant_id,id,identity_user_id),
 UNIQUE(tenant_id,session_ref,owner_membership_id)
);
ALTER TABLE control_plane.practice_company_marker OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.practice_company_marker FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

CREATE TABLE control_plane.practice_worker_switch (
 id uuid PRIMARY KEY,
 session_ref uuid NOT NULL REFERENCES control_plane.contractor_practice_session(session_id),
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
 owner_membership_id uuid NOT NULL,
 worker_membership_id uuid NOT NULL,
 worker_identity_user_id uuid NOT NULL,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 command_id uuid NOT NULL UNIQUE,
 started_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 ended_at timestamptz, end_reason text, end_command_id uuid UNIQUE, end_event_id uuid UNIQUE,
 FOREIGN KEY(tenant_id,session_ref,owner_membership_id) REFERENCES control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id),
 FOREIGN KEY(tenant_id,worker_membership_id,worker_identity_user_id) REFERENCES app.membership(tenant_id,id,identity_user_id),
 FOREIGN KEY(tenant_id,worker_membership_id) REFERENCES app.contractor_member(tenant_id,membership_id),
 CHECK(owner_membership_id<>worker_membership_id),
 CHECK(expires_at=started_at+interval '30 minutes'),
 CHECK((ended_at IS NULL AND end_reason IS NULL AND end_command_id IS NULL AND end_event_id IS NULL) OR (ended_at IS NOT NULL AND end_reason IN('switched_back','expired') AND end_command_id IS NOT NULL AND end_event_id IS NOT NULL))
);
CREATE UNIQUE INDEX practice_worker_switch_one_open ON control_plane.practice_worker_switch(session_ref) WHERE ended_at IS NULL;
CREATE INDEX practice_worker_switch_worker_user ON control_plane.practice_worker_switch(worker_identity_user_id);
CREATE INDEX practice_worker_switch_open_worker ON control_plane.practice_worker_switch(tenant_id,worker_membership_id) WHERE ended_at IS NULL;
ALTER TABLE control_plane.practice_worker_switch OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.practice_worker_switch FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;

-- sign-in refusal trigger function (SECURITY DEFINER, executable by owner only)
CREATE FUNCTION app.practice_company_refuse_sign_in() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='user_email' THEN
  IF EXISTS(SELECT 1 FROM control_plane.practice_company_marker k WHERE k.owner_identity_user_id=NEW.user_id)
   OR EXISTS(SELECT 1 FROM control_plane.practice_worker_switch w WHERE w.worker_identity_user_id=NEW.user_id)
  THEN RAISE EXCEPTION 'PRACTICE_COMPANY_SIGN_IN_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME IN ('membership_locator','invitation','sso_connection') THEN
  IF EXISTS(SELECT 1 FROM control_plane.practice_company_marker k WHERE k.tenant_id=NEW.tenant_id)
  THEN RAISE EXCEPTION 'PRACTICE_COMPANY_SIGN_IN_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'PROBE_BAD_TABLE'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.practice_company_refuse_sign_in() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_company_refuse_sign_in() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT OR UPDATE ON identity.membership_locator FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT ON identity.invitation FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT ON identity.sso_connection FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT OR UPDATE ON identity.user_email FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();

CREATE FUNCTION app.practice_worker_refuse_wider_grant() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.role NOT IN ('operative','supervisor') AND EXISTS(SELECT 1 FROM control_plane.practice_worker_switch w WHERE w.tenant_id=NEW.tenant_id AND w.worker_membership_id=NEW.membership_id AND w.ended_at IS NULL AND w.expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'PRACTICE_WORKER_GRANT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.practice_worker_refuse_wider_grant() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_refuse_wider_grant() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER made_up_worker_no_wider_grant BEFORE INSERT ON app.role_grant FOR EACH ROW EXECUTE FUNCTION app.practice_worker_refuse_wider_grant();

-- four more app functions, PUBLIC revoked; three granted to the runtime role
CREATE FUNCTION app.practice_company_made_up(p_session_ref uuid) RETURNS TABLE(verdict text) LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$ BEGIN RETURN QUERY SELECT 'forbidden'::text; END $$;
CREATE FUNCTION app.practice_worker_switch_on(p_session uuid,p_command uuid,p_worker uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'PROBE' USING ERRCODE='42501'; END $$;
CREATE FUNCTION app.practice_worker_switch_off(p_session uuid,p_command uuid) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'PROBE' USING ERRCODE='42501'; END $$;
CREATE FUNCTION app.practice_worker_switch_state(p_session uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN RETURN '{}'::jsonb; END $$;
ALTER FUNCTION app.practice_company_made_up(uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.practice_worker_switch_off(uuid,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.practice_worker_switch_state(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_company_made_up(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
REVOKE ALL ON FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
REVOKE ALL ON FUNCTION app.practice_worker_switch_off(uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
REVOKE ALL ON FUNCTION app.practice_worker_switch_state(uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_off(uuid,uuid) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_state(uuid) TO jobguard_runtime;

CREATE OR REPLACE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT l.tenant_id, coalesce(a.worker_membership_id,l.membership_id), coalesce(a.worker_identity_user_id,l.identity_user_id) FROM app.contractor_practice_session_live(s) l LEFT JOIN (control_plane.practice_worker_switch a JOIN control_plane.practice_company_marker k ON k.tenant_id=a.tenant_id AND k.session_ref=a.session_ref AND k.owner_membership_id=a.owner_membership_id AND k.environment='synthetic_demo') ON a.session_ref=l.session_ref AND a.tenant_id=l.tenant_id AND a.owner_membership_id=l.membership_id AND k.owner_identity_user_id=l.identity_user_id AND a.environment='synthetic_demo' AND a.ended_at IS NULL AND a.started_at<=clock_timestamp() AND a.expires_at>clock_timestamp() AND current_database()='jobguard_synthetic_demo' AND current_setting('transaction_isolation')='read committed' AND NOT EXISTS(SELECT 1 FROM identity.membership_locator ml WHERE ml.tenant_id=l.tenant_id) AND NOT EXISTS(SELECT 1 FROM identity.invitation iv WHERE iv.tenant_id=l.tenant_id) AND NOT EXISTS(SELECT 1 FROM identity.user_email ue WHERE ue.user_id IN(l.identity_user_id,a.worker_identity_user_id)) AND NOT EXISTS(SELECT 1 FROM identity.session rs WHERE rs.user_id IN(l.identity_user_id,a.worker_identity_user_id)) $$;
COMMIT;
