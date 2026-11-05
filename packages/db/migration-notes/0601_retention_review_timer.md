# 0601_retention_review_timer — synthetic retention review timer (M4-20 remains open)

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
Only filename stems were renumbered to `0600_retention_records` and
`0601_retention_review_timer`; the existing advisory-lock seed 753 is unchanged.
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


## Batch-24 PR preparation — 5 November 2026

READY for the launcher to stage, finish the merge, commit and open this RED PR.
Compared against local `origin/main` at `7e190e66ef8c640d2e708c68c9ffe53b79fa1150`.
All three working-file conflicts are exact unions: API exports, DB exports and
`laterEmptyTables`. The index intentionally remains unmerged for the launcher.
Incoming main changes are preserved. Retention migrations are not duplicates of
main; their unchanged SQL bodies now use reserved stems `0600_retention_records`
and `0601_retention_review_timer`, with matching proofs, notes and lane paths.
Main ends at 0596; 0597–0599 remain reserved for the preceding groups.

The requested `batch-24-harden.md` is absent. Read `batch-24.md` (which includes
its prior hardening rules), `batch-9-harden.md`, current product instructions,
the M4-20 plan and the supplied current brief. No new behaviour in conflict
resolution. Applicable current hardening: spread pool options preserve password;
role-refusal loop omits operative without a seeded agreement; 408/429 preserve
the exact pending command; screen controls have explicit high-contrast colours.
The existing browser journey now checks 408, 429 and lost-response replay with
four identical command envelopes. The contract and LP-0 proof explicitly hold
production LP-5 integration rather than claiming lifecycle dispatch. No new
application command type, protected authority write, app.* function SET clause,
provider route, CI image or predecessor routine change is introduced. Existing
identity-session expiry/revocation tests do not revoke practice-session rows.
The new table flows through `laterEmptyTables`, including restore reconciliation.

Local checks actually run, at most two Vitest workers and three files per run:
- Installed `tsc`: core and DB compilation, API and web `--noEmit`: passed.
- API watchdog registry, context boundary, identity: 278 passed.
- API retention application and review task: 15 passed.
- DB migration-proof loader and retention repository: 84 passed.
- Web retention API and screen: 6 passed.
- Core retention balances: 17 passed. Total: 400 passed.
- Core purity, money arithmetic, commercial boundary, AI provider boundary,
  PL/pgSQL CASE-in-IF guards: passed. Provider register regenerated with no diff.
- `git diff --check origin/main`: passed; no working-file conflict markers.
- Standard lane lint was run and fails because the unfinished merge includes
  incoming main paths and old indexed migration names. Do not widen the lane.
  Exported policy/path/order validators checked the effective working diff plus
  untracked files against origin/main: all 29 paths pass, exact allow list with
  no self-grant, migration order passes. Rerun standard lane lint after commit.
- `pnpm --filter @jobguard/web build:cloudflare` made no progress past its pnpm
  configuration warning and was interrupted. Source inspection confirms the
  retention route/server use `@jobguard/api/workspace`, not API source imports;
  server module starts with `server-only`, client has no DB import, and browser
  imports of DB/core-bearing packages remain dynamic. Cloudflare build is not
  claimed as passed.

CI must prove real PostgreSQL fresh/upgrade/catalogue/RLS and privileges,
append-only storage, exact replay, concurrency, session/tenant/job isolation,
audit atomicity, caller-setting restoration, upgrade snapshots and fingerprints;
run retention store/timer/screen integration suites and the updated mobile-360
and desktop browser journey. Full required CI and an independent RED review at
the final committed head are still required. This PR does not finish M4-20 or
authorize production retention, money, providers, tax or release.
