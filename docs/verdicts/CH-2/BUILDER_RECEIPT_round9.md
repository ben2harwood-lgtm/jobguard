# CH-2 builder receipt — round 9

7 October 2026. Branch `codex/sandbox/ch-2`, PR #97. Starting and unchanged git HEAD: `fb0561fb6ba7be78529a7fd60a0b6780fcd2234a`. This receipt describes the working-tree repair for the dispatcher to commit. It is builder execution evidence, not an independent verdict or technical acceptance.

## Finding → fix → test

| Finding | Fix | Coverage |
|---|---|---|
| Sol P2-2(a): saved proof response mismatch becomes `ProofApplicationError("CONFLICT")` and Nest returns 500. | Normalize proof response-store, upload, finalisation and completion replay conflicts to round 8's `WatchdogError("IDEMPOTENCY_CONFLICT")`. Remove `CONFLICT` from `ProofApplicationError`'s allowed codes. Nest's typed filter explicitly maps the stable code to 409; Next proof accepts the same code. | Real `ProofApplication` and response repository, with a PostgreSQL query double: saved payload, job and action mismatches through actual Nest `ExceptionsHandler` and actual Next POST adapter. Require exact 409/body, typed error, rollback and no domain writes. An identical request still returns its exact saved first answer without any write. |
| Sol P2-2(b): changed legacy readiness payload throws ordinary `Error("IDEMPOTENCY_CONFLICT")` and Nest returns 500. | Use `WatchdogError` in both legacy branches and the existing uniqueness-conflict branch. Next readiness reads the typed code before its existing message fallback. | Real `ReadinessApplication` and `ReadinessRepository`: legacy record and advance payload mismatches through Nest and Next, with the same exact response/type/rollback/no-write assertions. |
| Other guarded replay refusals can produce the same 500. | Replace remaining plain identity-conflict throws in discrepancy, supplier-match, supplier-fact, purchase-order and relevance-inbox repositories. Normalize `CommandError("COMMAND_CONFLICT")` only at the guarded purchase-order repository boundary. Other Next guarded mutation adapters already map the stable error message to 409. | Source regression rejects plain identity-conflict errors in all six affected repositories. Two additional real purchase-order application/dispatcher cases exercise foreign-job and stored-receipt conflicts through Nest; both require 409 and refusal before any decision, outbox or audit write. |
| Generated API contract must agree. | Regenerate `apps/api/openapi.json` from the controllers. Proof and readiness 409 descriptions explicitly include saved-response/legacy mismatches; the stable code enum and successful responses remain. | Generated-contract check plus existing registry assertions. |

The query doubles establish application and adapter behavior, not PostgreSQL enforcement, concurrency, RLS or transaction durability. Database integration coverage from earlier rounds remains required in CI.

## Tests first

Before implementation edits, only `apps/api/src/watchdog-registry.test.ts` differed from fb0561f. The final corrected red run was:

`pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts --maxWorkers=1` → **exit 1; 33 passed, 18 failed / 51 tests**.

Nest returned **500 / Internal server error** for all three saved proof mismatches and both legacy readiness mismatches. Next proof returned the older `CONFLICT` body instead of `IDEMPOTENCY_CONFLICT`; Next readiness returned 409 but its underlying error was untyped. The plain-error source checks and strengthened finalisation assertions also failed. No implementation fix was present in that run. Two purchase-order cases were added subsequently; final focused coverage is 53 tests.

Earlier test-only drafts exited 1 (32 pass/12 fail, then 32 pass/17 fail); the latter had five Next bootstrap mock-path failures. Those mock paths were corrected before the final red evidence above. Initial typecheck and lint exited 2 because the test's literal cross-package imports crossed API `rootDir`, and `ExceptionsHandler.next` required narrowing its unknown argument. Both were corrected without changing an assertion. A later dynamic-import draft resolved paths incorrectly: a full API run exited 1 (155 pass, five Next import failures plus the health socket failure), and a focused run exited 1 (48 pass/five import failures). Absolute filesystem imports fixed the test harness; final focused run passes all 53.

## Commands actually run

Environment: macOS arm64, Node **24.17.0**, pinned pnpm **10.28.1**, existing installed dependencies. Pnpm commands used the existing `/private/tmp/ch2-bin` PATH shim to `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`; no package download/install was attempted. Command logs are in `/private/tmp/ch2-round9-*.log` and are local scratch evidence.

| Command | Exit | Result |
|---|---:|---|
| `pnpm turbo run build --filter=@jobguard/db...` | 0 | Rebuilt database exports before adapter tests; 3 tasks successful. |
| `pnpm --filter @jobguard/api exec vitest run src/watchdog-registry.test.ts --maxWorkers=1`, final | 0 | 53/53. An earlier post-fix run also passed all then-current 51 cases. |
| `pnpm typecheck`, corrected run | 0 | 7 tasks successful. Initial test-harness failure described above. |
| `LANE_BASE_REF=origin/main pnpm lint`, corrected run | 0 | Repository guards and 7 package tasks pass; no self-comparison refusal. Initial test-harness failure described above. |
| `pnpm lint:lanes` (initial and final, including receipt) | 0 each | Entire CH-2 range and working-tree paths accepted; no lane widening. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1`, final full run | 1 | 160 pass / 1 fail. Sole failure: unchanged `health.test.ts`, sandbox `listen EPERM`, with its associated unhandled socket error. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts --maxWorkers=1` | 0 | 160 tests / 15 files. Socket-free API suite; exclusion is invocation-only, no test file is changed or skipped in CI. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | 0 | 63 tests / 8 files. |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts test/verify-evidence-pack-cli.test.ts --maxWorkers=1` | 0 | 7 tests / 2 files; no database server used. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1`, during other checks | 1 | 316 pass / 4 existing 5000ms timeout failures in unchanged receipt-allocation/extra-origin tests. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1`, retry after other checks | 1 | 319 pass / 1 existing 5000ms timeout: `packages/core/src/receipt-allocation.test.ts:212` (supported working size). No other check running; no assertion, source or timeout changed. |
| `node --test tools/*.test.mjs` | 0 | 42 tests. |
| `pnpm build` | 0 | 7 tasks successful (4 cached); API rebuilt and Next production build completed. |
| `node --import tsx src/generate-openapi.ts` (cwd `apps/api`) | 0 | Generated specification using socket-free entry point. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | 0 | Generated specification matches; repeated after the final source edits with the same exit 0. |
| Final `pnpm typecheck` after final source edits | 0 | 7 tasks successful (4 cached); final source checked. |
| Final `LANE_BASE_REF=origin/main pnpm lint` after final source edits | 0 | Repository guards and 7 package tasks pass (4 cached), including the new receipt in the lane check. |
| `git diff --check` | 0 | No whitespace errors. |
| `git diff --exit-code HEAD -- package.json pnpm-lock.yaml packages/db/migrations/0096_watchdog_live.sql config/agent-lane-assignments.json` | 0 | Dependencies, migration 0096 including retained triggers, and lane registry are unchanged. |

Turbo emits existing sandbox cache-write IO warnings; Next emits its existing multiple-lockfile/workspace-root warning. Neither was patched. No clean pinned reinstall was performed.

## Scope, invariants and remaining gates

All earlier work is preserved. Migration **0096** and Ben's **“keep triggers”** decision (Command Center, 7 October) are unchanged. No DDL, grant, RLS, lock-order, identity-ownership, stored-result, provider, money, entitlement or authorization change. No new environment variable or operational alert. All changed paths stay within the CH-2 lane; no lane-registry or build-plan edit. No tests deleted or weakened, no committed skip, and no timeout added or increased. The finalisation assertion now requires the exact shared typed conflict code instead of the former application-specific code. Backwards compatibility: guarded proof replay refusals now expose `IDEMPOTENCY_CONFLICT` rather than `CONFLICT`/`COMMAND_CONFLICT`; exact successful replays are preserved.

Synthetic data only. No live provider, real send, spending, production mode or decision approval. The purchase-order probes stop before any approval write. No git add/commit/checkout/push, merge or PR creation. Intended conventional commit subject/body is written to `/private/tmp/jg-msg-ch-2.txt` for the dispatcher.

Not run and why:

- `pnpm test:db`, `pnpm test:migrations`, PostgreSQL/browser regression and both-project `pnpm test:e2e`: dispatcher states this sandbox cannot bind localhost or start PostgreSQL. No query-double test is presented as database or browser verification. The full root `pnpm test` was not run because it includes those unavailable database suites; available unit/tool suites are recorded separately.
- Clean install: dependencies are already installed and the work order forbids downloads.
- Live-model/provider/production checks: unauthorized and inapplicable to this error-mapping repair; no prompt/model or AI parser changed.
- Exact-commit CI/security/browser acceptance and independent verdict: dispatcher must commit the repair and obtain these separately. No independent review or founder acceptance is claimed.

The supplemental core suite remains locally red at the unchanged out-of-lane working-size test; final-head CI must establish that earlier mandatory guarantee. No further retry, timeout increase or out-of-lane repair was attempted.

**Sol P1**: Ben says the approved dependency repair is on main and clears when main is incorporated. Dependency files and fail-closed scanner remain untouched; this sandbox performs no merge. Final integrated-commit security CI is still required.

**Sol P2-3**: the reported untouched-suite `beforeAll` ECONNREFUSED is a CI database-startup flake per this work order. No startup code, assertion or timeout changed here. Re-run CI against the dispatcher-created/integrated commit; old-head or historical results do not establish acceptance of this repair.
