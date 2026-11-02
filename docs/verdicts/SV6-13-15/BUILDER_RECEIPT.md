# SV6-13-15 builder receipt — 24 October 2026

Built ahead against accepted SV6-05 `68c87b84`, including accepted SV6-01 `7596d818`. Pure synthetic work only. **SV6-13, SV6-14 and SV6-15 remain DEPENDENCY-BOUND for aggregate acceptance.** No commit, push, merge, independent verdict, acceptance or release is claimed.

## Session record

```yaml
session_record:
  date: 2026-10-24
  builder: Codex
  model: GPT-6 family (exact runtime model identifier not supplied)
  session_id: not supplied in the task context
  worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv6-13-15
  branch: codex/sandbox/sv6-13-15
  starting_head: 68c87b84ec5ede05434d16034079e507aa9f1635
  ending_head: 68c87b84ec5ede05434d16034079e507aa9f1635
  implementation_commit: not created; dispatcher owns commit
  initial_working_tree: clean
  scope: [SV6-13, SV6-14, SV6-15]
  data: synthetic only
  review_status: builder evidence only; independent exact-commit verdict outstanding
  acceptance_status: dependency-bound; separate actor acceptance outstanding
```

## Authority, scope and implementation

Read repository AGENTS.md, BUILD_PLAN.md §10.2.8, §§10.3.1–10.3.3, the SV-6 card and dependency rows, the issued spec's full acceptance section and ready rule at line 887, its reassessment/held Q5/Q6/Q7 boundaries, and the existing SV6-01/SV6-05 modules, tests, contracts, lane and receipts. The current order authorizes building this pure piece ahead; it does not waive SV-5, complete CH-7 or M4-8-S acceptance/merge prerequisites.

The branch has no `recovery-attribution.integration.test.ts` and no persisted SV-6 writer. The ordered filename is introduced at `packages/core/src/recovery-attribution.integration.test.ts` so the pure assertions run in the requested core `src` suite. Exact acceptance-table test titles are retained; the suite explicitly identifies itself as pure contract composition. It is **not** PostgreSQL integration, a replay store, or an automatic reassessment executor. No DB test with a mocked database is substituted.

The existing pure attribution module receives additive helpers only:

- `reassessRecoveryAttribution` validates both full versioned envelopes, tenant/job/case/work/line/lock/bundle continuity, immediate predecessor/revision, non-regressing case revision and changed source revision/hash. It returns a separate immutable successor; it does not append to a database.
- `qualifyingAttributionPrincipal` projects exact historical assessment principal or zero for an excluded assessment. It does not establish freshness or financial authority. The original recorded remaining customer principal is retained on an evidence-excluded assessment.
- `attributionCurrentSourceV1` and `requireCurrentAttributionQualification` strictly validate an internal source-owner watermark and refuse stale identity/revision/hash/principal or unqualified results. The owner must reconstruct this watermark under authoritative source locks; schema-valid client JSON or a cached watermark is never proof of current entitlement. No endpoint exposes this internal shape.

Allocations are consumed unchanged. There is no receipt allocation, signed adjustment interpretation, subtraction from raw receipts, model arithmetic, fee posting, tax choice, illustration history/delta, policy default, customer-balance write or external effect. Tests use the existing cumulative kernel only for synthetic recomputed targets, with posted J=0 as in SV6-05; a prior illustration is never treated as a posting. Existing fixed attribution/eligibility versions and UUID/manifest/predicate guards are reused. No shared barrel is edited.

Shared-file serialization: this lane edits `packages/core/src/recovery-attribution-persistence.ts`, so it must serialize with any other lane changing that module. The new version-2 lane names exactly the three deliverables; its own JSON is implicitly editable under the lane tool and cannot appear in `allow`. `config/agent-lane-assignments.json` is untouched. Four working-tree files comprise the change, including the lane file itself.

Invariants: AGENTS §§5.1, 5.2, 5.5, 5.6, 5.8–5.10, 5.13–5.14. No migration/backfill, grants/RLS change, operational alert, provider, API/UI or existing contract-schema change. Existing exports and v1 fee code remain unchanged. New helpers are unused internal pure leaves pending integration. Rollback is removal of these additions before integration; no persisted state exists to undo.

## Acceptance evidence and limits

| ID and exact named test | Pure evidence executed | Remaining acceptance |
|---|---|---|
| SV6-13 money changes append revisions and preserve original facts | Each of reversal, refund and credit validates a new successor. Two £800 items recompute Q £1,600 → £1,400 → £800 and fee target £160 → £140 → £80: only the affected item changes. Full disqualification contributes zero. Original facts and untouched item remain byte-identical; saved allocation references remain unchanged; exact `2000000/43` is preserved without rounding. Incorrect scope, predecessor, revisions, bundle and source watermark refuse. | **DEPENDENCY-BOUND**: real append-only rows, source-triggered recomputation, transactional linkage/audit and persistent original-row invariance need the missing writer/source integration. No linked compensation or refund execution is built. |
| SV6-14 evidence invalidation changes qualification without rewriting customer money | Explicit source-owner invalidation input produces an excluded successor with the original £800 remaining principal and the same invoice/allocation references, but zero qualifying contribution. The other £800 item remains qualifying. Missing proof and a falsely eligible result refuse. Original assessment stays byte-identical. | **DEPENDENCY-BOUND**: issued Q7 execution/lock-order mechanism, authoritative evidence validity and actual receipts/customer balances require persistence. No dummy receipt or customer-balance store is used to claim this proof. |
| SV6-15 source changes invalidate current entitlement without altering replay history | A parsed immutable first result remains byte-identical across stale-use attempts. Each valid variable binding/hash/revision/principal mismatch is rejected independently, as are malformed/missing proof and held state. A newly reviewed synthetic successor can pass its new watermark. | **DEPENDENCY-BOUND**: actual persisted first-command replay bytes, current authorization, atomic freshness under locks, races and database retrieval are unproved. No in-memory command store impersonates persistence. |

Ready rule at spec line 887 remains in force: no aggregate SV-6 acceptance before complete CH-7 or a founder-recorded split. SV6-10, SV6-16 and SV6-29: **INCOMPLETE — HELD / outside this order**. No new SV6-BEN-Q4/Q5 implementation or independent acceptance is claimed; their existing core regressions are included in the source-suite run. Literal card browser assertions: **NOT BUILT / NOT RUN — UI parked**.

## Test development and mutations

The first test run actually executed all three named tests and exited 1 because the new helpers were absent. The implementation application script initially used unavailable `python`; it was rerun with installed `python3`. The next run passed SV6-13/14 and failed SV6-15 because schema parsing changes object key order. The byte-identity test now snapshots the first parsed result, then compares those same immutable bytes before/after changed sources and rejection; arbitrary input key order is not presented as persisted replay. Final core source-suite result is recorded below.

All **31** temporary rule-removal mutations were killed (each targeted Vitest command exited 1 with its named test failing). They were executed serially; the source was restored by a `finally` block. Thirty logs have assertion failures; bypassing the parent conjunct gate instead makes the valid excluded assessment fail to parse in the named evidence test, also a real test failure. No import/compilation failure is counted as a killed guard.

| Target | Mutations and evidence |
|---|---|
| SV6-13 | Seven independent successor scope/bundle comparisons; predecessor; attribution revision; case revision regression; source revision; source hash; envelope parse guard. Scope cases first assert schema-validity so a redundant parser failure cannot mask the removed comparison. |
| SV6-14 | Excluded-to-zero branch; principal parse guard; inherited all-conjunct eligibility gate. Missing proof is rejected by the existing complete ten-fact schema. |
| SV6-15 | Eleven independent current scope/bundle/assessment/revision/hash comparisons; exact principal comparison; result parse, watermark parse and qualified-state guards. |

Runner `/private/tmp/jg-sv6-mutations.py`; logs `/private/tmp/jg-sv6-mutant-<name>.log`. Each command used `pnpm --dir packages/core exec vitest run --maxWorkers=2 src/recovery-attribution.integration.test.ts -t '<exact acceptance prefix>'`. Other test titles were unselected by `-t`; no skipped placeholder tests were added. These mutations are deterministic builder evidence, not independent model review.

## Commands actually run

Installed Node `v24.17.0`, pnpm `10.28.1`, Vitest `4.1.11`; no install or download attempted. `pnpm` below is the installed pinned launcher via `/private/tmp/jg-sv6-bin/pnpm`, invoking `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. Child package PATH uses the same launcher. Checks ran **one at a time**, Turbo concurrency 1, explicit Vitest maxWorkers 2. The check/mutation runners wait while `os.getloadavg()[0] > 20`; observed starting loads were below 20, and no load wait was necessary. Build uses `CIRCLE_NODE_TOTAL=2` for the existing Next worker constraint. No sandbox escalation or git write command was used.

| Command | Actual result |
|---|---|
| Initial focused named test run | Exit 1: all three absent-helper failures. |
| Focused named test run after implementation | Exit 1: two pass, one key-order assertion fails; corrected as explained above. |
| Focused named test run after correction | Exit 0: 3 tests pass. Later exact-principal/fee assertions are covered by the complete final source run. |
| `pnpm --dir packages/core typecheck` | Exit 0, intermediate package check. |
| 31 targeted mutation commands | Each exit 1, named guard-removal failure; source restored. |
| `pnpm typecheck --concurrency=1` | Exit 0: 7 tasks succeed, 2 cache hits, 40.891s. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` (initial) | Exit 1: own JSON cannot list itself in `allow`; corrected to the tool's implicit self-file allowance. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` (corrected) | **HOLD**, exit 1: eleven inherited SV6-01/SV6-05 paths outside this lane. Core purity passes; package lint is not reached. No parent paths added to the lane to conceal this integration hold. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **HOLD**, exit 1: same eleven inherited parent paths, no new lane-deliverable violation. |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0: all 7 package lint tasks pass, 2 cache hits, 23.186s. Separate evidence, not a claim that root lint passes. |
| `pnpm --dir packages/core exec vitest run --maxWorkers=2 src` | Exit 0: **127 files, 3,012 tests pass**, including the three exact acceptance titles and existing attribution/fee/allocation source regressions; 8.39s. |
| `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=1` | Exit 0: all 7 tasks succeed, 2 cache hits, 40.355s. Existing Next dependency/build and sandbox cache I/O warnings only. |
| `pnpm openapi:check` | Exit 1 before generator execution: installed tsx CLI tries to bind its IPC pipe and receives sandbox `listen EPERM`. |
| `pnpm --dir apps/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0: the same source generator and committed-snapshot check passes via the installed loader, without the CLI IPC listener. No OpenAPI snapshot edit. |
| `node tools/money-arithmetic-lint.mjs` | Exit 0. Run separately because main-based root lint stopped before this check. |
| `node tools/commercial-boundary-lint.mjs` | Exit 0. Same reason. |

Full check logs: `/private/tmp/jg-sv6-{typecheck,lint,lint-final,lanes,package-lint,unit,build,openapi,openapi-loader,money-lint,commercial-lint}.log`. The pinned-runner and load-check wrapper is `/private/tmp/jg-sv6-check.py`. Turbo reused 2 tasks per repository check; other package tasks ran here and reported nonfatal cache-write `Operation not permitted` warnings. Cached log text can name the originating worktree; that is cache replay, not evidence that fresh work ran there.

Database, migrations, browser and whole-repository `pnpm test` suites: **NOT RUN HERE**. The issued environment excludes PostgreSQL/localhost; reviewer/GitHub CI after dispatcher push owns those suites. No fresh-install proof is claimed because dependencies were supplied installed. No AI extraction, prompt, model or matching policy changed; no live-model eval applies. The new pure guards do not authorize production or retroactively satisfy missing integration evidence.

Remaining gates: main-based lane integration handling; accepted SV-5, complete CH-7/founder split, allocator source bridge and relevant prerequisites; Q7 execution/lock-order agreement; persistent writer/replay/audit/race proofs; required CI; independent exact-commit verdict(s); separate acceptance; Ben's merge/release authority. No builder acceptance is recorded.

The intended conventional commit subject and body are at `/private/tmp/jg-msg-sv6-13-15.txt`. Dispatcher commits the working tree. No git add, commit, checkout, push or other git write was attempted.

## Content binding

Uncommitted implementation content; the receipt is not self-hashed. The dispatcher must bind independent review to the eventual commit.

- `config/lanes/sv6-13-15.json` — SHA-256 `025d2f652c1333be2c1dcd1aad1de1f63bfa4c09db43be065c8d7fe080ba8d8d`
- `packages/core/src/recovery-attribution-persistence.ts` — SHA-256 `18988eb7cf63625d94b32c0772de0ef1d92ce5c10094b506ebcbe69295366dc3`
- `packages/core/src/recovery-attribution.integration.test.ts` — SHA-256 `9634355de399c99ecd2bb700c87f8c6d0d82d78d7e50c618267022b108f6dd66`

Final `git diff --check`: exit 0. Python exact-scope/whitespace inspection: exit 0, exactly the three declared deliverables plus the implicitly owned lane JSON, including untracked-file whitespace. HEAD remains `68c87b84ec5ede05434d16034079e507aa9f1635`. No executable source changed after the successful checks.
