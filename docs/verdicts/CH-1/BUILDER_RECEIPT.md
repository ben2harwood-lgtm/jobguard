# CH-1 builder receipt — HOLD, incomplete implementation

Issued header: JobGuard integrator, 8 October 2026; header overrides the 7 October draft. Builder: Codex. Dispatcher commits; builder performed only read-only git inspection and working-tree edits, under the confirmed 7 October dispatcher-commits ruling. No commit, push, PR, merge, technical acceptance, independent model verdict or release was performed.

Base and current HEAD: `df1f9c1776522390be6bccff7a2324e3bbdb09c6` (`origin/main` and `codex/sandbox/ch-1`). There is no built implementation head: the dispatcher must supply it after deciding how to handle this held preparation diff. Intended subject/body: `/private/tmp/jg-msg-ch-1.txt`.

## Blocking source finding

The issued order permits fixture-path-only edits to UIWIRE-5/UIWIRE-14 and says every other v1 test stays unchanged. It also says to stop and report a v1 test that creates a fresh job and requires old pricing. Source inspection found THREE MORE such tests:

- `apps/web/e2e/switch-live.spec.ts:4`: calls `openQuote(page)`, switches the fresh job live, then requires `Illustrative only until D01 approval` and `£79.00` inside `Live activation`.
- `apps/web/e2e/fee-statement.spec.ts:3`: calls `openQuote(page)`, selects `simulated_base_obligation`, switches the fresh job live, then requires the v1 illustration and £203.00/£2,617.00/£2,538.00 results and both cap/base-fee explanations.
- `apps/web/e2e/UIWIRE-13.spec.ts:3`: calls `openQuote(page)`, selects `simulated_base_obligation` on a fresh job; its second test expects the historic £15.00 recovery-fee result.
- `apps/web/e2e/helpers/capture-journey.ts:21–25,39–52`: `openQuote` uses `confirmCapturedScope` → `openReview` → `openCapture`; `openCapture` presses `＋ Start a new job`. It does not open a saved v1 sample.

These are source-inspected incompatibilities, not observed browser failures: the sandbox cannot run browser journeys. Making fresh jobs v3 and removing default v1 copy would contradict those exact protected assertions. Keeping v1 as the fresh-job default would contradict DW1/DW3. Choosing v1 based on the client scenario would let a new job write historic tables, also contradicting the contract. No such workaround was implemented.

Asynchronous questions requested a lane amendment for fixture-path-only changes in these three tests and a saved-v1 fixture helper. No answer has been received. The current order gives no permission to edit those files/helper; none was edited. The implementation must remain held until the dispatcher resolves this contradiction. Q4's two authorised files are also untouched; their before/after lines are therefore identical and there are no fixture-path changes to report.

## Preparation delivered

- First mutation added exactly one compact, name-sorted `ch-1` line to the lane registry, with migration 0104, both Q4 test paths and the required note. Every other registry line is unchanged.
- `packages/core/src/activation-v3.ts`: strict server-internal switch-live input and readonly terms-output schemas; exact nonnegative bounded integer pence; small-job predicate `max(accepted, highest sent) < 200000`. Fee-policy identity is taken from SV-1's exported success-fee schema, with no second runtime literal declaration.
- The trial/plan field is the closed literal `none_recorded_pre_mon2a`, per the **8 October coordinator ruling, INDEX.md “Coordinator rulings, round 3”**, supplied in the issued header. It is not null, blank or a guessed entitlement.
- `packages/core/src/activation-v3.test.ts`: 13 tests, including both sides of £2,000, highest-sent override, £18,800/£30,000 classification, invalid magnitudes/fractions, strict rejection of forged server facts, closed context and output consistency.
- One additive core export and `docs/contracts/job-activation-terms-v1.md`.
- This receipt, targeted failing/passing logs, and hashes of protected v1 files.

No runtime consumer uses these new contracts yet. There is no v3 activation routine, persistence/application/UI change or activated v3 fixture. No existing application behaviour was changed.

## Done-when evidence

| Assertion | Result |
|---|---|
| DW1 — atomic activation, one terms row, zero historic financial rows, replay/races | HOLD: persistence/application not implemented; PostgreSQL cannot run here. |
| DW2 — historic v1 behaviour and labelled rendering | Existing v1 sources/tests byte-identical; browser rendering and relabel not implemented. Source conflict above blocks completion. |
| DW3 — no historic pricing copy on new-job screens/exports/snapshots | HOLD: product path not implemented. |
| DW4 — immutable small-job flag | Core output consistency/read-only schema tested; SQL immutability not implemented or proven. |
| DW5 — named activated v3 fixtures | Pure thresholds tested for £1,000, £18,800 and £30,000; named persisted fixtures not created. |

Migration **0104_job_activation_terms.sql** is reserved by the issued order but **not created/registered** in this held preparation. No migration, catalog/count row, backfill or database data changed. BUILD_PLAN.md and merged migrations are unchanged. Fixture identities `core-1000`, `recovery-18800`, `shadow-30000` remain to be generated and activated through the real v3 command when work resumes; DEMO-S owns the complete shadow journey.

## Executed checks

Commands use the already installed pinned pnpm **10.28.1** binary, exposed by a temporary `/private/tmp/ch-1-bin/pnpm` symlink and `PATH=/private/tmp/ch-1-bin:$PATH`. The default shell pnpm shim points to 11.8.0. The initial targeted launch through it refused its automatic version switch because registry signature verification fetches failed; it never executed the tests (the initial shell wrapper returned 0 from its final `cat`, so no pnpm exit was captured). The failed fetches downloaded no package. Subsequent checks used the already installed pinned executable in command PATH only; no package, manifest, lockfile or repository tool changed or package downloaded. Node: **v24.17.0**. Dependencies were preinstalled; `pnpm install --frozen-lockfile` was not run per the dispatcher's no-download instruction. Turbo replayed existing cache entries for unchanged packages and reported restricted shared-cache write warnings.

| Command | Exit / observed result |
|---|---|
| `pnpm --filter @jobguard/core exec vitest run src/activation-v3.test.ts src/activation.test.ts src/fee.test.ts` (tests first) | 1: new module missing; 12 existing tests passed. |
| Same targeted command (first implementation) | 1: 24 passed, output refinement threw on an invalid magnitude; fixed without changing assertions. |
| Same targeted command (final preparation) | 0: 3 files, 25 tests passed. |
| `pnpm typecheck` | 0: all 7 package checks succeeded; 2 unchanged-package cache hits. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1: core purity passed, then lane checker rejected identical base/HEAD: `Missing branch or self-comparison range; refusing a misleading pass.` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1: same identical-base/HEAD guard. Requires the dispatcher commit; checker/tool unchanged. |
| `pnpm --filter @jobguard/core test` | 1: 49 files passed, 6 failed; 1595 tests passed, 12 failed on unchanged suites' 5000ms timeouts during concurrent checks. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=1` | 1: 107 files passed, 3 failed; 3208 tests passed, 6 failed at the unchanged 5000ms timeout. The concurrent build emitted dist tests, so this run discovered both source and compiled tests (110 files). Five receipt-allocation and one enterprise-boundary timeout remain; no timeout increased. |
| `pnpm --filter @jobguard/api test` (before package build outputs existed) | 1: 18 import-failing suites, 4 passed, 59 tests passed. Errors resolving missing @jobguard/core/db build outputs. |
| Same API command (after dependency outputs existed) | 1: 21 files passed, health suite failed; 581 tests passed, 1 failed; `EPERM`, `syscall: listen`, `address: 0.0.0.0`. No test skipped. |
| `pnpm --filter @jobguard/web test` (before build outputs existed) | 1: 11 import-failing suites, 8 passed, 57 tests passed. Missing @jobguard/api/core/db build outputs. |
| Same web command (after build outputs existed) | 0: 19 files, 350 tests passed. |
| `pnpm build` | 0: all 7 package builds succeeded, including the production Next build; 2 unchanged-package cache hits. Existing workspace-root/autoprefixer and restricted cache-write warnings remain. |
| `pnpm openapi:check` | 1: tsx IPC pipe `listen EPERM` at `/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/86724.pipe`. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`, first diagnostic) | 1: missing @jobguard/db/dist/index.js before dependency build completed. |
| Same Node invocation after dependency build outputs existed | 0: exact same OpenAPI generator/check, with no tsx CLI IPC server. Official wrapper result remains 1. |
| `pnpm --filter @jobguard/web exec playwright test --list CH-1.spec.ts UIWIRE-5.spec.ts UIWIRE-14.spec.ts` | 0: 8 existing tests, 2 files, both projects; CH-1 spec absent while held. Listing only, no browser execution. |
| `node tools/core-purity.mjs` (mistyped diagnostic path) | 1: MODULE_NOT_FOUND; actual file is core-purity-lint.mjs. |
| `node tools/core-purity-lint.mjs` | 0: 111 TypeScript files. |
| `node tools/money-arithmetic-lint.mjs` | 0. |
| `node tools/commercial-boundary-lint.mjs` | 0. |
| `git diff --check` | 0. |

Supplemental read-only Python inspection confirmed the registry differs from base by **only** the new ch-1 line, lane-name order is preserved, and all 9 changed/untracked paths match the issued allowlist. This is a deterministic inspection, not an official lane-lint pass or a model verdict.

The first targeted run failed before the implementation file existed (exit 1: `Cannot find module './activation-v3.js'`); unchanged v1 targeted suites passed 12 tests. The first implementation run found a schema-validation defect: the output refinement called the throwing predicate on an already invalid magnitude. The refinement now compares the already schema-checked values without throwing. The targeted passing run exited 0: **3 files, 25 tests** (13 new, 12 existing); `core-red.log` and `core-green.log` retain the output. No assertion or timeout was relaxed.

Not run: root `pnpm test` (includes the prohibited PostgreSQL subsystem); DB suites, `pnpm test:db`, `pnpm test:migrations`, or browser execution (sandbox cannot start PostgreSQL or bind localhost, per issued instructions). PostgreSQL and browser suites must run in GitHub CI after dispatcher push. No CH-1 browser spec was authored while the complete workflow is held; `--list` found only the two existing permitted v1 specs. No DB/mock result is represented as a real PostgreSQL guarantee. No live provider or AI-model evaluation was required or run.

## Scope, compatibility and remaining work

All existing behavioural tests remain byte-identical. `unchanged-v1-hashes.json` records matching base/working-tree SHA-256 hashes for activation.ts, fee.ts, their tests, the listed v1 DB/browser/application suites and fee-what-if.test.ts. No catalog/count tests changed. No legacy table/routine/source, PracticeAccess, practiceMaterialPool, parties guard, watchdog registry/transition, activation route, OpenAPI document, decision approval or production gate was changed.

Affected prepared invariants: pure core, bounded integer money, strict versioned boundaries, server-selected commercial facts, immutable terms contract, reuse of SV-1's policy identity. Tenant isolation, authorization, audit, retries, lock order and SQL immutability still require implementation and real tests; this preparation proves none of them.

Shared-file overlap: lane registry and core export are edited by this CH-1 builder in this worktree; integration/serialization owner is the dispatcher/coordinator. No shared UI file has been touched. MON-7, CH-3a and CH-6 UI overlaps remain applicable when implementation resumes.

Remaining gates: fixture lane amendment; complete CH-1 vertical slice and acceptance coverage; clean pinned install/checks in CI; real PostgreSQL migrations/adversarial suites and browser runs in both projects; independent Claude verdict on the exact dispatcher commit; separate actor's acceptance. **D01 v3, D09 and G4-S remain pending.** No founder-reserved action was taken. This document is a builder HOLD report, not an independent verdict or acceptance.
