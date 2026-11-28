-- Q64 / V2-SQ-E. The quote laid out by room: which room each included line sits in, the room's place in
-- the quote, and whether the customer sees the room itemised or as one room total. A display choice only:
-- totals still come from app.quote_line, and nothing here stores a price.
BEGIN;

DO $v2$
BEGIN
  IF current_database() <> 'jobguard_v2_local' OR NOT EXISTS (
    SELECT FROM pg_policy WHERE polrelid = 'app.job'::regclass AND polname = 'v2_practice_firm'
  ) OR to_regclass('app.quote_line') IS NULL THEN
    RETURN;
  END IF;

  SET LOCAL ROLE jobguard_migration;

  -- One row per (quote revision, included line), written with the revision. Insert-only.
  CREATE TABLE IF NOT EXISTS app.v2_quote_section (
    tenant_id uuid NOT NULL,
    job_id uuid NOT NULL,
    quote_revision_id uuid NOT NULL,
    scope_item_id uuid NOT NULL,
    room_name varchar(100) NOT NULL CHECK (room_name = btrim(room_name) AND length(room_name) BETWEEN 1 AND 100),
    room_order integer NOT NULL CHECK (room_order >= 1),
    display_mode text NOT NULL CHECK (display_mode IN ('itemised', 'room_total')),
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, quote_revision_id, scope_item_id),
    FOREIGN KEY (tenant_id, quote_revision_id, scope_item_id) REFERENCES app.quote_line (tenant_id, quote_revision_id, scope_item_id),
    FOREIGN KEY (tenant_id, job_id, quote_revision_id) REFERENCES app.quote_revision (tenant_id, job_id, id)
  );

  ALTER TABLE app.v2_quote_section ENABLE ROW LEVEL SECURITY;
  ALTER TABLE app.v2_quote_section FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS v2_quote_section_runtime ON app.v2_quote_section;
  CREATE POLICY v2_quote_section_runtime ON app.v2_quote_section TO jobguard_runtime
    USING (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_quote_section.tenant_id, v2_quote_section.job_id)))
    WITH CHECK (tenant_id = (SELECT app.lp11_policy_tenant()) AND EXISTS (
      SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_quote_section.tenant_id, v2_quote_section.job_id)));
  -- FL: the same restrictive firm lock as every V2 table (app.job carries the practice-firm policy).
  DROP POLICY IF EXISTS v2_practice_firm ON app.v2_quote_section;
  CREATE POLICY v2_practice_firm ON app.v2_quote_section AS RESTRICTIVE FOR ALL TO jobguard_runtime
    USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_quote_section.tenant_id, v2_quote_section.job_id)))
    WITH CHECK (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id, j.id) = (v2_quote_section.tenant_id, v2_quote_section.job_id)));
  REVOKE ALL ON app.v2_quote_section
    FROM PUBLIC, jobguard_runtime, jobguard_identity, jobguard_worker, jobguard_shadow, jobguard_infrastructure;
  GRANT SELECT, INSERT ON app.v2_quote_section TO jobguard_runtime;
  DROP TRIGGER IF EXISTS v2_quote_section_immutable ON app.v2_quote_section;
  CREATE TRIGGER v2_quote_section_immutable BEFORE UPDATE OR DELETE ON app.v2_quote_section
    FOR EACH ROW EXECUTE FUNCTION app.reject_immutable_authorization_record();

  -- An excluded line never sits in a room, and one room has one place and one display mode per revision.
  -- AFTER INSERT, so row security refuses an outsider's row (42501) first. Runs as the caller.
  CREATE OR REPLACE FUNCTION app.v2_quote_section_guard() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $guard$
  BEGIN
    IF NOT EXISTS (SELECT FROM app.quote_line l WHERE (l.tenant_id, l.quote_revision_id, l.scope_item_id)
        = (NEW.tenant_id, NEW.quote_revision_id, NEW.scope_item_id) AND l.included AND l.job_id = NEW.job_id) THEN
      RAISE EXCEPTION 'V2_QUOTE_SECTION_LINE_EXCLUDED' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT FROM app.v2_quote_section s WHERE (s.tenant_id, s.quote_revision_id) = (NEW.tenant_id, NEW.quote_revision_id)
        AND s.scope_item_id <> NEW.scope_item_id
        AND ((s.room_name = NEW.room_name) <> (s.room_order = NEW.room_order)
          OR (s.room_name = NEW.room_name AND s.display_mode <> NEW.display_mode))) THEN
      RAISE EXCEPTION 'V2_QUOTE_SECTION_ROOM_INCONSISTENT' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
  END $guard$;
  DROP TRIGGER IF EXISTS v2_quote_section_guard ON app.v2_quote_section;
  CREATE TRIGGER v2_quote_section_guard AFTER INSERT ON app.v2_quote_section
    FOR EACH ROW EXECUTE FUNCTION app.v2_quote_section_guard();
END
$v2$;
COMMIT;
