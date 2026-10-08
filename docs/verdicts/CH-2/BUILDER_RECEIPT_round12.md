# CH-2 builder receipt — round 12

Working-tree integration for `codex/sandbox/ch-2`, PR #97, on integration HEAD `9e664bc9a513d2746f8ef0926ef6d170c8a31283` (main `3395d343fd50d979c734daf4946ba293ee2ed836`). Compared each requested file with `git diff $(git merge-base 58eef49 3395d34) 58eef49 -- <file>` and reapplied CH-2 over the SBOX versions. This is builder execution evidence, not an independent verdict or technical acceptance. The Opus PASS at `58eef49` does not review this new working-tree diff.

## Reapplied changes, by file

Every Nest controller retains its cookie parameter, `practiceCookie`, and per-request session-bound application construction. Every Next route retains its cookie check, awaited session-bound `workspaceApplication`, and `practiceFailure` precedence. Ownership checks precede commands and cached proof responses. Missing sessions return 401; stranger sessions return 404 without disclosing the job or receipt. Typed watchdog refusals preserve stable codes.

| File | Round 12 change |
| --- | --- |
| `apps/api/src/app.module.ts` | Register CH-2's `WatchdogExceptionFilter` as `APP_FILTER` alongside SBOX's `PracticeErrorsFilter`; retain ENT-1's `ContractorController` and the merged providers. |
| `apps/api/src/inbox-relevance.controller.ts` | Restore 201/409 OpenAPI declarations on seed and dismissal, with `JOB_NOT_LIVE` and `IDEMPOTENCY_CONFLICT`. |
| `apps/api/src/proof/proof.application.ts` | Restore first-response records/replays, request hashing, membership recheck, transactional projection/recording callbacks, generated original insertion in the upload transaction, finalisation command identity, live guard, derived completion Decision, and typed replay/finalisation conflicts. Retain `PracticeAccess.job`, upload/evidence/evidence-or-upload ownership checks, and session-scoped original-byte storage lookup. Proof reads remain available before/after live as in reviewed CH-2; they require confirmed scope, without requiring activation. |
| `apps/api/src/proof/proof.controller.ts` | Restore 201/409 declarations, including saved-response and legacy replay conflicts. |
| `apps/api/src/purchase-order.controller.ts` | Restore 201/409 declarations on revision and simulated placement. |
| `apps/api/src/readiness.controller.ts` | Restore 201/409 declarations on plan and advance, including saved-response/legacy conflicts. |
| `apps/api/src/supplier-document.controller.ts` | Restore 201/409 declarations on intake, receipt and fact confirmation. |
| `apps/api/src/supplier-match.controller.ts` | Restore 201/409 declarations on proposal and correction. |
| `apps/api/src/things-to-check.controller.ts` | Restore 201/409 declarations on evaluation, review and bill supersession. |
| `apps/web/app/api/jobs/[id]/proof/route.ts` | Restore watchdog job errors and 409 mapping for typed idempotency/command conflicts. |
| `apps/web/app/api/jobs/[id]/purchase-orders/placement/route.ts` | Restore watchdog job errors; preserve conflict/stale 409 mapping. |
| `apps/web/app/api/jobs/[id]/purchase-orders/revisions/route.ts` | Restore watchdog job errors and explicit idempotency 409. |
| `apps/web/app/api/jobs/[id]/readiness/[action]/route.ts` | Restore typed-code extraction and watchdog/idempotency 409 mapping. |
| `apps/web/app/api/jobs/[id]/relevance-inbox/[action]/route.ts` | Restore watchdog job errors; preserve idempotency conflict mapping. |
| `apps/web/app/api/jobs/[id]/relevance-inbox/decisions/[decisionId]/route.ts` | Restore watchdog job errors and explicit idempotency 409. |
| `apps/web/app/api/jobs/[id]/supplier-documents/facts/confirm/route.ts` | Restore watchdog job errors alongside stale/idempotency 409. |
| `apps/web/app/api/jobs/[id]/supplier-documents/intake/route.ts` | Restore watchdog job errors and explicit idempotency 409. |
| `apps/web/app/api/jobs/[id]/supplier-documents/receipts/route.ts` | Restore watchdog job errors and explicit idempotency 409. |
| `apps/web/app/api/jobs/[id]/supplier-matches/corrections/route.ts` | Restore watchdog job errors; retain conflict 409. |
| `apps/web/app/api/jobs/[id]/supplier-matches/route.ts` | Restore mutation watchdog job errors; retain conflict 409 and SBOX read denial mapping. |
| `apps/web/app/api/jobs/[id]/things-to-check/[action]/route.ts` | Restore watchdog job errors; retain conflict 409. |

`WatchdogExceptionFilter` already has `@Catch(WatchdogError)`; `PracticeErrorsFilter` already has `@Catch(PracticeAccessError)`. Neither needed weakening or broadening. The new real-module regression initializes `AppModule` without listening, asserts both registered filters and `ContractorController`, and uses Nest's `RouterExceptionFilters` against that module's actual global filter configuration. It verifies practice 401/404/403 and watchdog 409/409/404 independently, including both decorators' exact catch types.

No new production/practice route was introduced. All affected watchdog handlers continue through `PracticeAccess`; the proof replay implementation also authorizes the job and referenced evidence before returning saved content.

## Tests and other integration fixes

- `apps/api/src/watchdog-registry.test.ts`: retain all earlier assertions. Load the real Next `hasSyntheticSession`/`practiceFailure` helpers with only infrastructure dependencies doubled. Supply an authenticated synthetic owner in the existing replay pools. Trace SBOX's read-only ownership transactions separately from business transactions so the original rollback/no-business-commit assertions continue to prove the command refusal. Add real-module filter coverage, stranger/missing-session status checks for 18 handler variants in Nest and Next, and typed idempotency/live/job-error mapping checks for 16 mutation variants. Idempotency errors are derived from the real `claimCommandIdentity` routine; DB transport remains doubled.
- `apps/api/src/proof/proof.application.test.ts`: the existing “proof complete preserves ownership and domain validation for owned pending upload” went red (`FORBIDDEN`) because restored replay logic checks active membership. Supply that active membership row in the DB double. Preserve `PROOF_INVALID`, foreign/unknown `NOT_FOUND`, and exact completion/get call-count assertions. All three cases pass.
- `apps/api/src/health.test.ts`: “reports liveness without configuring or opening a datasource” went red because Supertest binds a listener (`listen EPERM`). Send the GET through the actual initialized Express/Nest route using in-memory Node request/response objects. Preserve both HTTP 200 and exact `{status:"ok"}` assertions, with application cleanup in `finally`. It passes without a socket.
- `apps/web/e2e/CH-2.spec.ts`: replace shared legacy home-job constants with IDs obtained from the current session's actual `/api/jobs` result. Keep title/status/link, unchanged-state, changed-job 409, reload, exact proof replay and zero-external-action assertions; add an ID-shape assertion. Existing second browser contexts already use the first context's `storageState`; retain that. All four tests remain present in both projects (eight cases discovered). Execution is CI-only here.
- `apps/web/e2e/SBOX-SESSION-1.spec.ts`: source inspection found its supplier/order setup would now hit CH-2's live guard. Preserve the original unconfirmed captured job and every creation/stranger/missing/invented-session/proposal/reload assertion. Create a separate captured job in that same session, review/confirm its fictional scope and switch it live through `startWatchdogJob` before attaching supplier sources and checking evidence-pack isolation. No direct status write, success interception, timeout change or removed assertion. Both project cases discovered; execution is CI-only.

The existing reviewed saved-proof-response, changed payload/job/action, legacy readiness, purchase-order replay, migration registry and non-blocking-trigger tests remain green in the final API unit run. No assertion was weakened, skipped or deleted; no timeout was added or increased.

## Lane and migrations

Only the compact `ch-2` line in `config/agent-lane-assignments.json` changed (line 3); its allow list is sorted. Added exactly:

1. `apps/api/src/health.test.ts` — repair the socket-dependent API unit test while retaining the actual route/status/body assertions.
2. `apps/api/src/proof/proof.application.test.ts` — adapt the SBOX ownership fixture to CH-2's restored membership/replay prerequisite.
3. `apps/web/e2e/SBOX-SESSION-1.spec.ts` — reconcile SBOX's supplier setup with CH-2's existing live-only invariant without changing its original ownership/reload assertions.

No other lane line or migration changed. `0096_watchdog_live.sql` is byte-identical to `58eef49` and the integration HEAD; SHA-256 `4b369d40e3d952a19267601245fae6a961925242666d34411176512994b1a4c4`. Ben's keep-triggers decision and the non-blocking `pg_try_advisory_xact_lock` trigger remain intact. The integrator's 0054/0094/0096 migration registration, exports, MIGRATIONS.md, §12.2 ledger and count-agnostic bootstrap/UIWIRE-12 changes remain intact. There is no new migration, backfill or rollback procedure for this round.

## Executed checks

Dependencies were already installed; no install was run. Node `v24.17.0`; use the already-cached pinned pnpm `10.28.1` via `PATH=/private/tmp/jg-ch2-round12-bin:$PATH`. The default machine pnpm dispatch stalled and was interrupted (130); the temporary PATH points to the cached pinned executable and leaves repository configuration unchanged. Logs are under `/private/tmp/ch2-*.log`.

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm typecheck` | 0 | Final run: all seven packages. An intermediate run exited 2 on an `unknown` test error passed to Nest's handler; add an `instanceof Error` narrowing and rerun green. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | Final run: all four repository boundary checks and all seven package checks. The intermediate narrowing error also produced exit 2 here; corrected. No self-comparison refusal: base is main `3395d34`, HEAD is `9e664bc`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Passed the final working-tree scope including this receipt and the three justified exact additions. |
| `pnpm build` | 0 | Initial dependency rebuild and final complete seven-package build both pass. Final Next compile, type validation and prerender pass. |
| `pnpm openapi:check` | 1 | Sandbox limitation: the installed `tsx` CLI attempts an IPC listener before loading the generator (`listen EPERM …/tsx-501/…pipe`). This is not a schema mismatch. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Socket-free invocation of the same source generator/check with the same installed tsx transformer passes. `apps/api/openapi.json` matches exactly; no regeneration needed. The standard wrapper remains for CI where IPC is permitted. |
| `pnpm --filter @jobguard/api exec vitest run src` | 0 / 1 | A complete run passed all 20 files and 451 tests. A final-tree repeat had 450 pass and one existing five-second timeout in “classifies standalone job mutations and dispatcher command literals too” (5.483s) under parallel workers. Early run exited 1 (266 failures with stale compiled workspace exports and old CH-2 doubles); rebuild and session/helper adaptation removed those. The next run exited 1 with only the named health/pending-proof failures above; both repaired without weakening assertions. Subsequent run: 435 passed, then 451 after complete transport coverage. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` | 0 | Final-tree serial run: all 20 files and 451 tests pass, with the original five-second limits and no test excluded. |
| `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts` | 0 | Intermediate targeted run: 93 tests, before adding the final 16 typed-refusal transport variants. Those are included in the final 451-test API run. |
| `pnpm --filter @jobguard/web test` | 0 | 11 files, 100 unit tests. |
| `pnpm --filter @jobguard/core test` | 1 | Initial concurrent run: five existing timeout failures in source/generated copies of receipt-allocation and enterprise boundary tests (2,851 passed). No assertion failure or altered timeout. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 1 | While other compilation/tests competed for CPU, the existing “the working size is bounded: more distinct denominators than the documented limit fail closed” exceeded the existing 5-second timeout (1,427 passed). |
| `pnpm --filter @jobguard/core test --maxWorkers=1` | 0 | Final run after other checks finished: 106 files, all 2,856 tests pass, including generated copies. No tests excluded and no timeout changed. The source suite has 1,428 tests; its emitted copies explain the doubled total. |
| `pnpm --filter @jobguard/db exec vitest run test/verify-evidence-pack-cli.test.ts` | 0 | Four DB-package unit tests; no PostgreSQL integration claimed. |
| `node --test tools/*.test.mjs` | 0 | All 42 repository tool tests pass. |
| `pnpm --filter @jobguard/web exec playwright test --list CH-2.spec.ts` | 0 | All eight CH-2 cases discovered in mobile-360 and desktop. |
| `pnpm --filter @jobguard/web exec playwright test --list CH-2.spec.ts SBOX-SESSION-1.spec.ts` | 0 | Ten cases discovered: eight CH-2 plus the two SBOX isolation project cases. This is collection, not browser execution. |
| `git diff --check` | 0 | No whitespace errors. |
| Read-only migration/lane comparison | 0 | No migration diff from integration HEAD; 0096 matches reviewed bytes. Only the CH-2 lane line changed; only the three listed paths were added. |

Turbo could read some shared worktree cache entries but could not write its shared cache (`IO error: Operation not permitted`); final task summaries still report seven successful checks/builds. Next also printed its existing multiple-lockfile root warning. Neither changed the checks' successful exit codes.

Relevant red/green names: health liveness; proof ownership/domain validation for owned pending upload; saved proof identical-response and changed payload/job/action replays; legacy readiness record/advance conflicts; purchase-order foreign-job/dispatcher-receipt conflicts; all round 10 deployed Next identity adapters; and the new round 12 real-module filter, stranger/missing-session, and typed-refusal transport cases. Core's time-limited receipt-allocation/enterprise checks pass in the final complete serial run. Browser fixture repairs are source-inspected/collected and await CI execution.

## Limits and handoff

Synthetic fixtures only. No live providers, real sends, spending, production mode or policy/decision approvals. Next's optimized build is compilation/prerender validation, not enabling production business mode. Database transport doubles prove adapter behavior, not PostgreSQL RLS, locking or transactional durability.

PostgreSQL integration/migration suites and browser execution were deliberately left for GitHub CI after the dispatcher pushes: this sandbox cannot start PostgreSQL or bind listeners. The full eight CH-2 browser cases, SBOX isolation case and existing mandatory suites remain required. A fresh independent cross-model verdict against the dispatcher's exact commit, separate technical acceptance and founder merge/release authorization are outstanding. No Git write, commit, push, merge or PR operation was performed.

Intended conventional commit subject/body: `/private/tmp/jg-msg-ch-2.txt`.
