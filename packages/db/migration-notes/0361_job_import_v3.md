# 0361 — private held v3 import boundary (partial CH5-P)

The supplied MON1-A source has no executable admission/source/session/plan result
handoff. Its `meterPlaceAdmissionHold` is the only DB API. This migration installs
only the proposed six-argument signature as a private unconditional refusal.
It cannot adopt even an invoiced job; no free-import exception is inferred.

Owner: jobguard_migration; SECURITY DEFINER; search_path=pg_catalog. PUBLIC,
runtime, meter, infrastructure and shadow have no EXECUTE. No new role, table,
RLS exception, grants, backfill, historical row/column/constraint/routine change,
external action, fee, obligation or meter event. Existing v1 shape stays intact.
Runtime composition must not call this function. No production capability enabled.

Rollback before any successor dependency: drop this exact private signature as
migration owner, preserving migration history by the operational forward-fix
process. Preferred forward fix: another issued migration replaces the refusal
only after accepted MON1 source/clock/session/lock order, trial/plan and baseline
source acknowledgements; adds immutable baselines/lines/terms/provenance/history
completion validation, complete canonical snapshot binding and atomic writes;
then grants only the checked runtime entrypoint. Never edit 0361 after integration.
The current stub must remain unconditionally unavailable if upstream admission
later changes. No automatic promotion from parent acceptance is safe.

Own-step and successor tests are in job-import-v3-upgrade.integration.test.ts;
PostgreSQL suites were authored for CI, not run in this sandbox. This migration
is a held foundation and does not meet CH5-P01–P13 positive acceptance.
