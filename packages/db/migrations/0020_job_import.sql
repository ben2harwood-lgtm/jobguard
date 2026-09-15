BEGIN;

ALTER TABLE app.job ADD COLUMN provenance varchar(24) NOT NULL DEFAULT 'system_generated_quote'
  CHECK (provenance IN ('system_generated_quote','imported'));
ALTER TABLE app.job DROP CONSTRAINT job_check;
ALTER TABLE app.job ADD CONSTRAINT job_baseline_shape CHECK (
  (baseline_quote_version_id IS NULL AND accepted_net_value_pence IS NULL AND fee_policy_version IS NULL AND recovery_cap_pence IS NULL)
  OR (provenance='system_generated_quote' AND baseline_quote_version_id IS NOT NULL AND accepted_net_value_pence IS NOT NULL AND fee_policy_version IS NOT NULL AND recovery_cap_pence IS NOT NULL)
  OR (provenance='imported' AND baseline_quote_version_id IS NULL AND accepted_net_value_pence IS NOT NULL AND fee_policy_version IS NOT NULL AND recovery_cap_pence IS NOT NULL)
);
ALTER TABLE app.job ADD CONSTRAINT imported_never_quote_lineage CHECK (
  provenance<>'imported' OR (accepted_quote_version_id IS NULL AND baseline_quote_version_id IS NULL)
);

CREATE TABLE app.imported_job_baseline (
  id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL,
  provenance varchar(16) NOT NULL CHECK(provenance='imported'),
  lineage_strength varchar(32) NOT NULL CHECK(lineage_strength='builder_attested_weaker'),
  baseline_hash char(64) NOT NULL CHECK(baseline_hash~'^[0-9a-f]{64}$'), baseline_description varchar(2000) NOT NULL,
  accepted_value_source varchar(32) NOT NULL CHECK(accepted_value_source='builder_attestation'),
  accepted_net_value_pence bigint NOT NULL CHECK(accepted_net_value_pence>=0), currency char(3) NOT NULL CHECK(currency='GBP'),
  recovery_cap_pence bigint NOT NULL CHECK(recovery_cap_pence>=0), fee_policy_version varchar(80) NOT NULL CHECK(fee_policy_version='reference_fee_policy_v1'),
  import_terms_version varchar(80) NOT NULL CHECK(import_terms_version='synthetic_import_terms_candidate.v1'),
  attested_by_membership_id uuid NOT NULL, attested_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id),
  FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
  FOREIGN KEY(tenant_id,attested_by_membership_id) REFERENCES app.membership(tenant_id,id)
);

CREATE FUNCTION app.guard_imported_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.provenance='imported' AND current_setting('app.import_command',true)<>'enabled' THEN
   RAISE EXCEPTION 'imported jobs require authorized import command' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER imported_job_command_only BEFORE INSERT ON app.job FOR EACH ROW EXECUTE FUNCTION app.guard_imported_job();
CREATE TRIGGER imported_baseline_immutable BEFORE UPDATE OR DELETE ON app.imported_job_baseline FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();

CREATE FUNCTION app.adopt_in_flight_job(p_tenant uuid,p_job uuid,p_baseline uuid,p_title varchar,p_lifecycle varchar,p_hash char(64),p_description varchar,p_net bigint,p_cap bigint,p_policy varchar,p_terms varchar,p_actor uuid,p_attested timestamptz)
RETURNS app.imported_job_baseline LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,app AS $$
DECLARE b app.imported_job_baseline;
BEGIN
 IF p_tenant IS DISTINCT FROM nullif(current_setting('app.tenant_id',true),'')::uuid THEN RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE='42501';END IF;
 IF p_lifecycle NOT IN('live','invoiced') OR p_net<0 OR p_cap<>app.reference_recovery_cap(p_net) OR p_policy<>'reference_fee_policy_v1' OR p_terms<>'synthetic_import_terms_candidate.v1' OR p_attested>clock_timestamp() THEN RAISE EXCEPTION 'invalid imported terms' USING ERRCODE='22023';END IF;
 PERFORM set_config('app.import_command','enabled',true);
 INSERT INTO app.job(id,tenant_id,title,status,revision,provenance,accepted_net_value_pence,fee_policy_version,recovery_cap_pence)
 VALUES(p_job,p_tenant,p_title,p_lifecycle,1,'imported',p_net,p_policy,p_cap);
 INSERT INTO app.imported_job_baseline(id,tenant_id,job_id,provenance,lineage_strength,baseline_hash,baseline_description,accepted_value_source,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,import_terms_version,attested_by_membership_id,attested_at)
 VALUES(p_baseline,p_tenant,p_job,'imported','builder_attested_weaker',p_hash,p_description,'builder_attestation',p_net,'GBP',p_cap,p_policy,p_terms,p_actor,p_attested) RETURNING * INTO b;
 RETURN b;
END $$;

ALTER TABLE app.imported_job_baseline OWNER TO jobguard_migration;
ALTER TABLE app.imported_job_baseline ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.imported_job_baseline FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.imported_job_baseline FOR ALL TO jobguard_runtime,jobguard_migration
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON app.imported_job_baseline TO jobguard_runtime;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.imported_job_baseline FROM jobguard_runtime;
ALTER FUNCTION app.guard_imported_job() OWNER TO jobguard_migration;
ALTER FUNCTION app.adopt_in_flight_job(uuid,uuid,uuid,varchar,varchar,character,varchar,bigint,bigint,varchar,varchar,uuid,timestamptz) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.adopt_in_flight_job(uuid,uuid,uuid,varchar,varchar,character,varchar,bigint,bigint,varchar,varchar,uuid,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.adopt_in_flight_job(uuid,uuid,uuid,varchar,varchar,character,varchar,bigint,bigint,varchar,varchar,uuid,timestamptz) TO jobguard_runtime;
COMMIT;
