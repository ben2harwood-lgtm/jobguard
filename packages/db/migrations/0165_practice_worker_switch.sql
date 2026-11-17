BEGIN;
DO $$ BEGIN
 IF to_regprocedure('app.contractor_practice_session_live(uuid)') IS NULL OR NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid='control_plane.contractor_practice_session'::regclass AND a.attname='session_digest' AND NOT a.attisdropped)
 THEN RAISE EXCEPTION 'PRACTICE_WORKER_SWITCH_NEEDS_SESSION_HARDENING'; END IF;
END $$;

CREATE TABLE control_plane.practice_company_marker (
 tenant_id uuid PRIMARY KEY REFERENCES control_plane.tenant(id),
 session_ref uuid NOT NULL UNIQUE REFERENCES control_plane.contractor_practice_session(session_id),
 owner_membership_id uuid NOT NULL, owner_identity_user_id uuid NOT NULL UNIQUE,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'), marked_at timestamptz NOT NULL,
 FOREIGN KEY(tenant_id,owner_membership_id,owner_identity_user_id) REFERENCES app.membership(tenant_id,id,identity_user_id),
 UNIQUE(tenant_id,session_ref,owner_membership_id)
);
ALTER TABLE control_plane.practice_company_marker OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.practice_company_marker FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TABLE control_plane.practice_worker_switch (
 id uuid PRIMARY KEY, session_ref uuid NOT NULL REFERENCES control_plane.contractor_practice_session(session_id),
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), owner_membership_id uuid NOT NULL,
 worker_membership_id uuid NOT NULL, worker_identity_user_id uuid NOT NULL,
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'), command_id uuid NOT NULL UNIQUE,
 started_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 ended_at timestamptz, end_reason text, end_command_id uuid UNIQUE, end_event_id uuid UNIQUE,
 FOREIGN KEY(tenant_id,session_ref,owner_membership_id) REFERENCES control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id),
 FOREIGN KEY(tenant_id,worker_membership_id,worker_identity_user_id) REFERENCES app.membership(tenant_id,id,identity_user_id),
 FOREIGN KEY(tenant_id,worker_membership_id) REFERENCES app.contractor_member(tenant_id,membership_id),
 CHECK(owner_membership_id<>worker_membership_id), CHECK(expires_at=started_at+interval '30 minutes'),
 CHECK((ended_at IS NULL AND end_reason IS NULL AND end_command_id IS NULL AND end_event_id IS NULL)
  OR (ended_at IS NOT NULL AND end_reason IS NOT NULL AND end_reason IN('switched_back','expired') AND end_command_id IS NOT NULL AND end_event_id IS NOT NULL)),
 CHECK(ended_at IS NULL OR (ended_at>=started_at AND ended_at<=expires_at)),
 CHECK(end_reason IS DISTINCT FROM 'expired' OR ended_at=expires_at),
 CHECK(end_reason IS DISTINCT FROM 'switched_back' OR ended_at<expires_at)
);
ALTER TABLE control_plane.practice_worker_switch OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.practice_worker_switch FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE UNIQUE INDEX practice_worker_switch_one_open ON control_plane.practice_worker_switch(session_ref) WHERE ended_at IS NULL;
CREATE INDEX practice_worker_switch_user ON control_plane.practice_worker_switch(worker_identity_user_id);
CREATE INDEX practice_worker_switch_open_member ON control_plane.practice_worker_switch(tenant_id,worker_membership_id) WHERE ended_at IS NULL;

CREATE FUNCTION app.practice_company_made_up(p_session_ref uuid)
 RETURNS TABLE(verdict text,reason_code text,company uuid,owner_member uuid,owner_user uuid)
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE t uuid; own record;
BEGIN
 verdict:='forbidden'; reason_code:='mode';
 IF current_database()<>'jobguard_synthetic_demo' THEN RETURN NEXT; RETURN; END IF;
 reason_code:='session';
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RETURN NEXT; RETURN; END;
 IF t IS NULL OR p_session_ref IS NULL THEN RETURN NEXT; RETURN; END IF;
 SELECT s.tenant_id,s.membership_id,s.identity_user_id INTO own FROM control_plane.contractor_practice_session s WHERE s.session_id=p_session_ref;
 IF NOT FOUND OR own.tenant_id IS DISTINCT FROM t THEN RETURN NEXT; RETURN; END IF;
 reason_code:='owner';
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=own.membership_id AND m.identity_user_id=own.identity_user_id AND m.role='owner'
  AND app.contractor_member_active(m.id) AND app.contractor_allowed(m.id,'organisation.manage',t)) THEN RETURN NEXT; RETURN; END IF;
 reason_code:='company_has_sign_in';
 IF EXISTS(SELECT 1 FROM identity.membership_locator l WHERE l.tenant_id=t)
 OR EXISTS(SELECT 1 FROM identity.invitation i WHERE i.tenant_id=t)
 OR EXISTS(SELECT 1 FROM identity.sso_connection s WHERE s.tenant_id=t)
 OR EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND (
  EXISTS(SELECT 1 FROM identity.user_email e WHERE e.user_id=m.identity_user_id)
  OR EXISTS(SELECT 1 FROM identity.session s WHERE s.user_id=m.identity_user_id))) THEN RETURN NEXT; RETURN; END IF;
 verdict:='made_up'; reason_code:='made_up'; company:=t; owner_member:=own.membership_id; owner_user:=own.identity_user_id; RETURN NEXT;
END $$;

CREATE FUNCTION app.practice_worker_switch_decision(p_session_ref uuid,p_worker uuid)
 RETURNS TABLE(decision text,reason_code text,company uuid,owner_member uuid,owner_user uuid,worker_user uuid)
 LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE rule record; member_user uuid;
BEGIN
 BEGIN SELECT * INTO STRICT rule FROM app.practice_company_made_up(p_session_ref);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN
  decision:='forbidden'; reason_code:='unexpected'; RETURN NEXT; RETURN;
 END;
 decision:='forbidden'; reason_code:=rule.reason_code;
 IF rule.verdict IS DISTINCT FROM 'made_up' THEN RETURN NEXT; RETURN; END IF;
 company:=rule.company; owner_member:=rule.owner_member; owner_user:=rule.owner_user;
 decision:='not_found'; reason_code:='worker';
 SELECT m.identity_user_id INTO member_user FROM app.membership m
 WHERE m.tenant_id=rule.company AND m.id=p_worker AND m.id<>rule.owner_member
 AND m.role IN('operative','supervisor','surveyor','client_approver') AND app.contractor_member_active(m.id)
 AND NOT EXISTS(SELECT 1 FROM app.role_grant g WHERE g.tenant_id=rule.company AND g.membership_id=m.id
  AND g.role NOT IN('operative','supervisor','surveyor','client_approver')
  AND NOT EXISTS(SELECT 1 FROM app.role_grant_revocation r WHERE r.tenant_id=rule.company AND r.grant_id=g.id))
 AND NOT EXISTS(SELECT 1 FROM identity.user_email e WHERE e.user_id=m.identity_user_id)
 AND NOT EXISTS(SELECT 1 FROM identity.membership_locator l WHERE l.user_id=m.identity_user_id)
 AND NOT EXISTS(SELECT 1 FROM identity.session s WHERE s.user_id=m.identity_user_id);
 IF NOT FOUND THEN RETURN NEXT; RETURN; END IF;
 decision:='allowed'; reason_code:='allowed'; worker_user:=member_user; RETURN NEXT;
END $$;

CREATE FUNCTION app.practice_worker_switch_on(p_session uuid,p_command uuid,p_worker uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; live record; rule record; saved control_plane.practice_worker_switch; marker control_plane.practice_company_marker; reading timestamptz; replay boolean:=false;
BEGIN

 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_session IS NULL OR p_command IS NULL OR p_worker IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END;
 SELECT * INTO live FROM app.contractor_practice_session_live(p_session);
 IF NOT FOUND OR t IS NULL OR t IS DISTINCT FROM live.tenant_id THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(live.session_ref::text,16501));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command::text,16502));

 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.command_id=p_command OR s.end_command_id=p_command;
 IF FOUND THEN
  IF saved.command_id=p_command AND saved.session_ref=live.session_ref AND saved.worker_membership_id=p_worker THEN
   replay:=true; SELECT * INTO marker FROM control_plane.practice_company_marker k WHERE k.tenant_id=t;
   RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'startedAt',to_char(saved.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expiresAt',to_char(saved.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'marker',(CASE WHEN saved.started_at=marker.marked_at THEN 'acquired' ELSE 'present' END),'state','acting','replayed',replay);
  END IF;
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
 END IF;
 BEGIN SELECT * INTO STRICT rule FROM app.practice_worker_switch_decision(live.session_ref,p_worker);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END;
 IF rule.decision IS NULL OR rule.decision NOT IN('allowed','not_found') THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO marker FROM control_plane.practice_company_marker k WHERE k.tenant_id=t;
 IF FOUND AND (marker.session_ref IS DISTINCT FROM live.session_ref OR marker.owner_membership_id IS DISTINCT FROM live.membership_id OR marker.owner_identity_user_id IS DISTINCT FROM live.identity_user_id)
 THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM control_plane.practice_worker_switch s WHERE s.session_ref=live.session_ref AND s.ended_at IS NULL)
 THEN RAISE EXCEPTION 'SWITCH_OPEN' USING ERRCODE='55000'; END IF;
 IF rule.decision='not_found' THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 reading:=clock_timestamp();
 IF marker.tenant_id IS NULL THEN
  INSERT INTO control_plane.practice_company_marker(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,marked_at)
   VALUES(rule.company,live.session_ref,rule.owner_member,rule.owner_user,reading) RETURNING * INTO marker;
 END IF;
 INSERT INTO control_plane.practice_worker_switch(id,session_ref,tenant_id,owner_membership_id,worker_membership_id,worker_identity_user_id,command_id,started_at,expires_at)
 VALUES(gen_random_uuid(),live.session_ref,rule.company,rule.owner_member,p_worker,rule.worker_user,p_command,reading,reading+interval '30 minutes') RETURNING * INTO saved;
 RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'startedAt',to_char(saved.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expiresAt',to_char(saved.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'marker',(CASE WHEN saved.started_at=marker.marked_at THEN 'acquired' ELSE 'present' END),'state','acting','replayed',replay);
END $$;

CREATE FUNCTION app.practice_worker_switch_off(p_session uuid,p_command uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; live record; saved control_plane.practice_worker_switch; reading timestamptz; replay boolean:=false;
BEGIN

 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_session IS NULL OR p_command IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END;
 SELECT * INTO live FROM app.contractor_practice_session_live(p_session);
 IF NOT FOUND OR t IS NULL OR t IS DISTINCT FROM live.tenant_id THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 PERFORM pg_advisory_xact_lock_shared(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(live.session_ref::text,16501));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_command::text,16502));

 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.command_id=p_command OR s.end_command_id=p_command;
 IF FOUND THEN
  IF saved.end_command_id=p_command AND saved.session_ref=live.session_ref THEN replay:=true; RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'endedAt',to_char(saved.ended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'endReason',saved.end_reason,'endEvent',saved.end_event_id,'state','owner','replayed',replay); END IF;
  RAISE EXCEPTION 'COMMAND_CONFLICT' USING ERRCODE='23505';
 END IF;
 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.session_ref=live.session_ref AND s.ended_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NOT_ACTING' USING ERRCODE='55000'; END IF;
 reading:=clock_timestamp();
 UPDATE control_plane.practice_worker_switch s SET ended_at=least(reading,s.expires_at),
  end_reason=(CASE WHEN reading<s.expires_at THEN 'switched_back' ELSE 'expired' END),end_command_id=p_command,end_event_id=gen_random_uuid()
 WHERE s.id=saved.id RETURNING * INTO saved;
 RETURN jsonb_build_object('switch',saved.id,'session',saved.session_ref,'owner',saved.owner_membership_id,'worker',saved.worker_membership_id,
 'endedAt',to_char(saved.ended_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'endReason',saved.end_reason,'endEvent',saved.end_event_id,'state','owner','replayed',replay);
END $$;

CREATE FUNCTION app.practice_worker_switch_state(p_session uuid) RETURNS jsonb
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; live record; saved control_plane.practice_worker_switch; answer text:='owner';
BEGIN

 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;

 BEGIN t:=nullif(current_setting('app.tenant_id',true),'')::uuid;
 EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END;
 SELECT * INTO live FROM app.contractor_practice_session_live(p_session);
 IF NOT FOUND OR t IS NULL OR t IS DISTINCT FROM live.tenant_id THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;

 SELECT * INTO saved FROM control_plane.practice_worker_switch s WHERE s.session_ref=live.session_ref AND s.ended_at IS NULL;
 IF FOUND THEN
  answer:='unclosed';
  IF EXISTS(SELECT 1 FROM app.contractor_session(p_session) l WHERE l.tenant_id=t AND l.membership_id=saved.worker_membership_id) THEN answer:='acting'; END IF;
 END IF;
 RETURN jsonb_build_object('state',answer,'switch',saved.id,'worker',saved.worker_membership_id,
 'startedAt',to_char(saved.started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'expiresAt',to_char(saved.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
END $$;

CREATE FUNCTION app.practice_company_marker_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE rule record;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'PRACTICE_MARKER_IMMUTABLE' USING ERRCODE='55000'; END IF;
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 BEGIN SELECT * INTO STRICT rule FROM app.practice_company_made_up(NEW.session_ref);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'PRACTICE_MARKER_FORBIDDEN' USING ERRCODE='42501'; END;
 IF rule.verdict IS DISTINCT FROM 'made_up' OR rule.company IS DISTINCT FROM NEW.tenant_id OR rule.owner_member IS DISTINCT FROM NEW.owner_membership_id
 OR rule.owner_user IS DISTINCT FROM NEW.owner_identity_user_id OR NEW.marked_at IS NULL OR NEW.marked_at<transaction_timestamp() OR NEW.marked_at>clock_timestamp()
 THEN RAISE EXCEPTION 'PRACTICE_MARKER_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_company_marker_guard BEFORE INSERT OR UPDATE OR DELETE ON control_plane.practice_company_marker FOR EACH ROW EXECUTE FUNCTION app.practice_company_marker_guard();
CREATE TRIGGER practice_company_marker_no_truncate BEFORE TRUNCATE ON control_plane.practice_company_marker FOR EACH STATEMENT EXECUTE FUNCTION app.practice_company_marker_guard();

CREATE FUNCTION app.practice_worker_switch_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE rule record;
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'SWITCH_RECORD_IMMUTABLE' USING ERRCODE='55000'; END IF;
 IF TG_OP='INSERT' THEN
  IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  BEGIN SELECT * INTO STRICT rule FROM app.practice_worker_switch_decision(NEW.session_ref,NEW.worker_membership_id);
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END;
  IF rule.decision IS DISTINCT FROM 'allowed' OR rule.company IS DISTINCT FROM NEW.tenant_id OR rule.owner_member IS DISTINCT FROM NEW.owner_membership_id
   OR rule.worker_user IS DISTINCT FROM NEW.worker_identity_user_id OR NEW.ended_at IS NOT NULL OR NEW.end_reason IS NOT NULL OR NEW.end_command_id IS NOT NULL OR NEW.end_event_id IS NOT NULL
   OR NEW.started_at IS NULL OR NEW.started_at<transaction_timestamp() OR NEW.started_at>clock_timestamp()
  THEN RAISE EXCEPTION 'SWITCH_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSIF TG_OP='UPDATE' THEN
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL
   OR (to_jsonb(NEW)-ARRAY['ended_at','end_reason','end_command_id','end_event_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['ended_at','end_reason','end_command_id','end_event_id'])
   OR (CASE WHEN NEW.end_reason='switched_back' THEN NEW.ended_at<transaction_timestamp() OR NEW.ended_at>clock_timestamp()
    WHEN NEW.end_reason='expired' THEN NEW.ended_at IS DISTINCT FROM OLD.expires_at OR clock_timestamp()<OLD.expires_at ELSE true END)
  THEN RAISE EXCEPTION 'SWITCH_RECORD_IMMUTABLE' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER practice_worker_switch_guard BEFORE INSERT OR UPDATE OR DELETE ON control_plane.practice_worker_switch FOR EACH ROW EXECUTE FUNCTION app.practice_worker_switch_guard();
CREATE TRIGGER practice_worker_switch_no_truncate BEFORE TRUNCATE ON control_plane.practice_worker_switch FOR EACH STATEMENT EXECUTE FUNCTION app.practice_worker_switch_guard();

CREATE FUNCTION app.practice_worker_switch_require_audit() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM app.audit_event a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.id AND a.event_type='practice.worker_switch.started'
   AND a.subject_type='practice-worker-switch' AND a.subject_ref=NEW.id::text AND a.actor_ref='membership:'||NEW.owner_membership_id::text
   AND (a.payload->'references'->>'worker')=NEW.worker_membership_id::text)
  THEN RAISE EXCEPTION 'SWITCH_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 ELSIF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM app.audit_event a WHERE a.tenant_id=NEW.tenant_id AND a.id=NEW.end_event_id AND a.event_type='practice.worker_switch.ended'
   AND a.subject_type='practice-worker-switch' AND a.subject_ref=NEW.id::text AND a.actor_ref='membership:'||NEW.owner_membership_id::text
   AND (a.payload->'references'->>'reason')=NEW.end_reason)
  THEN RAISE EXCEPTION 'SWITCH_AUDIT_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER practice_worker_switch_require_audit AFTER INSERT OR UPDATE ON control_plane.practice_worker_switch DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app.practice_worker_switch_require_audit();

CREATE FUNCTION app.practice_company_refuse_sign_in() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_SCHEMA<>'identity' THEN RAISE EXCEPTION 'PRACTICE_SIGN_IN_TRIGGER_INVALID'; END IF;
 IF TG_TABLE_NAME IN('membership_locator','invitation','sso_connection') THEN
  IF EXISTS(SELECT 1 FROM control_plane.practice_company_marker k WHERE k.tenant_id=NEW.tenant_id)
  THEN RAISE EXCEPTION 'PRACTICE_COMPANY_SIGN_IN_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='user_email' THEN
  IF EXISTS(SELECT 1 FROM control_plane.practice_company_marker k WHERE k.owner_identity_user_id=NEW.user_id)
   OR EXISTS(SELECT 1 FROM control_plane.practice_worker_switch s WHERE s.worker_identity_user_id=NEW.user_id)
  THEN RAISE EXCEPTION 'PRACTICE_COMPANY_SIGN_IN_FORBIDDEN' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'PRACTICE_SIGN_IN_TRIGGER_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT OR UPDATE ON identity.membership_locator FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT ON identity.invitation FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT ON identity.sso_connection FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();
CREATE TRIGGER made_up_company_no_sign_in BEFORE INSERT OR UPDATE ON identity.user_email FOR EACH ROW EXECUTE FUNCTION app.practice_company_refuse_sign_in();

CREATE FUNCTION app.practice_worker_refuse_wider_grant() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.role NOT IN('operative','supervisor','surveyor','client_approver') AND EXISTS(
  SELECT 1 FROM control_plane.practice_worker_switch s WHERE s.tenant_id=NEW.tenant_id AND s.worker_membership_id=NEW.membership_id AND s.ended_at IS NULL AND s.expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'PRACTICE_WORKER_GRANT_FORBIDDEN' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER made_up_worker_no_wider_grant BEFORE INSERT ON app.role_grant FOR EACH ROW EXECUTE FUNCTION app.practice_worker_refuse_wider_grant();

CREATE OR REPLACE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT l.tenant_id, coalesce(a.worker_membership_id,l.membership_id), coalesce(a.worker_identity_user_id,l.identity_user_id) FROM app.contractor_practice_session_live(s) l LEFT JOIN (control_plane.practice_worker_switch a JOIN control_plane.practice_company_marker k ON k.tenant_id=a.tenant_id AND k.session_ref=a.session_ref AND k.owner_membership_id=a.owner_membership_id AND k.environment='synthetic_demo') ON a.session_ref=l.session_ref AND a.tenant_id=l.tenant_id AND a.owner_membership_id=l.membership_id AND k.owner_identity_user_id=l.identity_user_id AND a.environment='synthetic_demo' AND a.ended_at IS NULL AND a.started_at<=clock_timestamp() AND a.expires_at>clock_timestamp() AND current_database()='jobguard_synthetic_demo' AND current_setting('transaction_isolation')='read committed' AND NOT EXISTS(SELECT 1 FROM identity.membership_locator ml WHERE ml.tenant_id=l.tenant_id) AND NOT EXISTS(SELECT 1 FROM identity.invitation iv WHERE iv.tenant_id=l.tenant_id) AND NOT EXISTS(SELECT 1 FROM identity.user_email ue WHERE ue.user_id IN(l.identity_user_id,a.worker_identity_user_id)) AND NOT EXISTS(SELECT 1 FROM identity.session rs WHERE rs.user_id IN(l.identity_user_id,a.worker_identity_user_id)) $$;
ALTER FUNCTION app.practice_company_made_up(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_company_made_up(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_decision(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_decision(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_off(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_off(uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_state(uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_state(uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_company_marker_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_company_marker_guard() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_guard() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_guard() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_switch_require_audit() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_switch_require_audit() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_company_refuse_sign_in() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_company_refuse_sign_in() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER FUNCTION app.practice_worker_refuse_wider_grant() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.practice_worker_refuse_wider_grant() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_off(uuid,uuid) TO jobguard_runtime;
GRANT EXECUTE ON FUNCTION app.practice_worker_switch_state(uuid) TO jobguard_runtime;
COMMIT;
