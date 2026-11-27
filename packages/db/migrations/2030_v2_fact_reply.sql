BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) OR to_regclass('app.v2_open_fact') IS NULL THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;

  -- A merchant or crew contact the builder recorded for one job. Practice only:
  -- the address must be an invented .invalid one. Never changed; a correction is
  -- a new row pointing at the row it replaces, and keeps the same role.
  CREATE TABLE IF NOT EXISTS app.v2_reply_recipient (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    id uuid NOT NULL,
    role text NOT NULL CHECK (role IN ('merchant', 'crew_member')),
    display_name varchar(120) NOT NULL CHECK (btrim(display_name) <> ''),
    merchant_id uuid CHECK (merchant_id IS NULL OR role = 'merchant'),
    contact_email varchar(254) NOT NULL
      CHECK (contact_email ~ '^[a-z0-9][a-z0-9._+-]*@([a-z0-9-]+\.)+invalid$'),
    corrects_id uuid,
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    recorded_by uuid NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, id),
    UNIQUE (tenant_id, job_id, id, role),
    UNIQUE (tenant_id, job_id, corrects_id),
    CHECK (corrects_id IS DISTINCT FROM id),
    FOREIGN KEY (tenant_id, job_id) REFERENCES app.job (tenant_id, id),
    -- A known merchant's name is copied from the merchant record, never retyped.
    FOREIGN KEY (tenant_id, merchant_id, display_name) REFERENCES app.merchant (tenant_id, id, name),
    FOREIGN KEY (tenant_id, job_id, corrects_id, role) REFERENCES app.v2_reply_recipient (tenant_id, job_id, id, role)
  );

  -- One request for a reply to one E1 fact at one fact version. Customer requests
  -- pin the job's party binding and customer revision; merchant and crew requests
  -- pin one recipient row. The reply token is stored only as a hash.
  CREATE TABLE IF NOT EXISTS app.v2_fact_reply_request (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    id uuid NOT NULL,
    fact_id uuid NOT NULL,
    fact_version integer NOT NULL CHECK (fact_version BETWEEN 1 AND 2147483647),
    recipient_kind text NOT NULL CHECK (recipient_kind IN ('customer', 'merchant', 'crew_member')),
    party_binding_id uuid,
    customer_revision_id uuid,
    recipient_id uuid,
    contact_email varchar(320) NOT NULL CHECK (lower(contact_email) ~ '@([a-z0-9-]+\.)+invalid$'),
    options jsonb CHECK (options IS NULL OR (jsonb_typeof(options) = 'array'
      AND jsonb_array_length(options) BETWEEN 2 AND 6)),
    allow_other boolean NOT NULL DEFAULT false,
    token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    expires_at timestamptz NOT NULL,
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    requested_by uuid NOT NULL,
    requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, id),
    UNIQUE (tenant_id, job_id, id, fact_id, fact_version),
    CHECK ((recipient_kind = 'customer') = (party_binding_id IS NOT NULL AND customer_revision_id IS NOT NULL)),
    CHECK ((recipient_kind = 'customer') = (recipient_id IS NULL)),
    CHECK (options IS NOT NULL OR NOT allow_other),
    CHECK (expires_at > requested_at),
    FOREIGN KEY (tenant_id, job_id, fact_id) REFERENCES app.v2_open_fact (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, job_id, party_binding_id) REFERENCES app.job_party_binding (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, customer_revision_id) REFERENCES app.customer_revision (tenant_id, id),
    FOREIGN KEY (tenant_id, job_id, recipient_id, recipient_kind)
      REFERENCES app.v2_reply_recipient (tenant_id, job_id, id, role)
  );

  CREATE TABLE IF NOT EXISTS app.v2_fact_reply_cancel (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    request_id uuid NOT NULL,
    command_id uuid NOT NULL,
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    cancelled_by uuid NOT NULL,
    cancelled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, request_id),
    UNIQUE (tenant_id, job_id, command_id),
    FOREIGN KEY (tenant_id, job_id, request_id) REFERENCES app.v2_fact_reply_request (tenant_id, job_id, id)
  );

  -- One recorded answer: from the reply link (once per request) or pasted by the
  -- builder from WhatsApp or a call. It answers one fact version. It changes no
  -- E1 fact until the builder applies it.
  CREATE TABLE IF NOT EXISTS app.v2_fact_reply (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    id uuid NOT NULL,
    fact_id uuid NOT NULL,
    fact_version integer NOT NULL CHECK (fact_version BETWEEN 1 AND 2147483647),
    request_id uuid,
    source text NOT NULL CHECK (source IN ('reply_link', 'pasted_by_builder')),
    choice varchar(500) CHECK (choice IS NULL OR btrim(choice) <> ''),
    choice_other boolean,
    delivery_date date,
    available boolean,
    arrangement varchar(500) CHECK (arrangement IS NULL OR btrim(arrangement) <> ''),
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    recorded_by uuid,
    received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, id),
    UNIQUE (tenant_id, job_id, request_id),
    CHECK ((source = 'reply_link') = (request_id IS NOT NULL)),
    CHECK ((source = 'pasted_by_builder') = (recorded_by IS NOT NULL)),
    CHECK (num_nonnulls(choice, delivery_date, available, arrangement) = 1),
    CHECK ((choice IS NULL) = (choice_other IS NULL)),
    FOREIGN KEY (tenant_id, job_id, fact_id) REFERENCES app.v2_open_fact (tenant_id, job_id, id),
    FOREIGN KEY (tenant_id, job_id, request_id, fact_id, fact_version)
      REFERENCES app.v2_fact_reply_request (tenant_id, job_id, id, fact_id, fact_version)
  );

  -- The builder's press that copied a reply into E1's fact. E1's answer uses the
  -- reply id as its command id, so a retried apply replays in both.
  CREATE TABLE IF NOT EXISTS app.v2_fact_reply_applied (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    reply_id uuid NOT NULL,
    fact_version integer NOT NULL CHECK (fact_version BETWEEN 2 AND 2147483647),
    request_digest char(64) NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
    applied_by uuid NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, reply_id),
    FOREIGN KEY (tenant_id, job_id, reply_id) REFERENCES app.v2_fact_reply (tenant_id, job_id, id)
  );

  ALTER TABLE app.v2_reply_recipient ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_reply_recipient FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_fact_reply_request ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_fact_reply_request FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_fact_reply_cancel ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_fact_reply_cancel FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_fact_reply ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_fact_reply FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_fact_reply_applied ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_fact_reply_applied FORCE ROW LEVEL SECURITY;

  -- Builder access: the same firm and job-visibility rule as 2002 to 2009.
  DROP POLICY IF EXISTS v2_reply_recipient_runtime ON app.v2_reply_recipient;
  CREATE POLICY v2_reply_recipient_runtime ON app.v2_reply_recipient TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_reply_recipient.tenant_id, v2_reply_recipient.job_id)
    ));
  DROP POLICY IF EXISTS v2_fact_reply_request_runtime ON app.v2_fact_reply_request;
  CREATE POLICY v2_fact_reply_request_runtime ON app.v2_fact_reply_request TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_fact_reply_request.tenant_id, v2_fact_reply_request.job_id)
    ));
  DROP POLICY IF EXISTS v2_fact_reply_cancel_runtime ON app.v2_fact_reply_cancel;
  CREATE POLICY v2_fact_reply_cancel_runtime ON app.v2_fact_reply_cancel TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_fact_reply_cancel.tenant_id, v2_fact_reply_cancel.job_id)
    ));
  DROP POLICY IF EXISTS v2_fact_reply_runtime ON app.v2_fact_reply;
  CREATE POLICY v2_fact_reply_runtime ON app.v2_fact_reply TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_fact_reply.tenant_id, v2_fact_reply.job_id)
    ));
  DROP POLICY IF EXISTS v2_fact_reply_applied_runtime ON app.v2_fact_reply_applied;
  CREATE POLICY v2_fact_reply_applied_runtime ON app.v2_fact_reply_applied TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_fact_reply_applied.tenant_id, v2_fact_reply_applied.job_id)
    ));

  REVOKE ALL ON app.v2_reply_recipient, app.v2_fact_reply_request, app.v2_fact_reply_cancel,
    app.v2_fact_reply, app.v2_fact_reply_applied FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_reply_recipient, app.v2_fact_reply_request, app.v2_fact_reply_cancel,
    app.v2_fact_reply, app.v2_fact_reply_applied TO jobguard_runtime;

  -- The no-sign-in reply link. Copied from the existing customer portal link
  -- (control_plane.lp11_customer_scope in 0765): a private scope row keyed on the
  -- current transaction id, opened only by the token function below after the
  -- hash lookup and closed before commit. Nothing the caller can set (no GUC)
  -- widens what the token reaches. Runtime gets no direct access to it.
  CREATE UNLOGGED TABLE IF NOT EXISTS control_plane.v2_fact_reply_scope (
    transaction_id xid8 PRIMARY KEY,
    token_hash char(64) NOT NULL,
    tenant_id uuid,
    job_id uuid,
    request_id uuid,
    reply_id uuid,
    audited boolean NOT NULL DEFAULT false
  );
  -- Failed token attempts, for a coarse limit. Times only: no hash, address or token.
  CREATE UNLOGGED TABLE IF NOT EXISTS control_plane.v2_fact_reply_failure (
    failed_at timestamptz NOT NULL DEFAULT clock_timestamp()
  );
  CREATE INDEX IF NOT EXISTS v2_fact_reply_failure_at ON control_plane.v2_fact_reply_failure (failed_at);
  REVOKE ALL ON control_plane.v2_fact_reply_scope, control_plane.v2_fact_reply_failure FROM PUBLIC;
END
$v2$;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR to_regclass('app.v2_fact_reply_request') IS NULL THEN
    RETURN;
  END IF;
  SET LOCAL ROLE jobguard_migration;

  CREATE OR REPLACE FUNCTION app.v2_fact_reply_scoped(t uuid, j uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    SELECT EXISTS (SELECT FROM control_plane.v2_fact_reply_scope s
      WHERE s.transaction_id = pg_current_xact_id_if_assigned() AND (s.tenant_id, s.job_id) = (t, j))
  $f$;
  CREATE OR REPLACE FUNCTION app.v2_fact_reply_scope_token() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    SELECT s.token_hash::text FROM control_plane.v2_fact_reply_scope s
    WHERE s.transaction_id = pg_current_xact_id_if_assigned()
  $f$;
  REVOKE ALL ON FUNCTION app.v2_fact_reply_scoped(uuid, uuid), app.v2_fact_reply_scope_token() FROM PUBLIC;

  -- The token function runs as the table owner. These policies let it read only
  -- the one job its scope row names, and write only that request's reply.
  DROP POLICY IF EXISTS v2_fact_reply_link_lookup ON app.v2_fact_reply_request;
  CREATE POLICY v2_fact_reply_link_lookup ON app.v2_fact_reply_request FOR SELECT TO jobguard_migration
    USING (token_hash::text = app.v2_fact_reply_scope_token() OR app.v2_fact_reply_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_fact_reply_link_read ON app.v2_fact_reply_cancel;
  CREATE POLICY v2_fact_reply_link_read ON app.v2_fact_reply_cancel FOR SELECT TO jobguard_migration
    USING (app.v2_fact_reply_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_fact_reply_link_read ON app.v2_reply_recipient;
  CREATE POLICY v2_fact_reply_link_read ON app.v2_reply_recipient FOR SELECT TO jobguard_migration
    USING (app.v2_fact_reply_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_fact_reply_link_read ON app.v2_fact_reply;
  CREATE POLICY v2_fact_reply_link_read ON app.v2_fact_reply FOR SELECT TO jobguard_migration
    USING (app.v2_fact_reply_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_fact_reply_link_write ON app.v2_fact_reply;
  CREATE POLICY v2_fact_reply_link_write ON app.v2_fact_reply FOR INSERT TO jobguard_migration
    WITH CHECK (source = 'reply_link' AND recorded_by IS NULL AND app.v2_fact_reply_scoped(tenant_id, job_id)
      AND request_id = (SELECT s.request_id FROM control_plane.v2_fact_reply_scope s
        WHERE s.transaction_id = pg_current_xact_id_if_assigned()));
  DROP POLICY IF EXISTS v2_fact_reply_link_read ON app.v2_open_fact;
  CREATE POLICY v2_fact_reply_link_read ON app.v2_open_fact FOR SELECT TO jobguard_migration
    USING (app.v2_fact_reply_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_fact_reply_link_read ON app.v2_open_fact_change;
  CREATE POLICY v2_fact_reply_link_read ON app.v2_open_fact_change FOR SELECT TO jobguard_migration
    USING (app.v2_fact_reply_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_fact_reply_link_read ON app.job_party_current;
  CREATE POLICY v2_fact_reply_link_read ON app.job_party_current FOR SELECT TO jobguard_migration
    USING (app.v2_fact_reply_scoped(tenant_id, job_id));
  DROP POLICY IF EXISTS v2_fact_reply_link_read ON app.job_party_binding;
  CREATE POLICY v2_fact_reply_link_read ON app.job_party_binding FOR SELECT TO jobguard_migration
    USING (app.v2_fact_reply_scoped(tenant_id, job_id));

  -- Whether a request's reply may still be applied: the fact is still at the
  -- requested version, no newer request exists for the fact, the customer's
  -- party binding and revision are unchanged, and a recorded recipient has not
  -- been corrected. Shared by the link (owner) and the builder (runtime).
  CREATE OR REPLACE FUNCTION app.v2_fact_reply_current(r app.v2_fact_reply_request) RETURNS boolean
    LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $f$
    SELECT (SELECT c.expected_version + 1 FROM app.v2_open_fact_change c
        WHERE (c.tenant_id, c.job_id, c.fact_id) = (r.tenant_id, r.job_id, r.fact_id)
        ORDER BY c.expected_version DESC LIMIT 1) = r.fact_version
      AND NOT EXISTS (SELECT FROM app.v2_fact_reply_request n
        WHERE (n.tenant_id, n.job_id, n.fact_id) = (r.tenant_id, r.job_id, r.fact_id)
          AND (n.requested_at, n.id) > (r.requested_at, r.id))
      AND CASE WHEN r.recipient_kind = 'customer' THEN EXISTS (
          SELECT FROM app.job_party_current p JOIN app.job_party_binding b
            ON (b.tenant_id, b.job_id, b.id) = (p.tenant_id, p.job_id, p.binding_id)
          WHERE (p.tenant_id, p.job_id) = (r.tenant_id, r.job_id)
            AND b.id = r.party_binding_id AND b.customer_revision_id = r.customer_revision_id)
        ELSE NOT EXISTS (SELECT FROM app.v2_reply_recipient c
          WHERE (c.tenant_id, c.job_id, c.corrects_id) = (r.tenant_id, r.job_id, r.recipient_id)) END
  $f$;
  REVOKE ALL ON FUNCTION app.v2_fact_reply_current(app.v2_fact_reply_request) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_fact_reply_current(app.v2_fact_reply_request) TO jobguard_runtime;

  -- Applying a reply first records it here, and this insert trigger takes a share lock on the
  -- job row, which app.bind_job_parties() holds FOR UPDATE. Runtime has no UPDATE grant on app.job,
  -- so it can't take the lock itself. apply() then checks the request again as runtime, in a new
  -- statement that sees any rebinding that committed while it waited, before E1's audit write.
  CREATE OR REPLACE FUNCTION app.v2_fact_reply_applied_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  BEGIN
    PERFORM 1 FROM app.job j WHERE (j.tenant_id, j.id) = (NEW.tenant_id, NEW.job_id) FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'REPLY_REFUSED' USING ERRCODE = '42501'; END IF;
    RETURN NEW;
  END $f$;
  REVOKE ALL ON FUNCTION app.v2_fact_reply_applied_guard() FROM PUBLIC;
  DROP TRIGGER IF EXISTS v2_fact_reply_applied_guard ON app.v2_fact_reply_applied;
  CREATE TRIGGER v2_fact_reply_applied_guard BEFORE INSERT ON app.v2_fact_reply_applied
    FOR EACH ROW EXECUTE FUNCTION app.v2_fact_reply_applied_guard();

  -- Open the scope for one token in this transaction and return the request, or
  -- record a failed attempt. A transaction opens at most one scope.
  CREATE OR REPLACE FUNCTION app.v2_fact_reply_scope_open(h text) RETURNS app.v2_fact_reply_request
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE r app.v2_fact_reply_request;
  BEGIN
    IF current_database() <> 'jobguard_v2_local' OR h IS NULL OR h !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'REPLY_REFUSED' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT FROM control_plane.v2_fact_reply_scope WHERE transaction_id = pg_current_xact_id_if_assigned()) THEN
      RAISE EXCEPTION 'REPLY_REFUSED' USING ERRCODE = '42501';
    END IF;
    IF (SELECT count(*) FROM control_plane.v2_fact_reply_failure WHERE failed_at > clock_timestamp() - interval '10 minutes') >= 20 THEN
      RETURN NULL;
    END IF;
    INSERT INTO control_plane.v2_fact_reply_scope (transaction_id, token_hash) VALUES (pg_current_xact_id(), h);
    SELECT * INTO r FROM app.v2_fact_reply_request WHERE token_hash = h;
    IF FOUND THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(r.tenant_id::text || ':' || r.id::text, 2013));
      UPDATE control_plane.v2_fact_reply_scope SET tenant_id = r.tenant_id, job_id = r.job_id, request_id = r.id
      WHERE transaction_id = pg_current_xact_id_if_assigned();
      IF r.expires_at > clock_timestamp() AND NOT EXISTS (SELECT FROM app.v2_fact_reply_cancel c
          WHERE (c.tenant_id, c.job_id, c.request_id) = (r.tenant_id, r.job_id, r.id)) THEN
        RETURN r;
      END IF;
    END IF;
    DELETE FROM control_plane.v2_fact_reply_failure WHERE failed_at < clock_timestamp() - interval '1 day';
    INSERT INTO control_plane.v2_fact_reply_failure DEFAULT VALUES;
    DELETE FROM control_plane.v2_fact_reply_scope WHERE transaction_id = pg_current_xact_id_if_assigned();
    RETURN NULL;
  END $f$;
  REVOKE ALL ON FUNCTION app.v2_fact_reply_scope_open(text) FROM PUBLIC;

  -- What the reply page may show: the one question and, for a customer choice,
  -- its stored options. Never the job, firm, recipient, token or other facts.
  CREATE OR REPLACE FUNCTION app.v2_fact_reply_view(r app.v2_fact_reply_request) RETURNS jsonb
    LANGUAGE sql STABLE SET search_path = pg_catalog, pg_temp AS $f$
    SELECT jsonb_build_object('status', CASE WHEN a.id IS NULL THEN 'open' ELSE 'answered' END,
      'kind', f.kind, 'recipient', r.recipient_kind,
      'question', coalesce(f.choice_question, f.delivery_item, f.crew_need, f.access_need),
      'options', coalesce(r.options, '[]'::jsonb), 'allowOther', r.allow_other,
      'current', app.v2_fact_reply_current(r), 'expiresAt', r.expires_at,
      'answer', CASE WHEN a.id IS NULL THEN NULL ELSE jsonb_strip_nulls(jsonb_build_object('choice', a.choice,
        'other', a.choice_other, 'deliveryDate', a.delivery_date, 'available', a.available,
        'arrangement', a.arrangement)) END,
      'answeredAt', a.received_at)
    FROM app.v2_open_fact f
    LEFT JOIN app.v2_fact_reply a ON (a.tenant_id, a.job_id, a.request_id) = (r.tenant_id, r.job_id, r.id)
    WHERE (f.tenant_id, f.job_id, f.id) = (r.tenant_id, r.job_id, r.fact_id)
  $f$;
  REVOKE ALL ON FUNCTION app.v2_fact_reply_view(app.v2_fact_reply_request) FROM PUBLIC;

  CREATE OR REPLACE FUNCTION app.v2_fact_reply_open(h text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE r app.v2_fact_reply_request; result jsonb;
  BEGIN
    r := app.v2_fact_reply_scope_open(h);
    IF r.id IS NULL THEN RETURN jsonb_build_object('status', 'refused'); END IF;
    result := app.v2_fact_reply_view(r);
    DELETE FROM control_plane.v2_fact_reply_scope WHERE transaction_id = pg_current_xact_id_if_assigned();
    RETURN result;
  END $f$;

  -- Record the one answer a request may receive. An exact retry of the same
  -- command replays; any other second answer is refused. A reply to a question
  -- that changed is kept and marked not current; it is never applied here.
  CREATE OR REPLACE FUNCTION app.v2_fact_reply_receive(h text, c uuid, d text, answer jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE r app.v2_fact_reply_request; kind text; prior app.v2_fact_reply; saved app.v2_fact_reply;
    pick text; other boolean := NULL; delivery date; ok boolean; free text;
  BEGIN
    IF c IS NULL OR d IS NULL OR d !~ '^[0-9a-f]{64}$' OR jsonb_typeof(answer) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'REPLY_INVALID' USING ERRCODE = '22023';
    END IF;
    r := app.v2_fact_reply_scope_open(h);
    IF r.id IS NULL THEN RETURN jsonb_build_object('status', 'refused'); END IF;
    SELECT * INTO prior FROM app.v2_fact_reply WHERE (tenant_id, job_id, request_id) = (r.tenant_id, r.job_id, r.id);
    IF FOUND THEN
      -- Read whether it is current while the scope still lets this function see the job.
      ok := app.v2_fact_reply_current(r);
      DELETE FROM control_plane.v2_fact_reply_scope WHERE transaction_id = pg_current_xact_id_if_assigned();
      IF prior.id = c AND prior.request_digest = d THEN
        RETURN jsonb_build_object('status', 'recorded', 'replayed', true, 'replyId', prior.id, 'jobId', prior.job_id,
          'requestId', r.id, 'factId', r.fact_id, 'factVersion', r.fact_version, 'current', ok);
      END IF;
      RETURN jsonb_build_object('status', 'answered');
    END IF;
    SELECT f.kind INTO kind FROM app.v2_open_fact f WHERE (f.tenant_id, f.job_id, f.id) = (r.tenant_id, r.job_id, r.fact_id);
    -- Exactly one field for the fact's kind; a choice must be a stored label, or
    -- free text only when the request allows "something else".
    IF kind = 'customer_choice' THEN
      IF answer - ARRAY['choice'] = '{}'::jsonb AND jsonb_typeof(answer->'choice') = 'string' THEN
        pick := answer->>'choice'; other := false;
        ok := r.options ? pick;
      ELSIF answer - ARRAY['other'] = '{}'::jsonb AND jsonb_typeof(answer->'other') = 'string' THEN
        pick := btrim(answer->>'other'); other := true;
        ok := r.allow_other AND length(pick) BETWEEN 1 AND 500;
      END IF;
    ELSIF kind = 'merchant_delivery_date' THEN
      ok := answer - ARRAY['deliveryDate'] = '{}'::jsonb AND jsonb_typeof(answer->'deliveryDate') = 'string'
        AND answer->>'deliveryDate' ~ '^\d{4}-\d{2}-\d{2}$' AND pg_input_is_valid(answer->>'deliveryDate', 'date');
      IF ok THEN delivery := (answer->>'deliveryDate')::date; END IF;
    ELSIF kind = 'crew_availability' THEN
      ok := answer - ARRAY['available'] = '{}'::jsonb AND jsonb_typeof(answer->'available') = 'boolean';
    ELSIF kind = 'access' THEN
      free := btrim(answer->>'arrangement');
      ok := answer - ARRAY['arrangement'] = '{}'::jsonb AND jsonb_typeof(answer->'arrangement') = 'string'
        AND length(free) BETWEEN 1 AND 500;
    END IF;
    IF ok IS NOT TRUE THEN RAISE EXCEPTION 'REPLY_INVALID' USING ERRCODE = '22023'; END IF;
    INSERT INTO app.v2_fact_reply (tenant_id, job_id, id, fact_id, fact_version, request_id, source, choice, choice_other,
      delivery_date, available, arrangement, request_digest)
    VALUES (r.tenant_id, r.job_id, c, r.fact_id, r.fact_version, r.id, 'reply_link', pick, other, delivery,
      CASE WHEN kind = 'crew_availability' THEN (answer->>'available')::boolean END, free, d)
    RETURNING * INTO saved;
    -- The audit sealer reads the tenant from this setting; the scope row decides
    -- which single event may be appended (policy v2_fact_reply_link_audit_write, which consumes the allowance).
    PERFORM set_config('app.tenant_id', r.tenant_id::text, true);
    UPDATE control_plane.v2_fact_reply_scope SET reply_id = saved.id WHERE transaction_id = pg_current_xact_id_if_assigned();
    RETURN jsonb_build_object('status', 'recorded', 'replayed', false, 'replyId', saved.id, 'jobId', saved.job_id,
      'requestId', r.id, 'factId', r.fact_id, 'factVersion', r.fact_version, 'current', app.v2_fact_reply_current(r));
  END $f$;

  -- Close the scope after the one audit event; nothing else can use it.
  CREATE OR REPLACE FUNCTION app.v2_fact_reply_close() RETURNS void
    LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    DELETE FROM control_plane.v2_fact_reply_scope WHERE transaction_id = pg_current_xact_id_if_assigned()
  $f$;

  REVOKE ALL ON FUNCTION app.v2_fact_reply_open(text), app.v2_fact_reply_receive(text, uuid, text, jsonb),
    app.v2_fact_reply_close() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_fact_reply_open(text), app.v2_fact_reply_receive(text, uuid, text, jsonb),
    app.v2_fact_reply_close() TO jobguard_runtime;

  -- The link has no signed-in member, so the existing sealer finds no request
  -- binding. Allow it exactly one event: the received reply this transaction's
  -- scope recorded, with that job as subject and that reply as command.
  -- Reading a sealed row back checks the scope only.
  CREATE OR REPLACE FUNCTION app.v2_fact_reply_audit_tenant(event_type text, subject_type text, subject_ref text,
    command_ref text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
    SELECT s.tenant_id FROM control_plane.v2_fact_reply_scope s
    WHERE s.transaction_id = pg_current_xact_id_if_assigned() AND s.reply_id IS NOT NULL
      AND event_type = 'v2.fact_reply.received' AND subject_type = 'job'
      AND subject_ref = s.job_id::text AND command_ref = s.reply_id::text
  $f$;
  REVOKE ALL ON FUNCTION app.v2_fact_reply_audit_tenant(text, text, text, text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_fact_reply_audit_tenant(text, text, text, text) TO jobguard_audit_writer;
  -- Writing one consumes the allowance in the same statement, and the event must
  -- carry the stored reply's own references and request hash. A second append,
  -- or one with other content, is refused even before the scope is closed.
  CREATE OR REPLACE FUNCTION app.v2_fact_reply_audit_take(event_type text, subject_type text, subject_ref text,
    payload jsonb) RETURNS uuid
    LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $f$
  DECLARE s control_plane.v2_fact_reply_scope; a app.v2_fact_reply;
  BEGIN
    SELECT * INTO s FROM control_plane.v2_fact_reply_scope
    WHERE transaction_id = pg_current_xact_id_if_assigned() AND reply_id IS NOT NULL AND NOT audited FOR UPDATE;
    IF NOT FOUND OR event_type IS DISTINCT FROM 'v2.fact_reply.received' OR subject_type IS DISTINCT FROM 'job'
        OR subject_ref IS DISTINCT FROM s.job_id::text THEN
      RETURN NULL;
    END IF;
    SELECT * INTO a FROM app.v2_fact_reply WHERE (tenant_id, job_id, id) = (s.tenant_id, s.job_id, s.reply_id);
    IF NOT FOUND OR payload->'references'->>'commandId' IS DISTINCT FROM a.id::text
        OR payload->'references'->>'replyId' IS DISTINCT FROM a.id::text
        OR payload->'references'->>'requestId' IS DISTINCT FROM a.request_id::text
        OR payload->'references'->>'factId' IS DISTINCT FROM a.fact_id::text
        OR payload->'references'->>'factVersion' IS DISTINCT FROM a.fact_version::text
        OR payload->'references'->>'source' IS DISTINCT FROM a.source
        OR payload->'hashes'->>'request' IS DISTINCT FROM a.request_digest::text THEN
      RETURN NULL;
    END IF;
    UPDATE control_plane.v2_fact_reply_scope SET audited = true WHERE transaction_id = s.transaction_id;
    RETURN s.tenant_id;
  END $f$;
  REVOKE ALL ON FUNCTION app.v2_fact_reply_audit_take(text, text, text, jsonb) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_fact_reply_audit_take(text, text, text, jsonb) TO jobguard_audit_writer;
  DROP POLICY IF EXISTS v2_fact_reply_link_audit ON app.audit_event;
  DROP POLICY IF EXISTS v2_fact_reply_link_audit_read ON app.audit_event;
  CREATE POLICY v2_fact_reply_link_audit_read ON app.audit_event FOR SELECT TO jobguard_audit_writer
    USING (tenant_id = app.v2_fact_reply_audit_tenant(app.lp11_audit_event_type(audit_event), subject_type, subject_ref,
      payload->'references'->>'commandId'));
  DROP POLICY IF EXISTS v2_fact_reply_link_audit_write ON app.audit_event;
  CREATE POLICY v2_fact_reply_link_audit_write ON app.audit_event FOR INSERT TO jobguard_audit_writer
    WITH CHECK (tenant_id = app.v2_fact_reply_audit_take(app.lp11_audit_event_type(audit_event), subject_type, subject_ref,
      payload));
END
$v2$;
COMMIT;
