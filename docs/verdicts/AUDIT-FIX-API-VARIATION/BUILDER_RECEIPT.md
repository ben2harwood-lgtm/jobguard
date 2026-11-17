# AUDIT-FIX-API-VARIATION — builder receipt

## Repair round r1 — dispatcher 5, 14 October 2026

PR #191, branch `codex/sandbox/audit-fix-api-variation`, repair starting HEAD `de2137732b45e83b955dc48ac16b082e2189046e`; local `origin/main` is `45de036b3f9f1cca8d51b0781f6334a03ba0a595`. This section supersedes the original run's current-head/validation claims below; the original receipt is retained as historical evidence. No git-writing command or install/download was run. PostgreSQL and browser suites cannot start in this sandbox and are deferred to CI. Intended commit message is `/private/tmp/jg-msg-audit-fix-api-variation.txt`; the dispatcher commits and pushes the working tree.

Read the supplied CI log `/Users/benharwood/.local/share/full-steam/jg-runs/audit-fix-api-variation-ci-failed-38503777928.log` for GitHub run `38503777928`. Its lines 1353–1358 report both addition/omission cases failing with `INVALID_VARIATION_COMMAND` at `packages/db/test/audit-api-value.integration.test.ts:52:2`, from `VariationApplication.command` at `apps/api/src/variation/variation.application.ts:5:160`. CI reports 138 database test files / 1,960 tests passing, with exactly those two cases failing. This is evidence from that pre-repair CI run, not a local PostgreSQL run or proof that this repair passes PostgreSQL.

**Cause and permitted repair.** The failing statement is the setup's second `variations.command(jobId, ...)`, with `action: "revise"`. It omits the expected revision newly required at `apps/api/src/variation/contracts.ts:5`. Approval leaves `first.id` as the current revision; the application compares that pointer without refusing an approved-current-revision edit, and `insertPricedVariation` rechecks its predecessor under the row lock. The strictness is correct for the documented concurrency contract (`docs/contracts/variation-edit-concurrency-v1.md`, BUILD_PLAN §5.2/§5.3 and C5); dropping it would reopen stale-edit races. No product code or rejection semantics changed in r1.

Dispatcher 5 explicitly permits this premise-establishing setup addition in the merged #186 test. Exact before/after at `packages/db/test/audit-api-value.integration.test.ts:52` (line number unchanged):

```ts
// Before:
await variations.command(jobId, { version: "variation-command.v1", action: "revise", variationId, revisionId: secondId, description: "Fictional revised price", price: price(15000) });
// After:
await variations.command(jobId, { version: "variation-command.v1", action: "revise", variationId, revisionId: secondId, expectedRevisionId: first.id, description: "Fictional revised price", price: price(15000) });
```

Only `expectedRevisionId: first.id` was added to that setup payload; the same application call, action, new revision ID, description and price are retained. Every assertion, expected value, refusal and count is byte-identical. A deterministic comparison against HEAD proves that deleting this single added property restores the entire merged test file byte for byte. The protected `apps/api/src/auth/context-boundary.test.ts` is byte-identical to HEAD, SHA-256 `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`.

The own lane's allow-list in `config/agent-lane-assignments.json:166` adds only the exact setup-test path authorized for r1. A parsed comparison against HEAD confirms every other lane and every other field in this lane remains unchanged. Shared registry/setup-test edits serialize with the dispatcher; no blanket allowance. Existing RED classification remains.

A standalone schema probe uses the real `variationCommandV1` with both directions and proves each original payload fails only at `expectedRevisionId` (`invalid_type`), then validates each payload with `first.id`. This is schema-only evidence; it does not emulate or claim PostgreSQL execution. Strict TypeScript checking covers the repaired merged integration file and both piece regression files.

**Repair validation.** Installed Node `v24.17.0` and cached pinned pnpm `10.28.1` were used. The default pnpm launcher stalled at version resolution and was interrupted; subsequent invocations use `PATH=/private/tmp/ch4-pnpm-bin:$PATH`. No dependency install/download was run. Local validation results follow in the completed r1 table.

Local root checks run with `LANE_BASE_REF=origin/main`; pnpm commands use the pinned launcher above. All results are deterministic local evidence, not an independent verdict.

| r1 command actually run | Result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | Exit 0, 7/7 tasks (4 cached) |
| `pnpm lint --concurrency=1` | Exit 0, boundary checks and 7/7 tasks (4 cached) |
| `pnpm lint:lanes` (including after receipt changes) | Exit 0, exact own lane |
| `pnpm build --concurrency=1` | Exit 0, 7/7 tasks (4 cached); existing Next workspace-root/CSS and sandbox cache-write warnings |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC listener gets sandbox `EPERM`; not an OpenAPI comparison failure |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | Exit 0, same check without CLI IPC; committed OpenAPI unchanged |
| `node --import tsx --input-type=module` from `apps/api`, stdin schema probe | Exit 0, original/repaired setup payload validation for both directions |
| `node node_modules/typescript/bin/tsc -p /private/tmp/jg-api-variation-r1-tests-tsconfig.json` | Exit 0, strict checking of repaired merged integration setup and both piece regression files |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude '**/dist/**' --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'` | Exit 1, 204 passed / 1 default-timeout failure in existing C-OPS-1 source-graph inspection; 16 files / 205 tests |
| `pnpm --filter @jobguard/db exec vitest run src/audit-checkpoint-handoff.test.ts --maxWorkers=1 --testTimeout=60000 --testNamePattern='C-OPS-1'` | Exit 0, the sole failed check passed; 55 unrelated tests skipped only in this targeted rerun |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1 --testTimeout=60000` | Exit 0, 81 files / 2,445 tests |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --testTimeout=60000 --exclude '**/health.test.ts' --exclude '**/shadow-isolation.application.test.ts' --exclude '**/auth/sso/action-paths.test.ts' --exclude '**/*.http.test.ts' --exclude '**/final-account-lock.isolation.test.ts'` | Exit 0, 64 files / 1,555 tests, including unchanged protected auth tests |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1 --testTimeout=60000` | Exit 0, 33 files / 784 tests |
| `pnpm --filter @jobguard/ai exec vitest run src --maxWorkers=1 --testTimeout=60000` | Exit 0, 5 files / 80 fixture/unit tests; no live-model call |
| `pnpm --filter @jobguard/config exec vitest run src --maxWorkers=1 --testTimeout=60000` | Exit 0, 1 test |
| `pnpm --filter @jobguard/storage exec vitest run src --maxWorkers=1 --testTimeout=60000` | Exit 0, 2 tests |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | Exit 0, 19 tests; git-writing lane fixtures excluded |
| `git diff --check` and Python byte/registry comparisons against HEAD | Exit 0, setup-only merged-test addition, protected auth file unchanged, own lane allowance only |

Completed source unit/tool suites and the targeted timeout rerun account for **5,091 passing tests**. The initial default-timeout failure and interrupted attempts are retained below; this total is not a PostgreSQL or browser result.

The first database unit attempts selected compiled `dist` tests, including a source-graph inspection that exceeded the default 5-second limit; they were interrupted (exit 130), then rerun with explicit build-output exclusion. An initial core source run hit three default timeouts in existing receipt-allocation size checks and was interrupted (exit 130); its complete rerun above passed. Local process inspection confirmed concurrent validation in several other worktrees; no other run was stopped. The failed C-OPS-1 check also passed on targeted rerun. Longer time limits apply only to these command-line invocations: no assertion, refusal, count, repository timeout or check script was changed.

Root `pnpm test` is not invoked because the mandatory PostgreSQL/listener suites cannot run in this sandbox and the lane-tool fixtures execute git-writing commands prohibited by the work order. Only sandbox-capable unit/tool suites are selected locally; no repository suite is made optional. `pnpm test:db`, `pnpm test:migrations`, listener suites and `pnpm test:e2e` remain required in CI after the dispatcher pushes. No new prompt/model behavior requires a live-model evaluation.

Logs are `/private/tmp/jg-api-variation-r1-{typecheck,lint,lanes,lanes-final,build,openapi,openapi-direct,schema-proof,tests-typecheck,db-unit,db-unit-source,db-unit-final,db-timeout-recheck,core,core-final,api,web,ai,config,storage,tools}.log`; sequential unit command/exit receipts are `/private/tmp/jg-api-variation-r1-unit-results.json`.

No schema migration, backfill, grant, operational alert, external action, AI prompt/model/gateway change or production-policy change. Remaining gates: GitHub CI must rerun the unchanged merged value assertions on real PostgreSQL, the piece's integration/lock-race coverage, mandatory database/migration and browser/listener suites, then record an independent verdict on the dispatcher's exact repair commit and separate technical acceptance. The builder does not accept its own work. The original release/commercial/security gates below remain.

## Original builder run — historical evidence

Task issued 13 October 2026 by dispatcher 4. Builder: Codex, 14 October 2026 (Europe/London). Source report: `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-variation.md`.

Branch: `codex/sandbox/audit-fix-api-variation`. Issued base and unchanged HEAD: `e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4`. The local `origin/main` resolves to `c08a53784c05b54b18f7bfff87f4c7597032ca7e`; checks use the required `LANE_BASE_REF=origin/main`. No git-writing command was run. The dispatcher must commit this working tree and bind the independent verdict to that new commit.

Check lane: **RED**, raised for money and commercial revision concurrency. The uncommitted path classification using `lane-floor.py`'s matcher and the coordinator map returns AMBER (10 amber paths, 2 green); the issued rule raises this money behavior to RED. The canonical commit-range command remains a dispatcher check. Own compact lane entry has exact file paths. Shared variation files and lane registry serialize with other pieces. No migration, application grant, provider action, spending or real data. Standard F grants are unchanged; the new database fixture creates only a disposable login inheriting the already existing runtime role.

Read repository AGENTS.md, BUILD_PLAN.md §5.2/§5.3 and C4/C5, and the merged M1-9/UIWIRE-8 path. Installed dependencies were used; no install/download was attempted. Runtime: Node `v24.17.0`; cached pinned pnpm `10.28.1` via `/private/tmp/ch4-pnpm-bin` (the default pnpm launcher stalled resolving its package-manager version and was interrupted).

## Blocking findings: red before implementation, green after

New test file: `packages/db/test/audit-api-variation.test.ts`. It exercises the real application and repository writers with scripted SQL responses; audit and access bridges are mocked. This is **test-executed application/unit evidence**, not PostgreSQL or independent-review evidence.

Before any product fix, ran:

```sh
PATH=/private/tmp/ch4-pnpm-bin:$PATH pnpm --filter @jobguard/db exec vitest run test/audit-api-variation.test.ts
```

Exit 1: five tests failed. Full output: `/private/tmp/jg-api-variation-red.log`. A preceding harness import failure was corrected before this reproduction run and is not claimed as defect evidence.

| Report finding | Failing regression and expected reason | Fix |
| --- | --- | --- |
| #1 stale rejection | `reject cannot cancel an approved revision`: rejection resolved instead of the expected typed conflict after approval | Lock variation; require priced state/current revision and no approval before inserting rejection |
| #2 wrong variation/revision pair | `reject requires the targeted variation's current revision`: the mismatched pair resolved instead of conflicting | Check the requested revision against the locked target's current pointer before any rejection insert |
| #3 unpriced capture stranded | `prices an existing unpriced capture`: `PRICE_REQUIRED` prevented initial pricing | Use `previous: null` for initial pricing, preserving captured variation/scope/lineage/origin |
| #4 stale edit supersedes approval | `stale revise preserves newer approval`: stale edit resolved and created £110 R3 over approved £200 R2 | Require loaded `expectedRevisionId`; compare in application and recheck predecessor under repository row lock |

The fifth initial red test proved that the old revision schema admitted a missing expected revision. No blocking finding was dropped.

After the fixes, the original five regressions passed (`/private/tmp/jg-api-variation-green.log`). Added locked-writer race coverage and a Nest HTTP 409 assertion; the resulting seven tests passed with `--maxWorkers=1` (exit 0). Existing expected values, refusals, counts, pinned names and fingerprints were not edited. `apps/api/src/auth/context-boundary.test.ts` and all its pinned lists are unchanged.

Permitted premise-establishing setup change in the **new** unit harness, before the unchanged `app.command(jobId, ...)` call:

```ts
// Before (reproduces the actual old client envelope):
{ description: v.description, price: { ...price, unitRatePence } }
// After (establishes the expected revision required by the fixed contract):
{ expectedRevisionId, description: v.description, price: { ...price, unitRatePence } }
```

The stale R1/R2 values and every assertion remain unchanged. No existing catalogue row or setup was altered. Own lane registration is a new row only.

## Implementation and compatibility

`VariationRevisionConflict` carries `code: VARIATION_REVISION_CONFLICT`. Both Nest and Next variation POST adapters expose it as HTTP 409. The browser keeps the pointer from opening the edit form and offers later pricing on an unpriced capture. Core exact arithmetic and the approved-revision history remain intact.

`variation-command.v1` edit requests now require an explicit expected UUID or `null` for first pricing. Old edit clients lacking the field fail validation and must reload the current client. Proposal, approval and rejection payloads are unchanged. Existing historical approved-money display semantics are preserved, including UIWIRE-8's unchanged expectation while a fresh revision awaits approval.

No schema/data migration or backfill. Rollback is a code rollback coordinated with the client; do not roll back protection independently while accepting new clients. No new operational alert or external effect. Existing fee policies and pilot/production gates are unchanged.

## Dispatcher-only automated coverage added

- `packages/db/test/audit-api-variation.integration.test.ts`: real runtime-role persistence for all four findings, immutable origin comparison, final-account eligible-source predicate, and a competing transaction that waits for the variation lock before refusing a stale predecessor. **Written, not executed here.**
- `apps/web/e2e/AUDIT-FIX-API-VARIATION.spec.ts`: later pricing through the UI, stale rejection HTTP 409, and client A's loaded edit refused after client B approves R2. **Written, not executed here.**

## Validation

All successful results below are **deterministic local checks**, not an independent verdict. Every pnpm invocation used the cached pinned launcher via `PATH=/private/tmp/ch4-pnpm-bin:$PATH`; root lint/typecheck/lane commands used `LANE_BASE_REF=origin/main`.

| Command actually run | Result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | Exit 0, 7/7 tasks |
| `pnpm lint --concurrency=1` | Exit 0, 7/7 tasks and boundary checks |
| `pnpm lint:lanes` | Exit 0, own exact-path lane |
| `pnpm build --concurrency=1` | Exit 0, 7/7 tasks; existing Next workspace-root/CSS warnings and sandbox cache-write warnings |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC socket gets `listen EPERM`; no OpenAPI mismatch |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | Exit 0, same generator/check without the CLI IPC listener; committed OpenAPI unchanged |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | Exit 0, 81 files / 2,445 tests |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude '**/health.test.ts' --exclude '**/shadow-isolation.application.test.ts' --exclude '**/auth/sso/action-paths.test.ts' --exclude '**/*.http.test.ts' --exclude '**/final-account-lock.isolation.test.ts'` | Exit 0, 63 files / 1,551 tests, including unchanged protected auth tests |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts'` | Exit 0, 17 files / 259 tests, including the seven new regressions |
| `pnpm --filter @jobguard/web exec vitest run app --maxWorkers=1` | Exit 0, 33 files / 784 tests |
| `pnpm --filter @jobguard/config exec vitest run src --maxWorkers=1` | Exit 0, 1 test |
| `pnpm --filter @jobguard/storage exec vitest run src --maxWorkers=1` | Exit 0, 2 tests |
| `pnpm --filter @jobguard/ai exec vitest run src --maxWorkers=1` | Exit 0, 80 fixture/unit tests; no live model call |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | Exit 0, 19 tests |
| `node node_modules/typescript/bin/tsc -p /private/tmp/jg-api-variation-tests-tsconfig.json` | Exit 0, strict checking of both new database test files (including the dispatcher-only integration file) |
| `git diff --check` | Exit 0 |

Total selected unit/tool tests: **5,141 passed**. Final logs are `/private/tmp/jg-api-variation-{typecheck-final,lint-final,build-final,api-sandbox,db-unit-final,web-final,core-final,config,storage,ai,tools,openapi,openapi-direct,tests-typecheck-final}.log`.

The first parallel validation batch was interrupted after resource-contention timeouts in existing suites. No expectation or timeout was changed. The subsequent API run passed 63 files but also discovered `final-account-lock.isolation.test.ts` dynamically loads a real PostgreSQL fixture: that suite failed before PostgreSQL startup because its free-port probe cannot bind here. It was excluded from the final sandbox-only run and remains mandatory for the dispatcher. No PostgreSQL server or browser was started.

Root `pnpm test` is not run here because it starts PostgreSQL/listener suites and its two lane-tool fixtures run git-writing commands, which this task forbids. PostgreSQL, browser and excluded listener suites are mandatory on the Mac/CI; these exclusions do not change any repository test script.

Protected auth test SHA-256 remains `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`, byte-identical to HEAD. A parsed registry comparison confirms every earlier lane row is unchanged. The first path-classifier probe incorrectly asserted that the coordinator map itself would return RED; its printed AMBER result was retained and the task's explicit money rule raises it to RED. No map or pin was edited.

No AI prompt/model/extraction/gateway change, so no changed-model live evaluation is required for this task. The AI fixture suite was nevertheless run as listed above.


## LATER findings — receipt only

- #5: revision retries are not idempotent; identical revision-ID replay raises uniqueness rather than returning its original result.
- #6: pricing changes and rejections append no audit event.
- #7: the existing “another tenant” variation test actually checks missing context; populated authenticated tenant A/B coverage remains outstanding.

The report's five weakest-test recommendations remain parked: meaningful tenant A/B tests; lineage validation instead of fixture construction; concurrent database approval evidence; extending the existing unpriced browser journey and rejection/approval race; persisted provenance/replay/money assertions for the existing mocked ownership test. No existing test was weakened or rewritten.

## Dispatcher / Mac / GitHub CI handoff

After committing this tree, run with the pinned install:

```sh
LANE_BASE_REF=origin/main pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm test
pnpm build
pnpm openapi:check
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-api-value.integration.test.ts test/audit-api-variation.integration.test.ts test/variation.integration.test.ts test/final-account.integration.test.ts test/commands.integration.test.ts test/command-replay-contract.integration.test.ts
pnpm test:db
pnpm test:migrations
pnpm --filter @jobguard/api exec vitest run src/health.test.ts src/shadow-isolation.application.test.ts src/auth/sso/action-paths.test.ts src/final-account-lock.isolation.test.ts src/contractor/contractor-practice-session.http.test.ts src/contractor/site-visit.http.test.ts src/contractor/site-extra.http.test.ts src/contractor/site-extra-pricing.http.test.ts
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop AUDIT-FIX-API-VARIATION.spec.ts UIWIRE-8.spec.ts UIWIRE-9.spec.ts
```

PostgreSQL, migrations, browser/MinIO journeys and listener-dependent HTTP suites must run on the Mac or GitHub CI after the dispatcher pushes. Run canonical `lane-floor.py jobguard <repo> e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4 <new-commit>`; preserve RED for the money behavior. Obtain the independent recorded RED verdict on that exact commit and separate actor acceptance. The builder does not accept its own work. Production, technical acceptance, founder merge/push/release, and commercial/security approval are not inferred from this receipt.
