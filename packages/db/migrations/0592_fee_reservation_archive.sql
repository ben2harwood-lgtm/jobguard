-- M4-12 reserve cleanup (RED). Additive, lazy compaction on the next store transaction.
-- Released attempts and replay/audit history are retained; unknown outcomes stay active.
BEGIN;
CREATE TABLE app.fee_reservation_archive (
  tenant_id uuid NOT NULL REFERENCES app.fee_reservation_book(tenant_id),
  kind text NOT NULL CHECK (kind IN ('attempt','event','audit')),
  key text NOT NULL CHECK (length(key) > 0),
  payload jsonb NOT NULL,
  PRIMARY KEY (tenant_id,kind,key)
);
ALTER TABLE app.fee_reservation_archive OWNER TO jobguard_migration;
ALTER TABLE app.fee_reservation_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.fee_reservation_archive FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.fee_reservation_archive FOR ALL TO jobguard_runtime
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON app.fee_reservation_archive FROM PUBLIC, jobguard_infrastructure, jobguard_runtime;
GRANT SELECT, INSERT ON app.fee_reservation_archive TO jobguard_runtime;
COMMIT;
