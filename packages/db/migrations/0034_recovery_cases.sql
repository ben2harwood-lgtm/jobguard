BEGIN;
ALTER TABLE app.recovery_case ADD COLUMN case_type varchar(40) NOT NULL DEFAULT 'merchant_overcharge' CHECK(case_type IN('merchant_overcharge','withheld_customer_payment','prevention')), ADD COLUMN counterparty varchar(120) NOT NULL DEFAULT 'Synthetic counterparty', ADD COLUMN book varchar(30) NOT NULL DEFAULT 'supplier_cost' CHECK(book IN('supplier_cost','builder_customer')), ADD COLUMN source_type varchar(30) NOT NULL DEFAULT 'supplier_documents' CHECK(source_type IN('supplier_documents','customer_invoice')), ADD COLUMN source_refs jsonb NOT NULL DEFAULT '["legacy synthetic recovery fixture"]'::jsonb CHECK(jsonb_typeof(source_refs)='array'), ADD COLUMN environment varchar(30) NOT NULL DEFAULT 'synthetic_demo' CHECK(environment='synthetic_demo');
GRANT INSERT ON app.recovery_case TO jobguard_runtime;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.recovery_case FROM jobguard_runtime;
CREATE TABLE app.recovery_claim_revision(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,case_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),claimed_net_pence bigint NOT NULL CHECK(claimed_net_pence>0 AND claimed_net_pence<=1000000000000),currency char(3) NOT NULL CHECK(currency='GBP'),reviewer_ref varchar(200) NOT NULL,subject_hash char(64) NOT NULL,previous_hash char(64),created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,case_id,revision),UNIQUE(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id)
);
CREATE TABLE app.recovery_case_event(
 id uuid NOT NULL,tenant_id uuid NOT NULL,job_id uuid NOT NULL,case_id uuid NOT NULL,sequence integer NOT NULL CHECK(sequence>0),event_type varchar(30) NOT NULL CHECK(event_type IN('opened','claim_amended','assemble_evidence','start_pursuit','start_negotiation','resume_pursuit','record_landing','close_recovered','close_no_recovery','prevent','write_off','dispute','reverse_landing')),
 from_state varchar(30),to_state varchar(30) NOT NULL,amount_pence bigint CHECK(amount_pence>0 AND amount_pence<=1000000000000),reviewer_ref varchar(200) NOT NULL,command_id uuid NOT NULL,payload_hash char(64) NOT NULL,previous_hash char(64),created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,case_id,sequence),UNIQUE(tenant_id,command_id),UNIQUE(tenant_id,job_id,id),FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id)
);
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['recovery_claim_revision','recovery_case_event'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=current_setting(''app.tenant_id'')::uuid) WITH CHECK(tenant_id=current_setting(''app.tenant_id'')::uuid)',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP;END$$;
COMMIT;
