# AUDIT-FIX-DBSRC-08 builder receipt

Status: implementation ready; HOLD for Mac/CI database/HTTP/browser and committed-range lane checks, independent RED verdict and separate acceptance.

Issued 13 October 2026 by dispatcher 4. Base and uncommitted HEAD: `bd959b01e857de0ba7cbd3588bab84add7d0f493` (`origin/main`). Branch: `codex/sandbox/audit-fix-dbsrc-08`. Check lane: RED (money, current role permission, tenant-scoped catalogue serialization). Source report: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-08.md`.

All four BLOCKING findings reproduced in new deterministic SQL protocol tests before source fixes. PostgreSQL regression tests are written but cannot run in this sandbox. No claim of database verification, live provider testing, model review or acceptance.

## Reproduction and implementation

1. Gross material rates require tax review: before fix, expected `review`, received `applicable`. Now only an explicitly net rate can produce net money; gross/unknown requires tax review without inventing a conversion policy.
2. Demoted approver cannot execute queued sends: before fix, delivery spy called once instead of zero. Executor's authorization join now checks current `owner` permission, matching the dispatcher.
3. Concurrent first rate saves create one catalogue identity: before fix, two successes instead of one. Acquire a transaction-scoped PostgreSQL advisory lock on the tenant/case-insensitive merchant/exact SKU key before reading. The losing save sees the committed version and raises the existing `STALE_MATERIAL_RATE_REVISION` error. All repository rate writers share this lock; raw privileged SQL and already-existing duplicate identities are outside this application serialization guarantee. Hash collisions only serialize unrelated keys.
4. Migration commit survives lost acknowledgement: before fix, restart rejected with `relation merchant already exists`. Runner inserts its migration record immediately before the existing script's final COMMIT in the same SQL submission and transaction. Migration files, names and sequence stay unchanged. Scripts outside the explicit BEGIN/final COMMIT convention fail closed. This prevents future unrecorded commits; it does not repair an already inconsistent installation.

DROPPED: none.

No migration, schema, product grant, RLS or provider change. Standard F: no new product grant. The new PostgreSQL fixture login inherits only the existing `jobguard_runtime` role, as in earlier suites.

## Preservation and scope

No existing test, expected value, refusal, count, pinned name or fingerprint edited. `apps/api/src/auth/context-boundary.test.ts` and all its pinned lists untouched. No premise setup inserted into an existing test. No existing catalogue row edited. Lane registry before: no `audit-fix-dbsrc-08` row. After: one compact row with exactly the seven changed paths, including this receipt and the two new test files. Shared lane registry and the three DB source files serialize with other work touching them.

Invariants affected: AGENTS 5.1, 5.3, 5.4, 5.5; BUILD_PLAN 5.3/5.4 and C4/C5/C6/C8. C1: repairs to existing repository/executor/migration behavior; no new route or UI. AI/model/eval changes: none. No real data, spending, sends or approvals. No Git write commands.

## LATER findings (receipt only)

- Boolean `safeRetry=true` can bypass unresolved-outcome protection in `operateOutbox`.
- Executor ignores `next_attempt_at` backoff.
- Execution/reconciliation/cancellation lack transactional audit-chain outcome events.

The report's five suggested existing-test strengthenings are outside this dispatch; existing tests remain unchanged.

## Commands and remaining gates

Commands actually run and the dispatcher checklist are recorded below.

Environment: supplied installed dependencies; no install or download performed. Actual runtime Node `v24.17.0` (repository `.nvmrc`: `24.15.0`), pnpm `10.28.1` loaded from its existing Corepack cache. The default pnpm launcher stalled on `--version` and was interrupted; commands below use `PATH=/private/tmp/jg-dbsrc08-bin:$PATH`, whose wrapper invokes `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Temporary configs/logs are outside the working tree. This is not a clean pinned-install receipt. Turbo reused unchanged package caches and executed changed DB/API/web tasks; cache-write warnings (`Operation not permitted`) are recorded in the logs.

Reproduction command: `pnpm --filter @jobguard/db exec vitest run --config /private/tmp/jg-dbsrc08-vitest.config.mjs src/audit-fix-dbsrc-08.test.ts` — exit 1, all four failures for the report's expected reasons, before any source fix. The temporary config maps existing workspace packages to their actual source because core's compiled exports were initially absent. Initial attempts without that alias failed to load core and ran zero tests; those are not reproduction evidence. `pnpm --filter @jobguard/core build` supplied the prerequisite (exit 0).

Final focused command: `pnpm --filter @jobguard/db exec vitest run src/audit-fix-dbsrc-08.test.ts src/outbox.test.ts --maxWorkers=1` — exit 0, 9 passed, using the repository's normal Vitest config. The earlier post-fix source-alias run also passed 9. The initial typecheck/build/package-lint and standalone new-integration typecheck failed on a widened string literal in the two new delivery spies; fixed with `as const` only, without changing assertions. The standalone new PostgreSQL test now typechecks: `node node_modules/.pnpm/typescript@5.8.3/node_modules/typescript/bin/tsc -p /private/tmp/jg-dbsrc08-integration-tsconfig.json` — exit 0 (absolute-path extension of DB tsconfig, noEmit, includes the new integration file).

`LANE_BASE_REF=origin/main pnpm lint` — exit 1 after core purity passed; lane tool refuses `HEAD == origin/main`. `LANE_BASE_REF=origin/main pnpm lint:lanes` — exit 1 for the same self-comparison refusal. Neither checker nor baseline altered. Separately checked the working-tree diff/untracked paths against the exact allow list, byte-compared every old lane row and the protected auth test to origin/main, and classified those paths with the unchanged external lane-floor.py matcher/map: all scope checks pass, path floor AMBER, raised to RED for money/current roles. This is supplementary deterministic scope evidence, not a pass from the lane tool. Protected auth SHA-256 remains `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`.

Other checks: `node --test tools/core-purity.test.mjs` — exit 0, 1 passed; `node tools/money-arithmetic-lint.mjs` — exit 0; `node tools/commercial-boundary-lint.mjs` — exit 0; `git diff --check` — exit 0. All migration SQL still starts with BEGIN and ends with COMMIT, and no migration file differs.

`pnpm openapi:check` — exit 1: tsx CLI IPC socket `listen EPERM`. Socket-free equivalent from apps/api, `node --import tsx src/generate-openapi.ts --check` — exit 0 after DB build artifacts existed. Initial loader attempt failed on missing DB dist; rerun succeeded without changing any OpenAPI schema or generator.

Broader units:

- `pnpm --filter @jobguard/core --filter @jobguard/ai --filter @jobguard/config --filter @jobguard/storage test` was interrupted (exit 130) after picking up both emitted dist tests and sources. Generated pricing/allocation source-inspection tests failed against JavaScript, and allocation tests exceeded their existing limits. Config: 2 passed; storage: 4 passed (source and emitted copies). No source test modified.
- `pnpm --workspace-concurrency=1 --filter @jobguard/core --filter @jobguard/ai --filter @jobguard/config --filter @jobguard/storage exec vitest run src --maxWorkers=1` — exit 1 at core: 2442 passed, 3 timed out in 5000ms (two receipt-allocation stress tests and enterprise-domain production-source inspection); 79 files passed, 2 failed. No timeout raised. Subsequent packages do not run after that failure.
- `pnpm --filter @jobguard/ai exec vitest run src --maxWorkers=1` — exit 0, 80 passed. Synthetic gateway fixtures only; not a live-model evaluation.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src test --exclude 'test/**/*.integration.test.ts' --exclude test/free-port.test.ts` — exit 1: 159 passed, 14 failed. One audit-checkpoint topology timeout and 13 audit-export CLI failures before DB dist existed. Rerun of those two files after build artifacts existed: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/verify-audit-export-cli.test.ts src/audit-checkpoint-handoff.test.ts` — exit 1: 69 passed, one unchanged 5000ms topology timeout. All 14 audit-export CLI tests now pass.
- `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1 --config /private/tmp/jg-dbsrc08-all-sources.config.mjs` — exit 0: 784 passed in 33 files. Temporary config maps workspace export names to the actual source and preserves e2e/node_modules/.next exclusions. An earlier normal-config attempt was interrupted after a missing compiled dependency prevented a suite loading.

Root `pnpm test` not run: it includes PostgreSQL suites and tool tests that write temporary Git repositories, both outside this sandbox's dispatch permissions. `pnpm test:db`, `pnpm test:migrations`, and browser suites not run: PostgreSQL/server/browser execution is prohibited here. No new browser workflow or spec; existing material/quote browser regressions remain mandatory on Mac/CI.

Backwards compatibility: gross rates now explicitly require review; demoted approvers leave their queued actions pending without an attempt; competing expected-version saves receive the existing stale error. No schema backfill or deployment change. Source rollback is sufficient, with no database rollback; an already-unrecorded committed migration requires separate operator diagnosis and is not repaired here. No new operational alerts introduced. Professional/security/commercial release gates unchanged.

Dispatcher must commit using `/private/tmp/jg-msg-audit-fix-dbsrc-08.txt` and then run, on the Mac or GitHub CI with the pinned install/runtime:

1. `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm build`, `pnpm openapi:check`, `pnpm test`.
2. `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-fix-dbsrc-08.integration.test.ts test/materials.integration.test.ts test/outbox.integration.test.ts`, `pnpm test:db`, `pnpm test:migrations`. New suite checks actual runtime-role SQL, two distinct PostgreSQL backends, first-save serialization, fresh setup and restart of an upgrade immediately before 0031 after committed-but-unacknowledged SQL, with unchanged prior tenant data.
3. `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M2-1A-S.spec.ts M2-1B-S.spec.ts quote-send.spec.ts m1-15-complete-journey.spec.ts`, plus the established full `pnpm test:e2e` gate.
4. Bind a real independent RED verdict to the dispatcher's exact commit, followed by separate technical acceptance. No acceptance or release is inferred from this receipt.

Final whole-workspace compiler checks: `LANE_BASE_REF=origin/main pnpm typecheck` — exit 0, all 7 packages successful (4 cache hits). `pnpm exec turbo run lint` — exit 0, all 7 package lint tasks successful (4 cache hits). This package-lint result does not replace the root lint/lane refusal described above.

Final `pnpm build` — exit 0, all 7 packages successful (4 cache hits), including Next production compilation, type validation, static page generation and build traces. Existing workspace-root/autoprefixer warnings and restricted cache writes did not prevent the build.

`pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --config /private/tmp/jg-dbsrc08-vitest.config.mjs --exclude src/shadow-isolation.application.test.ts` — exit 1: 1572 passed, 109 failed, 1 skipped (existing skip), 63 files passed and 8 failed. 108 HTTP cases fail because Supertest tries to bind a socket (`listen EPERM`); the remaining failure is the unchanged 5000ms watchdog-registry source-inspection limit. The PostgreSQL/browser shadow-isolation file was excluded as prohibited execution, and all HTTP cases must be rerun on the Mac. No assertion or test skip changed in the repository.

After compiler/build jobs finished, reran the existing timed-out core files unchanged: `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts src/enterprise-domain/boundaries.test.ts --maxWorkers=1` — exit 0, all 39 tests passed in 2.38s. Their earlier failures were time-limit failures under concurrent verification; no timeout or assertion changed.

The unchanged checkpoint suite also passes with compiler jobs finished: `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1` — exit 0, all 56 passed in 2.18s. Both DB unit files that failed in the earlier broad run have now passed without altered limits or expectations.

The unchanged registry suite passes after compiler jobs finished: `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts --maxWorkers=1` — exit 0, all 121 passed. All observed source-inspection/stress timeouts have passed on unchanged reruns; the unresolved API failures are the 108 socket-dependent cases. No failures were converted into new skips.

Final preservation/scope check: exact seven working-tree paths still match the new lane's allow list; every prior lane row is unchanged; migration files and the protected auth test are unchanged; `git diff --check` passes. Intended commit subject/body are written to `/private/tmp/jg-msg-audit-fix-dbsrc-08.txt`. No commit, staging, checkout, push, merge, Git fixture creation or acceptance performed. The dispatcher owns the new commit and remaining verification.
