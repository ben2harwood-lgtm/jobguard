BEGIN;
CREATE TABLE app.recovery_eligibility_revision(
 id uuid NOT NULL, tenant_id uuid NOT NULL, job_id uuid NOT NULL, case_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), case_revision integer NOT NULL CHECK(case_revision>0), evidence_revision integer NOT NULL CHECK(evidence_revision>0),
 policy_version varchar(40) NOT NULL CHECK(policy_version='reference-d03.v1'), policy_revision integer NOT NULL CHECK(policy_revision>0),
 scenario varchar(50) NOT NULL, classification varchar(30) NOT NULL CHECK(classification IN('eligible_for_review','excluded','pending_review')),
 eligible_net_pence bigint CHECK(eligible_net_pence>0 AND eligible_net_pence<=1000000000000), currency char(3) NOT NULL CHECK(currency='GBP'),
 reason varchar(200) NOT NULL, citations jsonb NOT NULL CHECK(jsonb_typeof(citations)='array'), status varchar(20) NOT NULL CHECK(status IN('reviewed','approved','superseded')),
 reviewer_ref varchar(200) NOT NULL, command_id uuid NOT NULL, subject_hash char(64) NOT NULL, previous_hash char(64), created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,case_id,revision), UNIQUE(tenant_id,command_id), UNIQUE(tenant_id,job_id,id),
 FOREIGN KEY(tenant_id,job_id,case_id) REFERENCES app.recovery_case(tenant_id,job_id,id)
);
ALTER TABLE app.recovery_eligibility_revision OWNER TO jobguard_migration;
ALTER TABLE app.recovery_eligibility_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.recovery_eligibility_revision FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.recovery_eligibility_revision FOR ALL TO jobguard_runtime,jobguard_migration USING(tenant_id=current_setting('app.tenant_id')::uuid) WITH CHECK(tenant_id=current_setting('app.tenant_id')::uuid);
GRANT SELECT,INSERT ON app.recovery_eligibility_revision TO jobguard_runtime;
REVOKE UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON app.recovery_eligibility_revision FROM jobguard_runtime;
COMMIT;
