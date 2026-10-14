BEGIN;
-- MIGFIX-1 partial: contractor revocation is an inactive-membership fact on every identity path.
-- CREATE OR REPLACE retains the existing signatures, owners, EXECUTE ACLs and definer settings.
-- No grants or business rows change. Membership history is never reactivated or normalized.
-- HELD [MIGFIX-1-1]: runtime UPDATE revocation needs coordinator-owned replacement of existing
-- runtime FOR SHARE membership locks; PostgreSQL requires UPDATE for those locks. Do not add
-- a direct write grant or weaken those checks to make the privilege removal possible here.

CREATE OR REPLACE FUNCTION identity.provision_verified_challenge(challenge_id uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE c identity.challenge; i identity.invitation; l identity.membership_locator; u uuid; t uuid; a uuid; m uuid;
BEGIN
 SELECT * INTO c FROM identity.challenge WHERE id=challenge_id FOR UPDATE;
 IF NOT FOUND OR NOT c.verified OR c.consumed_at IS NULL OR c.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'invalid challenge' USING ERRCODE='22023';
 END IF;
 -- Consume the authorization latch on every outcome, including unknown signin/invitation.
 UPDATE identity.challenge SET verified=false WHERE id=c.id;
 SELECT user_id INTO u FROM identity.user_email WHERE email=c.email;
 IF c.purpose='signin' AND u IS NULL THEN RETURN NULL; END IF;
 IF c.purpose='invitation' THEN
  -- Match the contractor command lock before checking membership reuse.
  SELECT tenant_id INTO t FROM identity.invitation WHERE id=c.invitation_id AND email=c.email;
  IF t IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54)); END IF;
  SELECT * INTO i FROM identity.invitation WHERE id=c.invitation_id AND email=c.email
   AND accepted_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
 END IF;
 IF u IS NULL THEN
  u:=gen_random_uuid();
  INSERT INTO identity.identity_user(id) VALUES(u);
  INSERT INTO identity.user_email(email,user_id) VALUES(c.email,u);
  IF c.purpose='signup' THEN
   t:=gen_random_uuid(); a:=gen_random_uuid(); m:=gen_random_uuid();
   INSERT INTO control_plane.tenant(id) VALUES(t);
   PERFORM set_config('app.tenant_id',t::text,true);
   INSERT INTO app.account(id,tenant_id,name) VALUES(a,t,'New business');
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,t,a,u,'owner');
   INSERT INTO identity.membership_locator VALUES(u,t,m);
  END IF;
 END IF;
 IF c.purpose='invitation' THEN
  PERFORM set_config('app.tenant_id',i.tenant_id::text,true); m:=gen_random_uuid();
  -- The locator outlives revocation and expiry, so it is not itself a reason to refuse. Lock it, then lock the linked
  -- membership: only a currently ACTIVE membership blocks a fresh invitation (the invitation then stays unused).
  SELECT * INTO l FROM identity.membership_locator WHERE user_id=u AND tenant_id=i.tenant_id FOR UPDATE;
  IF FOUND THEN
   PERFORM 1 FROM app.membership WHERE tenant_id=l.tenant_id AND id=l.membership_id AND identity_user_id=u
    AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
     WHERE r.tenant_id=l.tenant_id AND r.membership_id=l.membership_id) FOR SHARE;
   IF FOUND THEN RETURN NULL; END IF;
   -- Inactive: add the invitation-bound replacement and repoint the locator atomically. The revoked or expired
   -- membership row is kept untouched as history (audit rows keep referring to it).
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,i.tenant_id,i.account_id,u,i.role);
   UPDATE identity.membership_locator SET membership_id=m WHERE user_id=u AND tenant_id=i.tenant_id;
  ELSE
   INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES(m,i.tenant_id,i.account_id,u,i.role);
   INSERT INTO identity.membership_locator VALUES(u,i.tenant_id,m);
  END IF;
  UPDATE identity.invitation SET accepted_at=clock_timestamp() WHERE id=i.id;
 END IF;
 INSERT INTO identity.security_event VALUES(gen_random_uuid(),'identity.verified',c.id,clock_timestamp());
 RETURN u;
END $$;

CREATE OR REPLACE FUNCTION identity.current_memberships(u uuid)
 RETURNS TABLE(id uuid, identity_user_id uuid, tenant_id uuid, role varchar, email varchar, name varchar)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE link identity.membership_locator;
BEGIN
 FOR link IN SELECT * FROM identity.membership_locator WHERE user_id=u LOOP
  PERFORM set_config('app.tenant_id',link.tenant_id::text,true);
  RETURN QUERY SELECT m.id,m.identity_user_id,m.tenant_id,m.role,e.email,a.name
   FROM app.membership m JOIN app.account a ON(a.tenant_id,a.id)=(m.tenant_id,m.account_id)
   JOIN identity.user_email e ON e.user_id=m.identity_user_id
   WHERE m.tenant_id=link.tenant_id AND m.id=link.membership_id AND m.identity_user_id=u
   AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
    WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION identity.invite_member(session_digest char(64), t uuid, recipient varchar, assigned_role varchar)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE s identity.session; a uuid; invitation_id uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO s FROM identity.session WHERE token_digest=session_digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
 -- Contractor revocation owns this same tenant key (seed 54). Take it before the authority read.
 PERFORM pg_advisory_xact_lock(hashtextextended(t::text,54));
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT m.account_id INTO a FROM app.membership m WHERE m.tenant_id=t AND m.identity_user_id=s.user_id
  AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
  AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r
   WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id) FOR SHARE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id)
 VALUES(invitation_id,recipient,t,a,assigned_role,clock_timestamp()+interval '1 day',s.user_id);
 INSERT INTO identity.security_event VALUES(gen_random_uuid(),'invitation.created',invitation_id,clock_timestamp());
 RETURN invitation_id;
END $$;
COMMIT;
