# meter-revoke-0380 — RED: least privilege

0399 withdraws runtime EXECUTE on `app.mon1_counted_meter_today(uuid,text)`
in the migration path. 0380 and all other existing migrations are unchanged.
The LP-0 inventory already records this signature as inaccessible; no inventory,
routine body, ownership, table privilege or intended user capability changes.
The supported freshness-checked reader and source entry point keep their grants.

PostgreSQL CI tests cover migration-only refusal before finalization, upgrade
with the reader already meter-owned, repeat migrate, deliberate re-grant detection
by LP-0, and the existing supported reader's success, stale-data and authorization
boundaries. The local source/registry check does not prove PostgreSQL privileges.

Forward fix only: preserve the revoke; repair any supported-reader failure in a
new migration rather than restoring access to stale counted data. No data backfill,
new operational alert, provider call or release activation. Full database CI and
one independent Claude RED review remain required before merge.

Local validation: built the existing core/storage outputs with their pinned
TypeScript compiler, then ran from `packages/db`:
`./node_modules/.bin/vitest run --maxWorkers=1 src/meter-reader-revoke.test.ts src/meter-work-admission.test.ts test/lp-0-catalog.test.ts`
— 3 files, 34 tests passed. The first attempt found missing core build output;
the rerun above passed after building workspace dependencies, without downloads.
`./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` passed from the
repository root. TypeScript syntax checks passed for the three changed integration
test files; lane validation covered all seven changed paths; `git diff --check`
passed. Database and browser execution were not run in this sandbox.
