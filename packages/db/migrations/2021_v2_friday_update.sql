BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid='app.job'::regclass AND polname='v2_practice_firm'
  ) THEN RETURN; END IF;
  SET LOCAL ROLE jobguard_migration;
  CREATE TABLE IF NOT EXISTS app.v2_friday_update (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    command_id uuid NOT NULL,
    week date NOT NULL CHECK (extract(isodow FROM week)=1),
    sequence integer NOT NULL CHECK (sequence>0),
    content_version integer NOT NULL CHECK (content_version>0),
    action text NOT NULL CHECK (action IN ('prepare','edit','send')),
    content jsonb NOT NULL CHECK (content->>'schema'='friday-content.v1' AND content->'photos'='[]'::jsonb),
    content_hash char(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    recipient text NOT NULL CHECK (recipient='customer@jobguard-v2.invalid'),
    actor_membership_id uuid NOT NULL,
    request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    client_created_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    sent_at timestamptz,
    sent_by uuid,
    catcher_message text,
    PRIMARY KEY (tenant_id,command_id),
    UNIQUE (tenant_id,job_id,week,sequence),
    FOREIGN KEY (tenant_id,job_id) REFERENCES app.job(tenant_id,id),
    CHECK ((action='send' AND sent_at IS NOT NULL AND sent_by=actor_membership_id AND catcher_message IS NOT NULL)
      OR (action<>'send' AND sent_at IS NULL AND sent_by IS NULL AND catcher_message IS NULL))
  );
  CREATE UNIQUE INDEX IF NOT EXISTS v2_friday_update_one_send
    ON app.v2_friday_update(tenant_id,job_id,week,content_version) WHERE action='send';
  ALTER TABLE app.v2_friday_update ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_friday_update FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_friday_update_runtime ON app.v2_friday_update;
  CREATE POLICY v2_friday_update_runtime ON app.v2_friday_update TO jobguard_runtime
    USING (tenant_id=(SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(v2_friday_update.tenant_id,v2_friday_update.job_id)
    ));
  REVOKE ALL ON app.v2_friday_update FROM PUBLIC,jobguard_runtime;
  GRANT SELECT,INSERT ON app.v2_friday_update TO jobguard_runtime;
END
$v2$;
COMMIT;
