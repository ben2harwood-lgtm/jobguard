BEGIN;

CREATE TABLE app.sandbox_run (
  id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES control_plane.tenant(id),
  job_id uuid NOT NULL,
  session_id uuid NOT NULL,
  scenario varchar(40) NOT NULL CHECK (scenario IN ('core-1000')),
  environment varchar(30) NOT NULL CHECK (environment = 'synthetic_demo'),
  status varchar(24) NOT NULL CHECK (status = 'active'),
  initial_clock_tick integer NOT NULL DEFAULT 0 CHECK (initial_clock_tick = 0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,job_id),
  FOREIGN KEY (tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
CREATE TABLE app.sandbox_run_event (
  id uuid NOT NULL, tenant_id uuid NOT NULL, run_id uuid NOT NULL,
  event_index integer NOT NULL CHECK (event_index > 0),
  kind varchar(30) NOT NULL CHECK (kind IN ('created','advanced','archived')),
  fake_clock_tick integer NOT NULL CHECK (fake_clock_tick >= 0),
  command_id uuid NOT NULL, payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,run_id,event_index), UNIQUE (tenant_id,command_id),
  FOREIGN KEY (tenant_id,run_id) REFERENCES app.sandbox_run(tenant_id,id)
);
CREATE TABLE app.sandbox_work (
  id uuid NOT NULL, tenant_id uuid NOT NULL, run_id uuid NOT NULL,
  step integer NOT NULL CHECK (step BETWEEN 1 AND 3),
  adapter varchar(40) NOT NULL CHECK (adapter IN ('fake_quote_review','fake_job_progress','fake_final_account')),
  input_hash char(64) NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  amount_pence bigint NOT NULL CHECK (amount_pence BETWEEN 0 AND 1000000000000), currency char(3) NOT NULL CHECK(currency='GBP'),
  environment varchar(30) NOT NULL CHECK(environment='synthetic_demo'), approved boolean NOT NULL CHECK(approved),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,run_id,step), FOREIGN KEY(tenant_id,run_id) REFERENCES app.sandbox_run(tenant_id,id)
);
CREATE TABLE app.sandbox_adapter_receipt (
  id uuid NOT NULL, tenant_id uuid NOT NULL, run_id uuid NOT NULL, work_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK(attempt_number=1), adapter varchar(40) NOT NULL CHECK(adapter LIKE 'fake_%'),
  input_hash char(64) NOT NULL, output_hash char(64) NOT NULL,
  fake_clock_tick integer NOT NULL CHECK(fake_clock_tick > 0), environment varchar(30) NOT NULL CHECK(environment='synthetic_demo'),
  external_action_count integer NOT NULL CHECK(external_action_count=0),
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,work_id,attempt_number),
  FOREIGN KEY(tenant_id,run_id) REFERENCES app.sandbox_run(tenant_id,id),
  FOREIGN KEY(tenant_id,work_id) REFERENCES app.sandbox_work(tenant_id,id)
);

DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['sandbox_run','sandbox_run_event','sandbox_work','sandbox_adapter_receipt'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP; END $$;
COMMIT;
