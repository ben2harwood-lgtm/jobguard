BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;
  -- One phone walk-round of a job. The device's start time is its own claim;
  -- the server records when the session reached it.
  CREATE TABLE IF NOT EXISTS app.v2_walk_session (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    id uuid NOT NULL,
    actor_membership_id uuid NOT NULL,
    device_started_at timestamptz NOT NULL,
    server_received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, job_id, id),
    UNIQUE (tenant_id, id),
    FOREIGN KEY (tenant_id, job_id) REFERENCES app.job (tenant_id, id)
  );

  -- Append-only revisions of the walk's ordered entries. The phone numbers each
  -- entry in capture order; a note, measurement or photo belongs to the room
  -- entry with the nearest lower number. Device time and photo metadata never
  -- choose the room. A photo ID shares the evidence upload ID space; its
  -- final verification stays on that upload and is read live, never copied.
  CREATE TABLE IF NOT EXISTS app.v2_walk_entry (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    session_id uuid NOT NULL,
    capture_order integer NOT NULL CHECK (capture_order BETWEEN 1 AND 100000),
    expected_version integer NOT NULL CHECK (expected_version BETWEEN 0 AND 2147483646),
    command_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('room', 'note', 'measurement', 'photo')),
    room_label varchar(80) CHECK (btrim(room_label) <> ''),
    note_text varchar(4000) CHECK (btrim(note_text) <> ''),
    quantity varchar(40) CHECK (quantity ~ '^(0|[1-9][0-9]*)([.][0-9]{1,6})?$' AND quantity ~ '[1-9]'),
    unit varchar(40) CHECK (btrim(unit) <> ''),
    photo_id uuid,
    device_captured_at timestamptz NOT NULL,
    server_received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    actor_membership_id uuid NOT NULL,
    PRIMARY KEY (tenant_id, job_id, session_id, capture_order, expected_version),
    UNIQUE (tenant_id, job_id, command_id),
    FOREIGN KEY (tenant_id, job_id, session_id) REFERENCES app.v2_walk_session (tenant_id, job_id, id),
    CONSTRAINT v2_walk_entry_shape_ck CHECK (
      (kind = 'room' AND room_label IS NOT NULL AND note_text IS NULL AND quantity IS NULL AND unit IS NULL AND photo_id IS NULL)
      OR (kind = 'note' AND note_text IS NOT NULL AND room_label IS NULL AND quantity IS NULL AND unit IS NULL AND photo_id IS NULL)
      OR (kind = 'measurement' AND quantity IS NOT NULL AND unit IS NOT NULL AND room_label IS NULL AND photo_id IS NULL)
      OR (kind = 'photo' AND photo_id IS NOT NULL AND room_label IS NULL AND quantity IS NULL AND unit IS NULL)
    )
  );
  -- A photo is filed once in the whole practice tenant, so a photo already
  -- filed on any other job, including another firm's, is refused. Later
  -- revisions of its entry keep it.
  CREATE UNIQUE INDEX IF NOT EXISTS v2_walk_entry_photo_once
    ON app.v2_walk_entry (tenant_id, photo_id) WHERE expected_version = 0 AND photo_id IS NOT NULL;

  -- Refuse a revision that changes what its entry is. This runs with the
  -- caller's rights. The cross-job upload check is app.v2_walk_entry_upload_guard.
  CREATE OR REPLACE FUNCTION app.v2_walk_entry_guard()
  RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
  AS $guard$
  DECLARE
    original record;
  BEGIN
    IF NEW.expected_version > 0 THEN
      SELECT kind, photo_id INTO original FROM app.v2_walk_entry
      WHERE (tenant_id, job_id, session_id, capture_order, expected_version)
        = (NEW.tenant_id, NEW.job_id, NEW.session_id, NEW.capture_order, NEW.expected_version - 1);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'V2_WALK_VERSION_GAP' USING ERRCODE = '23514';
      END IF;
      IF original.kind <> NEW.kind OR original.photo_id IS DISTINCT FROM NEW.photo_id THEN
        RAISE EXCEPTION 'V2_WALK_ENTRY_KIND_FIXED' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END
  $guard$;
  REVOKE ALL ON FUNCTION app.v2_walk_entry_guard() FROM PUBLIC;
  DROP TRIGGER IF EXISTS v2_walk_entry_guard ON app.v2_walk_entry;
  CREATE TRIGGER v2_walk_entry_guard BEFORE INSERT ON app.v2_walk_entry
    FOR EACH ROW EXECUTE FUNCTION app.v2_walk_entry_guard();

  -- Refuse a photo whose evidence upload belongs to another job, in any firm of
  -- the tenant. The firm lock hides other firms' uploads from the caller, so the
  -- check runs as its owner (tenant isolation still applies) and only reads
  -- evidence_upload. It is enabled ALWAYS so no writer skips it.
  CREATE OR REPLACE FUNCTION app.v2_walk_entry_upload_guard()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
  AS $guard$
  BEGIN
    IF NEW.photo_id IS NULL THEN
      RETURN NEW;
    END IF;
    -- Serialize with an upload of the same ID (app.v2_walk_photo_upload_guard), so
    -- whichever commits second sees the first, in either insertion order.
    PERFORM pg_advisory_xact_lock(hashtextextended('v2-walk-photo:' || NEW.tenant_id || ':' || NEW.photo_id, 0));
    IF EXISTS (
      SELECT FROM app.evidence_upload u
      WHERE (u.tenant_id, u.id) = (NEW.tenant_id, NEW.photo_id) AND u.job_id <> NEW.job_id
    ) THEN
      RAISE EXCEPTION 'V2_WALK_PHOTO_OTHER_JOB' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END
  $guard$;
  REVOKE ALL ON FUNCTION app.v2_walk_entry_upload_guard() FROM PUBLIC;
  DROP TRIGGER IF EXISTS v2_walk_entry_upload_guard ON app.v2_walk_entry;
  CREATE TRIGGER v2_walk_entry_upload_guard BEFORE INSERT ON app.v2_walk_entry
    FOR EACH ROW EXECUTE FUNCTION app.v2_walk_entry_upload_guard();
  ALTER TABLE app.v2_walk_entry ENABLE ALWAYS TRIGGER v2_walk_entry_upload_guard;

  -- The other insertion order: a walk photo entry can arrive before its upload.
  -- An upload may then only begin on the job the walk filed the photo on, in
  -- any firm of the tenant. The guard runs as its owner so it sees every firm's
  -- photo entries through the narrow read-only policy below (photo rows only,
  -- no writes), and it is enabled ALWAYS so no writer skips it.
  DROP POLICY IF EXISTS v2_walk_entry_photo_guard ON app.v2_walk_entry;
  CREATE POLICY v2_walk_entry_photo_guard ON app.v2_walk_entry FOR SELECT TO jobguard_migration
    USING (kind = 'photo' AND photo_id IS NOT NULL);
  CREATE OR REPLACE FUNCTION app.v2_walk_photo_upload_guard()
  RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
  AS $guard$
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('v2-walk-photo:' || NEW.tenant_id || ':' || NEW.id, 0));
    IF EXISTS (
      SELECT FROM app.v2_walk_entry e
      WHERE (e.tenant_id, e.photo_id) = (NEW.tenant_id, NEW.id) AND e.kind = 'photo' AND e.job_id <> NEW.job_id
    ) THEN
      RAISE EXCEPTION 'V2_WALK_PHOTO_OTHER_JOB' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END
  $guard$;
  REVOKE ALL ON FUNCTION app.v2_walk_photo_upload_guard() FROM PUBLIC;
  DROP TRIGGER IF EXISTS v2_walk_photo_upload_guard ON app.evidence_upload;
  CREATE TRIGGER v2_walk_photo_upload_guard BEFORE INSERT ON app.evidence_upload
    FOR EACH ROW EXECUTE FUNCTION app.v2_walk_photo_upload_guard();
  ALTER TABLE app.evidence_upload ENABLE ALWAYS TRIGGER v2_walk_photo_upload_guard;

  -- Linked V2 sessions share a synthetic membership. Resolve the signed-in
  -- person's membership from their verified linked credential and bound firm.
  CREATE OR REPLACE FUNCTION app.v2_walk_editor(credential_digest text)
  RETURNS uuid
  LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog
  AS $actor$
    SELECT c.membership_id
    FROM control_plane.identity_practice_credential c
    CROSS JOIN LATERAL app.linked_practice_authority(c.token_digest::text) authority
    WHERE c.token_digest = credential_digest
      AND (SELECT app.lp11_policy_tenant()) IS NOT NULL
      AND (SELECT app.current_firm_profile_key()) = 'practice:' || authority.owner_digest
  $actor$;
  REVOKE ALL ON FUNCTION app.v2_walk_editor(text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION app.v2_walk_editor(text) TO jobguard_runtime;

  ALTER TABLE app.v2_walk_session ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_walk_session FORCE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_walk_entry ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_walk_entry FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS v2_walk_session_runtime ON app.v2_walk_session;
  CREATE POLICY v2_walk_session_runtime ON app.v2_walk_session TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_walk_session.tenant_id, v2_walk_session.job_id)
    ));

  DROP POLICY IF EXISTS v2_walk_entry_runtime ON app.v2_walk_entry;
  CREATE POLICY v2_walk_entry_runtime ON app.v2_walk_entry TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_walk_entry.tenant_id, v2_walk_entry.job_id)
    ));

  -- FL-1 rule: a restrictive firm lock so runtime only sees walk rows on jobs the firm can see.
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_walk_session;
  CREATE POLICY v2_practice_firm ON app.v2_walk_session AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_walk_session.tenant_id, v2_walk_session.job_id)));

  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_walk_entry;
  CREATE POLICY v2_practice_firm ON app.v2_walk_entry AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_walk_entry.tenant_id, v2_walk_entry.job_id)));

  REVOKE ALL ON app.v2_walk_session, app.v2_walk_entry FROM PUBLIC;
  GRANT SELECT, INSERT ON app.v2_walk_session, app.v2_walk_entry TO jobguard_runtime;
END
$v2$;
COMMIT;
