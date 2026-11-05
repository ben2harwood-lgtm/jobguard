# M4-18 interim draft read authority and refusals (RED)

All four reported findings were confirmed against batch-19 at 7ca663938. None was skipped.
Migration 0781 recreates the latest 0595 routine, changing only authentication and live-job checks.
It requires the same persisted owner/admin session for read and append, including command replays.
A missing, expired, revoked or malformed session digest raises INTERIM_DRAFT_UNAUTHENTICATED;
mon1_company_actor still checks membership and role, with METER_FORBIDDEN mapped to 403.
The existing helper's revocation timing remains unchanged and belongs to LP-6b.

The application rejects zero/multiple company memberships with 404, matching the neighbouring
sole-company route's refusal, before resolving context or accessing the repository. Reads pass the
session digest explicitly. Omitting it remains source-compatible but fails closed in SQL with 401.
The screen already displays the response message as plain text: 403 says "You don't have permission."
401/403 responses contain no retry instruction. Genuine unavailable/unknown errors remain 503.
JOB_NOT_LIVE remains the public code and maps to 409.

Both read and append call the existing app.require_watchdog_live guard after tenant-scoped job
existence and session checks. The registry classifies mutations as post_live_billing; reads also
use the live-job boundary because they expose this same post-live billing book. The shared guard
locks the job row for the transaction. No registry row, issuance capability or other contract changes.
Existing per-job serialization, revision checks, canonical hashes and replay checks remain intact.

The proof is source-authored. LP-0 changes only the routine's exact static-call inventory;
upgrade and tenancy sections are explicitly empty because routine ACLs, ownership, arguments,
row shapes, grants and policies do not change. No tables, columns or new runtime entry points.
The plan-entitlement lifecycle upgrade starts before 0556; interim_draft_records first exists at
0595, so it is not among that test's predecessor routine definitions and needs no body exception.
Forward fix: recreate this routine with a later reviewed migration. Do not roll back the access
checks to restore unauthenticated reads. Existing draft rows require no backfill.

## Validation actually run

- `pnpm typecheck` could not start: the installed pnpm wrapper tried to verify pinned 10.28.1
  against an unreachable registry and refused the switch. No package, pin or scanner changes.
- Installed `./node_modules/.bin/tsc -p <package>/tsconfig.json` passed for core, config, storage,
  db, ai and API; web `tsc -p apps/web/tsconfig.json --noEmit` passed. These are the configured
  workspace TypeScript projects. An exploratory apps/mobile check found no such project.
- DB Vitest: `test/migration-proof-loader.test.ts test/interim-draft-repository.test.ts`,
  maxWorkers=2: 92 passed. Initial run needed the existing dependency builds first.
- API Vitest: `src/watchdog-registry.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts`,
  maxWorkers=2: 278 passed after dependency builds.
- API Vitest: `src/interim-draft.application.test.ts`, maxWorkers=2: 14 passed.
- Web Vitest: `app/api/jobs/[id]/interim-drafts/route.test.ts app/jobs/[id]/interim-drafts/screen.test.ts`,
  maxWorkers=2: 7 passed. These are unit tests, not browser or PostgreSQL proof.
- `git diff --check` passed. The lane tool refused its default HEAD==origin/main self-comparison;
  an explicit HEAD^ comparison then refused inherited batch-18/base and batch-19 paths. A
  source comparison confirmed all 10 piece paths changed and all other batch-19 paths stayed
  byte-identical. The tool must be rerun after the router records the base merge and commit.
  The lane intentionally
  includes only this piece's changes, not inherited batch-19 paths.

CI must run the real PostgreSQL suites, migration/upgrade/catalogue/tenancy proofs, and the
interim-drafts browser journey headlessly with at most two workers. New PostgreSQL assertions
cover read/append wrong roles, missing/expired/revoked sessions, foreign and missing jobs,
non-live jobs, and GET/POST refusals through the real routine with fictional session fixtures.
Existing race, replay, immutable-history and financial-table snapshot assertions remain.
No database or browser was started in this sandbox. Independent exact-head RED review and
required green CI remain necessary before merge.

## Second-run browser fixture correction

The revised brief authorizes only the fixture setup and three session-proof arguments in
`apps/web/e2e/interim-drafts.spec.ts`. Before the first stored record, its existing admin pool
now uses a transaction and `app.transition_job`, following M4-1-S's owner-only lifecycle
fixture: draft to quoting to accepted to live, bound to the same fictional baseline.
The fixture-local replication setting is restored before commit; production routines and
0781 are unchanged. Each of the three repository reads now passes the existing digest.
Every assertion is preserved byte-for-byte after accounting for those authorized read
arguments, including stored kinds, five records, 8000/6000/4000/2000, retry and duplicate
billing refusal. No browser was run here. The lane now includes this spec.

Second-run validation (installed binaries, no downloads):

- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false`: passed,
  including the changed browser spec.
- API Vitest: `src/watchdog-registry.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts`:
  278 passed; `src/interim-draft.application.test.ts`: 14 passed.
- DB Vitest: `test/migration-proof-loader.test.ts`: 76 passed.
- Web Vitest: `app/api/jobs/[id]/interim-drafts/route.test.ts app/jobs/[id]/interim-drafts/screen.test.ts`:
  7 passed. Each Vitest invocation used `--maxWorkers=2`, at most three named files, sequentially.
- Source comparison against the second run's starting spec passed: removing only the new
  lifecycle fixture and three digest arguments recovers the original file byte-for-byte.
- `git diff --check`: passed. No PostgreSQL/browser suite or broader first-run check repeated.

## Named holds for landing

1. `.git` is read-only by instruction, so no merge, fetch, commit or push ran. The worktree
   retains batch-19's files applied by hand on HEAD 108373dc9 and the first run's 0781 fix.
   Batch-19 has since landed on main (#560). The router catches this branch up at landing;
   the inherited batch-19 paths should merge cleanly because they are identical. Do not treat
   them as new M4-18 work or widen the lane to absorb them. Renumber claimed migration 0781
   at landing and rerun the lane check against the recorded base.
2. CI must prove the browser journey and real PostgreSQL suites; local unit/type checks do
   not establish these. Independent exact-head RED review and green CI remain outstanding.
3. M4-18 remains open: reviewed templates (D06), tax rulings (D02), live approval/issuing,
   all release gates, and LP-6b's existing revocation-timing work remain closed and unchanged.
