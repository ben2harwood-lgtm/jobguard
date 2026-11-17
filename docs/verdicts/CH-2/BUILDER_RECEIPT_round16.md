# CH-2 builder receipt — round 16, CH-3a integration

PR #97; branch `codex/sandbox/ch-2`; working tree based on integration HEAD `aac02efd2947b111163ef93901f7446d18cee256` (main `0264158ffa8fbe61f7c896be9a9c5aa210f07af0`). Comparison base: `3395d343fd50d979c734daf4946ba293ee2ed836`. Reviewed CH-2 source: `c7c0d7e`, whose earlier Opus PASS (comment 6047659537) does **not** constitute review of this integration diff.

Implementation is ready for dispatcher commit and CI. This is a builder run receipt, not independent review or technical acceptance. PostgreSQL, migration, browser and listener-based health verification remain mandatory in CI.

## Per-file integration

| File | Re-applied CH-2 behavior and preserved CH-3a behavior |
| --- | --- |
| `apps/api/src/app.module.ts` | Restored the import/global registration of `WatchdogExceptionFilter`; retained `PracticeErrorsFilter`, `ContractorController`, `JobPartiesController` and `JobPartiesListController`. |
| `apps/web/app/ui/quote-editor.tsx` | Restored the watchdog panel around live proof. Retained party loading/readiness, binding-bound preview, `PARTIES_CHANGED` guards for download/send, stale-preview copy, party-aware activation controls and lifecycle event. |
| `apps/web/app/ui/workspace-shell.tsx` | Restored both `WatchdogStatusProvider` branches and all watchdog panels, including proof/read-only controls. Retained `<JobParties>` in both branches, outside the disabling watchdog fieldsets. |
| `packages/db/test/evidence.integration.test.ts` | Restored command-based live import before proof/evidence setup. Kept CH-3a's legacy party recipe and UTF8 cluster. All 33 reviewed assertions retained. |
| `packages/db/test/inbox-relevance.integration.test.ts` | Restored live imports of both fixture jobs. Kept legacy party recipe and UTF8. All 8 assertions retained. Additional strict test compilation exposed two inherited typing errors: made the synthetic branded-context cast explicit through `unknown` and passed a mutable copy of readonly query arguments; no runtime/assertion change. |
| `packages/db/test/materials.integration.test.ts` | Restored both live fixture imports. Kept legacy party recipe and UTF8; all 8 assertions retained. |
| `packages/db/test/practice-session.integration.test.ts` | Retained explicit `seedSyntheticPartyFixture` and transaction-local tenant context before quote documents. Restored `transition_job` through quoting, accepted and live before evidence; supplier originals/versions are recorded while live before recovery/invoicing. Retained UTF8 and all 56 reviewed assertions. Added the generated-home/session regression below. |
| `packages/db/test/readiness.integration.test.ts` | Restored live imports, tenant-context helper for direct legacy rows, and all five historical replay/concurrent-command regression tests. Retained legacy party recipe and UTF8; all 44 reviewed assertions retained. |
| `packages/db/test/supplier-documents.integration.test.ts` | Restored both live imports and CH-2's reviewed exact-first-result replay assertion (`replayed:false`, including replay). Retained legacy party recipe and UTF8; all 15 reviewed assertions retained. The pre-CH-2 `replayed:true` flag on main is replaced by the already-reviewed CH-2 first-result assertion, not by removing the assertion or relaxing idempotency. |
| `packages/db/test/supplier-matching.integration.test.ts` | Restored both live imports. Retained legacy party recipe and UTF8; all 19 assertions retained. |
| `packages/db/test/watchdog-fixtures.ts` | Adapted the shared synthetic adoption recipe to CH-3a: seed explicit fictional customer/site revisions under tenant context, supply `job-parties.v1`, and use required `import:<job>` semantic key. Business adoption still runs as runtime through the real dispatcher/controlled routine, with its synthetic authorization, immutable binding/baseline and audit; no direct status write. |
| `packages/db/test/pool-test-utils.ts` | The legacy synthetic party hook leaves an imported draft to the adoption routine, which binds its supplied parties itself. This prevents duplicate current-binding insertion. All other legacy party/document fixture behavior and every production guard remain intact. |
| `packages/db/test/watchdog-migration-owner.integration.test.ts` | Installed the fictional party recipe before seeding the historical live rows in the pre-0096 schema (which now includes 0095). Retained the cross-job mislink, non-superuser owner, rollback, validation and FORCE-RLS assertions. |
| `packages/db/test/watchdog.integration.test.ts` | Added real-runtime coverage for watchdog input before/after an audited live-party correction, correction replay, unchanged imported baseline binding, live lifecycle, exact watchdog replay, and one correction audit event. Existing assertions/races retained. |
| `packages/core/src/watchdog.ts` | Added five exhaustive `pre_live_allowed` classifications: Next parties/party import, Nest parties/party import and Nest quote preview. Party setup/correction/adoption and quote preview remain available before live; CH-3a's specific authorization/revision/correction rules still apply. No live-only classification changed. |
| `apps/api/src/watchdog-registry.test.ts` | Added real AppModule assertions for both party controllers alongside the existing Contractor/controller/filter/error-dispatch assertions. Exhaustive route discovery remains unchanged and now passes. |
| `config/agent-lane-assignments.json` | Added **only** `packages/db/test/pool-test-utils.ts` to the existing `ch-2` allow list, on its single compact JSON line. Required because CH-3a's shared legacy fixture hook otherwise collides with controlled adoption. All other lane entries are identical. |
| `docs/verdicts/CH-2/BUILDER_RECEIPT_round16.md` | This receipt. |

Shared edits serialized in this working tree: AppModule, UI composition, command registry and the exact legacy fixture helper. No other agent was launched. The integrator's migration order/exports, MIGRATIONS.md, ledger and count-agnostic UIWIRE-12/demo-bootstrap changes remain intact. The shared evidence-pack fixture remains unchanged: modern callers already install CH-3a's party recipe, and its genuine 0041 upgrade caller must remain compatible with the schema before parties existed.

## Migration interplay — source findings and CI coverage

No migration SQL change was needed. `require_job_parties()` checks entry into live and snapshots documents/baselines; 0096 guards watchdog tables, not party tables. A live binding correction updates the job revision without re-entering live. Both routines lock the same job consistently, and binding correction does not mutate the original baseline binding. The new runtime integration case exercises correction and watchdog inputs together.

0094's session issuer inserts generated home jobs only. 0095's `job_parties_generated_practice` hook runs before its live-party guard, supplies the generated live job's binding and leaves quoting jobs unbound. 0096 adds no job-insert watchdog guard. The new session regression asserts three owned homes, one bound live home, successful/replayed watchdog input on it, and atomic `JOB_NOT_LIVE` refusals on the two quoting homes.

The actual source conflicts were in synthetic setup: the old adoption helper omitted required party revisions and used the wrong semantic key; the legacy hook would pre-bind the adoption's draft and collide with its controlled insert. These are repaired in fixtures, not by bypassing the production guards. The older migration-owner fixture also needed fictional parties because its preceding schema now includes 0095.

These PostgreSQL regressions were source-inspected and typechecked, **not executed locally**. CI must prove the SQL behavior, including the seven restored suites, CH-3a party suites, SBOX issuance, CH-2 replay/lock-order/race/owner/upgrade suites and browser regressions.

All existing migration files numbered 0000–0095 match main byte-for-byte. `0096_watchdog_live.sql` matches `c7c0d7e` byte-for-byte:

`SHA-256 4b369d40e3d952a19267601245fae6a961925242666d34411176512994b1a4c4`

Ben's **keep triggers** decision and non-blocking `pg_try_advisory_xact_lock` remain unchanged. No new migration, backfill, rollback/forward-fix procedure, grant, RLS change, operational alert or external action.

## Executed checks and red/green evidence

Installed dependencies only; Node `v24.17.0`, pinned pnpm `10.28.1`. The default global pnpm launcher stalled on the initial typecheck attempt (interrupted, exit 130). Subsequent pnpm commands used an already-installed 10.28.1 binary via `/private/tmp/jg-ch2-bin` in PATH/PNPM_HOME. No installation/download command was run. Turbo emitted shared-cache `Operation not permitted` warnings but reported successful checks; these are not test failures.

| Command | Exit | Actual result |
| --- | ---: | --- |
| `pnpm typecheck` (pinned runs, including final product diff) | 0 | Seven package checks passed; final run 7 successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint` (initial and final product diff) | 0 | Purity, lane, money/commercial boundaries and seven package lint checks passed. No self-comparison refusal: origin/main is 0264158, HEAD is aac02ef. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | CH-2 lane passes, including working-tree paths and the one exact helper addition. Rechecked after receipt creation. |
| `pnpm build` (initial and final product diff) | 0 | All seven packages, Nest and production Next build passed; final run 7 successful, 2 cached. |
| `pnpm openapi:check` | 1 | `tsx` launcher failed creating its IPC socket: `listen EPERM`. This does not establish stale OpenAPI. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator/check through the loader without the launcher socket. Generated content equals `apps/api/openapi.json`; no regeneration needed. Rechecked at completion. |
| `pnpm --filter @jobguard/api test` (first run) | 1 | 498 passed, 3 failed: two real unclassified-route failures and the health listener failure. |
| `pnpm --filter @jobguard/api test` (after registry repair) | 1 | **500 passed; only `health.test.ts` failed**, with sandbox `listen EPERM` on `0.0.0.0` (one associated uncaught listener error). Full API suite remains mandatory in CI; no test was excluded/skipped. Its chained OpenAPI command was not reached; the separate check above ran. |
| `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts` | 0 | All 120 tests passed after fixing the registry: route exhaustiveness, genuine module registration, scoped error filters, previous replay/portability/lock checks. |
| `pnpm --filter @jobguard/web test` (before dependency build finished) | 1 | Stale built exports: 2 failing files, 100 passing/10 failing tests; party schemas were undefined. No assertion changed to address this. |
| `pnpm --filter @jobguard/web test` (after shared package build) | 0 | 13 files, **115 tests passed**. |
| `pnpm --filter @jobguard/db exec vitest run src` | 0 | Both DB unit files, **8 tests passed**. This is not PostgreSQL integration evidence. |
| `pnpm --filter @jobguard/core --filter @jobguard/ai --filter @jobguard/config --filter @jobguard/storage test` | 0 | Core 2874; AI synthetic fixtures 72; config 2; storage 4 tests passed. No live-model/provider evaluation. |
| `pnpm --filter @jobguard/core test` (after registry change) | 0 | 108 files, **2874 tests passed**. |
| `node --test tools/*.test.mjs` | 0 | **42 tests passed**, zero skipped. Repository Git state untouched. |
| `pnpm turbo run build --filter=@jobguard/core` | 0 | Rebuilt final registry exports before repeat API/core verification. |
| `pnpm --filter @jobguard/core exec tsc -p tsconfig.json --noEmit` | 0 | Additional direct pinned-run check. |
| `node_modules/.bin/tsc -p /private/tmp/jg-ch2-test-types.json` | 0 / 2 / 0 | Focused new/edited fixture compilation initially passed; expansion to every edited DB test/helper exposed the two inherited inbox typing errors; after the fixture-only fixes every selected test/helper compiles. Temporary config extends the repo's strict configuration with Nest decorators, no emit and explicit changed DB test/helper files. |
| `node /private/tmp/jg-ch2-assertions.cjs` | 0 | Deterministic AST comparison: all **183** reviewed CH-2 matcher assertions in the seven restored suites retained, plus 9 new session assertions. This is source evidence, not model review or execution. |
| Migration byte/lane comparison script and `git diff --check` | 0 | Every merged migration unchanged; 0096 reviewed hash matches; only the exact CH-2 helper path added to lane configuration; whitespace clean. |

Logs are under `/private/tmp/ch2-r16-*.log`. Temporary diagnostic scripts/configuration are outside the repository. No assertion deleted, weakened or skipped; no timeout added or increased. The restored supplier replay assertion is exactly CH-2's previously reviewed first-result contract.

## Dispatcher handoff and remaining gates

No local PostgreSQL process, browser suite, `pnpm test:db`, `pnpm test:migrations`, or full root `pnpm test` was run: this sandbox cannot bind listeners/start PostgreSQL, and the root test command includes those DB suites. No substitute mocks are claimed as database/browser proof. The full API health test also needs the unrestricted CI runner. Browser projects remain both mobile-360 and desktop, including CH-2, CH-3a and SBOX-SESSION-1 and earlier mandatory regressions.

Synthetic data only. No live providers, spending, real sends, production activation or policy/decision approval. Existing synthetic command authorization fixtures were preserved. No model/prompt/provider route, commercial formula, fee entitlement, money representation, audit or tenant-isolation guarantee changed. Public request/response schemas and OpenAPI remain unchanged.

Intended commit message is written to `/private/tmp/jg-msg-ch-2.txt`. No repository commit, add, checkout, push, merge or PR operation was performed. Dispatcher must commit, run CI, obtain a fresh independent verdict bound to that exact commit and separate technical acceptance. Prior c7c0d7e approval is historical evidence only; production/pilot release gates remain unchanged.
