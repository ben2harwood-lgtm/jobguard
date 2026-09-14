BEGIN;
CREATE TABLE app.job_finding (
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, decision_id uuid NOT NULL,
 fingerprint char(64) NOT NULL CHECK(fingerprint~'^[0-9a-f]{64}$'), kind varchar(40) NOT NULL CHECK(kind IN('unresolved_question','required_proof','materials_bill_review')),
 classification varchar(16) NOT NULL CHECK(classification IN('mandatory','advisory')), title varchar(160) NOT NULL, detail varchar(1000) NOT NULL,
 subject_ref varchar(200) NOT NULL, action_type varchar(100) NOT NULL, suggestion_confidence numeric(5,4), snapshot_revision integer NOT NULL CHECK(snapshot_revision>=0),
 created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,fingerprint), UNIQUE(tenant_id,decision_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id), FOREIGN KEY(tenant_id,decision_id) REFERENCES app.decision(tenant_id,id),
 CHECK((kind='materials_bill_review' AND classification='advisory' AND detail LIKE 'REVIEW SUGGESTION%No overcharge has been detected.%') OR kind<>'materials_bill_review')
);
CREATE TABLE app.finding_suppression (
 id uuid NOT NULL,tenant_id uuid NOT NULL,finding_id uuid NOT NULL,reason varchar(40) NOT NULL CHECK(reason IN('low_value','low_confidence','daily_advisory_budget')),
 policy_version varchar(80) NOT NULL,created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,finding_id),
 FOREIGN KEY(tenant_id,finding_id) REFERENCES app.job_finding(tenant_id,id)
);
CREATE FUNCTION app.reject_mandatory_finding_suppression() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM app.job_finding f WHERE f.tenant_id=NEW.tenant_id AND f.id=NEW.finding_id AND f.classification='mandatory') THEN RAISE EXCEPTION 'mandatory findings cannot be suppressed' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
CREATE TRIGGER finding_suppression_advisory_only BEFORE INSERT ON app.finding_suppression FOR EACH ROW EXECUTE FUNCTION app.reject_mandatory_finding_suppression();
CREATE TRIGGER job_finding_immutable BEFORE UPDATE OR DELETE ON app.job_finding FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
CREATE TRIGGER finding_suppression_immutable BEFORE UPDATE OR DELETE ON app.finding_suppression FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['job_finding','finding_suppression'] LOOP EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO jobguard_runtime,jobguard_migration USING (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);EXECUTE format('REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.%I FROM jobguard_runtime',n);END LOOP;END $$;
ALTER FUNCTION app.reject_mandatory_finding_suppression() OWNER TO jobguard_migration;
COMMIT;
