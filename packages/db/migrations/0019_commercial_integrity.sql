BEGIN;

CREATE TABLE app.commercial_integrity_value_fact (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL,
 value_kind varchar(12) NOT NULL CHECK(value_kind IN('quoted','accepted','final')),
 net_value_pence bigint NOT NULL CHECK(net_value_pence>=0), currency char(3) NOT NULL CHECK(currency='GBP'),
 source_ref uuid NOT NULL, occurred_at timestamptz NOT NULL, synthetic boolean NOT NULL CHECK(synthetic),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,value_kind,source_ref),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);
CREATE TABLE app.commercial_integrity_activity_fact (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL,
 activity_kind varchar(32) NOT NULL CHECK(activity_kind IN('site_activity','recovery_discussed','outside_app_settlement')),
 occurred_at timestamptz NOT NULL, synthetic boolean NOT NULL CHECK(synthetic),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id,activity_kind,occurred_at),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id)
);

-- Preserve an explicit accepted/quoted value pair for every existing synthetic activation.
INSERT INTO app.commercial_integrity_value_fact(id,tenant_id,job_id,value_kind,net_value_pence,currency,source_ref,occurred_at,synthetic)
SELECT gen_random_uuid(),c.tenant_id,c.job_id,'accepted',c.accepted_net_value_pence,c.currency,c.activation_id,c.created_at,true
FROM app.cap_snapshot c JOIN app.job_activation a ON(a.tenant_id,a.id)=(c.tenant_id,c.activation_id) WHERE a.mode='synthetic_demo';
INSERT INTO app.commercial_integrity_value_fact(id,tenant_id,job_id,value_kind,net_value_pence,currency,source_ref,occurred_at,synthetic)
SELECT gen_random_uuid(),c.tenant_id,c.job_id,'quoted',q.net_value_pence,c.currency,q.id,c.created_at,true
FROM app.cap_snapshot c JOIN app.job_activation a ON(a.tenant_id,a.id)=(c.tenant_id,c.activation_id)
JOIN app.quote_version q ON(q.tenant_id,q.id)=(c.tenant_id,c.baseline_quote_version_id) WHERE a.mode='synthetic_demo';

CREATE TRIGGER commercial_integrity_value_immutable BEFORE UPDATE OR DELETE ON app.commercial_integrity_value_fact FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
CREATE TRIGGER commercial_integrity_activity_immutable BEFORE UPDATE OR DELETE ON app.commercial_integrity_activity_fact FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_commercial_mutation();
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['commercial_integrity_value_fact','commercial_integrity_activity_fact'] LOOP
 EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
 EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK(tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);
END LOOP; END $$;
COMMIT;
