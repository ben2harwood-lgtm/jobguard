# SV6-08-09 builder receipt — 24 October 2026

Status: build-ahead pure coverage; persisted acceptance DEPENDENCY-BOUND. Not committed, pushed, independently reviewed, accepted or merge-ready. Dispatcher commits; founder owns merge/release.

## Session record

```yaml
date: 2026-10-24
actor: Codex
role: builder
session_id: 01a16bdd-9796-7522-ab67-3b48ed5225aa
model_and_reasoning: not independently exposed by this session; no model routing changed
subagents: none
worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv6-08-09
branch: codex/sandbox/sv6-08-09
starting_head: 68c87b84ec5ede05434d16034079e507aa9f1635
implementation_commit: uncommitted working tree; dispatcher to supply exact commit
initial_worktree: clean
synthetic_only: true
```

## Authority and implementation

Read repository AGENTS.md, BUILD_PLAN §10.2.8–9, SV-6 and its dependency rows, the issued SV6-08-09 order, the planning specification's acceptance table and verification/hold sections (lines 680–895), and its definitions, allocation ownership and ready-rule rulings. Follow the actual accepted SV6-01/SV6-05 modules on this branch. The draft's proposed pure illustration and integration filenames are absent; the actual leaf is `packages/core/src/recovery-fee-illustration.ts`. The current order expressly authorizes build ahead; it does not waive SV-5, CH-7 or M4-8 dependency/acceptance gates.

Added two exact-title tests to the existing pure illustration test file. No existing assertion was removed or weakened. Production source already implements the required guards and remains byte-identical to HEAD after temporary mutations. No allocator, raw-receipt allocation call, allocation policy, fee formula, model output, persistence, UI, route, commercial action or provider integration is introduced. Both fixtures remain explicitly synthetic and tenant/job/lock bound. Money uses the existing exact arithmetic kernel; no model produces any money input.

Files changed: `packages/core/src/recovery-fee-illustration.test.ts`, this receipt, and `config/lanes/sv6-08-09.json`. The version-2 lane lists exactly the two non-register files; its own lane JSON is intrinsically permitted by the lane checker and cannot appear in `allow`. The shared register is unchanged. Edits to the shared illustration test file serialize with any other SV-6 leaf editing it.

No migration, grants/RLS/catalogue change, data backfill, public schema/API change, production policy activation, operational alert or backwards-compatibility change. Rollback removes the two additive tests and lane/receipt; no persisted data exists for this leaf. Tenant/current-authority authentication and source reconstruction remain the persisted caller's responsibility, not a property established by pure parsing.

## Acceptance mapping

| ID | Named test and result boundary |
| --- | --- |
| SV6-08 | `SV6-08 coalesced work and assessment history cannot duplicate principal` in the actual pure file. Multiple evidence citations still produce one contribution; distinct reviewed revisions of one canonical work refuse in either order; latest-only recomputation is separate and prior inputs/results remain byte-identical. Independent assessment/review/allocation aliases refuse; a distinct work contributes normally. Pure result recorded below. **DEPENDENCY-BOUND**: the specified `packages/db/test/recovery-attribution.integration.test.ts`, persisted assessment writer/current selector and SV-5 source handoff do not exist on this base; no pretend DB or mock integration test was created. Server coalescence, historical selection and persisted uniqueness still require real DB tests after dependencies land. |
| SV6-09 | `SV6-09 illustration consumes saved allocations without reallocating or rounding them` in the actual pure file. The synthetic saved wire retains numerator `4000000` and denominator `86`; the summation spy observes those exact unreduced values. Only the aggregate reduces to `2000000/43`, fee is 4651p, fractional principal display remains withheld. Both allocation IDs remain in order, input bytes remain unchanged, mismatched principal/missing manifest/empty proof refuse. **DEPENDENCY-BOUND** for figures integration proving actual saved IDs/rationals from M4-8 rows; the pure fixture is not allocator or persistence evidence. |

The pure test title for SV6-08 is deliberately not presented as the absent required integration test. These are partial build-ahead results, not whole-ID technical acceptance. No skipped placeholder tests were added. Focused `-t` runs leave earlier tests unselected; the final complete source run includes them.

Aggregate SV-6 remains outstanding. Literal browser assertions: **NOT BUILT / NOT RUN — UI parked**. SV6-10, SV6-16 and SV6-29: **INCOMPLETE — HELD**, not addressed by this order. Saved F5/F7 dependency work remains **NOT BUILT — HELD** where it needs an undecided rule. SV6-BEN-Q4/Q5 are outside this lane; no new acceptance result is claimed. Existing accepted synthetic SV6-05 policy composition is only consumed, never amended or treated as production approval.

## Executed checks

Existing Node v24.17.0, pnpm 10.28.1, Vitest 4.1.11, TypeScript 5.8.3; no install/download or fresh pinned-install claim. Commands use a temporary pnpm shim pointing to the installed `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`, including child Turbo tasks. Checks are serial, Vitest `--maxWorkers=2`, Turbo `--concurrency=1`. A local check wrapper waits while one-minute load exceeds 20 before each command. Initial focused baseline ran with load 14.61 and passed: 2 selected tests, 26 unselected, exit 0.

No database, migration or browser suite is run in this sandbox, as instructed; reviewer/GitHub CI must supply those results. No changed AI prompt/model/parser/matching policy requires an eval run. No independent model verdict or separate acceptance has been obtained; neither can bind to this uncommitted work yet.

## Mutation evidence

Actual production guards were temporarily removed one at a time, the two new tests selected with `pnpm --dir packages/core exec vitest run --maxWorkers=2 src/recovery-fee-illustration.test.ts -t 'SV6-0[89]'`, and each source restored in `finally`. All ten runs exited 1 with assertion failures, not import/setup errors. The runner also waits for load ≤20 before each mutation. No mutation is shipped; `git diff --exit-code` confirms both production modules are unchanged.

| Mutation | Named coverage that failed |
| --- | --- |
| Remove canonical work uniqueness | SV6-08; old/current revisions can otherwise enter the same sum. |
| Remove assessment uniqueness | SV6-08; one assessment can otherwise contribute under distinct work identities. |
| Remove review uniqueness | SV6-08; a review can otherwise be reused across contributions. |
| Remove allocation uniqueness | SV6-08; two work records can otherwise consume the same saved allocation. |
| Remove assessment/qualified-source principal agreement | SV6-09; inconsistent rational principal is otherwise accepted. |
| Remove required allocation-to-manifest link | SV6-09; an unknown allocation ID is otherwise accepted. |
| Remove minimum-one saved allocation from consumed SV6-01 schema | SV6-09; missing proof is otherwise accepted. |
| Reduce the saved rational before summation | SV6-09; aggregation spy no longer receives the original numerator/denominator. |
| Truncate the saved rational to integer pence before summation | SV6-09; exact principal is lost. |
| Multiply principal by number of evidence citations | SV6-08 and SV6-09; citation multiplicity incorrectly changes money. |

The final three are deliberate arithmetic fault injections rather than removal of an existing boolean guard. They test unchanged consumption and one contribution per work without adding an allocation implementation. Logs: `/private/tmp/jg-sv6-08-09-mutant-{work,assessment,review,allocation,principal-agreement,allocation-manifest,required-allocation,reduced-principal,rounded-principal,citation-multiplier}.log`. Runner `/private/tmp/jg-sv6-08-09-mutations.py`; combined output `/private/tmp/jg-sv6-08-09-mutations.log`. These are builder-executed deterministic checks, not independent model review.

## Final check results

| Command | Actual result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | PASS, exit 0: 7 tasks, 2 cache hits. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | FAIL/HOLD, exit 1: core purity passed; lane guard then refused 11 inherited parent paths. Package lint and later root money/commercial checks do not execute through this failed root command. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL/HOLD, exit 1: same inherited parent paths; no lane widening. |
| `pnpm exec turbo run lint --concurrency=1` | PASS, exit 0: all 7 package lint tasks, 2 cache hits. This is separate evidence, not a root lint pass. |
| `pnpm --dir packages/core exec vitest run --maxWorkers=2 src` | PASS, exit 0: 126 source files, 3,011 tests, including all earlier core acceptance regressions and both new named tests. No generated-dist discovery or root/full-suite pass is claimed. |

Inherited paths refused by the main-based lane comparison (not changed by this builder): `config/lanes/sv6-01.json`, `config/lanes/sv6-05.json`, `docs/contracts/recovery-attribution-v1.md`, `docs/contracts/recovery-fee-illustration-v3.md`, `docs/verdicts/SV6-01/BUILDER_RECEIPT.md`, `docs/verdicts/SV6-05/BUILDER_RECEIPT.md`, `packages/core/src/recovery-attribution-persistence.test.ts`, `packages/core/src/recovery-attribution-persistence.ts`, `packages/core/src/recovery-attribution-persistence.type.test.ts`, `packages/core/src/recovery-fee-illustration.ts`, `packages/core/src/recovery-fee-illustration.type.test.ts`. The dispatcher must handle the stacked comparison after parent integration.

Check logs are `/private/tmp/jg-sv6-08-09-{typecheck,lint,lanes,package-lint,core-source}.log`. Turbo emitted nonfatal sandbox cache I/O warnings. Cached logs display their original worktree paths; they are cache reuse, not newly executed checks in those worktrees. Build/OpenAPI and final path checks follow below.

| Remaining command | Actual result |
| --- | --- |
| `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=1` | PASS, exit 0: 7 tasks, 2 cache hits, 1m19.666s. Nonfatal Turbo sandbox cache I/O and existing Next workspace-root/dependency warnings. |
| `pnpm openapi:check` | FAIL/ENVIRONMENT, exit 1: tsx CLI cannot create its IPC `.pipe` socket (`listen EPERM`), before generator execution. |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | PASS, exit 0: the same installed source generator and committed OpenAPI snapshot check, without the CLI IPC listener. No snapshot changed. |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0. |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0. |

Additional logs: `/private/tmp/jg-sv6-08-09-{build,openapi,openapi-loader,money-lint,commercial-lint}.log`. No escalation or package download was attempted. Load gating waited before root lint when load exceeded 20; no second heavy check ran concurrently.

## Handoff

Root/main lane checks remain held by inherited accepted-parent changes; standard OpenAPI launcher remains environment-blocked, with the socket-free checker passing. DB, migrations, application/HTTP persistence and browser execution are **NOT RUN — reviewer/GitHub CI after dispatcher push**, not substituted by pure tests. The missing persisted attribution integration tests are **NOT BUILT — dependency-bound**; after the real writer/source-selector and upstream linkage land, their owner must add the exact table-mandated DB test and figures assertions. No imaginary API/fixture seam or skipped placeholder was added here. No aggregate SV-6 acceptance or independent exact-commit verdict is claimed.

Intended conventional commit subject/body: `/private/tmp/jg-msg-sv6-08-09.txt`. All work remains in the working tree on the starting HEAD; dispatcher owns commit, exact-commit independent review and separate acceptance. The builder does not accept its own work.

Content binding (receipt not self-hashed):

- `packages/core/src/recovery-fee-illustration.test.ts` — SHA-256 `2647e637212d435e0a7910d656154644b4a1acad28cf2dd30331b1ceee3ce95a`.
- `config/lanes/sv6-08-09.json` — SHA-256 `c2bfe5f789f24175b3424b1ab71bda29aa22b9b5ced590273e0b8fa458c88c59`.

Final `git diff --check`: PASS, exit 0. Read-only exact-path comparison: PASS, exactly the three declared files. The lane's allowlist exactly matches the two non-register paths. Byte comparison with `git show HEAD:<path>`: both production modules and `config/agent-lane-assignments.json` unchanged; HEAD remains the starting accepted SV6-05 commit. Commit-message file exists. Invariants exercised: AGENTS §§5.1 (tenant/job bindings), 5.5 (exact money), 5.6 (proof and duplicate consumption), 5.9 (no model authority), 5.10 (synthetic no-charge), 5.13 (independent acceptance remains outstanding). No executable source changed after the final source-suite/build results.
