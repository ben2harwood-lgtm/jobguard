BEGIN;
-- Restricted identity/control-plane exception for the DARK MemoryAuthProvider specimen.
-- No tenant/business runtime reads. Synthetic identities deliberately do not reference real identity rows.
-- One locked snapshot keeps device tombstones, consumed-token history and command claims atomic.
CREATE TABLE identity.mobile_auth_fixture_state (
 environment text PRIMARY KEY CHECK(environment='synthetic_demo'),
 state jsonb NOT NULL CHECK(jsonb_typeof(state)='object'
  AND (state->>'version'='mobile-auth-state.v1') IS TRUE AND (state->>'environment'='synthetic_demo') IS TRUE)
);
ALTER TABLE identity.mobile_auth_fixture_state OWNER TO jobguard_migration;
REVOKE ALL ON identity.mobile_auth_fixture_state FROM PUBLIC, jobguard_runtime, jobguard_infrastructure, jobguard_identity;
GRANT SELECT, INSERT, UPDATE ON identity.mobile_auth_fixture_state TO jobguard_identity;
COMMENT ON TABLE identity.mobile_auth_fixture_state IS
 'M3-2 RED synthetic identity exception; no live users, business data, public transport or sync access. Independent review required.';
COMMIT;
