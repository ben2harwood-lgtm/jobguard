# 0212 — post-lock upload transition guard (SV5-GUARD, C248)

Additive migration stacked on SV-5 0205 and prerequisite 0204. No data backfill or privilege expansion. A pre-cutoff upload that was not verified cannot change state after final-account lock except to rejected. Verified-source immutability remains enforced by 0204 (C238); post-cutoff rows and same-state updates retain existing behavior. Rejection is recorded in the existing immutable manifest exclusion and `final_check.sources_excluded` audit at freeze.

The migration-owned SECURITY DEFINER trigger fixes search_path to pg_catalog,app, uses the existing guard convention for current-tenant checks (with migration/superuser fixture access), sets transaction-local context to the row tenant and restores it, and queries only that tenant/job's lock. Its name places it after 0204's identity guard and job SHARE lock, serializing against lock/freeze without acquiring a new business lock. No grants to runtime or workers. All existing catalogue expectations remain; only the exact private routine/trigger are added.

Forward-fix preferred: retain 0212 and add a reviewed migration. Removing the trigger/function reopens the C248 race and must not be a production rollback. Existing locks already frozen with an unprocessable source are not repaired by this migration; no frozen manifest is rewritten.

Real PostgreSQL regression, catalogue and upgrade suites must run in reviewer/CI. Builder sandbox cannot bind sockets; no database execution is claimed.
