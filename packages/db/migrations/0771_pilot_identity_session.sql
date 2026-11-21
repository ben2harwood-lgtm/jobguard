BEGIN;
ALTER TABLE identity.session DROP CONSTRAINT session_environment_check;
ALTER TABLE identity.session ADD CONSTRAINT session_environment_check
  CHECK (environment IN ('synthetic_demo', 'pilot_no_charge'));
COMMIT;
