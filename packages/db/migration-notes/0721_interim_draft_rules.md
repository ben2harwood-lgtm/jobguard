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

## 9 November catch-up candidate — DO NOT COMMIT

The router supplied this writable catch-up worktree at origin/main/HEAD
`a96b743c6bf636d4b01045ec399071d35aa95227`, branch
`codex/sandbox/m4-18-interim-rules-catchup`. Original source branch
`codex/sandbox/m4-18-interim-rules` is `b5f1b929e41977cabafa6b6683b426fed4d23c07`;
the merge base is `108373dc9e9ff496931419193cf983cb27f2d873`.
No Git write commands ran. The candidate is a working-file three-way combination,
not a recorded Git merge; the router must preserve the source/base information.

Inherited batch-19 files already on main were retained. Conflicts in workspace and
database exports, watchdog routes and later-empty-tables resolve entirely to main:
main already contains the interim additions, plus newer unrelated additions and
request-binding snapshot exclusions. Main's principal sessionCredential fixture
is preserved, and the new route fixture carries that same authenticated-principal
contract. Original M4-18 application/repository typed refusals, company-selection
checks, live-job checks, unit tests and browser lifecycle setup are carried forward.
Shared expectation edits only add the 0781 routine-body rows to entitlement's
first-match list and MIGFIX-7's last-write-wins fullBodies map; all prior rows remain.

Main's highest migration is 0698. Of the original branch's added migrations, 0595
already exists byte-identically on main; only 0781 remains new, and 0781 > 0698.
No migration meets the brief's at-or-below-main renumber condition, so there are no
renumbers or removed migration paths. A case-insensitive search of main migration
sources for function app.interim_draft_records( finds 0595 and latest 0665.
A mechanical comparison proves 0781 retains 0665's entire routine/ownership/grants,
except for the original branch's typed session check and require_watchdog_live call.
Main's newer bound session actor helper remains the same referenced helper.

### Blocking scope conflict

The no-test-expectation-change rule prevents a ready result. Main's existing
interim-draft-screen.integration.test.ts expects FORBIDDEN on expired/revoked
sessions (lines 72–76), and METER_FORBIDDEN on a null SQL digest (line 84).
interim-draft.integration.test.ts line 104 also expects FORBIDDEN after revocation.
The original M4-18 branch deliberately returns INTERIM_DRAFT_UNAUTHENTICATED from
0781 for those identical inputs, mapped to UNAUTHENTICATED/401. Its new route test
requires that 401. These outcomes cannot both hold at the same latest schema.
Main's expectations have not been changed or weakened. Source inspection establishes
this contradiction; PostgreSQL was not run and no database failure is claimed observed.
The candidate therefore is NOT READY and must not be committed or pushed as ready.
Recommendation for a separately authorized repair: retain M4-18's explicit 401
semantics and align only these stale expired/revoked/missing-session expectations,
preserving all role, cross-tenant, live-job and immutable-history assertions. That
repair must also verify main's request-binding refusal path through the real database;
local unit tests do not establish its interaction with revoked sessions.

### Catch-up validation actually run

- Installed tsc: packages/db --noEmit and apps/web --noEmit --incremental false: PASS.
- Local dependency builds with installed tsc: core, config, storage, db, ai, API: PASS.
  These only supply ignored runtime build outputs; no packages downloaded.
- DB Vitest, --maxWorkers=2, test/interim-draft-repository.test.ts and
  test/migration-proof-loader.test.ts: 95 PASS. Initial attempt could not import
  missing @jobguard/core build output; rerun after building dependencies passed.
- API Vitest, --maxWorkers=2, src/interim-draft.application.test.ts: 14 PASS.
- Web Vitest, --maxWorkers=2, app/api/jobs/[id]/interim-drafts/route.test.ts and
  app/jobs/[id]/interim-drafts/screen.test.ts: 7 PASS.
- git diff --check: PASS. No conflict markers remain.
- Working-tree lane validation against origin/main using the repository's exported
  loadLanePolicy, lanePathAllowed and migrationOrderViolations validators: printed
  "Lane boundary passed", 14 exact paths. Driver: /tmp/m4-18-lane-check.mjs.
  Standard inspectLane CLI rejects HEAD == origin/main as a self-comparison before
  the router commits; this working-tree validation is not a committed-range CI pass.
- No PostgreSQL, browser, provider, release, push or independent review ran.
  The environment prohibits starting PostgreSQL and binding localhost. After the
  scope conflict is resolved, real database/browser CI and exact-head RED review
  remain required. This note does not mark M4-18 finished or lift any product gate.


## 9 November repair 1 — router ruling applied, READY for router commit

This supersedes the catch-up candidate's scope-conflict hold and recommendation
above. The router ruled that main's principal contract wins: expired and revoked
sessions remain FORBIDDEN, and a null SQL digest remains METER_FORBIDDEN (mapped
to FORBIDDEN/403). Migration 0781 now preserves 0665's explicit null-digest guard
and delegates session authority to the existing app.mon1_company_actor helper.
The separate INTERIM_DRAFT_UNAUTHENTICATED precheck is removed. The new M4-18
PostgreSQL route test now expects INTERIM_DRAFT_FORBIDDEN/403 after revocation;
its title reflects the outcomes it covers. Main's existing assertions are unchanged.
All other prepared application, repository, migration-proof, upgrade and browser
catch-up changes are retained. Existing generic 401 error mapping tests remain
valid error-adapter checks; they do not assert that SQL returns 401 for these sessions.
The lane note records the ruling. No new abstraction or reporting mechanism.

Repair validation with installed binaries (no package downloads):

- DB Vitest: test/interim-draft-repository.test.ts and
  test/migration-proof-loader.test.ts: 95 passed.
- API Vitest: src/interim-draft.application.test.ts: 14 passed.
- Web Vitest: app/api/jobs/[id]/interim-drafts/route.test.ts and
  app/jobs/[id]/interim-drafts/screen.test.ts: 7 passed.
- Every Vitest run used --maxWorkers=2 and at most two named files.
- ./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit: passed.
- ./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false: passed.
- PostgreSQL and browser suites were not run: this sandbox prohibits starting
  PostgreSQL and binding localhost. CI must execute the affected PostgreSQL
  integration, migration/upgrade and browser suites after the router pushes.
- No git write commands, push, provider calls, release or independent review ran.
  READY means ready for the router to commit the repair; exact-head RED review
  and required green CI still gate merge. Product release gates remain unchanged.

The starting HEAD remains a96b743c6bf636d4b01045ec399071d35aa95227.
During validation origin/main advanced to 6bcbbd0d12076b59155d0efa110ed6955e03255d;
the earlier /tmp working-tree lane helper refused its HEAD==origin/main assumption.
The repository's standard lane CLI is used for the final lane check instead.

- Final standard lane command: `node tools/agent-lane-boundary-lint.mjs`: printed
  "Lane boundary passed", all 14 working-tree paths. This is local lane validation,
  not a committed-range CI result.
- Source comparison: 0781 matches 0665 except comments and require_watchdog_live;
  the pre-existing main screen-test assertions are unchanged.
