# DEMO-P1 builder receipt — 23 October 2026

Builder: Codex session executing issued DEMO-P1 build-ahead order, decision 74. Source-inspected and test-executed only; not independently verified or accepted. No commit, push, PR, merge, provider, spending, real data, database or browser execution. Ben retains merge authority; dispatcher commits after exit.

Base and HEAD at start: `dc5721230fd8aedbf2d9d0457789074b66b48765` (`origin/main`); branch `codex/sandbox/demo-p1`; initially clean. Worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/demo-p1`. No clean install performed: preinstalled dependencies used. Node `v24.17.0`; successful pnpm commands use cached Corepack `10.28.1`, with network disabled. No dependency or lockfile changed.

## Delivered scope and choices

- Exact four draft functional files, issued `config/lanes/demo-p1.json` and this receipt only. The issued lane/branch replaces the draft proposed evd lane name; no second registration. No shared barrel, routing, catalogue test, migration, runtime application or package export changed.
- Static, unregistered `demoCatalogue` documentation data: all 49 rows (DC 8, DR 11, DS 7, DM 13, DT 8, DV 2), 24 separately documented interface entries, 12 dedicated negative branches, both viewport projects, 29 explicit prerequisites and all 18 planning holds. Every binding is HELD with null acceptance evidence, every journey NOT_RUN. Source presence is not producer acceptance.
- Simplest proposed form: plain constant data plus a Markdown contract and five fictional raw-text input recipes. Strict JSON grammar and adversarial mutation checks live only in the owned unit test. No runtime parser, dispatcher or second money/billing/fee model. Test-only JSON asset import uses Vitest; no filesystem dependency added to core. The compiler diagnostic suppression covers only the JSON import because resolveJsonModule is not enabled, not runtime implementation errors.
- Exact planning §7.4 sequences/figures retained, including shadow £30,000/£3,200/£400/£500/£300 → £34,400 net/£41,280 gross, Q £800/fee £80/yours £720 and tracked £3,600/fee £0. Recovery ends £32 net posted, £250 refunded, £288 yours; measured external-actions/unresolved zero remain conditional assertions requiring actual evidence. Core includes cited five-line review and £1,320 invoice; £500/£820 receipts remain builder-recorded. Meter year totals are twelve monthly payments; no annual activation. Trial/card/clock semantics stay with MON owners.
- The £100 net/£20 tax credit (£120 gross, £700 due after reversal) remains PROPOSED under H-CORE-CORRECTION. This order does not accept the fixture choice. No commercial, VAT, authority, clock or catch-source decision was invented.
- No data migration, compatibility change, external action or operational alert. All historical files/tests untouched. No claim of running PostgreSQL, browser, live model, provider integration, two human observations or independent review.

## Commands and actual results

Repository/contract inspection used read-only `pwd`, `git status --short`, `git rev-parse HEAD origin/main`, `git branch --show-current`, `git grep`, `rg`, `sed`, `cat`, `ls`, `df -h .` and `memory_pressure`. Full AGENTS.md, applicable DEMO-S/related BUILD_PLAN cards, planning §§1–2.5, holds, command inventory, §7.4 and DEMO-P1 were read. Route-file checks and symbol/schema grep results are recorded individually in the contract. Disk observed 218 GiB free; system-wide memory free 65%. Unit batches never exceeded three named files/two Vitest workers. Builds use Turbo concurrency 2; only one unit invocation at a time. No worker agents were needed for this bounded single-owner fixture task.

Successful package commands below used `COREPACK_ENABLE_NETWORK=0 corepack pnpm ...`, or `PATH=/usr/local/lib/node_modules/corepack/shims:$PATH COREPACK_ENABLE_NETWORK=0 pnpm ...` where nested pnpm calls were needed. Both use cached pinned pnpm 10.28.1.

| Command/check | Actual result |
|---|---|
| `COREPACK_ENABLE_NETWORK=0 corepack pnpm --version` | PASS, 10.28.1, exit 0 |
| `pnpm --filter @jobguard/core typecheck` | PASS, exit 0, including final catalogue/test changes |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/small-builder-demo-scenarios.test.ts` | PASS, final 6 tests, exit 0 |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/small-builder-demo-scenarios.test.ts src/fee.test.ts src/activation.test.ts` | PASS, 3 files / 18 tests, exit 0; pure unit tests only |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL, exit 1: core purity passes; lane guard refuses self-comparison because uncommitted HEAD equals base. Turbo lint stage NOT RUN by this wrapper. No base substitution or weakening. |
| `pnpm lint:lanes` | FAIL, exit 1, same self-comparison refusal. Dispatcher must rerun after commit. |
| `pnpm build --concurrency=2` | PASS, exit 0, 7/7 Turbo tasks (2 cached). Next production build completed; existing CSS/file-type/workspace-root and sandbox cache-write warnings. Not a clean-install CI result. |
| `pnpm --filter @jobguard/core build` | PASS, exit 0, final catalogue/test revision compiled after root build started |
| `pnpm openapi:check` | FAIL, exit 1: tsx CLI IPC socket `listen EPERM` in sandbox, before generator execution |
| `node --import tsx src/generate-openapi.ts --check` (cwd apps/api) | PASS, exit 0; same check without CLI IPC server, no schema changes |
| `node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit` | PASS after replacing forbidden node:fs test import with JSON asset import |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | FAIL, exit 1, same lane guard refusal; core purity passes after fix |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0 |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0 |
| `git diff --check` | PASS, exit 0; tracked diff empty because all six deliverables are new/untracked; separate actual-file scope/whitespace check required below |

Earlier red/fix iterations: direct installed Vitest invocation initially failed on the intentionally absent catalogue import; then failed one length assertion because four meter observations contained only the amount. The observations were expanded to require their actual period/statement/approval/settlement provenance. The figure regression initially failed because £500 belongs to DC-06's operation rather than observation column; the test now checks both columns. No inherited test was edited. Initial direct typecheck/lint rejected node:fs in core tests; fixed with a static test-only JSON asset import. Direct installed Vitest then passed 5 tests, and the final pinned runs passed 6.

The default global pnpm launcher was also probed using `pnpm --version`, environment variants `PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS=false` and `npm_config_manage_package_manager_versions=false`, and `pnpm --manage-package-manager-versions=false --version`. It stalled and refused the version switch due to unavailable signature/registry fetch. A direct installed v11 JS launcher probe behaved the same. No install/download command was issued; these probes did not supply check evidence. The installed offline v9 probe returned 9.0.0; its attempted `--filter @jobguard/core typecheck` refused engines, exit 1, and ran no compiler. No dependency/security/engine configuration was modified. Cached pinned Corepack resolved this runner problem. Read-only `ps` was refused by the sandbox; no process state was inferred from it.

## STOPs (individual; documentation preparation continued)

1. `DemoMeterCommands`, `DemoSubscriptionCommands`, `DemoTrialCommands`: absent symbols at base, proposed owner ports only. No local substitute or success adapter.
2. Proposed success-fee, fee-statement, collection, refund and money-check routes: absent at base; exact commands/methods/results/authority remain H-MONEY/H-DEMO-P1-EXEC. Contract route table lists each absence.
3. Diary/customer-message POST is not installed authority merely because GET route files exist. SV-7A/MON-5 intake bindings and source fixtures remain external.
4. Complete supplier/photo/diary source-byte-to-catch fixtures remain externally owned; no fabricated signals/catches or claimed executable DS-03 fixture. The five JSON text recipes are fictional source inputs only, not a claim to generate all scenario evidence at this base.
5. Accepted operation-result/lost-response contracts, concrete source-reader bindings and predecessor acceptance receipts are missing. Existing source-inspected interfaces remain HELD; no fabricated file/method/read API or fixture-based zero.
6. Required lane/root lint cannot pass an uncommitted self-comparison under existing guard. No git writes authorised; final committed checks belong to dispatcher/CI.
7. Standard OpenAPI wrapper cannot bind its tsx IPC socket here; direct equivalent generator passes as separately labelled evidence.

The initial exact-string search for `contractVersion: job_capture_v1` was a formatting false negative, not a missing capture schema. Inspection verified `CAPTURE_CONTRACT_VERSION` and `captureRequestV1` in `packages/core/src/capture.ts`; the contract records the correct binding and no capture STOP.

## All holds remain holds

H-SV5; H-EP-MUST-SURFACE; H-PACK-CONSUMER; H-CH8-A-BINDING; H-SV6; H-VALUE-SOURCES; H-FOLLOWUP-CLOCK; H-ALLOC; H-MONEY; H-LIFECYCLE; H-COMPANY; H-CUSTOMER; H-TRIAL; H-CORE-CORRECTION; H-DEMO-P1-EXEC; H-OPERATION-READ; H-MON7; H-REVIEW. Full descriptions are preserved in the contract/static catalogue. Policy (including D01/D03/D13), London clock, card/identity, company/reset scope, customer approval and catch-source decisions remain with their owners; MON-7b stays parked. No receipt converts a candidate, pure fixture or old review into accepted prerequisite evidence.

## Acceptance evidence and checks not run

| ID | Builder evidence / remaining limitation |
|---|---|
| DP1-01 | All 49 rows documented with source/operation/schema references, evidence and binding status. Complete executable-map acceptance **BLOCKED / NOT COMPLETE**. |
| DP1-02 | Test-only strict raw-input grammar rejects end-state fields at root/recipe/source. No production parser installed. |
| DP1-03 | Inputs and expectations separated; unregistered constant is documentation only. No runtime output or observations supplied. |
| DP1-04 | Five families, companions, variants, negatives and both projects documented; no browser execution claim. |
| DP1-05 | Existing tests unchanged; selected historical fee/activation unit suites pass. Full v1/root regression remains CI responsibility. |
| DP1-06 | All upstream gaps/holds explicit. No complete mapping or successful journey claim. |

NOT RUN locally: clean pinned install; root `pnpm test`; PostgreSQL/catalogue/RLS/tenant/concurrency/replay/upgrade/migration/restore suites; all browsers including mobile-360 and desktop; full root regression; AI fixture/live evaluation (no model/prompt/parser behavior changed); live providers. Database/browser suites are CI-only by order. Required green CI and both actual exact-head Claude A/B reviews plus distinct technical acceptance remain missing/unassigned in the supplied issue. Builder identity is this Codex session; no reviewer or acceptance actor has been appointed by this receipt. Two nontechnical builder observations are MISSING. No commit exists for independent verdict binding yet. Runtime I/J1–J5/A1 and final DEMO-S acceptance are not complete. No gate is opened.

Intended commit message is written to `/private/tmp/jg-msg-demo-p1.txt`; dispatcher commits. No shared integration patch is needed for this documentation-only leaf.

## Completion addendum

`node tools/core-purity-lint.mjs`: PASS, exit 0, 230 TypeScript files; seven pre-existing computed imports reported, no new computed-import exception. Read-only Node API scope check (`loadLanePolicy`, `selectLane`, `lanePathAllowed` plus `git ls-files --others --exclude-standard -z`) PASS, exit 0: unique demo-p1 lane, all six actual untracked deliverables allowed, no trailing whitespace. This checks working-tree file scope only and does not replace the refused committed-range lane check. `pnpm exec turbo run lint --concurrency=2` was run separately to exercise the package lint stages that the root wrapper did not reach; result recorded below.

Final separate package lint result: `PATH=/usr/local/lib/node_modules/corepack/shims:$PATH COREPACK_ENABLE_NETWORK=0 pnpm exec turbo run lint --concurrency=2` PASS, exit 0, 7/7 tasks (2 cached), with sandbox cache-write warnings. This does not turn root `pnpm lint` or `pnpm lint:lanes` into PASS. Final `git diff --name-only` is empty and `git ls-files --others --exclude-standard` lists exactly the six permitted new files; intended commit-message file exists. No commit/push performed.
