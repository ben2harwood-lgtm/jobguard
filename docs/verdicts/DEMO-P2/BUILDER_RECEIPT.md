# DEMO-P2 builder receipt — 23 October 2026

Builder: this Codex session, executing the issued DEMO-P2 preparation-only build-ahead order under decision 74. Source-inspected and unit-test-executed; no independent verification or technical acceptance. Dispatcher commits after exit; Ben merges. No commit, push, PR, deployment, enablement, provider action, spending or real data.

Start/current HEAD: `0e517aa291fcc73b3ef0f40cb22e52d2b1b69e7b` (DEMO-P1 candidate, under review). Branch `codex/sandbox/demo-p2`, worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/demo-p2`. Integration target main; cached `origin/main` is `dc5721230fd8aedbf2d9d0457789074b66b48765`. The issued order explicitly authorizes stacking on P1 for catalogue structure only, superseding the draft's old base/branch/lane placeholders. No final P2 commit exists yet for verdict binding.

## Delivered scope and engineering choices

Exactly the four draft-owned functional files, `config/lanes/demo-p2.json`, and this receipt. The lane is version 2, with one exact branch and five exact functional/receipt paths; its own lane-file path is not included in JSON allow. No legacy register, foreign lane, shared barrel, catalogue, route, migration or package manifest changed. No additive integration patch required for pure preparation. No backwards-compatibility impact, data migration, external action, financial calculation or new operational alert.

Strict Zod product-report, immutable-source-reference, typed value/scope and separate unverified acceptance-index schemas plus deterministic relational checks. P1 catalogue use is restricted to version/step/family/binding structure and known holds; expected figures never become report data. A structurally complete blocked report is explicitly not an executable map, passed journey, authenticated source or acceptance verdict. All P1 bindings remain HELD; observed rows fail. Both viewport labels and all five families are exercised only as pure synthetic specimens.

Report metrics reproduce exact source values; no second fee/tax/rounding/aggregate engine. Scope is one tenant/job/session/run/project per report; companions and company aggregates need their future owner adapters. Exact command replay is allowed, conflicting canonical input/result binding is rejected. Zero external-actions needs matching adapter and sentinel claims and still remains unverified. Unknown keys/PASS/approval fields are rejected. Actual caller classification, hashing, source provenance and authority cannot be authenticated by this pure function and are explicitly held for runtime adapters. Prelock Final Check sources are refused even if unreferenced or zero-count. No hidden source query exists.

## Source inspection and symbol verification

Read repository AGENTS.md in full; BUILD_PLAN §§2.4 C1–C8 and DEMO-S; the Astra DEMO-P2 draft at line 6920 in full, its own planning pack common §§1–2.5 and holds, plus the P1 contract, catalogue structure and receipt. The source specification is `/Users/benharwood/.local/share/full-steam/jg-runs/v5-planning-wave-20261020T214337Z/JobGuard-BUILD-AHEAD-ALL-SIX-CORRECTED-DRAFT-20261020T230116Z.md`.

Read-only `git grep` verified `demoCatalogue` and `MAX_MONEY_PENCE`; P2's four named functional paths have no HEAD hits and are new targets as specified, not absent predecessor symbols. The P2 card names no other existing callable symbol. The lane template was read with `git show codex/sandbox/ch5-c:config/lanes/ch5-c.json`; lane guard helpers were source-inspected/grep-verified before own-file scope validation. No proposed P1 runtime port was consumed or implemented. Its missing runtime symbols remain inherited holds rather than preparation blockers.

## Environment and actual commands

Dependencies already installed; no clean install or package download. Node `v24.17.0`; cached pinned pnpm `10.28.1` via `COREPACK_ENABLE_NETWORK=0 corepack pnpm`, or Corepack shims prepended to PATH for nested scripts. Initial default `pnpm --version` produced a global-launcher warning without a usable version; switched to the cached pinned runner. No engine/lockfile changes. Disk 214 GiB available; system-wide memory free 61%. One check/build invocation at a time, max two Vitest workers and max three named files; Turbo checks/build use concurrency 2. No subagents needed for this single pure leaf.

| Command actually run | Actual result |
|---|---|
| `COREPACK_ENABLE_NETWORK=0 corepack pnpm --version` | PASS, 10.28.1, exit 0 |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/small-builder-demo-trace.test.ts` before implementation | Expected RED, exit 1, missing new module; no tests collected |
| Same own-file Vitest command after implementation | PASS, exit 0, initial 25 tests |
| `pnpm --filter @jobguard/core typecheck` | First FAIL, exit 2: test-matrix typing and comparison against nonexistent BOUND status. Both fixed in owned files; subsequent PASS, exit 0 |
| `pnpm --filter @jobguard/core lint` | PASS, exit 0 |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/small-builder-demo-trace.test.ts src/small-builder-demo-scenarios.test.ts src/money.test.ts` | PASS, exit 0, 3 files / 70 tests, including additional final adversaries |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL, exit 1: core purity PASS (232 TS files, 7 existing computed-import reports); lane guard rejects all six inherited P1 files. Turbo package-lint stage not reached |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, exit 1: same inherited-P1-file boundary refusal |
| `git diff --check` | PASS, exit 0; tracked diff empty because six P2 deliverables are new/untracked. Separate own-file scope/whitespace check required below |

No inherited test changed or weakened. Red iterations are described above; no red result is relabelled as a pass.

## Individual STOPs and continuing work

1. Root lint/lint:lanes against the required `origin/main` base refuse `config/lanes/demo-p1.json`, P1 contract, input fixture, receipt, catalogue source and catalogue test. These are committed predecessor files already in the issued base, not P2 modifications. No foreign paths were added to the lane, no alternative comparison was used to claim root PASS. Dispatcher reruns after appropriate predecessor integration and its P2 commit. Pure preparation continued.
2. P1 complete executable map remains BLOCKED_NOT_COMPLETE; all required bindings HELD. No accepted runtime source/renderer or authoritative provenance contract is supplied. Runtime rendering, observed journey completion and authenticity certification are STOPped individually; no local substitutes.

The draft's absent new P2 target files are expected creation targets and not STOPs. No existing P2 dependency symbol was missing.

## Acceptance evidence and preserved holds

| ID | Builder evidence and limit |
|---|---|
| DP2-01 | Missing/duplicate/foreign rows, missing sources/keys, held observed rows and forged map completion rejected by unit tests. Complete blocked specimens remain not-established journeys. |
| DP2-02 | Changed input hash/result binding conflicts; exact replay remains structurally consistent. No live command execution claim. |
| DP2-03 | Scope and amount/count/status mismatches fail; fractional/unsafe/over-limit amounts fail. Pure data consistency, not RLS proof. |
| DP2-04 | Public acceptance claims rejected; plausible external artifact URL/hash/commit remains unverified. Actual reviewer/CI/human provenance not checked. |
| DP2-05 | Prelock Final Check sources/hidden-zero fields rejected; no source queries/runtime path. Actual noninterference remains runtime evidence. |
| DP2-06 | Fixture-only zero and one-sided source evidence fail; paired claims still unverified. Actual adapter/sentinel execution NOT RUN. |

All inherited holds persist: H-SV5; H-EP-MUST-SURFACE; H-PACK-CONSUMER; H-CH8-A-BINDING; H-SV6; H-VALUE-SOURCES; H-FOLLOWUP-CLOCK; H-ALLOC; H-MONEY; H-LIFECYCLE; H-COMPANY; H-CUSTOMER; H-TRIAL; H-CORE-CORRECTION; H-DEMO-P1-EXEC; H-OPERATION-READ; H-MON7; H-REVIEW. Policy, clock, company/customer authority, reset scope, trial/card/lifecycle, source-to-catch and commercial decisions remain owned externally. MON-7b stays parked. Nothing here approves live/pilot/provider/production activity.

NOT RUN: PostgreSQL/runtime-role/RLS/concurrency/replay/integration/migration/upgrade/restore suites and both browser projects, as ordered CI-only; clean install; broad root test/regression suite; live provider/model evaluation. AI eval is inapplicable: no prompt/model/extractor/matching-policy change. Lane-regression Node suites specified CI-only remain CI-only. Required green CI, two actual final-head independent Claude reviews and fresh distinct technical acceptance are missing; no actors appointed by this receipt. Both human observations remain MISSING. P1 review/acceptance and DEMO-I/J/A runtime acceptance remain held. No builder self-acceptance.

Further verification results are appended below after actual command completion. Intended commit message: `/private/tmp/jg-msg-demo-p2.txt`.

## Completed verification addendum

- `pnpm build --concurrency=2`: PASS, exit 0, 7/7 Turbo tasks (2 cached), including actual Next production build. Existing CSS compatibility, Nest file-type/load-esm, workspace-root and sandbox cache-write warnings. This is not clean-install CI or a browser run.
- Read-only Node scope check using `loadLanePolicy`, `selectLane`, `lanePathAllowed`, `git ls-files --others --exclude-standard -z` and whitespace inspection: PASS, exit 0. Exactly six allowed new files, unique demo-p2 lane and no trailing whitespace. This is working-tree scope evidence, not the failed committed-range lane check.
- `pnpm openapi:check`: FAIL, exit 1, tsx CLI cannot bind its IPC pipe (`listen EPERM`) before generator execution. **STOP 3:** standard wrapper execution is blocked by sandbox socket restrictions. No approval escalation or check weakening attempted.
- `node --import tsx src/generate-openapi.ts --check` from `apps/api`: PASS, exit 0, same source generator check without the CLI's IPC server. No OpenAPI bytes changed. This fallback result does not relabel the wrapper PASS.
- `pnpm typecheck --concurrency=2`: PASS, exit 0, 7/7 Turbo tasks (2 cached), including final new tests; sandbox cache-write warnings only.

Final diff/scope inspection: six new/untracked permitted deliverables, no tracked modifications; `git diff --check` PASS and intended commit-message file exists. No git writes or network operations were performed. The dispatcher must bind its eventual commit to actual independent A/B reviews and separate acceptance, and rerun root lint/lane checks after predecessor integration. Preparation implementation is delivered for review only; no acceptance or runtime readiness is asserted.


## r1

Issued repair 23 October 2026, builder Codex gpt-6.1-sol, medium reasoning. Repair base/HEAD `304a8ebd6c30e118400e6419d93aae1aeb891b74`, branch `codex/sandbox/demo-p2`, after the dispatcher merged DEMO-P1 r1 `167ea3a0`. Both full REPAIR verdicts were read at `/Users/benharwood/.local/share/full-steam/jg-runs/v5-demo-p2-claude-A-89a4cf40-20261023.md` and `v5-demo-p2-claude-B-89a4cf40-20261023.md`; the relative paths in the order were absent in the worktree. Read repository AGENTS.md, BUILD_PLAN inherited C1–C8 and DEMO-S context, the issued draft DEMO-P2 card and §7.2, and DEMO-P1's r1 receipt. These old verdicts concern `89a4cf40`, not this repair. No independent verdict or acceptance is claimed for the new diff.

DP2-06: replace free-string metric IDs with a closed preparation vocabulary. `net` remains available; `external-actions`, `real-external-actions`, `External-Actions` and `realExternalActions` parse to the single canonical ID `external-actions`. Duplicate checks and the existing count/adapter/sentinel rule operate on that canonical ID. Every unknown spelling, including `real_external_actions_v2`, is rejected by the schema; no fuzzy matching or arbitrary metric-name escape remains. The supported aliases are explicit input compatibility, while parsed output uses the canonical ID. This intentionally narrows this unregistered preparation schema: any future metric vocabulary addition needs a contract/schema/test change. There are no installed consumers, route changes or migrations.

DEMO-P1 r1 adaptation: P2 already resolves step binding IDs and status from the imported catalogue, so no copied IDs or recipe changes were needed in the validator. The contract now records the 32 distinct HELD bindings, including B24–B32. Added per-step coverage checks every one of the 49 repaired catalogue rows in its own family against the current required HELD bindings. All five families and both project labels still pass as blocked specimens. Structured capture recipes remain inputs owned by P1, never trace evidence or runtime output. P1's recipe parser tests run only as deterministic synthetic tests; no live model or capture API was exercised.

Regression proof actually run before changing the implementation: final new test cases against the original implementation exited 1, **5 failed / 82 passed**, logged at `/private/tmp/demo-p2-r1-red.log`. Three alias-normalisation cases, unknown-ID rejection, and duplicate identity after normalisation fail without the repair. The canonical spelling's pre-existing rule and all 32 inherited P2 cases remained green, as did the 49 added catalogue cases; those are regression/adaptation coverage, not claimed red tests for new behavior. Each of the four spelling cases also tests a matching domain-only zero, a matching adapter/sentinel pair, and matching non-count evidence. No inherited assertion was removed or weakened. After the fix, both named suites pass **141/141** (P2 87; P1 54), log `/private/tmp/demo-p2-r1-green.log`.

Checks use installed dependencies, Node v24.17.0 and cached pinned Corepack pnpm 10.28.1 with `COREPACK_ENABLE_NETWORK=0`; nested pnpm uses `/usr/local/lib/node_modules/corepack/shims` on PATH. No install or download was attempted. Vitest uses at most two workers. Results below are working-tree evidence, not clean-install CI or exact-commit review.

| r1 command | Actual result |
|---|---|
| `pnpm --filter @jobguard/core typecheck` | PASS, exit 0 |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/small-builder-demo-trace.test.ts` before implementation repair | Expected FAIL, exit 1, 5 failures / 82 passes; regression control only |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/small-builder-demo-trace.test.ts src/small-builder-demo-scenarios.test.ts` | PASS, exit 0, 2 files / 141 tests |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL, exit 1; core purity PASS (232 files), lane guard rejects six inherited P1 paths; package stage not reached by wrapper |
| `pnpm lint:lanes` | FAIL, exit 1; same six inherited P1 paths in branch-vs-main comparison |
| `pnpm exec turbo run lint --concurrency=2` | PASS, exit 0, all 7 package tasks (2 cached); sandbox cache-write warnings |
| `node tools/money-arithmetic-lint.mjs` and `node tools/commercial-boundary-lint.mjs` | PASS, both exit 0, run separately because root wrapper stopped before these |
| `pnpm openapi:check` | FAIL, exit 1; tsx CLI IPC socket `listen EPERM` before generator execution |
| `node --import tsx src/generate-openapi.ts --check` (cwd apps/api) | PASS, exit 0, equivalent generator check without CLI IPC; no OpenAPI change |

Root lint/lane failures are unchanged stacked-branch limitations, not bypassed or converted to passes. A separate working-tree allowlist check using the existing `loadLanePolicy`/`lanePathAllowed` and read-only Git diff/untracked listing passed: four permitted tracked changes and zero untracked files. No lane configuration was edited. Final whitespace and remaining check results follow below.

All prior holds remain. No provider/network action, financial calculation, authoritative report, accepted executable map, source-authenticity proof, release or real-data gate is added. The change touches the DP2-06 structural evidence boundary and preserves tenant/source/command/visibility checks. No migration, operational alert, AI prompt/model/extraction policy or runtime workflow changes. Clean install, full root test suite, PostgreSQL/migrations, browser/device suites, restore, live providers and live-model evaluations were not run; database/browser execution belongs to GitHub CI by the dispatcher's environment note. Fresh exact-commit Claude A/B reviews and separate acceptance are still required after dispatcher commit. No sub-agent, staging, checkout, commit, push or PR action was performed.

Final r1 check results: `pnpm --filter @jobguard/core lint` PASS, exit 0; `pnpm typecheck --concurrency=2` PASS, exit 0, 7/7 Turbo tasks (2 cached); `pnpm build --concurrency=2` PASS, exit 0, 7/7 Turbo tasks (2 cached), including Next production compilation and static generation. Build emitted existing workspace-root, CSS and file-type/computed-dependency warnings plus sandbox cache-write warnings; no check was disabled. Core typecheck/package lint and root typecheck are separate successful invocations. Final `git diff --check` PASS, exit 0; final working-tree allowlist PASS, exactly the four modified P2 functional/receipt paths, zero untracked files. An earlier whitespace check found a temporary extra blank line at the receipt EOF while this section was being appended; it was removed before the final check.

Logs are `/private/tmp/demo-p2-r1-{red,green,typecheck,core-lint,lint,lanes,package-lint,root-typecheck,build,openapi,openapi-direct}.log`. Intended conventional-commit subject and body are saved to `/private/tmp/jg-msg-demo-p2.txt`. Changes remain uncommitted for dispatcher handoff. No action in this repair writes Git metadata. These checks establish pure schema behavior only; independent review, CI database/browser checks and separate acceptance remain pending.
