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


## v5-r2 repair receipt — source and local checks only

Issued repair at `33a51a69ce260f4e8c12768b2bab1c0e8c10f3a9`, branch `codex/sandbox/ch-7-rest-c`; exact C-only parent remains unmerged #298 `98a7a80515c4d12db6f97154d7192d33ea4b5157`. Read AGENTS.md, applicable BUILD_PLAN CH-7/M4-5-S/§10.3.3, terms contract, main checkout's approved milestone/deferrals, Ben's 17 October answers, current ledger/receipt and the actual independent Claude A REPAIR at `/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch-7-rest-c-opus-A-33a51a69.md`. That recorded verdict remains historical; the earlier receipt's statement that no verdict exists applies to its original uncommitted work and does not describe the present repair. B's partial reasoning was not read. No Claude runs, self-acceptance or git writes.

Failing-first evidence is source-only: initial `inIsolatedWorld` creates a checked v3 activation; six round-9 calls then insert a second activation before their assertions. A identified the uniqueness conflict; this builder did not execute PostgreSQL to reproduce it. Root's express r2 authority permits only the six-test v1 supplier substitution and two exact template changes. Implemented in the local test helper, with no shared fixture or production change. Default worlds still call `seedPursuitFixture`; the new option is selected six times, all in round 9. Twelve participating constructors explicitly use merchant cases; source references come from existing supplier fixtures. Added exact caseType/recipient/sourceRefs assertion. Fixture/context/actor restoration is unchanged.

Preservation proof: `/private/tmp/jg-ch-7-rest-c-r2-preservation.py` compares against the exact repair head and inversely normalizes only the issued substitutions. It reconstructs all 1,797 original lines, so helper code outside the selector and every test outside the six opt-ins (including the seventh default-v3 no-history test) remain unchanged. It retains all 41 original round-9 assertions, adds one supplier identity assertion, and compares the full numeric-token sequence unchanged. The exact original receipts/approvals, GREATEST money logic, case revisions, counts, changedSinceReview, cancellation/retryable/blocked states, zero/nonzero sinks, runtime landing calls and both lock-order interleavings remain. Two customer-body expectations are expressly replaced by supplierBody at identical £200.00 and £120.00; this is the authorized category wording change. 252 protected migration/runtime/terms/refusal/follow-up files are byte-identical to the repair head. 0207 SHA-256: `c4bb7e8fa0f5682cc7825c357fde757cf565982e40f3fe5b5629a8ceff0a579c`. No new withheld approval/refusal test changed.

Coverage split: legacy v1 approved landings and their shared money/lock invariants now run through supported supplier correction. Current withheld customer pursuits retain actual v3 terms setup elsewhere. There is no claim of a current-v3 customer approved-landing integration path, no restored v1 withheld route, no policy conversion and no production engine invented.

Existing install only, Node v24.17.0 / corepack pnpm 10.28.1. No install/download or cache deletion. Disk available before first heavy command: 47,182,688 KiB; rechecked at 47,190,812 KiB and 47,201,072 KiB before subsequent heavy commands (above the 45 GB floor). Heavy commands use `HEAVY_SLOTS=2 /Users/benharwood/.local/bin/heavy-slot <label>`; no more than two issued concurrently, then serialized after wrapper failure. Wrapper sysctl/sysmon/process-list warnings are recorded, with no bypass. Logs are `/private/tmp/jg-ch-7-rest-c-r2-*.log`.

| Actual command (heavy-slot where applicable) | Result |
| --- | --- |
| `corepack pnpm --filter @jobguard/db typecheck` | PASS exit 0; typecheck.log. |
| `node node_modules/typescript/bin/tsc -p /private/tmp/jg-ch-7-rest-c-tsconfig.json --noEmit` | PASS exit 0; integration-source.log. Existing scratch config includes db/src and all five C integration files, inherits strict repo settings; compiles tests omitted by package config. No DB execution. |
| `PATH=/private/tmp/jg-ch-7-rest-c-bin:$PATH LANE_BASE_REF=98a7a80515c4d12db6f97154d7192d33ea4b5157 corepack pnpm lint` | PASS exit 0; lint.log, 7 package tasks successful (2 cached). Existing temporary pnpm shim selects installed corepack pnpm for Turbo children, no global config change. Exact-parent local lane check includes working diff. |
| `LANE_BASE_REF=98a7a80515c4d12db6f97154d7192d33ea4b5157 corepack pnpm lint:lanes` | PASS exit 0; lanes.log. C-only scope, not main integration. |
| `LANE_BASE_REF=origin/main corepack pnpm lint:lanes` | FAIL exit 1; main-lanes.log: eleven inherited B paths, unchanged prerequisite HOLD. |
| `corepack pnpm --filter @jobguard/db exec vitest run test/recovery-message-repository.test.ts test/recovery-case-join.test.ts test/recovery-eligibility-v3-interest.test.ts --maxWorkers=2` | Initial wrapper exit 2 before Vitest (mocked-units.log; only resource-probe warnings). Same command retried serially through heavy-slot: PASS exit 0, 3 named files / 27 tests (mocked-units-retry.log). Mocked units only. |
| `python3 /private/tmp/jg-ch-7-rest-c-r2-preservation.py` | PASS exit 0; preservation.log. Deterministic before/after source proof described above. |
| `corepack pnpm --filter @jobguard/db build` | PASS exit 0; build.log. |
| `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` from apps/api | PASS exit 0; openapi.log. Uses the established loader method to execute the unchanged generator without the tsx CLI's unsupported IPC listener. No generated file changed. |
| `git diff --check` | PASS exit 0, including final receipt/ledger edits. |

PostgreSQL, migrations, browser, listeners and race execution NOT RUN locally, per issuance. CI on the exact repaired dispatcher head must execute the complete recovery-messages integration suite, all six supplier landing scenarios and both race orders, pursuit-terms integration/own-upgrade proofs, retained recovery-case-terms/follow-up and affected prior upgrade suites, F14/F16 supplier-credit and B terms-timing regressions. Exact-head fresh A and B independent checks, separate acceptance, prerequisite integration and green CI remain required. Root/main lane stays held; no review/acceptance/release claim. Production SQL and 0207 are unchanged, with no migrations/data changes, new alerts, external action or compatibility change in this repair.


Final working-tree scope check: exactly the three issued writable files differ from repair HEAD (message integration test, own ledger and own receipt). No git object/ref/index write or push. Intended dispatcher commit message written to `/private/tmp/jg-msg-ch-7-rest-c.txt`. Bounded r2 implementation and permitted local checks complete; actual PostgreSQL/race CI and fresh independent exact-head A/B verdicts are still owed, with separate acceptance and #298/main integration held.
