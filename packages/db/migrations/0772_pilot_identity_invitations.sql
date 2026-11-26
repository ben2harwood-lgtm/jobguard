BEGIN;

-- The existing invitation entry points accept only the session mode of their
-- database. Keep the scoped SSO and owner checks, function owners and grants.
CREATE OR REPLACE FUNCTION identity.lp11_invitation_sso_state(d char(64),t uuid)
 RETURNS TABLE(required boolean,connection_id uuid)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE u uuid;
 identity_mode constant text := CASE
  WHEN current_database() ~ '^jobguard_pilot(_[a-z0-9]+)*$'
   AND current_database() !~ '^jobguard_pilot_(queue|restore)(_|$)' THEN 'pilot_no_charge'
  ELSE 'synthetic_demo' END;
BEGIN
 SELECT s.user_id INTO u FROM identity.session s
 WHERE s.token_digest=d AND s.environment=identity_mode
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp();
 IF u IS NULL OR NOT EXISTS(SELECT 1 FROM identity.current_memberships(u) m WHERE m.tenant_id=t) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 PERFORM app.lp11_set_identity_scope(t,NULL);
 RETURN QUERY SELECT e.required,e.connection_id FROM identity.sso_required_state(t) e;
 DELETE FROM control_plane.lp11_identity_scope WHERE transaction_id=pg_current_xact_id_if_assigned();
END $$;

CREATE OR REPLACE FUNCTION identity.invite_member(session_digest char(64), t uuid, recipient varchar, assigned_role varchar)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE s identity.session; a uuid; actor uuid; invitation_id uuid:=gen_random_uuid();
 identity_mode constant text := CASE
  WHEN current_database() ~ '^jobguard_pilot(_[a-z0-9]+)*$'
   AND current_database() !~ '^jobguard_pilot_(queue|restore)(_|$)' THEN 'pilot_no_charge'
  ELSE 'synthetic_demo' END;
BEGIN
 -- LP6D_BOUND: bind before any membership or tenant lock.
 PERFORM app.bind_request('real',session_digest::text,t);
 SELECT * INTO s FROM identity.session WHERE token_digest=session_digest AND environment=identity_mode AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
 -- Contractor revocation owns this same tenant key (seed 54). Take it before the authority read.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 SELECT * INTO s FROM identity.session WHERE token_digest=session_digest AND environment=identity_mode AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT m.account_id,m.id INTO a,actor FROM app.membership m WHERE m.tenant_id=t AND m.identity_user_id=s.user_id AND m.id=app.current_actor()
  AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
   WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id) FOR SHARE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF assigned_role='operative' THEN PERFORM app.mon8_require_feature(actor,'operative_roles'); END IF;
 INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id)
 VALUES(invitation_id,recipient,t,a,assigned_role,clock_timestamp()+interval '1 day',s.user_id);
 INSERT INTO identity.security_event VALUES(gen_random_uuid(),'invitation.created',invitation_id,clock_timestamp());
 RETURN invitation_id;
END $$;

COMMIT;
