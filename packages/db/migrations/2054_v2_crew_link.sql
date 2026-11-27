-- Q52 / V2-F7M. "My brief" for a crew member by their own link (no sign-in).
-- A link is stored as a hash only. The link side reaches the database only
-- through the narrow owner functions below, on a per-transaction scope row,
-- copied from E2's reply link (2029) under its own names.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) OR to_regclass('app.v2_brief_progress') IS NULL OR to_regclass('app.v2_crew_contact') IS NULL THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;

  -- One link for one crew record, one trade and one job. Never changed: a new link
  -- replaces an older one for the same crew member and trade on the job.
  CREATE TABLE IF NOT EXISTS app.v2_crew_link (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    id uuid NOT NULL,
    command_id uuid NOT NULL,
    firm_key text NOT NULL CHECK (firm_key ~ '^practice:[a-f0-9]{64}$'),
    crew_id uuid NOT NULL,
    crew_revision integer NOT NULL CHECK (crew_revision BETWEEN 1 AND 2147483647),
    trade varchar(100) NOT NULL CHECK (btrim(trade) <> ''),
    token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    expires_at timestamptz NOT NULL,
    actor_membership_id uuid NOT NULL,
    PRIMARY KEY (tenant_id, job_id, id),
    UNIQUE (tenant_id, command_id),
    CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '30 days'),
    FOREIGN KEY (tenant_id, job_id) REFERENCES app.job (tenant_id, id),
    FOREIGN KEY (tenant_id, firm_key, crew_id, crew_revision)
      REFERENCES app.v2_crew_contact (tenant_id, firm_key, crew_id, revision)
  );

  CREATE TABLE IF NOT EXISTS app.v2_crew_link_cancel (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    link_id uuid NOT NULL,
    command_id uuid NOT NULL,
    actor_membership_id uuid NOT NULL,
    cancelled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, link_id),
    UNIQUE (tenant_id, command_id),
    FOREIGN KEY (tenant_id, job_id, link_id) REFERENCES app.v2_crew_link (tenant_id, job_id, id)
  );

  -- A crew member's press, by link. An observation only: F2's status never counts it,
  -- and it moves no money or close-out. The builder confirms it with an ordinary F1
  -- press. No watchdog trigger (that guard needs a bound request actor); the link
  -- function checks the job is live itself. seen_head is the F1 task head the page showed.
  CREATE TABLE IF NOT EXISTS app.v2_crew_progress (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    command_id uuid NOT NULL,
    crew_link_id uuid NOT NULL,
    trade varchar(100) NOT NULL CHECK (btrim(trade) <> ''),
    brief_version integer NOT NULL CHECK (brief_version BETWEEN 0 AND 2147483645),
    scope_item_id uuid NOT NULL,
    task_key varchar(200) NOT NULL CHECK (btrim(task_key) <> ''),
    kind text NOT NULL CHECK (kind IN ('done', 'blocked', 'changed')),
    note varchar(2000) NOT NULL CHECK (kind = 'done' OR btrim(note) <> ''),
    seen_head integer NOT NULL CHECK (seen_head BETWEEN 0 AND 2147483646),
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, command_id),
    FOREIGN KEY (tenant_id, job_id, crew_link_id) REFERENCES app.v2_crew_link (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, job_id, trade, brief_version)
      REFERENCES app.v2_crew_brief (tenant_id, job_id, trade, expected_version),
    FOREIGN KEY (tenant_id, job_id, scope_item_id) REFERENCES app.scope_identity (tenant_id, job_id, id)
  );

  -- The link names a crew record of the job's own firm, for that record's trade.
  -- AFTER INSERT, so row security refuses an outsider's row (42501) first.
  CREATE OR REPLACE FUNCTION app.v2_crew_link_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $guard$
  BEGIN
    IF NOT EXISTS (
      SELECT FROM app.job j JOIN app.v2_crew_contact c
        ON (c.tenant_id, c.firm_key, c.crew_id, c.revision) = (NEW.tenant_id, NEW.firm_key, NEW.crew_id, NEW.crew_revision)
      WHERE (j.tenant_id, j.id) = (NEW.tenant_id, NEW.job_id)
        AND NEW.firm_key = 'practice:' || j.practice_session_digest AND c.trade = NEW.trade
    ) THEN
      RAISE EXCEPTION 'CREW_LINK_CREW_UNAVAILABLE' USING ERRCODE = '23503';
    END IF;
    RETURN NULL;
  END $guard$;
  DROP TRIGGER IF EXISTS v2_crew_link_guard ON app.v2_crew_link;
  CREATE TRIGGER v2_crew_link_guard AFTER INSERT ON app.v2_crew_link
    FOR EACH ROW EXECUTE FUNCTION app.v2_crew_link_guard();

  ALTER TABLE app.v2_crew_link ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_crew_link FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_crew_link_cancel ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_crew_link_cancel FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_crew_progress ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_crew_progress FORCE ROW LEVEL SECURITY;
  -- V2 practice firms share one backing tenant: firm as well as job visibility.
  DROP POLICY IF EXISTS v2_crew_link_runtime ON app.v2_crew_link;
  CREATE POLICY v2_crew_link_runtime ON app.v2_crew_link TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND firm_key = (SELECT app.current_firm_profile_key())
      AND EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_crew_link.tenant_id, v2_crew_link.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND firm_key = (SELECT app.current_firm_profile_key())
      AND EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_crew_link.tenant_id, v2_crew_link.job_id)));
  DROP POLICY IF EXISTS v2_crew_link_cancel_runtime ON app.v2_crew_link_cancel;
  CREATE POLICY v2_crew_link_cancel_runtime ON app.v2_crew_link_cancel TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.v2_crew_link l WHERE (l.tenant_id, l.job_id, l.id)
        = (v2_crew_link_cancel.tenant_id, v2_crew_link_cancel.job_id, v2_crew_link_cancel.link_id)));
  -- Builder read only: the link side writes crew presses through its owner function.
  DROP POLICY IF EXISTS v2_crew_progress_runtime ON app.v2_crew_progress;
  CREATE POLICY v2_crew_progress_runtime ON app.v2_crew_progress FOR SELECT TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.v2_crew_link l WHERE (l.tenant_id, l.job_id, l.id)
        = (v2_crew_progress.tenant_id, v2_crew_progress.job_id, v2_crew_progress.crew_link_id)));
  REVOKE ALL ON app.v2_crew_link, app.v2_crew_link_cancel, app.v2_crew_progress
    FROM PUBLIC, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_crew_link, app.v2_crew_link_cancel TO jobguard_runtime;
  GRANT SELECT ON app.v2_crew_progress TO jobguard_runtime;
  DROP TRIGGER IF EXISTS v2_crew_progress_immutable ON app.v2_crew_progress;
  CREATE TRIGGER v2_crew_progress_immutable BEFORE UPDATE OR DELETE ON app.v2_crew_progress
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  DROP TRIGGER IF EXISTS v2_crew_link_immutable ON app.v2_crew_link;
  CREATE TRIGGER v2_crew_link_immutable BEFORE UPDATE OR DELETE ON app.v2_crew_link
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();
  DROP TRIGGER IF EXISTS v2_crew_link_cancel_immutable ON app.v2_crew_link_cancel;
  CREATE TRIGGER v2_crew_link_cancel_immutable BEFORE UPDATE OR DELETE ON app.v2_crew_link_cancel
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

  -- The private per-transaction scope, as E2's control_plane.v2_fact_reply_scope.
  CREATE UNLOGGED TABLE IF NOT EXISTS control_plane.v2_crew_link_scope (
    transaction_id xid8 PRIMARY KEY,
    token_hash char(64) NOT NULL,
    tenant_id uuid,
    job_id uuid,
    link_id uuid,
    firm_key text,
    crew_id uuid,
    progress_id uuid,
    audited boolean NOT NULL DEFAULT false
  );
  -- Failed attempts, for a coarse limit. Times only: no hash, link or token.
  CREATE UNLOGGED TABLE IF NOT EXISTS control_plane.v2_crew_link_failure (
    failed_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  CREATE INDEX IF NOT EXISTS v2_crew_link_failure_at ON control_plane.v2_crew_link_failure (failed_at);
  REVOKE ALL ON control_plane.v2_crew_link_scope, control_plane.v2_crew_link_failure FROM PUBLIC;
END
$v2$;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR to_regclass('app.v2_crew_link') IS NULL THEN
    RETURN;
  END IF;
  SET LOCAL ROLE jobguard_migration;

  CREATE OR REPLACE FUNCTION app.v2_crew_link_scoped(t uuid, j uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    SELECT EXISTS (SELECT FROM control_plane.v2_crew_link_scope s
      WHERE s.transaction_id = pg_current_xact_id_if_assigned() AND (s.tenant_id, s.job_id) = (t, j))
  $f$;
  CREATE OR REPLACE FUNCTION app.v2_crew_link_scoped_crew(t uuid, f text, c uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    SELECT EXISTS (SELECT FROM control_plane.v2_crew_link_scope s
      WHERE s.transaction_id = pg_current_xact_id_if_assigned() AND (s.tenant_id, s.firm_key, s.crew_id) = (t, f, c))
  $f$;
  CREATE OR REPLACE FUNCTION app.v2_crew_link_scope_token() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    SELECT s.token_hash::text FROM control_plane.v2_crew_link_scope s
    WHERE s.transaction_id = pg_current_xact_id_if_assigned()
  $f$;
  REVOKE ALL ON FUNCTION app.v2_crew_link_scoped(uuid, uuid), app.v2_crew_link_scoped_crew(uuid, text, uuid),
    app.v2_crew_link_scope_token() FROM PUBLIC;

  -- The link functions run as the table owner. These policies let them read only
  -- the one job (and the one crew record) the scope row names.
  DROP POLICY IF EXISTS v2_crew_link_lookup ON app.v2_crew_link;
  CREATE POLICY v2_crew_link_lookup ON app.v2_crew_link FOR SELECT TO jobguard_migration
    USING (token_hash::text = app.v2_crew_link_scope_token() OR app.v2_crew_link_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_crew_link_read ON app.v2_crew_link_cancel;
  CREATE POLICY v2_crew_link_read ON app.v2_crew_link_cancel FOR SELECT TO jobguard_migration
    USING (app.v2_crew_link_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_crew_link_read ON app.v2_crew_contact;
  CREATE POLICY v2_crew_link_read ON app.v2_crew_contact FOR SELECT TO jobguard_migration
    USING (app.v2_crew_link_scoped_crew(tenant_id, firm_key, crew_id));
  DROP POLICY IF EXISTS v2_crew_link_read ON app.v2_crew_brief;
  CREATE POLICY v2_crew_link_read ON app.v2_crew_brief FOR SELECT TO jobguard_migration
    USING (app.v2_crew_link_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_crew_link_read ON app.v2_brief_progress;
  CREATE POLICY v2_crew_link_read ON app.v2_brief_progress FOR SELECT TO jobguard_migration
    USING (app.v2_crew_link_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_crew_link_read ON app.v2_work_plan;
  CREATE POLICY v2_crew_link_read ON app.v2_work_plan FOR SELECT TO jobguard_migration
    USING (app.v2_crew_link_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_crew_link_read ON app.v2_crew_progress;
  CREATE POLICY v2_crew_link_read ON app.v2_crew_progress FOR SELECT TO jobguard_migration
    USING (app.v2_crew_link_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_crew_link_write ON app.v2_crew_progress;
  CREATE POLICY v2_crew_link_write ON app.v2_crew_progress FOR INSERT TO jobguard_migration
    WITH CHECK (app.v2_crew_link_scoped(tenant_id, job_id) AND crew_link_id = (SELECT s.link_id
      FROM control_plane.v2_crew_link_scope s WHERE s.transaction_id = pg_current_xact_id_if_assigned()));
  -- The job's state only, for the link function's own live check.
  DROP POLICY IF EXISTS v2_crew_link_job ON app.job;
  CREATE POLICY v2_crew_link_job ON app.job FOR SELECT TO jobguard_migration
    USING (app.v2_crew_link_scoped(tenant_id, id));
  DROP POLICY IF EXISTS v2_crew_link_read ON app.v2_work_plan_edit;
  CREATE POLICY v2_crew_link_read ON app.v2_work_plan_edit FOR SELECT TO jobguard_migration
    USING (app.v2_crew_link_scoped(tenant_id, job_id));

  -- Open the scope for one token in this transaction and return the link, or record
  -- a failed attempt. Only the newest live link for its crew member and trade opens,
  -- and only while the crew record it names is that record's newest revision.
  CREATE OR REPLACE FUNCTION app.v2_crew_link_scope_open(h text) RETURNS app.v2_crew_link
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE l app.v2_crew_link;
  BEGIN
    IF current_database() <> 'jobguard_v2_local' OR h IS NULL OR h !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'CREW_LINK_REFUSED' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT FROM control_plane.v2_crew_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned()) THEN
      RAISE EXCEPTION 'CREW_LINK_REFUSED' USING ERRCODE = '42501';
    END IF;
    INSERT INTO control_plane.v2_crew_link_scope (transaction_id, token_hash) VALUES (pg_current_xact_id(), h);
    SELECT * INTO l FROM app.v2_crew_link WHERE token_hash = h;
    IF FOUND THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(l.tenant_id::text || ':' || l.id::text, 2041));
      UPDATE control_plane.v2_crew_link_scope SET tenant_id = l.tenant_id, job_id = l.job_id, link_id = l.id,
        firm_key = l.firm_key, crew_id = l.crew_id
      WHERE transaction_id = pg_current_xact_id_if_assigned();
      IF l.expires_at > clock_timestamp()
        AND NOT EXISTS (SELECT FROM app.v2_crew_link_cancel c
          WHERE (c.tenant_id, c.job_id, c.link_id) = (l.tenant_id, l.job_id, l.id))
        AND NOT EXISTS (SELECT FROM app.v2_crew_link n
          WHERE (n.tenant_id, n.job_id, n.crew_id, n.trade) = (l.tenant_id, l.job_id, l.crew_id, l.trade)
            AND (n.issued_at, n.id) > (l.issued_at, l.id))
        AND (SELECT max(c.revision) FROM app.v2_crew_contact c
          WHERE (c.tenant_id, c.firm_key, c.crew_id) = (l.tenant_id, l.firm_key, l.crew_id)) = l.crew_revision THEN
        RETURN l;
      END IF;
    END IF;
    -- Failed attempts are recorded for monitoring, capped per ten minutes so guessing cannot grow the table.
    -- They never refuse a valid link: tokens are 256-bit, so guessing is not a practical attack.
    DELETE FROM control_plane.v2_crew_link_failure WHERE failed_at < clock_timestamp() - interval '1 day';
    IF (SELECT count(*) FROM control_plane.v2_crew_link_failure WHERE failed_at > clock_timestamp() - interval '10 minutes') < 20 THEN
      INSERT INTO control_plane.v2_crew_link_failure DEFAULT VALUES;
    END IF;
    DELETE FROM control_plane.v2_crew_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned();
    RETURN NULL;
  END $f$;
  REVOKE ALL ON FUNCTION app.v2_crew_link_scope_open(text) FROM PUBLIC;

  -- What the crew page may show: the trade, the crew member's own name and the
  -- latest generated brief for the trade, each task with its latest recorded kind
  -- and note. Never a price, value, customer, other trade or job, phone, email or token.
  -- briefChanged is conservative: any plan edit or new accepted plan since the brief.
  CREATE OR REPLACE FUNCTION app.v2_crew_link_view(l app.v2_crew_link) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $f$
    WITH brief AS (
      SELECT b.expected_version + 1 AS version, b.content, b.recorded_at FROM app.v2_crew_brief b
      WHERE (b.tenant_id, b.job_id, b.trade) = (l.tenant_id, l.job_id, l.trade)
      ORDER BY b.expected_version DESC LIMIT 1
    )
    SELECT jsonb_build_object('status', 'open', 'trade', l.trade, 'expiresAt', l.expires_at,
      'crewName', (SELECT c.display_name FROM app.v2_crew_contact c
        WHERE (c.tenant_id, c.firm_key, c.crew_id, c.revision) = (l.tenant_id, l.firm_key, l.crew_id, l.crew_revision)),
      'brief', (SELECT jsonb_build_object('version', brief.version,
        'accessWindow', brief.content->>'accessWindow',
        'proofNeeded', coalesce(brief.content->'proofNeeded', '[]'::jsonb),
        'changed', EXISTS (SELECT FROM app.v2_work_plan_edit e
            WHERE (e.tenant_id, e.job_id) = (l.tenant_id, l.job_id) AND e.recorded_at > brief.recorded_at)
          OR EXISTS (SELECT FROM app.v2_work_plan p
            WHERE (p.tenant_id, p.job_id) = (l.tenant_id, l.job_id) AND p.created_at > brief.recorded_at),
        'tasks', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'scopeItemId', t->>'scopeItemId', 'taskKey', t->>'taskKey', 'title', t->>'title',
            'scope', t->'scope', 'durationMinutes', t->'durationMinutes', 'visit', t->'visit',
            'proofNeeded', coalesce(t->'proofNeeded', '[]'::jsonb),
            'version', coalesce(p.version, 0), 'latest', CASE WHEN p.kind IS NULL THEN NULL
              ELSE jsonb_build_object('kind', p.kind, 'note', p.note, 'recordedAt', p.recorded_at) END,
            'reported', CASE WHEN o.kind IS NULL THEN NULL
              ELSE jsonb_build_object('kind', o.kind, 'note', o.note, 'recordedAt', o.recorded_at) END)
            ORDER BY (t->>'position')::int)
          FROM jsonb_array_elements(brief.content->'tasks') t
          LEFT JOIN LATERAL (SELECT r.expected_version + 1 AS version, r.kind, r.note, r.recorded_at
            FROM app.v2_brief_progress r
            WHERE (r.tenant_id, r.job_id, r.trade, r.scope_item_id, r.task_key)
              = (l.tenant_id, l.job_id, l.trade, (t->>'scopeItemId')::uuid, t->>'taskKey')
            ORDER BY r.expected_version DESC LIMIT 1) p ON true
          -- This link's own latest observation on the task, so a reopened link shows what the crew sent.
          LEFT JOIN LATERAL (SELECT o.kind, o.note, o.recorded_at FROM app.v2_crew_progress o
            WHERE (o.tenant_id, o.job_id, o.crew_link_id, o.scope_item_id, o.task_key)
              = (l.tenant_id, l.job_id, l.id, (t->>'scopeItemId')::uuid, t->>'taskKey')
            ORDER BY o.recorded_at DESC, o.command_id DESC LIMIT 1) o ON true
          -- Only tasks this crew member may act on: unassigned ones and their own, by F1's ownerRef (a crew
          -- record id), never by display name. Receive reads this view, so a hidden task is refused too.
          WHERE t->>'ownerRef' IS NULL OR t->>'ownerRef' = l.crew_id::text), '[]'::jsonb))
        FROM brief))
  $f$;
  REVOKE ALL ON FUNCTION app.v2_crew_link_view(app.v2_crew_link) FROM PUBLIC;

  CREATE OR REPLACE FUNCTION app.v2_crew_link_open(h text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE l app.v2_crew_link; result jsonb;
  BEGIN
    l := app.v2_crew_link_scope_open(h);
    IF l.id IS NULL THEN RETURN jsonb_build_object('status', 'refused'); END IF;
    result := app.v2_crew_link_view(l);
    DELETE FROM control_plane.v2_crew_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned();
    RETURN result;
  END $f$;

  -- Record one crew press. An exact retry replays; the same id with another body is
  -- refused. The job must be live (the rule app.require_watchdog_live applies, read
  -- here directly: that routine needs a bound request actor, which a link has none of).
  CREATE OR REPLACE FUNCTION app.v2_crew_link_receive(h text, c uuid, d text, k text, scope uuid, task text,
    brief integer, n text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE l app.v2_crew_link; v jsonb; prior app.v2_crew_progress; saved app.v2_crew_progress; head integer; lifecycle text;
  BEGIN
    IF c IS NULL OR d IS NULL OR d !~ '^[0-9a-f]{64}$' OR k NOT IN ('done', 'blocked', 'changed') OR scope IS NULL
        OR task IS NULL OR brief IS NULL OR n IS NULL OR length(n) > 2000 OR (k <> 'done' AND btrim(n) = '') THEN
      RAISE EXCEPTION 'CREW_LINK_INVALID' USING ERRCODE = '22023';
    END IF;
    l := app.v2_crew_link_scope_open(h);
    IF l.id IS NULL THEN RETURN jsonb_build_object('status', 'refused'); END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('crew_progress:' || l.job_id::text, 2041));
    SELECT * INTO prior FROM app.v2_crew_progress WHERE (tenant_id, command_id) = (l.tenant_id, c);
    IF FOUND THEN
      DELETE FROM control_plane.v2_crew_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned();
      IF prior.crew_link_id = l.id AND prior.request_digest = d THEN
        RETURN jsonb_build_object('status', 'recorded', 'replayed', true, 'commandId', prior.command_id,
          'jobId', prior.job_id, 'linkId', l.id, 'kind', prior.kind, 'recordedAt', prior.recorded_at);
      END IF;
      RETURN jsonb_build_object('status', 'conflict');
    END IF;
    SELECT j.status INTO lifecycle FROM app.job j WHERE (j.tenant_id, j.id) = (l.tenant_id, l.job_id) FOR SHARE;
    v := app.v2_crew_link_view(l);
    IF lifecycle IS DISTINCT FROM 'live' OR v->'brief' IS NULL OR v->'brief' = 'null'::jsonb
        OR (v->'brief'->>'changed')::boolean OR (v->'brief'->>'version')::integer IS DISTINCT FROM brief + 1 THEN
      DELETE FROM control_plane.v2_crew_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned();
      RETURN jsonb_build_object('status', 'stale');
    END IF;
    SELECT (t->>'version')::integer INTO head FROM jsonb_array_elements(v->'brief'->'tasks') t
    WHERE t->>'scopeItemId' = scope::text AND t->>'taskKey' = task;
    IF NOT FOUND THEN
      DELETE FROM control_plane.v2_crew_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned();
      RETURN jsonb_build_object('status', 'refused');
    END IF;
    INSERT INTO app.v2_crew_progress (tenant_id, job_id, command_id, crew_link_id, trade, brief_version, scope_item_id,
      task_key, kind, note, seen_head, request_digest)
    VALUES (l.tenant_id, l.job_id, c, l.id, l.trade, brief, scope, task, k, btrim(n), head, d)
    RETURNING * INTO saved;
    -- The audit sealer reads the tenant from this setting; the scope row decides which
    -- single event may be appended (policy v2_crew_link_audit_write consumes the allowance).
    PERFORM set_config('app.tenant_id', l.tenant_id::text, true);
    UPDATE control_plane.v2_crew_link_scope SET progress_id = saved.command_id
    WHERE transaction_id = pg_current_xact_id_if_assigned();
    RETURN jsonb_build_object('status', 'recorded', 'replayed', false, 'commandId', saved.command_id,
      'jobId', saved.job_id, 'linkId', l.id, 'kind', saved.kind, 'recordedAt', saved.recorded_at);
  END $f$;

  CREATE OR REPLACE FUNCTION app.v2_crew_link_close() RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    DELETE FROM control_plane.v2_crew_link_scope WHERE transaction_id = pg_current_xact_id_if_assigned()
  $f$;

  REVOKE ALL ON FUNCTION app.v2_crew_link_open(text),
    app.v2_crew_link_receive(text, uuid, text, text, uuid, text, integer, text), app.v2_crew_link_close() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_crew_link_open(text),
    app.v2_crew_link_receive(text, uuid, text, text, uuid, text, integer, text), app.v2_crew_link_close() TO jobguard_runtime;

  -- The link has no signed-in member, so the existing sealer finds no request binding.
  -- Allow it exactly one event: the crew press this transaction's scope recorded,
  -- with that job as subject and that press as command (copied from E2, 2029).
  CREATE OR REPLACE FUNCTION app.v2_crew_link_audit_tenant(event_type text, subject_type text, subject_ref text,
    command_ref text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    SELECT s.tenant_id FROM control_plane.v2_crew_link_scope s
    WHERE s.transaction_id = pg_current_xact_id_if_assigned() AND s.progress_id IS NOT NULL
      AND event_type = 'v2.crew_progress.recorded' AND subject_type = 'job'
      AND subject_ref = s.job_id::text AND command_ref = s.progress_id::text
  $f$;
  REVOKE ALL ON FUNCTION app.v2_crew_link_audit_tenant(text, text, text, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_crew_link_audit_tenant(text, text, text, text) TO jobguard_audit_writer;
  CREATE OR REPLACE FUNCTION app.v2_crew_link_audit_take(event_type text, subject_type text, subject_ref text,
    payload jsonb) RETURNS uuid
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE s control_plane.v2_crew_link_scope; p app.v2_crew_progress;
  BEGIN
    SELECT * INTO s FROM control_plane.v2_crew_link_scope
    WHERE transaction_id = pg_current_xact_id_if_assigned() AND progress_id IS NOT NULL AND NOT audited FOR UPDATE;
    IF NOT FOUND OR event_type IS DISTINCT FROM 'v2.crew_progress.recorded' OR subject_type IS DISTINCT FROM 'job'
        OR subject_ref IS DISTINCT FROM s.job_id::text THEN
      RETURN NULL;
    END IF;
    SELECT * INTO p FROM app.v2_crew_progress WHERE (tenant_id, command_id) = (s.tenant_id, s.progress_id);
    IF NOT FOUND OR payload->'references'->>'commandId' IS DISTINCT FROM p.command_id::text
        OR payload->'references'->>'linkId' IS DISTINCT FROM p.crew_link_id::text
        OR payload->'references'->>'scopeItemId' IS DISTINCT FROM p.scope_item_id::text
        OR payload->'references'->>'taskKey' IS DISTINCT FROM p.task_key
        OR payload->'references'->>'kind' IS DISTINCT FROM p.kind
        OR payload->'references'->>'briefVersion' IS DISTINCT FROM (p.brief_version + 1)::text
        OR payload->'hashes'->>'request' IS DISTINCT FROM p.request_digest::text THEN
      RETURN NULL;
    END IF;
    UPDATE control_plane.v2_crew_link_scope SET audited = true WHERE transaction_id = s.transaction_id;
    RETURN s.tenant_id;
  END $f$;
  REVOKE ALL ON FUNCTION app.v2_crew_link_audit_take(text, text, text, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_crew_link_audit_take(text, text, text, jsonb) TO jobguard_audit_writer;
  DROP POLICY IF EXISTS v2_crew_link_audit_read ON app.audit_event;
  CREATE POLICY v2_crew_link_audit_read ON app.audit_event FOR SELECT TO jobguard_audit_writer
    USING (tenant_id = app.v2_crew_link_audit_tenant(app.lp11_audit_event_type(audit_event), subject_type, subject_ref,
      payload->'references'->>'commandId'));
  DROP POLICY IF EXISTS v2_crew_link_audit_write ON app.audit_event;
  CREATE POLICY v2_crew_link_audit_write ON app.audit_event FOR INSERT TO jobguard_audit_writer
    WITH CHECK (tenant_id = app.v2_crew_link_audit_take(app.lp11_audit_event_type(audit_event), subject_type, subject_ref,
      payload));
END
$v2$;
COMMIT;
