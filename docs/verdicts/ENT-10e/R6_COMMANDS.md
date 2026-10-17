# ENT-10e r6 command journal — 13 October 2026

Builder evidence only; baseline HEAD 51986a49fd9b891b752e8c808409ab01d6a4120a. Existing dependencies, Node v24.17.0; pnpm commands used `PATH=/private/tmp/jg-ent10e-bin:$PATH` to execute cached pnpm 10.28.1. Log prefix `/private/tmp/jg-ent10e-r6-`. No git-writing test fixtures were run.

| Command | Exit | Actual result |
| --- | --- | --- |
| Default-shell `pnpm --version` | 130 | Default unpinned launcher stalled and was interrupted; no install was requested. Switched to existing cached pinned launcher. |
| Cached `pnpm --version` | 0 | 10.28.1. |
| `pnpm typecheck --force` | 0 | Seven workspace tasks passed with no cache hits. |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0 | Root purity/lane/money/commercial scanners and seven real package lint tasks passed with no cache hits. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | Registered ENT-10e lane passed against current origin/main. |
| `pnpm exec tsc -p /private/tmp/jg-ent10e-tests-tsconfig.json` | 0 | Five ENT-10e integration files and imports compile. Existing temporary test config; no PostgreSQL execution. |
| `pnpm openapi:check` | 1 | tsx CLI IPC listener fails `listen EPERM` in this sandbox; generator is not reached by that launcher. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator's serialized snapshot comparison passed without the CLI IPC listener. No regeneration/edit of OpenAPI. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | 0 | 33 files, 784 unit tests passed. Existing config excludes browser/e2e. |
| `pnpm --filter @jobguard/ai exec vitest run src --maxWorkers=1` | 0 | Five files, 80 fixture tests passed; no live model/provider call. |
| `pnpm --filter @jobguard/config exec vitest run src --maxWorkers=1` | 0 | One test passed. |
| `pnpm --filter @jobguard/storage exec vitest run src --maxWorkers=1` | 0 | Two tests passed. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | 0 | 19 tests passed. Both lane-tool fixture suites excluded because they execute forbidden git writes. |
| Initial core unit run: `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 130 | Interrupted during excessive concurrent load after receipt-allocation's working-size test reported failure at 6,763 ms. No complete suite result; repeated below. |
| Initial API unit run (command below) | 130 | Interrupted during excessive concurrent load before a suite result; repeated below. |
| Initial database unit run (command below) | 130 | Interrupted during excessive concurrent load after `[C-OPS-1] all transitive request workspace sources and package entry targets cannot reach the operator` reported failure at 19,453 ms. No complete suite result; repeated below. |
| TypeScript AST assertion comparison against HEAD | 0 | 197 original expect/matcher expressions retained byte-for-byte in order; R6_ASSERTION_CHECK.json. |
| Diff line accounting generator | 0 | Every touched protected-file line listed in R6_PROTECTED_TEST_LINES.md; concurrency file unchanged. |
| `git diff --check` | 0 | No whitespace errors. |
| Read-only git status/head/main/merge inspection | 0 | HEAD unchanged; four commits behind origin/main; no MERGE_HEAD. |
| Process-list diagnostic (`ps`) | 1 | Sandbox refused process listing; no process manipulation through this diagnostic. |

API selected-unit command: `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --exclude='src/health.test.ts' --exclude='src/shadow-isolation.application.test.ts' --exclude='src/final-account-lock.isolation.test.ts' --exclude='src/auth/sso/action-paths.test.ts' --exclude='src/contractor/*.http.test.ts'`. These excluded existing tests require PostgreSQL or HTTP listeners; CI remains unchanged.

Database selected-unit command: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 --exclude='dist/**' --exclude='**/*.integration.test.ts' --exclude='test/free-port.test.ts'`. No PostgreSQL guarantee is inferred from these units.

Core rerun: `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1`, exit **0**, 81 files / **2,445 tests passed** (`core-unit-retry.log`). No assertion or timeout setting was changed.

Build: `pnpm build --concurrency=2 --force`, exit **0**, seven tasks passed with no cache hits. Full Next production build completed. Existing workspace-root/CSS and sandbox Turbo cache-IO warnings appear in build.log.

First completed database rerun: selected command above, exit **1**, 10 files / 152 tests passed and one existing C-OPS-1 source-graph test timed out at 5,000 ms (10,599 ms elapsed). This ran while other checks were still active. No failing expectation or timeout setting was changed. A final isolated run is recorded below.

API rerun: selected command above, exit **0**, 65 files / **1,572 tests passed** (api-unit-retry.log). No assertion or timeout setting was changed.

Final `LANE_BASE_REF=origin/main pnpm lint:lanes` including all receipt artifacts, exit **0** (lanes-final.log). `git diff --check` also passed again. Final isolated database run: selected command above, exit **1**, **152 passed / 1 timed out** across 11 files. With no other task check running, the existing `src/audit-checkpoint-handoff.test.ts:279` C-OPS-1 source-graph check took 5,675 ms and exceeded its unchanged 5,000 ms limit (db-unit-isolated.log). No timeout override, exclusion, expectation change or source fix was applied. This remains a local failed check; no complete database-unit pass is claimed.

Final selected-run totals: **5,055 tests passed and one source-graph timeout**. Interrupted/failed earlier runs are recorded above rather than counted as extra passes. All seven workspace typecheck, lint and build tasks passed. OpenAPI passed through direct execution of the same generator; its required CLI launcher remains sandbox-blocked. Local checks therefore are not wholly green. Full root test, database/migration and browser suites are NOT RUN locally for the dispatcher-specified sandbox limits. No live integrations, model review, technical acceptance or release is claimed.
