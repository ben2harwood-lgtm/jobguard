BEGIN;
-- ENT-11a/11b hosted synthetic startup. Complete 0749 successor body; original guards retained.
CREATE OR REPLACE FUNCTION app.northside_register(p_owner uuid,p_settings jsonb) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 -- LP6D_BOUND: run before original DECLARE initializers and business locks.
 PERFORM app.current_actor();
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
  OR p_owner IS DISTINCT FROM app.current_actor() THEN
  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';
 END IF;
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid; own control_plane.contractor_practice_session; rule record; added integer; assignment app.commercial_track_assignment; agreement_status text; status_id uuid; agreement_id uuid; new_agreement boolean:=false;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'MODE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO own FROM control_plane.contractor_practice_session WHERE tenant_id=t AND membership_id=p_owner;
 IF NOT FOUND OR own.revoked_at IS NOT NULL OR own.expires_at<=clock_timestamp()
  OR app.contractor_practice_home_deadline(own.session_digest,clock_timestamp())<=clock_timestamp()
 THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 PERFORM pg_advisory_xact_lock(hashtextextended(own.session_id::text,16501));
 -- Re-read lifetime after the tenant/switch fences; a retry cannot renew or revive this instance.
 SELECT * INTO own FROM control_plane.contractor_practice_session WHERE tenant_id=t AND membership_id=p_owner;
 IF own.revoked_at IS NOT NULL OR own.expires_at<=clock_timestamp()
  OR app.contractor_practice_home_deadline(own.session_digest,clock_timestamp())<=clock_timestamp()
 THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT rule FROM app.practice_company_made_up(own.session_id);
 IF rule.verdict IS DISTINCT FROM 'made_up' OR EXISTS(SELECT 1 FROM control_plane.practice_worker_switch WHERE session_ref=own.session_id AND ended_at IS NULL)
 THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- The generated practice owner is the only bootstrap authority. Ordinary contractor starts stay unchanged.
 IF NOT EXISTS(SELECT 1 FROM app.membership m WHERE m.tenant_id=t AND m.id=p_owner
  AND m.identity_user_id=own.identity_user_id AND m.role='owner' AND app.contractor_member_active(m.id))
 THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT * INTO assignment FROM app.commercial_track_assignment WHERE tenant_id=t ORDER BY revision DESC LIMIT 1;
 IF assignment.revision IS DISTINCT FROM 1 OR assignment.commercial_track IS DISTINCT FROM 'contractor'
  OR assignment.environment IS DISTINCT FROM 'synthetic_demo' OR assignment.actor_ref IS DISTINCT FROM 'operations:synthetic-generator'
  OR assignment.agreement_reference IS DISTINCT FROM 'synthetic-agreement:'||t::text
 THEN RAISE EXCEPTION 'NORTHSIDE_ACTOR_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT status INTO agreement_status FROM app.contractor_agreement_status_revision
 WHERE tenant_id=t AND assignment_id=assignment.id ORDER BY revision DESC LIMIT 1;
 -- Missing fictional setup may be completed; any recorded loss of authority remains final for this startup.
 IF agreement_status IS NOT NULL AND agreement_status<>'active'
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_settings->>'version' IS DISTINCT FROM 'northside-settings.v1' OR p_settings->>'classification' IS DISTINCT FROM 'demo_settings'
 THEN RAISE EXCEPTION 'NORTHSIDE_SETTINGS_INVALID' USING ERRCODE='22023'; END IF;
 INSERT INTO app.northside_run(tenant_id,session_ref,owner_membership_id,owner_identity_user_id,settings_version,settings_hash,settings)
 VALUES(t,own.session_id,own.membership_id,own.identity_user_id,p_settings->>'version',encode(sha256(convert_to(p_settings::text,'UTF8')),'hex'),p_settings)
 ON CONFLICT(tenant_id) DO NOTHING;
 GET DIAGNOSTICS added=ROW_COUNT;
 IF NOT EXISTS(SELECT 1 FROM app.northside_run WHERE tenant_id=t AND settings=p_settings AND session_ref=own.session_id)
 THEN RAISE EXCEPTION 'NORTHSIDE_SETTINGS_CONFLICT' USING ERRCODE='23514'; END IF;
 -- Provision only after every original run/settings check. The tenant fence precedes switch/business locks.
 IF agreement_status IS NULL THEN
  status_id:=gen_random_uuid();
  INSERT INTO app.contractor_agreement_status_revision(tenant_id,id,assignment_id,revision,status,schema_version,environment,fictional_source)
  VALUES(t,status_id,assignment.id,1,'active','contractor-agreement-status.v1','synthetic_demo','fictional-fixture:'||own.session_id::text);
 END IF;
 SELECT id INTO agreement_id FROM app.enterprise_agreement_version WHERE tenant_id=t
  AND agreement_ref='northside-fictional:'||own.session_id::text AND operations_actor_ref='operations:synthetic-northside';
 IF agreement_id IS NULL THEN
  IF EXISTS(SELECT 1 FROM app.enterprise_agreement_version WHERE tenant_id=t)
  THEN RAISE EXCEPTION 'NORTHSIDE_SETTINGS_CONFLICT' USING ERRCODE='23514'; END IF;
  agreement_id:=gen_random_uuid(); new_agreement:=true;
  INSERT INTO app.enterprise_agreement_version(tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
  VALUES(t,agreement_id,'northside-fictional:'||own.session_id::text,1,10,'on_payment','enterprise_site_capture_policy_v1',
   '2000-01-01T00:00:00Z',false,app.final_lock_hash(jsonb_build_object('version','northside-fictional-terms.v1',
    'session',own.session_id,'assignment',assignment.id,'rateNumerator',1,'rateDenominator',10,'basis','on_payment',
    'policyVersion','enterprise_site_capture_policy_v1','effectiveFrom','2000-01-01T00:00:00Z','endOfJobCheck',false)),
   'synthetic_demo','operations:synthetic-northside');
 END IF;
 IF status_id IS NOT NULL OR new_agreement THEN
  -- Last contending lock: provisioning, its audit and the run commit together. No authorization or mandate is created.
  PERFORM app.append_audit(jsonb_build_array(jsonb_build_object('id',agreement_id,'version','audit.v1',
   'actorRef','membership:'||p_owner::text,'eventType','northside.fictional_agreements.provisioned',
   'subjectType','northside-run','subjectRef',t::text,'payload',jsonb_build_object(
    'references',jsonb_build_object('assignment',assignment.id::text,'agreement',agreement_id::text,'environment','synthetic_demo'),
    'classifications',jsonb_build_object('action','security')))));
 END IF;
 RETURN added=1;
END;
END
$$;

-- The browser supplies a month and command identity, never agreement authority.
CREATE OR REPLACE FUNCTION app.ef_derive_northside(p_session uuid,p_command uuid,p_period text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid; a uuid; ag uuid; own control_plane.contractor_practice_session;
BEGIN
 IF current_database()<>'jobguard_synthetic_demo' THEN RAISE EXCEPTION 'FEE_GATE_CLOSED' USING ERRCODE='42501'; END IF;
 IF app.current_actor() IS NULL OR lower(nullif(current_setting('app.tenant_id',true),'')) IS DISTINCT FROM app.current_tenant()::text
 THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;
 a:=app.ef_actor(p_session); t:=app.current_tenant();
 IF a IS DISTINCT FROM app.current_actor() THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT s.* INTO own FROM control_plane.contractor_practice_session s JOIN app.northside_run r
  ON(r.tenant_id,r.session_ref)=(s.tenant_id,s.session_id)
 WHERE s.tenant_id=t AND s.session_digest=app.contractor_practice_session_digest(p_session)
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
  AND app.contractor_practice_home_deadline(s.session_digest,clock_timestamp())>clock_timestamp();
 IF own.session_id IS NULL THEN RAISE EXCEPTION 'EXTRA_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT id INTO ag FROM app.enterprise_agreement_version WHERE tenant_id=t AND environment='synthetic_demo'
  AND agreement_ref='northside-fictional:'||own.session_id::text AND operations_actor_ref='operations:synthetic-northside';
 IF ag IS NULL THEN RAISE EXCEPTION 'FEE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Existing entrypoint owns durable replay, request binding, finance authority, derivation and audit.
 RETURN app.ef_derive(p_session,p_command,ag,p_period);
END $$;
ALTER FUNCTION app.ef_derive_northside(uuid,uuid,text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ef_derive_northside(uuid,uuid,text) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ef_derive_northside(uuid,uuid,text) TO jobguard_runtime;

COMMIT;
