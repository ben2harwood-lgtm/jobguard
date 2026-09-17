BEGIN;
CREATE TABLE app.fee_illustration_source(
 tenant_id uuid NOT NULL,job_id uuid NOT NULL,command_id uuid NOT NULL,source_version varchar(32) NOT NULL CHECK(source_version='recovery-18800.v1'),
 accepted_net_pence bigint NOT NULL CHECK(accepted_net_pence=1880000),eligible_net_pence bigint NOT NULL CHECK(eligible_net_pence=282000),
 gross_landed_pence bigint NOT NULL CHECK(gross_landed_pence=338400),base_obligation_pence bigint NOT NULL CHECK(base_obligation_pence=7900),
 base_settled_pence bigint NOT NULL CHECK(base_settled_pence IN(0,7900)),prior_posting_pence bigint NOT NULL CHECK(prior_posting_pence=20300),
 statement_issued_count integer NOT NULL DEFAULT 1 CHECK(statement_issued_count=1),ledger_entry_count integer NOT NULL DEFAULT 1 CHECK(ledger_entry_count=1),
 source_ids uuid[] NOT NULL CHECK(cardinality(source_ids)=2),created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,job_id),UNIQUE(tenant_id,command_id),FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
ALTER TABLE app.fee_illustration_source OWNER TO jobguard_migration;ALTER TABLE app.fee_illustration_source ENABLE ROW LEVEL SECURITY;ALTER TABLE app.fee_illustration_source FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.fee_illustration_source FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON app.fee_illustration_source TO jobguard_runtime;REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.fee_illustration_source FROM jobguard_runtime;
CREATE TRIGGER fee_illustration_immutable BEFORE UPDATE OR DELETE ON app.fee_illustration_source FOR EACH ROW EXECUTE FUNCTION app.reject_recovery_mutation();
CREATE FUNCTION app.create_fee_illustration_source(p_job uuid,p_command uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;BEGIN
 IF t IS NULL OR NOT EXISTS(SELECT 1 FROM app.job WHERE tenant_id=t AND id=p_job) THEN RAISE EXCEPTION 'synthetic job required' USING ERRCODE='42501';END IF;
 INSERT INTO app.fee_illustration_source(tenant_id,job_id,command_id,source_version,accepted_net_pence,eligible_net_pence,gross_landed_pence,base_obligation_pence,base_settled_pence,prior_posting_pence,source_ids)
 VALUES(t,p_job,p_command,'recovery-18800.v1',1880000,282000,338400,7900,7900,20300,ARRAY[gen_random_uuid(),gen_random_uuid()]);
END $$;
ALTER FUNCTION app.create_fee_illustration_source(uuid,uuid) OWNER TO jobguard_migration;REVOKE ALL ON FUNCTION app.create_fee_illustration_source(uuid,uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION app.create_fee_illustration_source(uuid,uuid) TO jobguard_runtime;
COMMIT;
