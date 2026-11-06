LATER-SAFETY-126-CATCHUP — RED (practice-session isolation and credit notes).

Landing preparation retains the launcher's completed merge of origin/main
(013fa602e, main parent 02b46ac6f). Migration 0852 is renamed by stem only to
0660, reserved after main's 0658 and LP-6c's 0659. The SQL bytes are unchanged:
a new private definer trigger guards credit-note inserts using the existing
practice digest and import ancestry. No existing routine is re-created, no
commercial behaviour or test expectation changes, and no predecessor is edited.
The proof filename/identity and integration test's migration pin follow 0660.

Upgrade-list inspection: migfix-7's successor proof discovery pins new routine
metadata and exact bodies from each proof's migration; plan-entitlement's
successor proof discovery binds the exact routine metadata. Neither contains an
0852 row to move. Their existing named replacement lists, and all other mainline
upgrade tests, remain unchanged. Migration discovery and proof discovery cover
the renamed stem. The lane lists every changed path relative to main except
config/lanes/ paths.

Forward fix only: retain the trigger and practice history. Removing the trigger
restores the cross-visitor credit issuance the original piece prevents. No data
backfill, provider action, real customer data, deployment or launch.

Local validation (installed tools, no downloads):
- DB: ./node_modules/.bin/tsc -p tsconfig.json --noEmit — passed.
- All 7 packages (core, storage, config, ai, db, api, web): installed root ./node_modules/.bin/tsc -p <package>/tsconfig.json --noEmit, sequentially — passed. These are their configured typecheck commands.
- Root turbo run typecheck --concurrency=2 was interrupted after its pnpm children stalled without completing a package; the direct checks above completed instead.
- DB: ./node_modules/.bin/vitest run --maxWorkers=2 src/migrate-discovery.test.ts test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts — 3 files, 111 tests passed.
- Read-only comparison: SQL unchanged; integration test and proof changed only by stem; main upgrade tests unchanged; no conflict markers.
- git diff --check — passed.

PostgreSQL/browser suites were not run: the sandbox cannot start PostgreSQL or
bind localhost. Router CI must run credit-note-practice-session.integration.test.ts,
migfix-7-upgrade.integration.test.ts and
plan-entitlement-lifecycle-upgrade.integration.test.ts (at most 2 workers and
3 named Vitest files per run), plus the mandatory CI checks. The earlier RED PASS
is not a new exact-head review of this catch-up. CI and any required exact-head
RED review remain release/merge gates. Router stages, commits and pushes; this
session performs no Git writes.
