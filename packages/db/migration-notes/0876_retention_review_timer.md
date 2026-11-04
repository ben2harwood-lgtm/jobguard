# 0876_retention_review_timer — synthetic retention review timer (M4-20 remains open)

Adds two infrastructure-only SECURITY DEFINER routines, with EXECUTE as the only
new grant. No role or table is added. FORCE RLS remains in force; discovery walks
control-plane tenant IDs, installs one tenant context at a time and restores the
caller value on success/error. It returns only tenants with a current due,
unreviewed condition. Its date predicate is a discovery filter; core remains the
execution rule engine under the existing 753 job lock.

`retention_timer` lists tenant book IDs, prepares a locked book and appends only
an exact timer review for a current due condition. It verifies hash, shape,
database date, profile identity and condition uniqueness; there is no actor,
resolution, satisfaction, approval, commercial send or money write parameter.
The existing actor column becomes nullable with a check permitting null only for
timer reviews. No column is added; existing row values and hashes are untouched.
No backfill is needed. Human append/session validation stays unchanged.

One Graphile discovery owner runs only in `synthetic_demo`; other environments
register neither task nor schedule. Queue keys bind tenant and database minute.
Execution rechecks the current book: two workers serialize, crashes before commit
roll back the review and audit together, retries after commit skip existing
profile/condition reviews. Each book commits separately so later failures are safe
to retry. Date revisions need fresh reviews; core refuses releases based on stale
approvals. Reviews remain proposals until explicit human resolution.

Forward fix preferred: disable the synthetic worker schedule, then use a reviewed
follow-up migration. Do not delete immutable reviews or audit. Removing EXECUTE
from the two new routines stops timer writes without changing stored histories.

CI must run real PostgreSQL fresh/upgrade, LP-0 and tenancy proofs plus
`retention-review-timer.integration.test.ts` and the existing retention suite.
Local sandbox cannot start PostgreSQL or bind localhost. Exact-head independent
RED review remains required. D02, D06 v2, demand after pilot and G0–G5 remain closed;
RETENTION_BALANCES_ENABLED stays false. No HTTP/screen, notices, invoices, M4-21,
ledger, receipt, fee or collection composition is enabled.

## Batch-24 local validation — 4 November 2026

READY for the router to finish the merge and commit; RED, NOPR. Base is local
`origin/main` / HEAD `84c57224b`; local `main` is stale. No fetch was run.
The worker union preserves extra escalation, practice-only task isolation and
retention scheduling; exports and the empty-table registry retain both sides.
Only filename stems were renumbered to `0875_retention_records` and
`0876_retention_review_timer`; the existing advisory-lock seed 753 is unchanged.
No predecessor routine or fingerprinted row shape changes. Both migrations have
proofs; infrastructure entry-point owner entries match LP-0's non-owner EXECUTE
reachability rule. No command-bus type or runtime authority-table write is added.

Installed TypeScript 5.8.3: `node_modules/.bin/tsc -p
packages/<package>/tsconfig.json` passed for core, config, storage, AI and DB,
refreshing ignored package output. `node_modules/.bin/tsc -p
apps/api/tsconfig.json --noEmit` and the corresponding web command passed.
`pnpm typecheck --concurrency=2` stalled in the launcher and was interrupted;
the installed binaries completed every workspace package check instead.
Initial Vitest imports failed because local package output was absent; all
selected suites passed after compilation, without changing tests or downloading.

Installed Vitest 4.1.12, each run from its package directory using
`./node_modules/.bin/vitest run --maxWorkers=2`, at most three named files:
- API: `src/watchdog-registry.test.ts`, `src/auth/context-boundary.test.ts`,
  `src/auth/identity.test.ts`: 278 passed.
- API: `src/retention-record.application.test.ts`,
  `src/retention-review-task.test.ts`: 15 passed.
- DB: `test/migration-proof-loader.test.ts`,
  `test/retention-record-repository.test.ts`: 84 passed.
- Web: `app/api/jobs/[id]/retention-records/route.test.ts`,
  `app/jobs/[id]/retention-records/screen.test.tsx`: 6 passed.
- Core: `src/retention-balances.test.ts`: 17 passed.
Total: 400 passed. No database or browser suites were run.

`git diff --check HEAD` passed. The standard
`node tools/agent-lane-boundary-lint.mjs` refuses a self-comparison because HEAD
still equals origin/main before the router commits. Its exported lane policy
loader and path validator were run directly on the actual working-tree diff
against origin/main plus untracked files: all 28 exact non-lane paths match the
batch allow list, with no self grant. The standard command must run again after
commit. Unmerged index entries intentionally remain for the router; all working
file conflicts are resolved.

CI must prove fresh/upgrade PostgreSQL, migration/catalogue proofs, FORCE RLS and
privileges, append-only/replay/concurrent-release guarantees, existing upgrade
snapshot and fingerprint guards, retention timer and screen integration suites,
and `M4-20-retention-records.spec.ts` plus affected browser journeys. Required
full CI checks and independent RED review at the final committed head remain
outstanding. This is synthetic draft storage, not completion of all M4-20 or
approval of live providers, fees, notices, invoices, tax, or production release.

LATER / SIMPLICITY (initial review):
`packages/db/src/retention-record-repository.ts`, `raiseTimerReviews`: reuse one
extended prepared-response schema for the initial and subsequent timer reads;
this would keep that response contract in one place. Optional, nonblocking;
no unrelated refactor was made in this merge.
