BEGIN;
-- ENT-5: companion rows leave fingerprinted predecessor row shapes unchanged.
CREATE TABLE app.extra_client_signin (
 tenant_id uuid NOT NULL, link_id uuid NOT NULL, signin_digest text NOT NULL CHECK(signin_digest ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(tenant_id,link_id), UNIQUE(tenant_id,signin_digest),
 FOREIGN KEY(tenant_id,link_id) REFERENCES app.extra_client_link(tenant_id,id)
);
CREATE TABLE app.extra_client_session (
 tenant_id uuid NOT NULL, id uuid NOT NULL, link_id uuid NOT NULL, token_digest text NOT NULL CHECK(token_digest ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,link_id), UNIQUE(tenant_id,token_digest),
 FOREIGN KEY(tenant_id,link_id) REFERENCES app.extra_client_link(tenant_id,id), CHECK(expires_at>issued_at)
);
CREATE TABLE app.extra_client_command_session (
 tenant_id uuid NOT NULL, command_id uuid NOT NULL, session_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,command_id),
 FOREIGN KEY(tenant_id,command_id) REFERENCES app.command_receipt(tenant_id,command_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(tenant_id,session_id) REFERENCES app.extra_client_session(tenant_id,id)
);
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['extra_client_signin','extra_client_session','extra_client_command_session'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure',n);
END LOOP; END $$;
CREATE FUNCTION app.xc_bind_link(p_link uuid,p_digest text,p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app.extra_client_link k JOIN app.command_receipt r ON(r.tenant_id,r.command_id)=(k.tenant_id,k.command_id)
 WHERE k.tenant_id=t AND k.id=p_link AND k.issued_by_membership_id=p_actor AND r.actor_membership_id=p_actor AND r.status='processing') THEN
 RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 INSERT INTO app.extra_client_signin VALUES(t,p_link,p_digest);
END $$;
ALTER FUNCTION app.xc_bind_link(uuid,text,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.xc_bind_link(uuid,text,uuid) FROM PUBLIC,jobguard_identity,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.xc_bind_link(uuid,text,uuid) TO jobguard_runtime;
COMMIT;
