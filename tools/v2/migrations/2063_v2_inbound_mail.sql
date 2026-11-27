-- V2-only migration: installed after 2001 by the checked local bootstrap.
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'jobguard_v2_local' THEN
  RAISE EXCEPTION 'V2 inbound mail requires the dedicated rehearsal database';
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS app.v2_inbound_address (
 tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id), firm_key text NOT NULL,
 address varchar(200) NOT NULL UNIQUE, created_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,firm_key),
 FOREIGN KEY(tenant_id,created_by) REFERENCES app.membership(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS app.v2_inbound_item (
 tenant_id uuid NOT NULL, firm_key text NOT NULL, id uuid NOT NULL,
 message_id varchar(200) NOT NULL, message_hash char(64) NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 sender varchar(200) NOT NULL, subject varchar(500) NOT NULL, fixture_id varchar(100),
 state text NOT NULL CHECK(state IN ('needs_job','needs_k6b','filed','dismissed')),
 job_id uuid, document_id uuid, filed_by uuid, revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,firm_key,message_id),
 FOREIGN KEY(tenant_id,firm_key) REFERENCES app.v2_inbound_address(tenant_id,firm_key),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,job_id,document_id) REFERENCES app.supplier_document(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,filed_by) REFERENCES app.membership(tenant_id,id),
 CHECK((state='filed')=(job_id IS NOT NULL AND document_id IS NOT NULL AND filed_by IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS app.v2_inbound_command (
 tenant_id uuid NOT NULL, firm_key text NOT NULL, command_id uuid NOT NULL,
 request_hash char(64) NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(tenant_id,firm_key,command_id),
 FOREIGN KEY(tenant_id,firm_key) REFERENCES app.v2_inbound_address(tenant_id,firm_key)
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['v2_inbound_address','v2_inbound_item','v2_inbound_command'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  IF NOT EXISTS(SELECT FROM pg_policy WHERE polrelid=('app.'||n)::regclass AND polname='v2_firm') THEN
   EXECUTE format('CREATE POLICY v2_firm ON app.%I TO jobguard_runtime USING (
    tenant_id=app.current_tenant() AND firm_key=app.current_firm_profile_key()
    AND (app.current_firm_profile_key() LIKE ''practice:%%'')) WITH CHECK (
    tenant_id=app.current_tenant() AND firm_key=app.current_firm_profile_key()
    AND (app.current_firm_profile_key() LIKE ''practice:%%''))',n);
  END IF;
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
  EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
 END LOOP;
 IF NOT EXISTS(SELECT FROM pg_policy WHERE polrelid='app.v2_inbound_item'::regclass AND polname='v2_job') THEN
  CREATE POLICY v2_job ON app.v2_inbound_item AS RESTRICTIVE TO jobguard_runtime
   USING(job_id IS NULL OR EXISTS(SELECT FROM app.job j WHERE(j.tenant_id,j.id)=(v2_inbound_item.tenant_id,v2_inbound_item.job_id)))
   WITH CHECK(job_id IS NULL OR EXISTS(SELECT FROM app.job j WHERE(j.tenant_id,j.id)=(v2_inbound_item.tenant_id,v2_inbound_item.job_id)));
 END IF;
END $$;
GRANT UPDATE(result) ON app.v2_inbound_command TO jobguard_runtime;
GRANT UPDATE(state,job_id,document_id,filed_by,revision) ON app.v2_inbound_item TO jobguard_runtime;
COMMIT;
