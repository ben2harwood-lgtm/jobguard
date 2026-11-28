BEGIN;
DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;
  SET LOCAL ROLE jobguard_migration;
  CREATE TABLE IF NOT EXISTS app.v2_rams_draft (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    command_id uuid NOT NULL,
    revision integer NOT NULL CHECK (revision > 0),
    quote_revision_id uuid NOT NULL,
    plan_version integer NOT NULL CHECK (plan_version >= 0),
    request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    snapshot jsonb NOT NULL CHECK ((
      jsonb_typeof(snapshot) = 'object'
      AND snapshot->>'version' = 'rams-draft.v1'
      AND snapshot->>'environment' = 'synthetic_demo'
      AND snapshot->>'status' IN ('draft','signed')
      AND snapshot->>'jobId' = job_id::text
      AND (snapshot->>'revision')::integer = revision
      AND snapshot->>'quoteRevisionId' = quote_revision_id::text
      AND (snapshot->>'planVersion')::integer = plan_version
      AND snapshot->>'actorMembershipId' = actor_membership_id::text
      AND jsonb_typeof(snapshot->'sections') = 'array'
      AND (snapshot->>'status' <> 'signed' OR
        (snapshot->>'signedBy' = actor_membership_id::text AND snapshot->>'signedAt' IS NOT NULL AND length(btrim(snapshot->>'signedName')) BETWEEN 1 AND 100))
    ) IS TRUE),
    actor_membership_id uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id,job_id,command_id),
    UNIQUE (tenant_id,job_id,revision),
    FOREIGN KEY (tenant_id,job_id,quote_revision_id)
      REFERENCES app.v2_work_plan (tenant_id,job_id,quote_revision_id)
  );
  ALTER TABLE app.v2_rams_draft ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_rams_draft FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_rams_draft_runtime ON app.v2_rams_draft;
  CREATE POLICY v2_rams_draft_runtime ON app.v2_rams_draft TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(v2_rams_draft.tenant_id,v2_rams_draft.job_id)
    ));
  -- V2 linked practice firms share one backing tenant: the same restrictive firm rule as 2001/2047.
  IF NOT EXISTS (SELECT FROM pg_policy WHERE polrelid = 'app.v2_rams_draft'::regclass AND polname = 'v2_practice_firm') THEN
    CREATE POLICY v2_practice_firm ON app.v2_rams_draft AS RESTRICTIVE FOR ALL TO jobguard_runtime
      USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(v2_rams_draft.tenant_id,v2_rams_draft.job_id)));
  END IF;
  REVOKE ALL ON app.v2_rams_draft FROM PUBLIC, jobguard_runtime;
  GRANT SELECT,INSERT ON app.v2_rams_draft TO jobguard_runtime;
END
$v2$;
COMMIT;
