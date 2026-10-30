# SV6-02-04 builder receipt — 24 October 2026

Working-tree evidence only. No commit, push, review, acceptance or release. Aggregate SV-6 remains incomplete.

## Session record

```yaml
order: SV6-02-04
builder: Codex
session_date: 2026-10-24
worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/sv6-02-04
branch: codex/sandbox/sv6-02-04
starting_head: 68c87b84ec5ede05434d16034079e507aa9f1635
accepted_parent: SV6-05 68c87b84 (includes SV6-01 7596d818), per issued order
initial_working_tree: clean
commit_owner: dispatcher
independent_verdict: pending exact dispatcher-created commit
acceptance: pending separate actor
```

Read repository AGENTS.md; BUILD_PLAN.md §10.2.8–9, §§10.3.1–3, SV-6 and dependency graph; the supplied full SV-6 acceptance table and ready-rule/Q6 hold; accepted parent schemas, tests and receipts. The current order authorizes build-ahead only, with actual upstream integration remaining dependency-bound. No subagents, downloads, git writes, localhost listeners or PostgreSQL startup.

## Scope and evidence limits

This branch has `recovery-attribution-persistence.ts` and its pure tests, plus the SV6-05 pure illustration. It has no `packages/db/test/recovery-attribution.integration.test.ts`, attribution repository or attribution migration. SV6-01's receipt explicitly records that missing runtime. No fake repository, mock persistence, invented source authority or always-failing/skipped integration placeholder was added. The exact acceptance titles are added to the existing pure persistence test module; their **persisted** acceptance remains dependency-bound. This differs from the ordered integration-file location and is an explicit outstanding item, not a claim that API/schema tests prove persistence. Clarification was requested while independent work continued.

All three criteria already have pure enforcement in accepted code; this change adds adversarial regression coverage without changing matching policy, domain policy or runtime behavior. No production module needed repair. Schema validation authenticates nobody and cannot prove that an upstream reader included every capture/disclosure, preserved history, checked true server receive times or acquired source locks. No end-to-end qualification or fee is claimed.

- SV6-02: exact named pure test independently falsifies each of ten predicates, rejects forged positive outcomes, validates excluded outcomes with unchanged factual principal, and rejects missing/null/malformed proof, absent booleans/references and unresolvable sources. Actual source construction and persisted qualification: **DEPENDENCY-BOUND**.
- SV6-03: exact named pure test composes the existing matcher with the attribution validator for baseline, draft/priced/approved/rejected/withdrawn Log an extra and final-review capture. It exercises compatible/unknown date and value combinations, source references, unchanged input, and foreign tenant/job isolation. It does not introduce a matching rule. The composition explicitly supplies the matcher result to the recorded predicate; proving that the real reader does so and retains withdrawal history is **DEPENDENCY-BOUND**.
- SV6-04: exact named pure test covers disclosed-before-lock, surfaced-early, post-lock evidence and pre-adoption evidence; every disclosure route; ordinary assessment and later confirmed dispute review; and a later assessment revision retaining the permanent exclusion. It does not claim to prove that persistence cannot omit an old exclusion. Database monotonicity, source reconstruction and timestamp proof are **DEPENDENCY-BOUND**.

No allocation implementation or calculation was added. Saved principal is checked unchanged; no model output computes money. Synthetic fixtures only. No new boundary, external action, money write, provider destination, alert, migration, backfill or OpenAPI change. Reverting the test/lane/receipt files reverses this change. The lane lists exactly the changed test and receipt; its own JSON is implicitly editable and must not appear in `allow` under the actual lane-loader rule.

## Verification

Used existing dependencies; no fresh install claimed. Actual Node `v24.17.0` satisfies engines `>=24 <25` but differs from `.nvmrc` `24.15.0`; no runtime/pin changed. Used cached pnpm `10.28.1` through `/private/tmp/jg-sv6-02-04-bin/pnpm`, invoking `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`, to avoid the host wrapper's registry resolution. Installed Vitest reports `4.1.11`.

All commands ran serially, explicit Vitest runs with `--maxWorkers=2`, Turbo with `--concurrency=1`. Load readings stayed below 20. Turbo reports nonfatal sandbox cache I/O warnings. Cached logs can name prior worktree paths; cache reuse is reported below.

| Command | Actual result |
|---|---|
| `pnpm --dir packages/core exec vitest run --maxWorkers=2 src/recovery-attribution-persistence.test.ts` | PASS, exit 0: 43 tests, before adding the isolated outcome-label assertion. Final source suite below includes that assertion. |
| `pnpm typecheck --concurrency=1` | PASS, exit 0: 7 tasks, 2 cache hits. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | FAIL, exit 1: core-purity passes; lane guard rejects exactly 11 inherited parent paths, before package lint. No current-lane changed path is rejected. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, exit 1: same 11 inherited paths. Do not widen lane ownership to hide the stacked comparison. |
| `pnpm exec turbo run lint --concurrency=1` | PASS, exit 0: all 7 package tasks, 2 cache hits. This does not replace the failed root lint gate. |
| `LANE_BASE_REF=68c87b84 pnpm lint:lanes` | FAIL, exit 1: guard correctly refuses a self-comparison because dispatcher has not committed this delta yet. No misleading parent-based PASS claimed. |
| Working-tree-only lane diagnostic using the actual `loadLanePolicy` / `lanePathAllowed` exports and git diff/untracked paths | PASS, exit 0: exactly test, lane JSON, receipt. Not a replacement for main comparison. |
| `pnpm --dir packages/core exec vitest run --maxWorkers=2 src` | PASS, exit 0: 126 files, 3,012 tests. Includes both parent suites and all three exact acceptance titles. No generated `dist` tests included. |

Check logs: `/private/tmp/jg-sv6-02-04-{typecheck,lint,lanes,package-lint,lanes-parent,core-source}.log`. The first focused test and working-tree diagnostic are recorded in session tool output. Full root `pnpm test` and cross-package test suites are not claimed by the core-only result.

### Mutation evidence

Temporary runner `/private/tmp/jg-sv6-02-04-mutations.py` removed one rule at a time and restored each source in `finally`. No mutated production file is included in this delta. Each final mutant exited 1 **with an assertion failure**, rather than failing compilation/import. Results: `/private/tmp/jg-sv6-02-04-mutations.json`, aggregate log `...-mutations.log`, and individual `...-mutant-<name>.log` files. These are builder-run deterministic checks, not independent review or durable CI artifacts.

| Criterion | Rule removed | Final result |
|---|---|---|
| SV6-02 | Each of all ten conjuncts independently bypassed in `qualifiesAttribution` | 10/10 killed by exact named test. |
| SV6-02 | Default a missing `holds` to true | Killed; missing proof is rejected. |
| SV6-02 | Remove fact source-manifest resolution check | Killed. |
| SV6-02 | Remove outcome/fact agreement check | Killed after adding an isolated forged-positive case with excluded reason codes. |
| SV6-03 | Exclude each draft/priced/approved/rejected/withdrawn capture, baseline or final-review entry from matcher | 7/7 killed. |
| SV6-03 | Require known-compatible date or value instead of accepting unknown compatibility | 2/2 killed. |
| SV6-03 | Remove tenant or job comparison in matcher | 2/2 killed. |
| SV6-04 | Ignore each permanent disclosed-before-lock/surfaced-early/post-lock/pre-adoption exclusion | 4/4 killed, including later confirmed dispute review. |

**Final result: 28/28 mutations killed.** Initial run: 26/27 killed; the outcome-agreement mutant survived because the existing reason-code guard independently refused the malformed positive. Added a correctly shaped reason-code case isolating that guard, added the missing-boolean-default mutant, then reran all 28 successfully. No survivor is concealed; no production repair was required. The restored full core source suite passed afterwards.

## Remaining gates

Accepted SV-5, complete CH-7/founder split and M4-8's checked source bridge remain dependency gates; this order does not waive the ready rule. PostgreSQL, migrations, actual HTTP and existing browser regressions: **NOT RUN — dispatcher/reviewer CI**, as ordered for this sandbox. Literal card browser assertions: **NOT BUILT / NOT RUN — UI parked**. SV6-10, SV6-16 and SV6-29: **INCOMPLETE — HELD**, outside this lane. No changed prompt/model/matching policy: no new AI evaluation required. No policy, tax, fee, production or pilot approval is inferred. No independent exact-commit verdict or separate acceptance recorded.

## Final checks and handoff

| Command | Actual result |
|---|---|
| `CIRCLE_NODE_TOTAL=2 pnpm build --concurrency=1` | PASS, exit 0: 7 tasks, 2 cache hits, 1m1.81s; existing web dependency/PostCSS and sandbox cache warnings. |
| `pnpm openapi:check` | FAIL, exit 1: tsx CLI attempts IPC socket `listen`, sandbox returns EPERM before generator execution. |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | PASS, exit 0: same generator and committed snapshot comparison, no listener or snapshot update. |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0. |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0. |

Logs: `/private/tmp/jg-sv6-02-04-{build,openapi,openapi-loader,money-lint,commercial-lint}.log`. Required main-based lane/root lint remain failed, not replaced by package checks. Dispatcher must integrate the accepted parents and bind review to its actual new commit.

No reply to the optional scope clarification was received during independent checks. Kept the narrow pure-test scope rather than adding a database subsystem not present on the accepted parent. The requested integration file and real persisted acceptance are **NOT BUILT — DEPENDENCY-BOUND**, not passed or replaced by these pure tests. The pure implementation was already correct for the supplied facts, so no production guard change is claimed.

Intended conventional commit subject and body: `/private/tmp/jg-msg-sv6-02-04.txt`. Dispatcher owns all git writes and push. No source changed after successful checks; this final receipt text records them. Final `git diff --check` and exact changed-path/lane check are recorded in session tool output. Receipt is not self-hashed.

Changed-file content binding:

- `packages/core/src/recovery-attribution-persistence.test.ts` — SHA-256 `55eee0505a9ddda48283cbab83a02acb7fec048777acf8f4c21252f0df8c8394`.

- `config/lanes/sv6-02-04.json` — SHA-256 `fa64eb59d712eb6f301b63e6db35404cfae6ba96ecfc5f4a0c68b423c1632761`.
