BEGIN;
ALTER POLICY tenant_isolation ON app.evidence_upload TO jobguard_runtime,jobguard_migration;
CREATE TABLE app.recovery_demo_selection(
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, command_id uuid NOT NULL,
 scenario varchar(32) NOT NULL CHECK(scenario IN('missing_evidence','pending_money','manual_receipt','unapproved_eligibility','prevented','eligible')),
 case_id uuid NOT NULL, receipt_id uuid, evidence_id uuid, eligibility_approval_id uuid, landing_approval_id uuid,
 selected_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,job_id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
ALTER TABLE app.recovery_demo_selection OWNER TO jobguard_migration;
ALTER TABLE app.recovery_demo_selection ENABLE ROW LEVEL SECURITY; ALTER TABLE app.recovery_demo_selection FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.recovery_demo_selection FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON app.recovery_demo_selection TO jobguard_runtime; REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.recovery_demo_selection FROM jobguard_runtime;
CREATE TRIGGER recovery_immutable BEFORE UPDATE OR DELETE ON app.recovery_demo_selection FOR EACH ROW EXECUTE FUNCTION app.reject_recovery_mutation();

CREATE FUNCTION app.configure_recovery_demo(p_job uuid,p_command uuid,p_scenario varchar) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE t uuid:=nullif(current_setting('app.tenant_id',true),'')::uuid;c uuid:=gen_random_uuid();r uuid:=gen_random_uuid();e uuid:=gen_random_uuid();u uuid:=gen_random_uuid();ea uuid:=gen_random_uuid();la uuid:=gen_random_uuid();
BEGIN
 IF t IS NULL OR p_scenario NOT IN('missing_evidence','pending_money','manual_receipt','unapproved_eligibility','prevented','eligible') THEN RAISE EXCEPTION 'invalid synthetic scenario' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM app.job_activation WHERE tenant_id=t AND job_id=p_job AND mode='synthetic_demo' AND fee_policy_version='reference_fee_policy_v1';IF NOT FOUND THEN RAISE EXCEPTION 'synthetic live job required' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM app.recovery_demo_selection WHERE tenant_id=t AND command_id=p_command) THEN RETURN p_command;END IF;
 IF EXISTS(SELECT 1 FROM app.recovery_demo_selection WHERE tenant_id=t AND job_id=p_job) THEN RAISE EXCEPTION 'scenario already selected' USING ERRCODE='23505';END IF;
 INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)VALUES(c,t,p_job,15000,'GBP',CASE WHEN p_scenario='prevented'THEN'prevented'ELSE'active'END,0,true);
 IF p_scenario<>'manual_receipt' THEN INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at)VALUES(r,t,p_job,'generated-fake-settlement:'||r,'generated-movement:'||r,CASE WHEN p_scenario='pending_money'THEN'pending'ELSE'settled'END,18000,'GBP',true,CASE WHEN p_scenario='pending_money'THEN NULL ELSE clock_timestamp() END) ; END IF;
 IF p_scenario NOT IN('missing_evidence','manual_receipt') THEN
  INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES(u,t,p_job,'synthetic/recovery/'||e,repeat('c',64),'application/pdf',64,'standard_evidence','verified','generated-v1',clock_timestamp(),clock_timestamp()+interval '1 day');
  INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)VALUES(e,t,u,p_job,'original','synthetic_bank_receipt','synthetic/recovery/'||e,'generated-v1',repeat('c',64),64,'application/pdf','standard_evidence',clock_timestamp(),clock_timestamp());
 END IF;
 IF p_scenario<>'unapproved_eligibility' THEN INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)VALUES(ea,t,p_job,c,'eligibility',0,'approved','reference_fee_policy_v1',clock_timestamp()+interval '1 hour',gen_random_uuid());END IF;
 INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)VALUES(la,t,p_job,c,'landing',0,'approved','reference_fee_policy_v1',clock_timestamp()+interval '1 hour',gen_random_uuid());
 INSERT INTO app.recovery_demo_selection VALUES(t,p_job,p_command,p_scenario,c,CASE WHEN p_scenario='manual_receipt'THEN NULL ELSE r END,CASE WHEN p_scenario IN('missing_evidence','manual_receipt')THEN NULL ELSE e END,CASE WHEN p_scenario='unapproved_eligibility'THEN NULL ELSE ea END,la,DEFAULT);
 RETURN p_command;
END$$;
-- Fix generated receipt statement with explicit columns/order above.
ALTER FUNCTION app.configure_recovery_demo(uuid,uuid,varchar) OWNER TO jobguard_migration; REVOKE ALL ON FUNCTION app.configure_recovery_demo(uuid,uuid,varchar) FROM PUBLIC; GRANT EXECUTE ON FUNCTION app.configure_recovery_demo(uuid,uuid,varchar) TO jobguard_runtime;
COMMIT;
