BEGIN;
-- M2-7 dark synthetic metrics. Additive only; forward-fix by disabling the reader/writer,
-- preserve receipts and audit history, then apply a corrective migration. No backfill.
CREATE TABLE app.inbox_metric_receipt (
 tenant_id uuid NOT NULL, job_id uuid NOT NULL, receipt_id uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 event_id uuid, command_id uuid, event jsonb,
 rejection text CHECK(rejection IN('INVALID_METRICS_INPUT','INVALID_METRICS_REFERENCE','IDEMPOTENCY_CONFLICT')),
 audit_event_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,receipt_id),
 UNIQUE(tenant_id,event_id), UNIQUE(tenant_id,command_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES app.job(tenant_id,id),
 FOREIGN KEY(tenant_id,audit_event_id) REFERENCES app.audit_event(tenant_id,id),
 CHECK((rejection IS NOT NULL AND event IS NULL AND event_id IS NULL AND command_id IS NULL)
  OR (rejection IS NULL AND event IS NOT NULL AND event_id IS NOT NULL AND command_id IS NOT NULL
   AND jsonb_typeof(event)='object'
   AND event->>'tenantId' IS NOT DISTINCT FROM tenant_id::text
   AND event->>'jobId' IS NOT DISTINCT FROM job_id::text
   AND event->>'eventId' IS NOT DISTINCT FROM event_id::text
   AND event->>'commandId' IS NOT DISTINCT FROM command_id::text
   AND event-ARRAY['tenantId','jobId','eventId','commandId','occurredAt','kind','ruleId','ruleVersion',
    'findingId','findingIds','decisionId','resolution','reason','outcome']='{}'::jsonb))
);
ALTER TABLE app.inbox_metric_receipt OWNER TO jobguard_migration;
ALTER TABLE app.inbox_metric_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inbox_metric_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.inbox_metric_receipt FOR ALL TO jobguard_runtime
 USING(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid)
 WITH CHECK(tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.inbox_metric_receipt FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
GRANT SELECT,INSERT ON app.inbox_metric_receipt TO jobguard_runtime;
CREATE FUNCTION app.inbox_metric_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'INBOX_METRICS_IMMUTABLE' USING ERRCODE='55000';
END $$;
ALTER FUNCTION app.inbox_metric_immutable() OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.inbox_metric_immutable() FROM PUBLIC,jobguard_runtime,jobguard_infrastructure;
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON app.inbox_metric_receipt
 FOR EACH ROW EXECUTE FUNCTION app.inbox_metric_immutable();
CREATE TRIGGER immutable_table BEFORE TRUNCATE ON app.inbox_metric_receipt
 FOR EACH STATEMENT EXECUTE FUNCTION app.inbox_metric_immutable();
COMMIT;
