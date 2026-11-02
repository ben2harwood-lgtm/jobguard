BEGIN;
-- Additive synthetic store. No programme, invoice, fee, outbox or live-worker writes.
CREATE TABLE app.scheduled_readiness_plan (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, task_id uuid NOT NULL,
 fact_revision integer NOT NULL CHECK(fact_revision>0),
 plan_hash text NOT NULL CHECK(plan_hash ~ '^[a-f0-9]{64}$'), payload jsonb NOT NULL,
 audit_event_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,job_id,task_id,fact_revision),
 UNIQUE(tenant_id,job_id,task_id,plan_hash),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(COALESCE(jsonb_typeof(payload)='object'
  AND payload->>'version'='readiness-scheduled-plan.v1' AND payload->'synthetic'='true'::jsonb
  AND payload->'scope'=jsonb_build_object('tenantId',tenant_id,'jobId',job_id,'taskId',task_id)
  AND payload->'factRevision'=to_jsonb(fact_revision)
  AND payload->>'status' IN('confirmed','cancelled'),false))
);
CREATE TABLE app.scheduled_readiness_proposal (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, task_id uuid NOT NULL,
 proposal_key text NOT NULL CHECK(proposal_key ~ '^[a-f0-9]{64}$'), plan_hash text NOT NULL,
 payload jsonb NOT NULL, audit_event_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,proposal_key),
 FOREIGN KEY(tenant_id,job_id,task_id,plan_hash) REFERENCES app.scheduled_readiness_plan(tenant_id,job_id,task_id,plan_hash),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(COALESCE(jsonb_typeof(payload)='object'
  AND payload->>'version'='readiness-prevention-proposal.v1'
  AND payload->'scope'=jsonb_build_object('tenantId',tenant_id,'jobId',job_id,'taskId',task_id)
  AND payload->>'key'=proposal_key AND payload->>'planHash'=plan_hash
  AND payload->>'classification'='prevention' AND payload->>'status'='proposal'
  AND payload->'feeEligible'='false'::jsonb AND payload->'programmeChanged'='false'::jsonb
  AND payload->'recoveryFeePence'='0'::jsonb,false))
);
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['scheduled_readiness_plan','scheduled_readiness_proposal'] LOOP
  EXECUTE format('ALTER TABLE app.%I OWNER TO jobguard_migration',n);
  EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('ALTER TABLE app.%I FORCE ROW LEVEL SECURITY',n);
  EXECUTE format('CREATE POLICY tenant_isolation ON app.%I TO jobguard_runtime,jobguard_migration USING(tenant_id=current_setting(''app.tenant_id'')::uuid) WITH CHECK(tenant_id=current_setting(''app.tenant_id'')::uuid)',n);
  EXECUTE format('REVOKE ALL ON app.%I FROM PUBLIC,jobguard_runtime,jobguard_infrastructure',n);
  EXECUTE format('GRANT SELECT,INSERT ON app.%I TO jobguard_runtime',n);
 END LOOP;
END $$;
COMMIT;
