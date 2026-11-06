# READY — recover-tests-core-2

Plan piece: TESTS-CORE-2, SH-1/exact money (BUILD_PLAN §8, AGENTS §5.5). RED: money regression tests. NOPR recovery from origin/codex/sandbox/tests-core-2 at 6c9aa2ebf9c441df7fc91b3093250fc062517344 onto main 62081c68933d0b953e7dd75a8cbd7b3a2fb4f304.

## Recovered scope

Confirmed HEAD equals the locally available origin/main, without fetching. All three files are absent there; existing tests lack the recovered refusal/negative-limit cases. Ported all three original files byte-for-byte using current helpers:

- allocation.refusals.test.ts: duplicate IDs including zero money, negative/zero weights, missing targets, zero-empty allocation, negative penny conservation (7 tests).
- customer-billing.history-boundaries.test.ts: one-penny credits/reversals, exact full credit/reversal, conservation identities, excessive credits/reversals and reversal without receipts (7 tests).
- money.negative-limits.test.ts: exact negative limit, bigint and arithmetic overflow, direct-construction magnitude error (6 tests).

All recovered tests pass against unchanged product code. No product defect was reproduced; no product code, dependency, schema, migration or release setting changed. Fictional values only.

## Local verification

From packages/core, using installed repository binaries:

- `./node_modules/.bin/vitest run --maxWorkers=2 src/allocation.refusals.test.ts src/customer-billing.history-boundaries.test.ts src/money.negative-limits.test.ts` — PASS, 3 files / 20 tests.
- `./node_modules/.bin/vitest run --maxWorkers=2 src/allocation.test.ts src/customer-billing.test.ts src/money.test.ts` — PASS, 3 files / 40 existing tests.
- `./node_modules/.bin/tsc -p tsconfig.json --noEmit` — PASS (also the core lint command).

The initial `pnpm --filter @jobguard/core exec vitest ...` and `pnpm --filter @jobguard/core typecheck` attempts stalled after a pnpm settings warning without starting their runners and were interrupted. No packages were downloaded; the installed Vitest 4.1.12 and TypeScript binaries ran directly instead.

- `git diff --check` — PASS; explicit whitespace check of every new file — PASS.
- `node tools/agent-lane-boundary-lint.mjs` — refused the uncommitted self-comparison (HEAD equals origin/main). Its exported `loadLanePolicy`, `selectLane` and `lanePathAllowed` functions validated the actual changed/untracked file list and exact allowlist successfully; committed CLI validation remains a CI hold.
- All three recovered tests remain byte-identical to the old branch.

## Named holds for landing

- Exact-head independent RED review remains required after the router commits.
- CI must prove the committed lane boundary and required repository typecheck, lint, tests and build against current main. Full suites were not run locally under this task's focused-check limit.
- PostgreSQL and browser checks cannot run in this sandbox. There is no changed DB or web behavior; CI must preserve its existing mandatory suites. No migration, provider, real-data or live-money acceptance is claimed.
- Router owns commit/push and NOPR scheduling; no git-writing command, PR or merge was performed here.

LATER / SIMPLICITY — initial review, packages/core/src/money.negative-limits.test.ts: the local codeOf helper could use the existing money.test.ts `toThrowError(expect.objectContaining({ code }))` pattern instead. One assertion style would remove a custom catch helper and reduce test maintenance. Non-blocking; this recovery preserves the original tests unchanged.
