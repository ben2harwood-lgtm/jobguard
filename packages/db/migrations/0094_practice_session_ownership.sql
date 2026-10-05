BEGIN;
-- Identity/control-plane exception: opaque token digests only, no business data.
-- Runtime has no table access; issuance and authentication have narrow routines.
CREATE TABLE control_plane.practice_session (
 token_digest char(64) PRIMARY KEY CHECK(token_digest ~ '^[0-9a-f]{64}$'),
 environment text NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '7 days',
 revoked_at timestamptz
);
ALTER TABLE control_plane.practice_session OWNER TO jobguard_migration;
REVOKE ALL ON control_plane.practice_session FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
ALTER TABLE app.job ADD COLUMN practice_session_digest char(64) REFERENCES control_plane.practice_session(token_digest);
ALTER TABLE app.job ADD COLUMN practice_scenario text CHECK(practice_scenario IN ('capture','core-1000','home'));
ALTER TABLE app.job ADD CONSTRAINT practice_binding_complete CHECK((practice_session_digest IS NULL)=(practice_scenario IS NULL));
ALTER TABLE app.job ADD CONSTRAINT practice_binding_synthetic_tenant CHECK(practice_session_digest IS NULL OR tenant_id='11111111-1111-4111-8111-111111111111'::uuid);
-- Deliberately no legacy backfill: first-touch claims are not creator evidence.
CREATE FUNCTION app.guard_practice_owner() RETURNS trigger LANGUAGE plpgsql
 SET search_path=pg_catalog AS $$ BEGIN
 IF NEW.practice_session_digest IS DISTINCT FROM OLD.practice_session_digest OR NEW.practice_scenario IS DISTINCT FROM OLD.practice_scenario THEN
  RAISE EXCEPTION 'PRACTICE_OWNER_IMMUTABLE' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION app.guard_practice_owner() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.guard_practice_owner() FROM PUBLIC;
CREATE TRIGGER practice_owner_immutable BEFORE UPDATE ON app.job FOR EACH ROW EXECUTE FUNCTION app.guard_practice_owner();
-- Owner role remains subject to FORCE RLS, under the fixed synthetic tenant.
CREATE POLICY practice_membership_lookup ON app.membership FOR SELECT TO jobguard_migration
 USING(tenant_id IN ('11111111-1111-4111-8111-111111111111'::uuid,'33333333-3333-4333-8333-333333333333'::uuid));
CREATE FUNCTION app.authenticate_practice_session(digest text, requested_tenant uuid DEFAULT '11111111-1111-4111-8111-111111111111'::uuid)
 RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid)
 LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT m.tenant_id,m.id,m.identity_user_id FROM control_plane.practice_session s
 JOIN app.membership m ON m.tenant_id=requested_tenant
  AND ((m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid AND m.id='d1500000-0000-4000-8000-000000000003'::uuid) OR (m.tenant_id='33333333-3333-4333-8333-333333333333'::uuid AND m.id='33333333-3333-4333-8333-333333333335'::uuid))
  AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
 WHERE s.token_digest=digest AND s.environment='synthetic_demo'
  AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
  AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
$$;
ALTER FUNCTION app.authenticate_practice_session(text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.authenticate_practice_session(text,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.authenticate_practice_session(text,uuid) TO jobguard_runtime;
CREATE FUNCTION app.issue_practice_session(digest text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog AS $$ BEGIN
 IF digest !~ '^[0-9a-f]{64}$' OR NOT EXISTS(
  SELECT 1 FROM app.membership m WHERE m.tenant_id='11111111-1111-4111-8111-111111111111'::uuid
   AND m.id='d1500000-0000-4000-8000-000000000003'::uuid AND m.identity_user_id='d1500000-0000-4000-8000-000000000001'::uuid
   AND m.role='owner' AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp())
 ) THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='42501'; END IF;
 INSERT INTO control_plane.practice_session(token_digest) VALUES(digest);
 PERFORM set_config('app.tenant_id','11111111-1111-4111-8111-111111111111',true);
 -- New generated home scenarios, never a claim on the shared/legacy fixtures.
 INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES
 (gen_random_uuid(),'11111111-1111-4111-8111-111111111111','Practice kitchen','quoting',digest,'home'),
 (gen_random_uuid(),'11111111-1111-4111-8111-111111111111','Kitchen extension','live',digest,'home'),
 (gen_random_uuid(),'11111111-1111-4111-8111-111111111111','Loft conversion','quoting',digest,'home');
END $$;
ALTER FUNCTION app.issue_practice_session(text) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.issue_practice_session(text) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.issue_practice_session(text) TO jobguard_runtime;
COMMIT;
