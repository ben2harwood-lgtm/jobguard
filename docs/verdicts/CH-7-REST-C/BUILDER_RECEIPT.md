# CH-7-REST-C — builder receipt

20 October 2026. Codex builder; requested gpt-6.1-sol, medium. No independent review, self-acceptance, commit, push, merge or release. Starting HEAD `98a7a80515c4d12db6f97154d7192d33ea4b5157`; observed origin/main `dc5721230fd8aedbf2d9d0457789074b66b48765`. Exact prerequisites and scope recorded in the ledger. Existing install, Node v24.17.0, cached corepack pnpm 10.28.1. No packages installed/downloaded. Disk preflight 47,438,724 KiB available (above 45 GB).

Read AGENTS.md in full, BUILD_PLAN CH-7/terms contracts, main checkout's approved speed-v5 milestone/deferrals, BEN-ANSWERS-20261017, draft-ch-7-rest-20261018T132715, B issuance embedded in d123, d123 continuation and v5-r1 order, B ledger/receipt, latest terms helper/writer/callers, and affected current/historical setup. Current issuance controls over stale dispatch mechanics.

Failing-first: the new integration and upgrade files and amended null-policy expectation were written before creating 0207. PostgreSQL suites NOT RUN by explicit instruction/environment; no executed red-to-green database claim. Existing helper's source demonstrably allowed null/v1 withheld cases through its policy OR branch. The replacement removes only that branch. Ordinary command and raw-trigger proofs require CI. All source remains synthetic and production-disabled.

Implementation, named proofs, exact expectation amendment, setup choices, own-migration preservation and residual gates are recorded in docs/ledger/CH-7-REST-C.md and migration note 0207. No new table/core API/transport or grant/security inventory changes. Contract records new-action-only enforcement and historical replay preservation. SQL owner/security/grants preserved by CREATE OR REPLACE; no writer/caller replacement. Financial/provider effects unchanged.

## Actual local commands

Every heavy check uses `HEAVY_SLOTS=2 ~/.local/bin/heavy-slot <label> <command>`; Vitest at most two workers and three named files. Logs `/private/tmp/jg-ch-7-rest-c-*.log`. Sandbox sysctl/sysmon/process-list warnings come from the required heavy-slot wrapper; commands still ran. No timeout/worker/approval bypass.

## Remaining acceptance

PostgreSQL, migration and browser/Playwright suites NOT RUN locally (CI-only); affected prior suites, fresh install and upgrade must pass there. No clean install was attempted (no downloads authorized). No AI/schema extraction/model change: eval inapplicable. The guarded SQL function change is not a changed AI output schema. No actual independent verdict exists for this uncommitted patch. Await exact-head RED verdicts, separate acceptance, B integration and green CI. Production gates and founder merge/release remain closed.

| Actual command (heavy-slot prefix as above) | Result |
| --- | --- |
| `corepack pnpm --filter @jobguard/db typecheck` | PASS exit 0; typecheck.log. |
| `node node_modules/typescript/bin/tsc -p /private/tmp/jg-ch-7-rest-c-tsconfig.json --noEmit` | PASS exit 0; fixture-typecheck.log; final reruns after added upgrade/reminder coverage: fixture-typecheck-final.log and fixture-typecheck-final-2.log. Scratch config includes db/src and all five changed integration files; package config excludes test/. |
| `LANE_BASE_REF=origin/main corepack pnpm lint` | FAIL exit 1 at lane check, lint.log: eleven inherited B paths outside C. Core purity passed (229 files). Integration HOLD until B merges; no lane widened. |
| `LANE_BASE_REF=origin/main corepack pnpm lint:lanes` | FAIL exit 1, lanes.log, same inherited B paths. |
| `PATH=/private/tmp/jg-ch-7-rest-c-bin:$PATH LANE_BASE_REF=98a7a80515c4d12db6f97154d7192d33ea4b5157 corepack pnpm lint` | FAIL exit 1, own-lint.log: tool refuses base=HEAD self-comparison. This is not a passing alternate lane check. |
| `corepack pnpm --filter @jobguard/db lint` | PASS exit 0; package-lint.log. |
| `node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs` | PASS exit 0; constituent-lint.log. |
| `corepack pnpm --filter @jobguard/db build` | PASS exit 0; build.log. |
| `corepack pnpm exec turbo run build --filter=@jobguard/db...` | FAIL exit 1, dependency-build.log: Turbo invoked the system pnpm 11.8.0 in a child despite the pinned outer pnpm. Storage cache restored; no dependency installed. Used direct pinned package builds below, without bypassing version checks. |
| `corepack pnpm --filter @jobguard/core build` | PASS exit 0; core-build.log. |
| `corepack pnpm --filter @jobguard/db exec vitest run test/recovery-message-repository.test.ts test/recovery-case-join.test.ts test/recovery-eligibility-v3-interest.test.ts --maxWorkers=2` | First FAIL exit 1 at import before tests (core dist absent), units.log. After direct core build: PASS exit 0, 3 files / 27 tests, units-retry.log. Mocked repository/unit checks, not a database integration. |
| `corepack pnpm --filter @jobguard/core exec vitest run src/recovery-case-terms.test.ts src/recovery-eligibility-v3.test.ts src/recovery-terms-timing.test.ts --maxWorkers=2` | PASS exit 0, 3 files / 66 tests; core-units.log. Includes inherited money/reason controls, not live provider or database proof. |
| `PATH=/private/tmp/jg-ch-7-rest-c-bin:$PATH corepack pnpm openapi:check` | FAIL exit 1; openapi.log: tsx CLI cannot bind its IPC pipe (EPERM). |
| `node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/api/src/generate-openapi.ts --check` from repo root | FAIL exit 1; openapi-direct.log: root tsconfig lacks API decorator settings. |
| `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` from apps/api | First FAIL exit 1 (config dist absent), openapi-api-cwd.log. After dependency builds: PASS exit 0, openapi-final.log. Loader executes same generator/check without CLI IPC. No OpenAPI file changed. |
| `corepack pnpm --filter @jobguard/config --filter @jobguard/ai build` | PASS exit 0; openapi-deps.log. Local workspace builds only, needed to execute unchanged OpenAPI generator. |
| `node /private/tmp/jg-ch-7-rest-c-source-check.mjs` | PASS exit 0; scope-final.log. Deterministic C working-tree scope and exact helper predicate comparison only; does not substitute for the held origin/main lane check. |
| `git diff --check` | PASS exit 0. |

No PostgreSQL/migration/browser suite or broad root test was executed. New failing-first database files were initially authored before 0207, then expanded with migration controls and the historical v1 reminder; no database red-to-green result claimed. The SQL replacement is source-inspected; local unit suites are test-executed; the task is not independently verified or technically accepted.

Successor setup inspection found no out-of-lane amendment necessary: terms-upgrade's positive successor uses a genuinely v3 job and real terms command; follow-up-upgrade executes new pursuits before applying 0134/0207, then only compares history after all successors. Those historical seeds and all their assertions are unchanged. No shared patch proposal or silent HOLD on an unimplemented setup change.

Final named database proofs remain CI-required: NullPolicyWithheldPursuitRefused, V1PolicyWithheldPursuitRefused, RawPreviewApprovalSinkRefused, ReminderUsesSameGuard, V3ApprovedTermsStillWork, NonWithheldUnchanged, HistoricalPursuitPreserved. Retained existing tests cover revoked/expired owner, foreign tenant/job/case, approval replay/conflict, exact authorization and rollback. New contention proof holds the actual case advisory key from a second connection and observes PostgreSQL blocking before release/refusal. Upgrade comparison covers nonempty predecessor tables, full PostgreSQL timestamp precision and types, original PK identities, allowed later additions and two successor runner calls. Raw refusal additionally compares row counts to detect stray inserts.

Intended commit message: `/private/tmp/jg-msg-ch-7-rest-c.txt`. Dispatcher owns all git writes. Final task status: bounded source implementation complete; acceptance HOLD for B integration, required main-range lane checks, PostgreSQL/browser CI, two independent exact-head checks and separate acceptance. No source/hash freeze of another piece, global configuration, reserved worktree or out-of-lane source change.
