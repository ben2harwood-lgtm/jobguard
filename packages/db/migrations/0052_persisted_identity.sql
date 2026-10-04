BEGIN;
-- Identity is a restricted control-plane exception, never a business/worker credential.
DO $$ BEGIN
 IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='jobguard_identity') THEN
  CREATE ROLE jobguard_identity NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
 END IF;
END $$;
CREATE TABLE identity.user_email (
 email varchar(320) PRIMARY KEY CHECK(email=lower(email) AND email LIKE '%.invalid'),
 user_id uuid NOT NULL UNIQUE REFERENCES identity.identity_user(id)
);
ALTER TABLE app.membership ADD CONSTRAINT membership_identity_binding_uq UNIQUE(tenant_id,id,identity_user_id);
CREATE TABLE identity.membership_locator (
 user_id uuid NOT NULL REFERENCES identity.identity_user(id),
 tenant_id uuid NOT NULL, membership_id uuid NOT NULL,
 PRIMARY KEY(user_id,tenant_id),
 FOREIGN KEY(tenant_id,membership_id,user_id) REFERENCES app.membership(tenant_id,id,identity_user_id)
);
CREATE TABLE identity.invitation (
 environment varchar(30) NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 id uuid PRIMARY KEY, email varchar(320) NOT NULL CHECK(email=lower(email) AND email LIKE '%.invalid'),
 tenant_id uuid NOT NULL, account_id uuid NOT NULL,
 role varchar(40) NOT NULL CHECK(role IN ('admin','estimator','foreman','operative','finance','read_only')),
 expires_at timestamptz NOT NULL, accepted_at timestamptz,
 issuer_user_id uuid NOT NULL REFERENCES identity.identity_user(id),
 FOREIGN KEY(tenant_id,account_id) REFERENCES app.account(tenant_id,id)
);
CREATE TABLE identity.challenge (
 environment varchar(30) NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 id uuid PRIMARY KEY, email varchar(320) NOT NULL CHECK(email=lower(email) AND email LIKE '%.invalid'),
 purpose varchar(16) NOT NULL CHECK(purpose IN ('signup','signin','invitation')),
 -- Unverified invitation selectors may be unknown; verification joins the immutable grant.
 invitation_id uuid,
 digest char(64) NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
 requested_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 consumed_at timestamptz, verified boolean NOT NULL DEFAULT false,
 delivery_state varchar(24) NOT NULL DEFAULT 'pending' CHECK(delivery_state IN ('pending','fixture_delivered','outcome_unknown')),
 CHECK(expires_at>requested_at)
);
CREATE INDEX challenge_lookup ON identity.challenge(email,purpose,requested_at DESC);
CREATE TABLE identity.request_window (
 ip_digest char(64) NOT NULL CHECK(ip_digest ~ '^[0-9a-f]{64}$'), requested_at timestamptz NOT NULL
);
CREATE INDEX request_window_lookup ON identity.request_window(ip_digest,requested_at);
CREATE TABLE identity.session (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES identity.identity_user(id),
 environment varchar(30) NOT NULL CHECK(environment='synthetic_demo'),
 token_digest char(64) NOT NULL UNIQUE CHECK(token_digest ~ '^[0-9a-f]{64}$'),
 csrf_token varchar(64) NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE identity.security_event (
 id uuid PRIMARY KEY, event_type varchar(40) NOT NULL CHECK(event_type IN ('challenge.requested','session.issued','identity.verified','invitation.created')),
 subject_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- New routines remain constrained by FORCE RLS and a transaction-local tenant.
CREATE POLICY identity_provision_account ON app.account TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY identity_provision_membership ON app.membership TO jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);

-- No supplied tenant/role: signup always creates one new tenant; invitation uses its immutable grant.
CREATE FUNCTION identity.provision_verified_challenge(challenge_id uuid) RETURNS uuid
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
    AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
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

CREATE FUNCTION identity.guard_invitation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,identity AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.accepted_at IS NOT NULL OR NEW.accepted_at IS NULL OR
  ROW(NEW.environment,NEW.id,NEW.email,NEW.tenant_id,NEW.account_id,NEW.role,NEW.expires_at,NEW.issuer_user_id)
  IS DISTINCT FROM ROW(OLD.environment,OLD.id,OLD.email,OLD.tenant_id,OLD.account_id,OLD.role,OLD.expires_at,OLD.issuer_user_id)
 THEN RAISE EXCEPTION 'invitation grant is immutable' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invitation_immutable BEFORE UPDATE OR DELETE ON identity.invitation
 FOR EACH ROW EXECUTE FUNCTION identity.guard_invitation();
ALTER FUNCTION identity.guard_invitation() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION identity.guard_invitation() FROM PUBLIC;

CREATE FUNCTION identity.current_memberships(u uuid)
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
   AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp());
 END LOOP;
END $$;

CREATE FUNCTION identity.invite_member(session_digest char(64), t uuid, recipient varchar, assigned_role varchar)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,identity AS $$
DECLARE s identity.session; a uuid; invitation_id uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO s FROM identity.session WHERE token_digest=session_digest AND environment='synthetic_demo' AND revoked_at IS NULL AND expires_at>clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='42501'; END IF;
 PERFORM set_config('app.tenant_id',t::text,true);
 SELECT account_id INTO a FROM app.membership WHERE tenant_id=t AND identity_user_id=s.user_id
  AND role='owner' AND revoked_at IS NULL AND(expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id)
 VALUES(invitation_id,recipient,t,a,assigned_role,clock_timestamp()+interval '1 day',s.user_id);
 INSERT INTO identity.security_event VALUES(gen_random_uuid(),'invitation.created',invitation_id,clock_timestamp());
 RETURN invitation_id;
END $$;

DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['user_email','membership_locator','invitation','challenge','request_window','session','security_event'] LOOP
  EXECUTE format('ALTER TABLE identity.%I OWNER TO jobguard_migration',n);
  EXECUTE format('REVOKE ALL ON identity.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
 END LOOP;
END $$;
ALTER FUNCTION identity.provision_verified_challenge(uuid) OWNER TO jobguard_migration;
ALTER FUNCTION identity.current_memberships(uuid) OWNER TO jobguard_migration;
ALTER FUNCTION identity.invite_member(char,uuid,varchar,varchar) OWNER TO jobguard_migration;

REVOKE ALL ON FUNCTION identity.provision_verified_challenge(uuid),identity.current_memberships(uuid),identity.invite_member(char,uuid,varchar,varchar) FROM PUBLIC;
GRANT USAGE ON SCHEMA identity TO jobguard_identity;
GRANT SELECT ON identity.user_email,identity.invitation TO jobguard_identity;
GRANT SELECT,INSERT ON identity.challenge,identity.session TO jobguard_identity;
GRANT UPDATE(attempts,consumed_at,verified,delivery_state) ON identity.challenge TO jobguard_identity;
GRANT UPDATE(revoked_at) ON identity.session TO jobguard_identity;
GRANT SELECT,INSERT ON identity.request_window TO jobguard_identity;
GRANT INSERT ON identity.security_event TO jobguard_identity;
GRANT EXECUTE ON FUNCTION identity.provision_verified_challenge(uuid),identity.current_memberships(uuid),identity.invite_member(char,uuid,varchar,varchar) TO jobguard_identity;
REVOKE ALL ON SCHEMA app,control_plane FROM jobguard_identity;
COMMIT;
