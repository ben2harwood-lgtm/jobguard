# AUDIT-FIX-API-VARIATION — builder receipt

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
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-api-variation.integration.test.ts test/variation.integration.test.ts test/final-account.integration.test.ts test/commands.integration.test.ts test/command-replay-contract.integration.test.ts
pnpm test:db
pnpm test:migrations
pnpm --filter @jobguard/api exec vitest run src/health.test.ts src/shadow-isolation.application.test.ts src/auth/sso/action-paths.test.ts src/final-account-lock.isolation.test.ts src/contractor/contractor-practice-session.http.test.ts src/contractor/site-visit.http.test.ts src/contractor/site-extra.http.test.ts src/contractor/site-extra-pricing.http.test.ts
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop AUDIT-FIX-API-VARIATION.spec.ts UIWIRE-8.spec.ts UIWIRE-9.spec.ts
```

PostgreSQL, migrations, browser/MinIO journeys and listener-dependent HTTP suites must run on the Mac or GitHub CI after the dispatcher pushes. Run canonical `lane-floor.py jobguard <repo> e9f9bc9ef4f4aa46394c414c9a3971c523fac2e4 <new-commit>`; preserve RED for the money behavior. Obtain the independent recorded RED verdict on that exact commit and separate actor acceptance. The builder does not accept its own work. Production, technical acceptance, founder merge/push/release, and commercial/security approval are not inferred from this receipt.
