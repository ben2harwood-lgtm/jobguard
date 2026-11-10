BEGIN;
-- Shared practice firms never read or save a company profile.
CREATE FUNCTION app.current_firm_profile_key() RETURNS text
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE b jsonb;
BEGIN
 b:=app.bound_context_reader();
 IF b IS NULL THEN RETURN NULL; END IF;
 IF (b->>'tenant_id')::uuid IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF b->>'tenant_id'='11111111-1111-4111-8111-111111111111' THEN RETURN NULL; END IF;
 RETURN b->>'tenant_id';
END $$;
ALTER FUNCTION app.current_firm_profile_key() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.current_firm_profile_key() FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.current_firm_profile_key() TO jobguard_runtime;

CREATE FUNCTION app.firm_profile_access(t uuid,k text,w boolean) RETURNS boolean
 LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE company text; b jsonb;
BEGIN
 b:=app.bound_context_reader();
 company:=app.current_firm_profile_key();
 IF company IS NULL OR t IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid
  OR k IS DISTINCT FROM company THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM app.membership m
  WHERE m.tenant_id=t AND m.id=(b->>'actor_id')::uuid AND (NOT w OR m.role='owner')
   AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())
   AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation r WHERE r.tenant_id=t AND r.membership_id=m.id));
END $$;
ALTER FUNCTION app.firm_profile_access(uuid,text,boolean) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.firm_profile_access(uuid,text,boolean) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.firm_profile_access(uuid,text,boolean) TO jobguard_runtime;

CREATE TABLE app.firm_profile (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
 company_key text NOT NULL,
 trading_name text NOT NULL CHECK(trading_name=btrim(trading_name) AND length(trading_name) BETWEEN 1 AND 120),
 address_lines text[] NOT NULL DEFAULT '{}' CHECK(cardinality(address_lines)<=3 AND array_position(address_lines,NULL) IS NULL),
 contact_email text NOT NULL DEFAULT '' CHECK(length(contact_email)<=320),
 contact_phone text NOT NULL DEFAULT '' CHECK(length(contact_phone)<=80),
 PRIMARY KEY(tenant_id,company_key)
);
ALTER TABLE app.firm_profile OWNER TO jobguard_migration;
ALTER TABLE app.firm_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.firm_profile FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.firm_profile FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;
GRANT SELECT,INSERT,UPDATE ON app.firm_profile TO jobguard_runtime;
CREATE POLICY firm_profile_read ON app.firm_profile FOR SELECT TO jobguard_runtime
 USING(app.firm_profile_access(tenant_id,company_key,false));
CREATE POLICY firm_profile_insert ON app.firm_profile FOR INSERT TO jobguard_runtime
 WITH CHECK(app.firm_profile_access(tenant_id,company_key,true));
CREATE POLICY firm_profile_update ON app.firm_profile FOR UPDATE TO jobguard_runtime
 USING(app.firm_profile_access(tenant_id,company_key,true))
 WITH CHECK(app.firm_profile_access(tenant_id,company_key,true));
-- Forward fix: retain stored profiles and immutable quote snapshots; no rollback deletes.
COMMIT;
