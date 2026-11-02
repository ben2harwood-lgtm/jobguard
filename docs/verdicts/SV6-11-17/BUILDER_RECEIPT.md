# SV6-11-17 builder receipt — order dated 24 October 2026

## Session record

```yaml
order: SV6-11-17
builder: Codex (GPT-6 family; exact deployment identifier not exposed)
role: builder, not independent checker or acceptor
branch: codex/sandbox/sv6-11-17
base_head: 68c87b84ec5ede05434d16034079e507aa9f1635
accepted_predecessors: SV6-05 at 68c87b84, containing SV6-01 at 7596d818
working_tree_at_start: clean
implementation_commit: none (dispatcher commits after exit; git is read-only)
commit_message_file: /private/tmp/jg-msg-sv6-11-17.txt
scope: exactly SV6-11 and SV6-17; synthetic pure acceptance
independent_verdict: NOT OBTAINED
technical_acceptance: NOT CLAIMED
merge_push_release: NOT PERFORMED
```

## Authority and result

Read repository AGENTS.md; BUILD_PLAN §10.2.8, §10.3.1–3, SV-6 card and dependencies; the issued SV-6 specification (including its acceptance table, Q6 ready rule and dispatcher rulings); accepted SV6-01/SV6-05 source, tests, contracts and receipts. This issued order permits building ahead on the exact accepted SV6-05 head; it does not waive merge dependencies or permit inventing their evidence.

Added exactly the two required test titles to the established pure file `packages/core/src/recovery-fee-illustration.test.ts`. The earlier order proposed `recovery-attribution-illustration.test.ts`; accepted SV6-05 actually uses `recovery-fee-illustration.test.ts`, which this lane preserves. Existing assertions remain unchanged. No implementation change was required: tests exercise the accepted module, exact summation and cumulative kernel directly. No model output participates in money calculations. No allocation algorithm, database fixture writer, provider call, UI or production capability was added.

SV6-11 tests F4 Q = 2000000/43 pence, F = 4651p, immutable input, one versus two saved allocation references on the same current work, independently keyed current contributions, reversed order, two 5p contributions giving 1p, and half-even 5p/15p/25p giving 0p/2p/2p. The two-reference envelope consumes an owner-supplied cumulative principal; it does not fabricate a persisted receipt journey or sum historical assessments.

SV6-17 tests zero inventory, positive fee examples around the old £79 credit and above the old example cap, fee-free capture separation, absent cap/base/credit/offset output fields, and rejection of each forbidden input/output field (including zero-valued inputs and £69/£79 values). Empty complete synthetic inventory tests zero; supplied unqualified or missing-proof records are never converted to successful empty inventory. The unchanged v1 regression files remain separate evidence.

> Separate billed and paid; label estimates; create no bill.

Source: BEN-ANSWERS-20261013.md, card jobguard-twenty-product-decisions-2026-10-13, as reproduced in the issued specification. This lane does not extend its partial Q4/Q5 mapping, choose a new policy bundle, define “found”, add fractional display rounding or illustrated history. It uses accepted SV6-05's existing synthetic policy contract unchanged.

## Scope and invariants

Lane `config/lanes/sv6-11-17.json` is version 2. Its exact allowlist contains the changed pure test and this receipt; the lane JSON owns itself under the existing lane rule and must not grant any lane-register path. `config/agent-lane-assignments.json` is untouched. Shared test-file changes serialize with other SV-6 work; the dispatcher must retain these additive named cases when integrating later lanes.

Affected invariants: exact rational money/half-even rounding and no positive fee without qualifying proof (AGENTS §§5.5–5.6), synthetic/no-charge and no offset rules (§§5.10, 5.14), independent-verdict boundary (§5.13). Tenant/job/lock bindings and proof checks remain the accepted source module's responsibility and existing regression coverage; these synthetic fixtures use one tenant/job/lock and distinct work/source IDs. No authentication, tenancy grants, source policy, matching, prompt, model, schema, migration, persisted data, external authorization or operational alert changes. No backwards-incompatible API change. Rollback: remove the added tests and lane/receipt; no data fix required.

## Executed checks

Verification results are appended below. Installed dependencies only; no install/download attempted. Node v24.17.0; repository pins pnpm 10.28.1, Vitest 4.1.11, TypeScript 5.8.3. Commands use installed pinned pnpm via `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` (P below). A temporary PATH shim makes Turbo child invocations use the same installed pnpm. All checks run sequentially, Turbo concurrency 1, explicit Vitest maxWorkers 2 and at most three files per batch. A Python runner checks host load and waits in 15-second intervals while it exceeds 20.

The initial typecheck attempt stalled at the host pnpm wrapper and was interrupted (exit 130). Retrying with the pinned child PATH succeeded. Root typecheck: exit 0, seven successful package tasks, two cache hits, 1m47.869s. Turbo emitted sandbox cache IO warnings; they did not fail compilation. Cache-replayed logs may name the earlier worktree that produced them; cache misses name this worktree.

## Dependency and release holds

- SV6-11: pure arithmetic BUILT; persisted F4 fraction assertion is **dependency-bound — NOT BUILT / NOT RUN** here. There is no `recovery-attribution.integration.test.ts` or figures integration implementation on this accepted parent. Creating a fake writer or positive saved-money fixture would violate this order. The owner of the real SV-5/M4-8/SV6 source integration must prove the persisted fraction after those dependencies land.
- SV6-17: pure no-offset guard BUILT; unchanged v1 execution results recorded below. Aggregate acceptance remains **dependency-bound** under the SV-6 ready rule: SV-5, complete CH-7 and M4-8 accepted integration remain required. Build-ahead authority is not a founder declaration of those dependencies being merged.
- Database suites, migrations, actual catalogs and browser suites: **NOT RUN locally** per dispatcher sandbox constraints; reviewer/GitHub CI after dispatcher push. No DB or browser success is claimed.
- Literal card browser assertions: **NOT BUILT / NOT RUN — UI parked**.
- SV6-10, SV6-16, SV6-29: **INCOMPLETE — HELD**, outside this two-ID scope; no new illustration persistence, complete value receipt or history is claimed. SV6-BEN-Q4/Q5 have no new acceptance claim from this lane. Saved F5/F7 prerequisites remain allocator-owned and held where undecided.
- Full mandatory CI and independent exact-commit cross-model verdict, separate acceptance, founder commit/push/merge and commercial/privacy/release gates remain outstanding. No builder self-acceptance or fabricated reviewed commit.

## Mutation evidence

Initial named acceptance run: exit 0, two tests passed (26 unselected tests reported skipped by Vitest's title filter; no skip statements added). Every temporary mutant exited 1 with an assertion failure in the required named acceptance test, not a compilation/import error. The module was restored between mutations and in a finally block; final source bytes match HEAD. Tests pre-existed every mutation; no failing assertion was weakened.

| Guard removed / mutant | Detection |
|---|---|
| Preserve exact Q: truncate aggregate rational to integer pence | SV6-11 fails: 46511/1 versus 2000000/43. |
| Round cumulative sum once: round each contribution's fee first | SV6-11 fails: 4652p versus 4651p. |
| Half-even ties: substitute half-up for returned F | SV6-11 fails: 1p/2p/3p versus 0p/2p/2p; SV6-17 also fails at Q=5p. |
| No cap: clamp fee to 7900p | SV6-17 fails: 7900p versus 8000p. |
| No base: impose 7900p minimum | SV6-17 fails: 7900p versus 0p. |
| No plan credit: subtract 7900p, floored at zero | SV6-17 fails: 0p versus 10p. |
| No subscription offset: subtract 6900p, floored at zero | SV6-17 fails: 0p versus 10p. |
| Strict input: remove envelope strictness | SV6-17 fails: cap key accepted. |
| Strict output: remove envelope strictness | SV6-17 fails: cap key accepted. |

Temporary runner: `/private/tmp/jg-sv6-11-17-mutate.py`. Logs: `/private/tmp/jg-sv6-11-17-mutant-{11-truncate-Q,11-round-pieces,11-half-up,17-cap,17-base,17-credit,17-subscription,17-input-strict,17-output-strict}.log`. These are local session evidence, not durable CI artifacts. The SV6-11 filter also selected the SV6-17 test through the shared describe title; the required SV6-11 assertion failed in each of its three mutations.

Root lint (`P lint --concurrency=1`, `LANE_BASE_REF=origin/main`): exit 1. Core purity passed; lane guard rejected eleven inherited files from accepted SV6-01/SV6-05, not this lane's new files. Separate `P lint:lanes` with the same base: exit 1, identical inherited-file hold. No allowlist expansion or comparison bypass was made. `P --dir packages/core lint`: exit 0 after final test additions. Full root package lint did not proceed past its lane precheck. Logs: `/private/tmp/jg-sv6-11-17-{typecheck,lint,lanes,core-lint,named-tests}.log`.

## Complete core source regression

After restoring all mutations, all **126 source test files / 3011 tests passed**, exit 0 in each of 42 sequential batches; no source test was omitted or selected by a title filter in this run. Actual command per batch: `P --dir packages/core exec vitest run --maxWorkers=2 <three files>`. The runner sorts `packages/core/src/**/*.test.ts` lexicographically and takes consecutive groups of three. This runs from `packages/core` against `src`, never generated `dist` tests. Logs: `/private/tmp/jg-sv6-11-17-unit-1.log` through `-unit-42.log`; runner `/private/tmp/jg-sv6-11-17-check.py unit`.

Specific acceptance/regression mapping:

- Batch 15: `src/fee-statement.test.ts src/fee-what-if.test.ts src/fee.test.ts` — 25 passed, unchanged v1 cap/credit/what-if/statement checks.
- Batch 30: `src/recovery-eligibility.test.ts src/recovery-fee-illustration.test.ts src/recovery-fee-illustration.type.test.ts` — 40 passed, including all 28 illustration tests and both required named tests.
- All remaining core batches passed, including prior attribution-persistence, allocation, cumulative-fee and shadow-domain suites. No DB/browser claims are included in the 3011 count.

Pure implementation SHA-256 after restoration: `9140b0724820a0521c087611448f8dc999934a7faef9413c5f0e7f4f24e0e22a`, exactly the accepted parent bytes. Changed test SHA-256: `5713081f02378842732fac8838fdea2c5685aef6c0d36e39a0b46dcc738c2306`. `git diff --check`: exit 0. No git write command used.

## Final build, OpenAPI and handoff

| Command | Actual result |
|---|---|
| `CIRCLE_NODE_TOTAL=2 P build --concurrency=1` | PASS, exit 0: seven package tasks, two cache hits, 1m35.714s. Existing autoprefixer compatibility and sandbox cache IO warnings only. |
| `P openapi:check` | Exit 1 before checker execution: tsx CLI IPC socket `listen EPERM` in sandbox. |
| `node apps/api/dist/generate-openapi.js --check` | Exit 1: compiled variant reports stale snapshot; no snapshot was generated or edited. This is not the canonical source invocation. |
| From `apps/api`: `node --import tsx src/generate-openapi.ts --check` | PASS, exit 0: same source checker and tsx transformation as the package script, using the loader without CLI IPC. No server listen or snapshot write. |
| `git diff --check` and Python exact working-tree scope/whitespace/restoration inspection | PASS, exit 0; exactly three files: the changed pure test, own lane JSON, own receipt. |

Build/OpenAPI logs: `/private/tmp/jg-sv6-11-17-{build,openapi,openapi-compiled,openapi-loader}.log`. The source loader result is the successful OpenAPI comparison evidence; the compiled-variant failure is retained rather than relabelled as passing or used to change unrelated API output.

Final result: **SV6-11 pure assertions PASS; SV6-17 pure assertions and unchanged v1 regressions PASS; nine guard mutations killed.** Full acceptance remains dependency-bound and requires independent review and the real persisted F4 journey. No DB/browser suite was attempted, no package install/download occurred, and no commit/add/checkout/push command was run. Intended conventional commit subject and body are in `/private/tmp/jg-msg-sv6-11-17.txt`, ready for the dispatcher. The initial HEAD remains the accepted parent, not a reviewed implementation commit.
