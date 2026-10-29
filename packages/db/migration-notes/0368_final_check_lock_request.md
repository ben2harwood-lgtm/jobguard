# 0368 — SV-5 automatic practice Final Check request

An AFTER INSERT trigger on the immutable final-account lock writes identifiers into the existing
infrastructure.final_check_request table in the lock transaction. Its primary key makes lock replay and
manual practice-run requests converge on one request. No shadow data is read and no builder response changes.
Only small-builder synthetic jobs with a practice session and non-imported provenance qualify.
Existing locks are not backfilled; the existing checked practice request remains available for them.

No table, role or callable runtime privilege is added. The trigger function belongs to jobguard_migration,
uses a pinned search path and has no PUBLIC/runtime/shadow/infrastructure execution grant. The existing
infrastructure exception and queue login remain unchanged. Source adapters and completion gates are unchanged.
The worker validates tenant/job/lock/manifest, runs the existing practice readers and reconciliation, then
publishes the proof-checked certificate with the manifest ID as stable certificate identity. Graphile delivery
is at least once; retries cannot create another certificate or classification run. Unknown sources stay unsupported.

Verification: final-check-lock-run.integration.test.ts covers lock replay, restricted access, actual worker
completion/replay, wrong tenant/job/lock/manifest, and unreadable-source refusal. Run it with database and migration
suites in CI. Browser SV-5 B/D exercise the automatic run in both configured projects.

Forward-fix by replacing the trigger function in a later migration. To disable auto-requesting, disable this
trigger; retain queued requests, locks, source attempts and completion evidence. No destructive rollback.
