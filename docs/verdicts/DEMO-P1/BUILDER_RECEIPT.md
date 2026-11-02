# DEMO-P1 builder receipt — 23 October 2026

Builder: Codex session executing issued DEMO-P1 build-ahead order, decision 74. Source-inspected and test-executed only; not independently verified or accepted. No commit, push, PR, merge, provider, spending, real data, database or browser execution. Ben retains merge authority; dispatcher commits after exit.

Base and HEAD at start: `dc5721230fd8aedbf2d9d0457789074b66b48765` (`origin/main`); branch `codex/sandbox/demo-p1`; initially clean. Worktree: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/demo-p1`. No clean install performed: preinstalled dependencies used. Node `v24.17.0`; successful pnpm commands use cached Corepack `10.28.1`, with network disabled. No dependency or lockfile changed.

## Delivered scope and choices

- Exact four draft functional files, issued `config/lanes/demo-p1.json` and this receipt only. The issued lane/branch replaces the draft proposed evd lane name; no second registration. No shared barrel, routing, catalogue test, migration, runtime application or package export changed.
- Static, unregistered `demoCatalogue` documentation data: all 49 rows (DC 8, DR 11, DS 7, DM 13, DT 8, DV 2), 24 initial interface entries (incomplete port separation and row mappings, corrected in r1 below), 12 dedicated negative branches, both viewport projects, 29 explicit prerequisites and all 18 planning holds. Every binding is HELD with null acceptance evidence, every journey NOT_RUN. Source presence is not producer acceptance.
- Simplest proposed form: plain constant data plus a Markdown contract and five fictional source-text input recipes (the three main-family recipes are structured in r1). Strict JSON grammar and adversarial mutation checks live only in the owned unit test. No runtime parser, dispatcher or second money/billing/fee model added by this leaf. Test-only JSON asset import uses Vitest; no filesystem dependency added to core. The compiler diagnostic suppression covers only the JSON import because resolveJsonModule is not enabled, not runtime implementation errors.
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
| DP1-01 | All 49 rows present; initial required-port mapping coverage was incomplete (Claude A BLOCKING 1), repaired below. Complete executable-map acceptance **BLOCKED / NOT COMPLETE**. |
| DP1-02 | Test-only strict raw-input grammar rejects end-state fields at root/recipe/source. No new production parser installed by this leaf; initial recipes were not tested against the existing capture parser until r1. |
| DP1-03 | Inputs and expectations separated; unregistered constant is documentation only. No runtime output or observations supplied. |
| DP1-04 | Five families, companions, variants, negatives and both projects documented; no browser execution claim. |
| DP1-05 | Existing tests unchanged; selected historical fee/activation unit suites pass. Full v1/root regression remains CI responsibility. |
| DP1-06 | All upstream gaps/holds explicit. No complete mapping or successful journey claim. |

NOT RUN locally: clean pinned install; root `pnpm test`; PostgreSQL/catalogue/RLS/tenant/concurrency/replay/upgrade/migration/restore suites; all browsers including mobile-360 and desktop; full root regression; AI fixture/live evaluation (no model/prompt/parser behavior changed); live providers. Database/browser suites are CI-only by order. Required green CI and both actual exact-head Claude A/B reviews plus distinct technical acceptance remain missing/unassigned in the supplied issue. Builder identity is this Codex session; no reviewer or acceptance actor has been appointed by this receipt. Two nontechnical builder observations are MISSING. No commit exists for independent verdict binding yet. Runtime I/J1–J5/A1 and final DEMO-S acceptance are not complete. No gate is opened.

Intended commit message is written to `/private/tmp/jg-msg-demo-p1.txt`; dispatcher commits. No shared integration patch is needed for this documentation-only leaf.

## Completion addendum

`node tools/core-purity-lint.mjs`: PASS, exit 0, 230 TypeScript files; seven pre-existing computed imports reported, no new computed-import exception. Read-only Node API scope check (`loadLanePolicy`, `selectLane`, `lanePathAllowed` plus `git ls-files --others --exclude-standard -z`) PASS, exit 0: unique demo-p1 lane, all six actual untracked deliverables allowed, no trailing whitespace. This checks working-tree file scope only and does not replace the refused committed-range lane check. `pnpm exec turbo run lint --concurrency=2` was run separately to exercise the package lint stages that the root wrapper did not reach; result recorded below.

Final separate package lint result: `PATH=/usr/local/lib/node_modules/corepack/shims:$PATH COREPACK_ENABLE_NETWORK=0 pnpm exec turbo run lint --concurrency=2` PASS, exit 0, 7/7 tasks (2 cached), with sandbox cache-write warnings. This does not turn root `pnpm lint` or `pnpm lint:lanes` into PASS. Final `git diff --name-only` is empty and `git ls-files --others --exclude-standard` lists exactly the six permitted new files; intended commit-message file exists. No commit/push performed.

## r1 (Claude A/B repair)

Repair base/HEAD: `0e517aa291fcc73b3ef0f40cb22e52d2b1b69e7b`, branch `codex/sandbox/demo-p1`. Both full verdict files were read before changes: `/Users/benharwood/.local/share/full-steam/jg-runs/v5-demo-p1-claude-A-0e517aa2-20261023.md` and `v5-demo-p1-claude-B-0e517aa2-20261023.md`, each REPAIR with one blocking finding. Those verdicts cover the original commit, not this uncommitted repair. No commit/push/PR; dispatcher owns the next commit. No dependency download or install. Node v24.17.0 and cached pinned Corepack pnpm 10.28.1, network disabled.

A BLOCKING 1: split MON-1/B24, MON-2A/B25 and MON-3/B26; separately document SV-5 completion/reveal B27, MON-5 approval B28, SV-6 attribution/derivation B29, CH-9 value B30, DEMO-I run/report/resume B31, and SV-3/SV-5 worker B32. Correct every row enumerated by the blocking finding, including its partial rows; add completion bindings on DC-05/DR-03 and map meter/trial rows to their distinct ports. The existing value route/schema is source-inspected partial evidence only, not accepted full CH-9. All 32 bindings remain HELD, with null acceptance evidence; all journeys remain NOT_RUN. No executable mapping or upstream gate is accepted.

B BLOCKING 1: core/recovery/shadow inputs now contain JOB plus six ITEM records, the five work items and Replace shelves to dismiss. All prices remain unknown for later human entry. Customer name and recipient email are removed from these three capture recipes; parties commands own that input. Meter/trial preparation recipes are unchanged because their separate input improvements were LATER, outside this repair.

Coverage correction: the initial six tests established row presence, ID resolution and a strict input envelope only. They did not establish correct required-port mappings or successful recipe extraction. The earlier DP1-01 coverage wording and “separately documented” claim overstated that evidence; corrected above. Initial JSON prose could not yield the documented main-family proposals. The added tests now pin 33 repaired row binding sets, nine distinct owner entries, three isolated MON ports and three real-parser recipe results. The test imports the actual pure `packages/ai/src/capture-fixture-parser.ts` through a test-only URL loaded by Vitest, avoiding an AI dependency in core's production graph and avoiding another package under core's rootDir. This is deterministic parser testing, not a live model, API, confirmation, database or browser test.

Failure checks actually run: baseline own suite PASS 6/6. First added regression batch failed on the original missing bindings and each of the three prose recipes. While parameterising per-row tests I introduced an extra closing parenthesis; that transform/typecheck failure was corrected and is not counted as a regression control. With the final test file, temporarily restore only the two input/catalogue files from read-only `git show HEAD:<path>` and run the own suite: exit 1, **48 new cases failed / all six original cases passed** (`/private/tmp/demo-p1-r1-red-final.log`). Restore repaired bytes in a finally block; own suite then passes 54/54. Thus every added case was checked to fail without the fixes, with no inherited assertion removed or weakened. No git write command was used.

Checks and final limitations follow below. The original receipt's pre-commit lane self-comparison failures describe its initial run; r1 runs use the actual committed side-branch HEAD. New uncommitted repairs still require post-commit checks and fresh exact-head Claude A/B review plus separate acceptance. DB/browser suites remain CI-only by order. No migration, money engine, external action, provider, alert or release behavior changes.

| r1 command (cached pnpm 10.28.1, `COREPACK_ENABLE_NETWORK=0`) | Actual result |
|---|---|
| `pnpm --filter @jobguard/core typecheck` | PASS, exit 0 after test syntax correction |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/small-builder-demo-scenarios.test.ts` | PASS, exit 0, 54/54; final run after original-data control restored repaired bytes |
| Same own-suite command with original HEAD catalogue/JSON and final tests | Expected FAIL, exit 1, 48 new cases fail, six inherited cases pass; not counted as a green check |
| `pnpm --filter @jobguard/core lint` | PASS, exit 0 |
| `LANE_BASE_REF=origin/main pnpm lint` | PASS, exit 0, lane/core-purity/money/commercial guards and all 7 package tasks (2 cached) |
| `pnpm lint:lanes` | PASS, exit 0, actual branch/base/HEAD comparison; working-tree allowlist checked separately |
| `pnpm build --concurrency=2` | PASS, exit 0, all 7 tasks (2 cached), including production Next build; sandbox cache-write and existing workspace-root/CSS/file-type warnings |
| `pnpm openapi:check` | FAIL, exit 1, tsx IPC `listen EPERM` before generator execution |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | PASS, exit 0, equivalent generator without CLI IPC; no OpenAPI change |
| `git diff --check` and working-tree allowlist check | PASS; exactly the five functional/receipt paths permitted by the existing demo-p1 lane; lane file unchanged |

Logs are `/private/tmp/demo-p1-r1-{red-final,green,lint,lanes,package-lint,build,openapi,openapi-direct}.log`. The initial parameterisation syntax error also caused an initial package typecheck failure; the later package typecheck, lint and build above cover the corrected test. The first six-test baseline and early five-failure test-first run were also executed, but the comprehensive final original-data control is the recorded regression proof. No test weakened. No root full test suite, root typecheck wrapper, PostgreSQL, browser, migration, restore or live-model/provider run; scope is the requested package typecheck/lint and own unit suite plus root lint/build/OpenAPI. Existing unrelated historical suites were not rerun for this documentation/input-only repair.

Resource observations: 209 GiB free disk, memory reported 45% before repair checks and 37% during build preparation. Vitest used at most two workers and one named file per invocation; build concurrency was two. No worker agents spawned. Root lint prints eight computed-import notices: seven existing plus the explicit test-only URL import of the pure installed capture parser; no purity rule or exception list changed. These notices are reported by the existing lint rather than rejected, and do not constitute dependency/provenance verification by that scanner.

All prior holds remain; reviewers must review the repaired commit after dispatcher commit. Intended conventional-commit subject/body saved to `/private/tmp/jg-msg-demo-p1.txt`. No commit, staging, checkout, push or PR command executed.
