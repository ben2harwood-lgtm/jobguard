Built by Codex; dispatched 13 Oct 2026

# ENT-3b builder receipt: visit start and complete, and the close-out answer (server only)

Base `origin/main` 4db73817ab7b3be4993fe8b01279ac0e1b8cf836 (ENT-3a merged, c84c6b3). Branch `codex/sandbox/ent-3b`. Migration `0139_site_visit_closeout.sql`, sha256 58174fc0e3cd28a9c5b27c5cf344565df68fb1fca1b557bd091aa21ddfcf4377. Head sha: see the last line of the dispatcher message (the receipt itself is committed in the final commit, so its own head is the commit that contains it). Lane check: 40 files changed against base, all inside the lane.

## Dispatcher addendum of 13 Oct (two coordinator rulings)
v2 is strictly additive to v1 (docs sentence added in `docs/contracts/site-extra-v1.md`: v2 and v3 are separate extensions of v1; test `[B17-SIDE]` in core, application and web). The two tenancy catalogue rows are pure additions (`git diff` shows 2 insertions, nothing else).

## Rule as built
`app.ent3b_visit_authority(actor, job)`: (a) tenant setting / actor / `contractor_member_active` else forbidden `member_inactive`; (b) role not operative or supervisor else forbidden `role_not_permitted`; (c) `ent3a_extra_authority(actor,'LogSiteExtra',job)` not exactly one `allowed` else not_found `job_out_of_scope`; (d) `contractor_job_assigned` false else not_found; otherwise allowed. Written once; nothing restated.

## B-prime
Ruling: contractor work-order jobs have no pre-live phase; routes are `pre_live_allowed`, carry their own live guard. Four rows in `packages/core/src/watchdog.ts` (lines 20 to 24: the ruling's comment line then `/api/contractor/jobs/[id]/site-visits/start`, `.../[visitId]/complete`, `nest:/contractor/jobs/:id/site-visits/start`, `nest:/contractor/jobs/:id/site-visits/:visitId/complete`). `watchdogCommandGuards`, the replay harness and the contract test are untouched.
Six titles, each run for both commands in `packages/db/test/site-visit.integration.test.ts` (loop "B-prime replay and live-guard properties", one `it` each per command): `[BP-a]` replaying a command id returns the first result, never the job's current state; `[BP-b]` the same command id with a changed payload conflicts; `[BP-c]` the same command id on another job conflicts; `[BP-d]` a successful no-op keeps its identity (the first call is never a no-op; the property applies to the replay of the same id and body: same visit id and answer id, nothing new written); `[BP-e]` a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written; `[BP-f]` an unauthorised caller gets the identical refusal for an unknown job, a foreign job, a not-live job and a live job (two callers: `VISIT_FORBIDDEN` and `NOT_FOUND`). Also `[BP-f]` at service level in `site-visit.application.test.ts`.
The `pre_live_allowed` class switches off NO runtime check for these routes: it only removes the shared harness and guard-list expectations. Evidence: authority is decided first (pre-check), then, inside the command transaction, `requireLiveJob(db, jobId)` is the first statement (`packages/db/src/site-visit-repository.ts`, `command()` first lines); a not-live job never reaches the routine; observed first lock = `require_watchdog_live` by `[B12]` lock observer. 201 and documented 409 enum `["JOB_NOT_LIVE","IDEMPOTENCY_CONFLICT"]`: `site-visit.controller.ts` decorators; checked in `site-visit.application.test.ts` "OpenAPI".
FIX line (owned gap): extend the shared replay harness to contractor-track jobs in the synthetic database and move these routes onto it.

## Locks
Keys already used (grep of `hashtextextended(` in migrations and sources): 0, 54, 55, 56, 126, 130, 417 (plus two-int `hashtext` pairs in 0112 and 0130). New: **3101** (tenant, job, member; exclusive; start) and **3102** (tenant, visit; exclusive in completion, shared in `ent3b_require_open_visit`). Command order: live-job row share lock, receipt row, tenant lock 54 shared, visit/member lock, audit head last, receipt completed (own row). Deferred triggers take no lock.

## Standard F: every new GRANT (one line each)
1. `GRANT SELECT ON app.closeout_answer TO jobguard_runtime` (SELECT only, no write grant).
2. `GRANT EXECUTE ON FUNCTION` the four callable signatures `ent3b_visit_authority(uuid,uuid)`, `ent3b_start_visit(uuid,uuid,uuid)`, `ent3b_complete_visit(uuid,uuid,uuid,uuid,text)`, `ent3b_require_open_visit(uuid,uuid)` to `jobguard_runtime` (explicit list; the two writers are SECURITY DEFINER and carry their own role check by calling the rule and the command receipt).
No INSERT, UPDATE or DELETE grant on any table was added; the runtime role still holds SELECT only on `app.site_visit` (tested). The two trigger functions are revoked from the runtime role. Nothing for PUBLIC or `jobguard_infrastructure`. Test: `[F]` in `site-visit-authority.integration.test.ts` reads the migration's GRANT lines.
Count note: the order says "five routines / three callable"; as built there are six functions: four callable and two trigger functions (the second trigger function serves both the answer table and the visit table).
No column, index, constraint, policy or grant added to any existing table; one deferred trigger added to `app.site_visit`; no existing object replaced or dropped.

## Acceptance map (BUILT unless stated)
B1 `site-visit-authority` (cell by cell). B2, B3, B4, B5, B6 (D2 part), B7, B8, B9, B10, B11, B12, B13, B14, B15 in `site-visit.integration.test.ts`. B6 P/U/W in `site-visit.test.ts`, `site-visit.application.test.ts` and the web route tests. B16 `site-extra-visit.integration.test.ts` (the two race cases are explained below). B17, B18 core, application, HTTP and five web files. B19 `site-visit-upgrade` and `site-visit-authority`. B20 below. B21 below. Audit-company acceptance line: `[A-AUDIT]` (definition text) and the decoy case in `[B12]` (another company's event with the same id does not satisfy the trigger).
Deviation to note, B16 race 1: a version 2 log in flight holds a job row lock from its inserts onward, so a completion cannot commit while a log is held "before its seam"; it waits (observed). The test therefore holds the log between its pre-check and its transaction (spy on the private pre-check) and the completion commits there; the log then fails with nothing written. Race 2 as ordered (the completion waits and succeeds after the log commits).
Reasons added: `visit_out_of_scope` for a visit that is not the caller's own open or owned visit (extra refusal and visit refusal records). An unstamped or missing context is `NOT_FOUND` (not specified by the order).

## Commands run (exit 0 unless stated; counts)
- Baseline on main: api `context-boundary` 145, `watchdog-registry` 121, `site-extra.http` 16 = 282 passed.
- Failed first: core `site-visit.test.ts` + `site-extra-v2.test.ts` before code: 2 files failed (33 tests failed). D1 before the migration: 21 of 21 failed (function does not exist). D2 before the repository export existed: file failed, 44 skipped (`SiteVisitRepository is not a constructor`). D4 before the repository change: 6 failed, 1 passed. NOT failed-first, honestly: D3 (the upgrade proof was written after the migration, its subject), and the application, HTTP and web tests, which were written after the code they test (their first run was green: 54, 34 and 88+50+18 tests).
- core: `site-visit.test.ts` + `site-extra-v2.test.ts`: 96 passed; ENT-3a `site-extra.test.ts` 35 passed.
- api: `site-visit.application.test.ts` 54; `site-visit.http.test.ts` 34; `context-boundary.test.ts` 145; `watchdog-registry.test.ts` 121 (all unedited guards green); ENT-3a `site-extra.application.test.ts` + `site-extra.http.test.ts` 57.
- web: start + complete + order-lines tests 88; site jobs + route-v2 + ENT-3a `route.test.ts` 50; order-lines rerun 18.
- db (embedded PostgreSQL, through `heavy-slot ent-3b`, `--maxWorkers=2`, at most three files, one run at a time): D1 21; D2 44; D3 1; D4 7; ENT-3a `site-extra`, `site-extra-authority`, merged `extra-origin` 104; `command-replay-contract` + `tenancy` 62; `extra-links`, `extra-origin-upgrade`, `job-scheduling` 25; `work-order-import`, `contractor`, `demo-bootstrap` 72; `fingerprinted-row-shape`, `recovery-follow-up-upgrade`, `watchdog` 54; `watchdog-lock-order` 23. All passed.
- `pnpm typecheck`, `LANE_BASE_REF=4db7381... pnpm lint`, `... pnpm lint:lanes` (passed, lane ent-3b, 40 files), `pnpm build`, `pnpm openapi:check`: all exit 0.
- Environment: embedded PostgreSQL first failed to start (missing dylib symlinks in this worktree's `node_modules`); fixed by running the package's own `scripts/hydrate-symlinks.js` (creates symlinks only; no download, nothing deleted, untracked files).
- NOT RUN: browser tests (none exist; UI parked); the whole-repository suites (dispatcher's).
- Mutation check of the four registry rows was attempted but is not valid (the registry test reads the built core, which was not rebuilt); so "the test fails without the rows" is NOT demonstrated.

## Proof that nothing outside the lane changed
Pinned files, sha256 main equals now (first 16 hex): context-boundary.test.ts d082694df3dc0054; practice-session.ts 9b765f410777c283; contractor-repository.ts 56b95b80360434f0; contractor-party-repository.ts e5852288e5355b53; work-order-repository.ts 4d101604ad160801; sor-repository.ts 45e54b465b2a1274; job-scheduling-repository.ts ce9b3fee004db9e7; work-order-fixtures.ts cfcd6d41a3618dd6. Text of `resolveContext` through the line before `log`, before and after: both 54e01fa61b388ed14b2f6b7bbb1f5016686fe90761744a9ca0834bddb058b873. `git diff --stat` against base: 40 files, 2524 insertions, 33 deletions (deletions are one-line edits of existing lines listed below). `extra-repository.ts`, `tenant-context.ts`, `audit.ts`, `watchdog.ts` (db) and the registry test are untouched.

## Edited lines in existing files (all additive in effect)
- `packages/db/src/site-extra-repository.ts`: input gains optional `siteVisitId`; reason union gains `visit_out_of_scope`; seam gains its third statement; `precheck` gains an optional fourth parameter and one visit read after the authority answer and live check; two precheck calls pass it; `raiseExtra` receives `siteVisitId` only when present. File still holds `LogSiteExtra` once and none of INSERT, UPDATE, DELETE.
- `apps/api/src/contractor/site-extra.application.ts`: two new import lines (existing import lines unchanged), a field and constructor assignment, `log` parses a v1 or v2 body (3 lines), new methods and helpers after `log`.
- `site-extra.controller.ts`: only `@ApiBody` (now `oneOf` both versions). `app.module.ts`: one import, one controller. `workspace/application.ts`: four properties on `siteExtras`. `workspace/index.ts`: one export line. `site-extras/route.ts`: accepts v1 or v2. `core/src/index.ts`, `db/src/index.ts`, `db/src/migrate.ts`, `MIGRATIONS.md`: appended lines. `site-extra.ts`: appended `logSiteExtraV2`. `tenancy.integration.test.ts`: two rows. `apps/api/openapi.json`: regenerated; every existing path unchanged except `/contractor/jobs/{id}/site-extras` (request body now documents both versions).

## Self-review
Checked against the order: authority checked before the live guard everywhere (pre-check, then `requireLiveJob`); the refusal for a caller-only cause is identical for every job id (tests B3, BP-f); no request value reaches actor, tenant, time, command type or work order; no path completes a visit without an answer (routine, guard trigger, deferred trigger, tested as owner); no path changes or adds an answer (B7, B8); both writers fail closed on a missing or malformed rule answer; EXECUTE list explicit; no word excluded by the wording note; no credential-shaped string. Found and fixed while self-reviewing: the visit read for completion initially sat only in the routine (random visit id gave `SITE_VISIT_UNAVAILABLE`); moved into the pre-check so it is the same `NOT_FOUND`. Open observations for reviewers, not changed: (1) the command type strings also appear as literals inside the SQL routines, as the order specifies; (2) the deferred answer check also refuses re-opening a completed visit; (3) a never-completed visit by a member later taken off the job stays open (honest limit 4).

## HELD / honest limits / gates
HELD: screens and browser journeys (UI parked, ENT-3e); acting as a made-up site worker (F2); surveyor visits; order check and prices (3c); photo and resident confirmation (3d); the "yes with no extra" prompt (ENT-8a); close-out rates (ENT-9); offline capture; closing stale visits; state rules (ENT-5); fees (ENT-7). Limits 1 to 5 as in the order are in `docs/contracts/site-visit-v1.md`. Later UI idea (LATER): show the question text near the completion button. This piece makes no new copy of the context adapter. Remaining gates: F2, UI, two independent RED verdicts, the Mac verification run, the dispatcher's push.

Builder receipt only — not independently verified, not accepted.

## Repair round 1

ISSUED 13 Oct 2026 by the JobGuard dispatcher on the coordinator's test-only ruling for PR #167. Repair builder: Codex. Starting branch `codex/sandbox/ent-3b`, clean head `f112ae6226a9914b96a11f13050d312cbfafc1ef`. Only `packages/db/test/site-visit.integration.test.ts` and this appended receipt section changed. No product code, migration bytes, grants, lane assignments or other piece's tests changed. Every test title, the four fault targets and every existing expected value remain unchanged; existing assertions are preserved and strengthened.

### Changes and evidence

- `packages/db/test/site-visit.integration.test.ts:375`: B12 captures each pooled client's real query before spying and wraps that client once, using the merged WeakSet pattern from `site-extra.integration.test.ts:89` / `:163` and `extra-unlink.integration.test.ts:108`. Non-target statements delegate to the original query. Receipt, start/complete routine and audit faults throw at their own statement. COMMIT injection is armed only after the command's live guard, so the earlier pre-check transaction commits normally. At COMMIT, deferred constraints run before the injection counter increments and the injected failure is raised; COMMIT itself never executes.
- `packages/db/test/site-visit.integration.test.ts:403`: each of the four targets, for both commands, must be reached exactly once. The original unavailable-error assertion is retained, with additional instance, exact error and PostgreSQL-detail redaction assertions. The original full snapshot and audit-head comparisons remain; explicit assertions also require no command receipt (including no processing receipt), no close-out answer, and no new visit or completion (`:410`). These are real-PostgreSQL assertions, NOT executed in this sandbox.
- `packages/db/test/site-visit.integration.test.ts:420`: the same start query and its original row-count assertion now run immediately after start, before completion changes the visit's tuple `xmin`; the added equality at `:422` compares visit insert and start audit transaction IDs. The completion query and both existing equality assertions remain unchanged.
- `packages/db/test/site-visit.integration.test.ts:488`: B13 likewise wraps each client once. The audit INSERT must actually be reached (`:505`); the exact original NOT_FOUND refusal assertion remains, strengthened with error-instance/redaction checks and unchanged snapshot/audit-head checks. The existing no-refusal-event and successful retry assertions remain.
- Database-free probe `/private/tmp/jg-ent-3b-injection-probe.cjs` extracts and executes the exact edited injection callbacks against deterministic pooled-client stubs: 18 cases covering both reused and separate clients, all four B12 targets for both commands, and B13. It verifies delegation, one wrap per client, successful pre-check COMMIT, reached counters, no command COMMIT execution, and ROLLBACK delegation. This is a deterministic wrapper check, not PostgreSQL integrity coverage, a live integration or an independent model verdict.

### Commands actually run

Node `v24.17.0`; installed pinned pnpm `10.28.1`, confirmed with `/private/tmp/jg-ent-3b-bin/pnpm --version` (exit 0). Subsequent pnpm commands used `PATH=/private/tmp/jg-ent-3b-bin:$PATH`; that temporary entry links an already-installed pinned binary. No dependency install or download was requested. Forced lint/build used `TURBO_CACHE_DIR=/private/tmp/jg-ent-3b-turbo-cache` to keep cache writes in the sandbox. Every Vitest invocation used `--maxWorkers=2`, at most three selected files, with one test run at a time.

- Initial default-launcher `pnpm exec turbo run typecheck --force` and a diagnostic `pnpm --version` stalled before running checks; both were interrupted, exit 130. The installed pinned binary resolved the launcher issue.
- `pnpm exec turbo run typecheck --force`: exit 0; 7/7 tasks, 0 cached. Shared-cache I/O warnings did not prevent the forced checks executing.
- `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force`: exit 0; 7/7 tasks, 0 cached.
- `LANE_BASE_REF=origin/main node tools/lint.mjs`: exit 0; core purity, lane, money and commercial boundary checks.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 0; ent-3b lane passed against merge-base of origin/main.
- `LANE_BASE_REF=origin/main pnpm lint --force`: exit 0; full root lint plus 7/7 forced package tasks, 0 cached, on the final test edits.
- `pnpm build --concurrency=2 --force`: exit 0; 7/7 tasks, 0 cached. Existing Next workspace-root/CSS/cache warnings; no source changes made for them.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/site-visit.test.ts src/site-extra-v2.test.ts src/site-extra.test.ts`: exit 0; 3 files, 131 tests passed.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/site-visit.application.test.ts src/context-boundary.test.ts src/watchdog-registry.test.ts`: exit 0; 2 matched files, 175 tests passed. The context-boundary path was unmatched; the correct path was run in the next API batch.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts src/contractor/site-extra.application.test.ts`: exit 0; 2 files, 186 tests passed.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/contractor/jobs/[id]/site-visits/start/route.test.ts' 'app/api/contractor/jobs/[id]/site-visits/[visitId]/complete/route.test.ts' 'app/api/contractor/jobs/[id]/order-lines/route.test.ts'`: exit 0; 3 files, 88 tests passed.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/contractor/site/jobs/route.test.ts' 'app/api/contractor/jobs/[id]/site-extras/route-v2.test.ts' 'app/api/contractor/jobs/[id]/site-extras/route.test.ts'`: exit 0; 3 files, 50 tests passed. Total selected unit tests: 630 passed.
- `node /private/tmp/jg-ent-3b-injection-probe.cjs`: initial exit 1 because the probe's call-history assertion also counted the permitted pre-check COMMIT. Corrected only the temporary probe's assertion to inspect command calls; subsequent runs, including after the final counter adjustment, exit 0, 18 cases passed.
- `pnpm openapi:check`: exit 1; the tsx CLI could not bind its IPC socket (EPERM). Equivalent generator/check through `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`: exit 0; bypasses the CLI IPC socket without changing the generator or checked document.
- Read-only Node comparison against `git show HEAD:packages/db/test/site-visit.integration.test.ts`: exit 0; all test titles and the pinned fault-target list unchanged. `git diff --check`: exit 0. `shasum -a 256 packages/db/migrations/0139_site_visit_closeout.sql`: exit 0; `58174fc0e3cd28a9c5b27c5cf344565df68fb1fca1b557bd091aa21ddfcf4377`, unchanged from the original receipt.

### Holds and handoff

NOT RUN: repaired PostgreSQL integration suite, database regressions, `pnpm test:db`, `pnpm test:migrations`, socket-dependent HTTP integration tests and browser suites. The dispatcher's environment note establishes that this sandbox cannot bind localhost or start PostgreSQL; no database start or heavy-slot run was attempted. Database and browser evidence must come from GitHub CI after the dispatcher commits/pushes. The earlier receipt's database results are historical and do not verify this repaired diff. No product/prompt/model changes require a new live-model evaluation.

Intended conventional commit subject and body written to `/private/tmp/jg-msg-ent-3b.txt`. No git write command, commit, push, merge, technical acceptance or independent verdict performed. This is a builder repair receipt only; the independent verdict must bind the dispatcher-created commit, and acceptance remains with the separate actor. Existing release gates remain in force.

## Repair round 2

ISSUED 13 Oct 2026 by the JobGuard dispatcher for the two BLOCKING access findings in the fresh Sol check of `e60bbbf78d473ad552b55c8a1e38fe8741d0bd8b`, PR #167. Repair builder: Codex. Starting branch `codex/sandbox/ent-3b`, clean head `e60bbbf78d473ad552b55c8a1e38fe8741d0bd8b`. The referenced `jg-runs/ent-3b-solcheck-20261013T133335.md` is absent from this worktree; this repair uses the findings quoted in the dispatch. Only the repository, its own integration test, its own contract and this appended receipt changed. `git ls-tree origin/main` confirms these four files are not merged files. No merged function/test, v1 site-extra behavior, grants, migration, provider, prompt or UI changed; no file or test was deleted.

### Changes and source evidence

- `packages/db/src/site-visit-repository.ts:28`: a changed-fact signal carries the error that may be exposed only while authorized, or the exact refusal already determined under lock. `:63` shares the existing membership/visit rule and completion-ownership check between the pre-check and command; it does not restate the database authority policy.
- `packages/db/src/site-visit-repository.ts:102`: the first command lock is the existing shared tenant-authority key 54. The command checks current membership, visit authority and ownership before the live guard or receipt claim. Membership/grant administration and work-order assignment revisions take that same key exclusively, so their commits cannot interleave with the checked replay. Audit remains the last new business lock; the writer routines reacquire an already-held tenant lock.
- `packages/db/src/site-visit-repository.ts:107` and `:164`: a live-guard refusal raises a changed-fact signal; `withTenant` rolls back before a fresh authority check. `JOB_NOT_LIVE` is returned only if that check still allows the caller. A refusal captured under the shared lock is retained rather than being replaced by a later authority decision after the lock is released.
- `packages/db/src/site-visit-repository.ts:115`: immediately before returning a cached result, recheck current membership, visit authority and completion ownership inside the command transaction under the held shared lock. The receipt claim can wait, so the command-entry check alone is insufficient for time-dependent membership expiry. No answer is returned on refusal.
- `packages/db/test/site-visit.integration.test.ts:340`: eight real-PostgreSQL races, start/complete × membership revocation/job-assignment removal × not-live/replay. The spy pauses only application control flow after the genuine PostgreSQL pre-check has committed; revocation uses the real contractor command and removal uses a real work-order revision import, both committed before the command starts. A subsequent SQL authority query proves the fixture mutation took effect. Each case asserts the exact authority error/status/versioned body, the same refusal when the change precedes the pre-check, unchanged visits/answers/receipts/commercial audit, no cached result fields, no new processing receipt, and a verified audit chain. Only the established security refusal event may be appended, deduplicated by command/reason.
- `packages/db/test/site-visit.integration.test.ts:385`: two further real-PostgreSQL races revoke membership after the live-guard rollback and before the second authority check. The revoke needs the exclusive tenant lock; completing it here also proves the shared command lock has been released before rechecking. Both commands return the exact 403 `VISIT_FORBIDDEN` response and write no command effect.
- `packages/db/test/site-visit.integration.test.ts:316`: two real-PostgreSQL lock-observer checks prove a successful replay commits with the shared authority lock held throughout the receipt read and subsequent authority/ownership check, returning the original result with no writes or audit-head change.
- `packages/db/test/site-visit.integration.test.ts:543`: update the own-piece lock-order expectation to the repair order's explicit shared-tenant-lock-first requirement, and add authority-before-live-before-receipt assertions. The original no-lock-after-audit and no-strong-table-lock assertions remain byte-for-byte. This corrects the old live-first title/assertion to the new required order; it does not relax the audit guarantee. All six B-prime titles, all other existing tests, B12 fault targets and refusal/money assertions are retained.
- `docs/contracts/site-visit-v1.md:15`: document the corrected lock order, the locked replay authority/ownership check and post-rollback live-refusal recheck; update honest limit 5 at `:26`.

**Fail-without-fix reasoning (source-inspected, NOT executed against PostgreSQL):** at starting head, all four pre-check/not-live races reach the immediate `JOB_NOT_LIVE` throw, so their expected authority refusals fail. All four pre-check/replay races reach the stored-result return before either checked writer, so they succeed unexpectedly and leak the original result instead of refusing. The two post-live-guard races never reach a second pre-check (the counter and authority-refusal assertions fail). The two observed replay checks find the live guard first and no command-transaction authority/ownership recheck, so their first-lock and recheck assertions fail. These are source deductions, not mutation-run or independent-verification claims. `vitest list` discovers 56 tests (the prior 44 plus 12 new tests) without starting a database or executing any test body.

### Migration, rule 9 and standard F

Migration `0139_site_visit_closeout.sql` is byte-identical to starting HEAD: SHA-256 `58174fc0e3cd28a9c5b27c5cf344565df68fb1fca1b557bd091aa21ddfcf4377`. No new routine, direct-write grant, schema change or migration was needed. The existing rule-9 populated-upgrade/catalogue proof and standard-F grant assertions are untouched and still mandatory in CI. No direct write access to money, membership, authorization, receipt or audit tables was added. Rollback/forward-fix for migration 0139 remains as previously documented; this round changes only repository execution and its own tests/docs. Runtime credentials and all merged functions remain unchanged.

### Commands actually run

Node `v24.17.0`; installed pinned pnpm `10.28.1`, checked with `/private/tmp/jg-ent-3b-bin/pnpm --version` (exit 0). Pnpm commands used `PATH=/private/tmp/jg-ent-3b-bin:$PATH` to use that already-installed pinned binary. Forced Turbo commands used `TURBO_CACHE_DIR=/private/tmp/jg-ent-3b-turbo-cache`; no install/download was attempted. Every Vitest invocation used `--maxWorkers=2`, at most three files, with one Vitest invocation at a time.

- `pnpm exec turbo run typecheck --force`: exit 0, 7/7 tasks, 0 cached; rerun on the final repository change, also exit 0, 7/7, 0 cached.
- `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force`: exit 0, 7/7 tasks, 0 cached; rerun on the final repository change, also exit 0, 7/7, 0 cached.
- `LANE_BASE_REF=origin/main pnpm lint --force`: exit 0, root purity/lane/money checks plus 7/7 forced package checks, 0 cached. `LANE_BASE_REF=origin/main node tools/lint.mjs` on the final code: exit 0.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 0, ent-3b lane against origin/main; repeated after the final code/tests, exit 0.
- `pnpm build --concurrency=2 --force`: exit 0, 7/7 tasks, 0 cached; rerun after the final replay recheck, also exit 0, 7/7, 0 cached. Existing Next workspace-root/CSS/webpack-cache warnings; no unrelated changes made for them.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/site-visit.test.ts src/site-extra-v2.test.ts src/site-extra.test.ts`: exit 0, 3 files, 131 tests passed.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/site-visit.application.test.ts src/auth/context-boundary.test.ts src/watchdog-registry.test.ts`: exit 0, 3 files, 320 tests passed.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/contractor/site-extra.application.test.ts`: exit 0, 1 file, 41 tests passed.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/contractor/jobs/[id]/site-visits/start/route.test.ts' 'app/api/contractor/jobs/[id]/site-visits/[visitId]/complete/route.test.ts' 'app/api/contractor/jobs/[id]/order-lines/route.test.ts'`: exit 0, 3 files, 88 tests passed.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 'app/api/contractor/site/jobs/route.test.ts' 'app/api/contractor/jobs/[id]/site-extras/route-v2.test.ts' 'app/api/contractor/jobs/[id]/site-extras/route.test.ts'`: exit 0, 3 files, 50 tests passed. Total selected unit tests: 630 passed. These do not execute the repaired PostgreSQL repository paths.
- `pnpm --filter @jobguard/db exec vitest list --maxWorkers=2 test/site-visit.integration.test.ts`: exit 0; final discovery redirected to `/private/tmp/jg-ent-3b-r2-test-list.txt`, 56 tests. Discovery only, no hooks/test bodies/database startup.
- `pnpm openapi:check`: exit 1, tsx CLI IPC socket bind refused with EPERM. Equivalent generator/check via `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`: exit 0, unchanged generator and checked document.
- Read-only Python comparison against `git show HEAD:...`: exit 0; six B-prime titles, B12 injection targets and audit-order assertions retained; migration byte-identical; only the four allowed own-piece repair files changed. `git diff --check`: exit 0. `git ls-tree origin/main` for those four paths: exit 0, no merged entries. Migration SHA-256 check: exit 0, value above.

### Holds and dispatcher handoff

**Contract conflict — not silently resolved:** the dispatch requires job-assignment removal to return `VISIT_FORBIDDEN`/403, while BUILD_PLAN ENT-3 "Refused targets", this piece's existing contract and preserved B4/B9/BP-f/B13/B15 assertions require `NOT_FOUND`/404 for a member no longer named on a job. This round preserves the existing policy and proves that identical `NOT_FOUND` refusal occurs before or after the pre-check; membership revocation receives identical `VISIT_FORBIDDEN`/403. Changing job-removal policy would contradict the simultaneous instruction to preserve those assertions. Clarification was requested during the turn and no answer has arrived. Acceptance of the requested job-removal 403 behavior is therefore HELD; this receipt does not claim that requirement satisfied. The own-piece lock observer was aligned with the dispatch's explicit shared-lock-first requirement and strengthened as described above.

NOT RUN in this sandbox: PostgreSQL integration bodies (including all 12 new tests), database regressions, `pnpm test:db`, `pnpm test:migrations`, socket-dependent HTTP integration tests, browser suites and the full repository `pnpm test`. The dispatcher states this sandbox cannot bind localhost or start PostgreSQL. GitHub CI after dispatcher commit/push runs database and browser suites; earlier-round database results do not verify this diff. CI and an independent verdict bound to the dispatcher-created commit remain required, with acceptance by a separate actor. Existing release gates remain in force. No new live-model evaluation is applicable.

Intended conventional commit subject/body written to `/private/tmp/jg-msg-ent-3b.txt`. No git add/commit/checkout/push/merge, dependency installation, database startup, independent verdict or technical acceptance performed. Builder repair receipt only.

## Repair round 3 — resolve the supplied main merge

Built by Codex, dispatched 13 October 2026, dispatcher 3. The earlier first-line Claude attribution was inaccurate for this Codex session and has been corrected; earlier-round results below are historical evidence only. No independent review or acceptance is claimed.

Starting and final existing HEAD: `9ed4ae7bf22aea3a7ccff1d034e0397c167b4f80`. Supplied MERGE_HEAD / origin/main: `269874640468a6e1dfdfed63edd4ce187d1d9dbb`. The dispatcher started the merge; this round resolved working-tree contents only. Git's index still has eleven unmerged entries because no git write, add, commit, checkout, merge, push or installation was performed. A final merge-commit SHA does not exist yet.

### Every conflicted file and its resolution

| File | Resolution |
| --- | --- |
| `BUILD_PLAN.md` | Keep main's ENT-3c ledger paragraph exactly; append ENT-3b's ledger paragraph after it. Historical wording and allocation values preserved. |
| `apps/api/openapi.json` | Regenerate from both registered controllers. Preserve every main path exactly, with the existing v1 schema retained exactly as the first alternative of ENT-3b's v1/v2 free-text request union. Preserve all ENT-3b paths. |
| `apps/api/src/app.module.ts` | Keep main's pricing-controller import and registration; append the visit-controller import and registration. All other controllers and providers preserved. |
| `apps/api/src/contractor/site-extra.application.ts` | Keep main's pricing imports, methods and error helper; append ENT-3b imports, visit methods and helpers. Retain the visit repository and v1/v2 free-text log parsing/visit reference. Main's pricing-method block and HEAD's visit-method block are verbatim. |
| `apps/api/src/workspace/application.ts` | Keep main's logSor, sorItems and orderCheck bindings; append startVisit, completeVisit, assignedJobs and orderLines in the same frozen siteExtras object. |
| `apps/api/src/workspace/index.ts` | Export main's sorSiteExtraHttpFailure, then ENT-3b's siteVisitHttpFailure. |
| `config/agent-lane-assignments.json` | Preserve main's ENT-3c entry and every other main lane value; append ENT-3b's entry. Do not widen any allowlist. JSON parses. |
| `packages/core/src/index.ts` | Export main's site-extra-pricing module, then ENT-3b's site-visit module. |
| `packages/core/src/watchdog.ts` | Keep main's SoR route rows and existing comment; append both pairs of visit route rows. Preserve watchdogCommandGuards and every other guard. |
| `packages/db/MIGRATIONS.md` | Keep main's complete 0140 documentation exactly; append ENT-3b's complete 0139 documentation after it. |
| `packages/db/src/migrate.ts` | Keep both registrations in explicitly required numeric order: 0139, then 0140. |

No merged test, pinned assertion/value, provider route, UI, prompt, policy, money calculation, membership rule or existing SQL routine was edited in this repair. Existing automatic nonconflicting merges are retained. In particular, the incoming main security test update was already in the supplied index and was not changed here. Source checks distinguish this from a claim that the complete merge contains no test changes.

### Tests and commands actually executed

Runtime: Node `v24.17.0`; installed pinned pnpm `10.28.1`. Commands calling pnpm first exported `PATH="$HOME/Library/pnpm/bin:$PATH"`, then selected the existing pinned executable through `/private/tmp/jg-ent-3b-bin`. The default pnpm launcher stalled on `pnpm --version`; it was interrupted (exit 130). The pinned executable version check exited 0. No install/download command was run. Turbo cache was placed at `/private/tmp/jg-ent-3b-r3-turbo-cache`.

The exact execution command strings, exit codes, initial tool output and inspection commands are recorded in [r3-command-log.json](./r3-command-log.json). Read-only git status/show/rev-parse/diff/ls-files, rg, cat, sed, ls, nl, Python conflict extraction/comparison and SHA-256 calculations were also run. Inspection blocks returned 0; two lookups found absent files (`site-extra-proposals-v1.md` and `apps/api/vitest.config.ts`). No file was created to replace either lookup. One binary preview of the pinned pnpm executable was unhelpful.

| Command | Actual result |
| --- | --- |
| `~/.local/bin/heavy-slot ent-3b pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/site-visit.test.ts src/site-extra-v2.test.ts` | Exit 0, 2 files, **96 tests passed**; helper permission failures below. One run only, no parallel test run. |
| `pnpm exec turbo run typecheck --force` | Exit 0; 7/7 tasks, **0 cached**. Executed once. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | Exit 1. Core purity passed (154 TypeScript files); lane check refused incoming main files in the unfinished merge index. Remaining root checks were subsequently run individually. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1; same pending-merge lane issue. No allowlist or checker change. |
| `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force` | Exit 0; 7/7 tasks, **0 cached**. Executed once. This is package lint, not a passing root lane check. |
| `node tools/money-arithmetic-lint.mjs` | Exit 0. |
| `node tools/commercial-boundary-lint.mjs` | Exit 0. |
| `pnpm build --concurrency=2 --force` | Exit 0; 7/7 tasks, **0 cached**. Executed once. Existing workspace-root, CSS and webpack-cache warnings remain. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts` | First attempt exit 1: pre-merge compiled core lacked SorSiteExtraError. After the forced build, exit 0 and document regenerated. Uses the repository generator without the tsx CLI's IPC socket. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0 after regeneration. |
| `git diff --check` | Exit 0 on the resolved contents. |
| Python source/schema/byte comparisons | Final exit 0: all eleven conflict files have no markers; both JSON files parse; pricing and visit method blocks preserved; all main lane values unchanged; all main and ENT-3b OpenAPI paths preserved; r2 repository, tests and 0139 unchanged. |

Before each heavy command, `memory_pressure | tail -1` reported 66–68% free and `df -g /System/Volumes/Data` reported 80–83 GB free, above the 35% / 45 GB thresholds.

Two temporary comparison scripts initially exited 1 without changing protected files: the first JSON union correctly identified the shared route's existing v1/v2 schema difference (only BUILD_PLAN had been resolved before that assertion); the comparison was refined to preserve the exact v1 alternative. A later overly broad main-byte comparison found that the already automatic merge of site-extra-repository contains both pieces; the final check instead proves every nonconflicted file is unchanged from the supplied baseline, while separately proving main's unchanged files and this piece's r2 source. These are temporary receipt checks, not permanent tests or weakened test assertions.

This is a merge-integration repair with no new acceptance behaviour and no new tests. All existing test bodies are preserved. No new test-first failing run is claimed; the initial generator failure and temporary comparison failures above are not unit-test failures.

### STOP / failed checks / files NOT RUN

**STOP: shared helper's permission checks, `~/.local/bin/heavy-slot:11`.** During the one successful core test run, internal `sysctl -n vm.loadavg` reported `sysctl: sysctl fmt -1 1024 1: Operation not permitted` and `sysmon request failed with error: sysmond service not found`; internal `pgrep -x node` reported `pgrep: Cannot get process list`. The helper nevertheless launched the tests and exited 0. The dispatcher refusal rule was applied as soon as this output returned: no further slot-dependent tests were attempted, no alternate test runner or gate bypass was used. The helper itself was not edited.

**Pending check: lane lint, `tools/agent-lane-boundary-lint.mjs:227–233`.** The local checker includes `git diff --cached HEAD` and the working-tree diff, so the supplied unfinished main merge is counted against ENT-3b. It refuses 30 incoming main paths, including `apps/api/src/auth/context-boundary.test.ts` and ENT-3c's new files. All these files are retained from the supplied merge. The dispatcher must complete the merge and rerun lane lint; this receipt does not claim that result. No source line needs weakening and no pinned list/value is changed.

NOT RUN due to the helper permission STOP:

- `apps/api/src/contractor/site-visit.application.test.ts`.
- `apps/web/app/api/contractor/jobs/[id]/site-visits/start/route.test.ts`.
- `apps/web/app/api/contractor/jobs/[id]/site-visits/[visitId]/complete/route.test.ts`.
- `apps/web/app/api/contractor/jobs/[id]/order-lines/route.test.ts`.
- `apps/web/app/api/contractor/site/jobs/route.test.ts`.
- `apps/web/app/api/contractor/jobs/[id]/site-extras/route-v2.test.ts`.

NOT RUN (cannot start PostgreSQL / a browser or bind sockets here; dispatch explicitly assigns these to CI):

- `packages/db/test/site-visit.integration.test.ts`, including the unchanged r2 race tests.
- `packages/db/test/site-visit-authority.integration.test.ts`.
- `packages/db/test/site-visit-upgrade.integration.test.ts`.
- `packages/db/test/site-extra-visit.integration.test.ts`.
- Incoming main's ENT-3c PostgreSQL suites, database regressions, `pnpm test:db` and `pnpm test:migrations`.
- `apps/api/src/contractor/site-visit.http.test.ts` and incoming main's socket-dependent HTTP tests.
- Browser suites / `pnpm test:e2e`. No own-piece browser spec exists while UI is parked.
- Full repository/package unit suites, excluded by the dispatch's file and memory limits.

No model/prompt change or live-model evaluation applies. Database and browser checks, independent review bound to the dispatcher-created commit, separate acceptance and existing production gates remain outstanding.

### Migration, upgrade proof and standard F

Both migrations remain byte-identical: 0139 equals HEAD; 0140 equals MERGE_HEAD. Existing populated upgrade proofs are retained unchanged; this round adds no migration or reshapes any upgrade test.

Standard F: **no new direct INSERT, UPDATE or DELETE grant** to jobguard_runtime, and no new grant authored in r3. For completeness, every runtime grant retained from these two migrations is listed separately:

- 0139: `GRANT SELECT ON app.closeout_answer TO jobguard_runtime;`
- 0139: `GRANT EXECUTE ON FUNCTION app.ent3b_visit_authority(uuid,uuid), app.ent3b_start_visit(uuid,uuid,uuid), app.ent3b_complete_visit(uuid,uuid,uuid,uuid,text), app.ent3b_require_open_visit(uuid,uuid) TO jobguard_runtime;`
- 0140: `GRANT SELECT ON app.extra_sor_revision TO jobguard_runtime;` (expanded from the migration's exact table loop).
- 0140: `GRANT SELECT ON app.extra_pricing_basis TO jobguard_runtime;` (expanded from the same loop).
- 0140: `GRANT EXECUTE ON FUNCTION app.ent3c_record_sor_revision(uuid,uuid,text,text) TO jobguard_runtime;`

Writer routines, their own authority checks, existing roles and forward-fix instructions are retained. No business network action, production activation, fee issuance or new alert was introduced. Public compatibility is the combined existing visit and pricing API, with free-text body versions 1 and 2 still accepted.

### Source inspection and hashes

This section is builder source inspection and deterministic comparison, not a model verdict. Before resolution, SHA-256 values for the supplied merge-modified paths were captured in `/private/tmp/jg-ent-3b-r3-baseline.json`. Final comparisons prove all 32 nonconflicted incoming paths unchanged. The eleven conflicted paths plus this receipt and its command log are the only r3 edits. No protected merged test or fingerprint was touched.

```text
58174fc0e3cd28a9c5b27c5cf344565df68fb1fca1b557bd091aa21ddfcf4377  packages/db/migrations/0139_site_visit_closeout.sql
29605ffb78bc6193da5d1483834c15456b0a23561cd2bb95f26bc564dd1ff852  packages/db/migrations/0140_site_extra_pricing.sql
b3e3b70aa925a684c9160425de06169c16c9e39bd7fc932b3e2b2a2688c458b6  packages/db/src/site-visit-repository.ts
ca600135ba2ffb9cc73d9185cc4a9e1db2011b38a8577e2f1f91e4a76bd62487  packages/db/test/site-visit.integration.test.ts
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35  apps/api/src/auth/context-boundary.test.ts
0ba72bc8d217065bf2e7194f9e8380f8cbf475eab682f24c9e131a42718b3f7a  apps/api/openapi.json
```

Self-inspection: shared methods, exports, application composition and controllers include both pieces; the pricing-method and visit-method blocks are byte-preserved; migrations retain numeric order and exact SQL; main's lane values and nonconflicting inputs remain unchanged; both JSON documents parse. The preserved r2 authority checks are source-inspected only in this round. The 96 executed core tests do not prove PostgreSQL races, HTTP socket journeys or browser behaviour.

Intended merge commit message is written to `/private/tmp/jg-msg-ent-3b.txt`, beginning exactly `Merge remote-tracking branch 'origin/main' into codex/sandbox/ent-3b`. The dispatcher owns staging, completing the merge and its new head SHA.

### Final diff-stat snapshot

`git diff --stat` (exit 0; index intentionally unmerged; captured before adding this stat appendix):

```text
 BUILD_PLAN.md                                     | Unmerged
 BUILD_PLAN.md                                     |   2 +
 apps/api/openapi.json                             | Unmerged
 apps/api/openapi.json                             | 180 ++++++++++++++++++++++
 apps/api/src/app.module.ts                        | Unmerged
 apps/api/src/app.module.ts                        |   3 +-
 apps/api/src/contractor/site-extra.application.ts | Unmerged
 apps/api/src/contractor/site-extra.application.ts |  66 +++++++-
 apps/api/src/workspace/application.ts             | Unmerged
 apps/api/src/workspace/application.ts             |   2 +-
 apps/api/src/workspace/index.ts                   | Unmerged
 apps/api/src/workspace/index.ts                   |   1 +
 config/agent-lane-assignments.json                | Unmerged
 config/agent-lane-assignments.json                |   9 +-
 docs/verdicts/ENT-3b/BUILDER_RECEIPT.md           | 112 +++++++++++++-
 packages/core/src/index.ts                        | Unmerged
 packages/core/src/index.ts                        |   1 +
 packages/core/src/watchdog.ts                     | Unmerged
 packages/core/src/watchdog.ts                     |   2 +
 packages/db/MIGRATIONS.md                         | Unmerged
 packages/db/MIGRATIONS.md                         |  19 +++
 packages/db/src/migrate.ts                        | Unmerged
 packages/db/src/migrate.ts                        |   1 +
 12 files changed, 387 insertions(+), 11 deletions(-)
```

The complete origin/main diff-stat and pre-resolution SHA-256 manifest are in the command log. These stats include existing branch work or incoming main changes, and do not label those as r3 edits.
