BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid='app.job'::regclass AND polname='v2_practice_firm'
  ) THEN RETURN; END IF;
  SET LOCAL ROLE jobguard_migration;
  -- V2-K2A: one private calendar link per job for the builder. Append-only revisions:
  -- version 1 creates the link (only its token hash is kept), refreshes save a new copy
  -- of the dated plan tasks, and a revoke row ends the link for good.
  CREATE TABLE IF NOT EXISTS app.v2_calendar_feed_revision (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    feed_id uuid NOT NULL,
    feed_version integer NOT NULL CHECK (feed_version > 0),
    command_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('create','refresh','revoke')),
    request jsonb NOT NULL CHECK (jsonb_typeof(request)='object'),
    token_hash text CHECK (token_hash ~ '^[a-f0-9]{64}$'),
    snapshot jsonb CHECK (snapshot IS NULL OR (jsonb_typeof(snapshot)='object'
      AND snapshot->>'version'='calendar-feed-snapshot.v1' AND jsonb_typeof(snapshot->'tasks')='array')),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,job_id,feed_id,feed_version),
    UNIQUE (tenant_id,job_id,command_id),
    CHECK ((feed_version=1) = (action='create')),
    CHECK ((action='create') = (token_hash IS NOT NULL)),
    CHECK ((action='revoke') = (snapshot IS NULL)),
    FOREIGN KEY (tenant_id,job_id) REFERENCES app.job(tenant_id,id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS v2_calendar_feed_token
    ON app.v2_calendar_feed_revision (token_hash) WHERE token_hash IS NOT NULL;
  ALTER TABLE app.v2_calendar_feed_revision ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_calendar_feed_revision FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_calendar_feed_runtime ON app.v2_calendar_feed_revision;
  CREATE POLICY v2_calendar_feed_runtime ON app.v2_calendar_feed_revision TO jobguard_runtime
    USING (tenant_id=(SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(v2_calendar_feed_revision.tenant_id,v2_calendar_feed_revision.job_id)
    ));
  -- Only the owner-run reader below uses this: it finds one link by token hash before
  -- any tenant binding exists. It reads this table only, never a job, quote or plan table.
  DROP POLICY IF EXISTS v2_calendar_feed_reader ON app.v2_calendar_feed_revision;
  CREATE POLICY v2_calendar_feed_reader ON app.v2_calendar_feed_revision FOR SELECT TO jobguard_migration
    USING (current_database()='jobguard_v2_local');
  -- V2-FL firm lock (the guard's direct-table shape, as 2047 writes it): a firm sees only its own jobs' links.
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_calendar_feed_revision;
  CREATE POLICY v2_practice_firm ON app.v2_calendar_feed_revision AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(v2_calendar_feed_revision.tenant_id,v2_calendar_feed_revision.job_id)));
  REVOKE ALL ON app.v2_calendar_feed_revision FROM PUBLIC;
  GRANT SELECT,INSERT ON app.v2_calendar_feed_revision TO jobguard_runtime;

  CREATE OR REPLACE FUNCTION app.v2_calendar_feed_read(h text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $read$
  DECLARE f app.v2_calendar_feed_revision; latest app.v2_calendar_feed_revision;
  BEGIN
    IF current_database()<>'jobguard_v2_local' OR h IS NULL OR h !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
    SELECT * INTO f FROM app.v2_calendar_feed_revision WHERE token_hash=h;
    IF NOT FOUND OR EXISTS (SELECT FROM app.v2_calendar_feed_revision r
      WHERE (r.tenant_id,r.job_id,r.feed_id)=(f.tenant_id,f.job_id,f.feed_id) AND r.action='revoke') THEN
      RETURN NULL;
    END IF;
    SELECT * INTO latest FROM app.v2_calendar_feed_revision r
      WHERE (r.tenant_id,r.job_id,r.feed_id)=(f.tenant_id,f.job_id,f.feed_id)
      ORDER BY r.feed_version DESC LIMIT 1;
    -- No tenant, job, firm or member identifiers leave this function.
    RETURN jsonb_build_object('feedId',f.feed_id,'snapshot',latest.snapshot,
      'updatedAt',to_char(latest.recorded_at AT TIME ZONE 'UTC','YYYYMMDD"T"HH24MISS"Z"'));
  END $read$;
  REVOKE ALL ON FUNCTION app.v2_calendar_feed_read(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_calendar_feed_read(text) TO jobguard_runtime;
END
$v2$;
COMMIT;
