Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-POLICY-BOUNDARY-1 — builder receipt

Branch `codex/sandbox/tests-policy-boundary-1`, base `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`. Check lane RED; BUILD-DON'T-MERGE (decision 74). No independent review is claimed. Per the coordinator's 17 Oct instruction the stand-in builder committed and pushed (replacing the order's "do not commit").

## What changed
- `packages/config/src/policy-gates.decision-identity.test.ts`: PG1 (matching approved identity passes; approved different decision refuses; refusal names the required decision).
- `packages/config/src/policy-gates.superseded-replay.test.ts`: PG2 (proposed and superseded refuse, including after an earlier approved call) and PG3 (refusal keeps decision id, mode, supplied policy version; frozen fixtures unmutated).
- `config/lanes/tests-policy-boundary-1.json`: lane registration exactly as the order gives.
- `docs/ledger/TESTS-POLICY-BOUNDARY-1.md`, this receipt.
No product code, decision record, policy version, status, pin or existing test touched. Fixture approval is not founder approval or release evidence.

## RED expectation
The order's RED is the mutation proof, not failing committed tests. Unchanged source: 2 files, 8 tests pass.
- Scratch mutation 1 (identity comparison removed): 2 fail, both PG1 ("refuses an approved record for a different decision", "refusal names the required decision, not the supplied one").
- Scratch mutation 2 (status check weakened to proposed-only): 3 fail: PG2 "refuses a superseded record", PG2 "refuses proposed and superseded ... after an earlier call passed", and PG3 "keeps required decision id, mode and supplied policy version" (it uses a superseded record).
`policy-gates.ts` restored byte for byte after each (git status shows it unmodified).

## Commands run
- `df -g /System/Volumes/Data`: 48 GB available (floor 33).
- vitest on the two files, `--maxWorkers=2`: pass (8/8) on unchanged source.
- `pnpm exec turbo run typecheck --force --concurrency=2`: 7/7 successful.
- `pnpm exec turbo run lint --force --concurrency=2` (LANE_BASE_REF=origin/main): 7/7 successful.
- `pnpm build --force --concurrency=2`: 7/7 successful.
- `git diff --check`: clean.

## NOT RUN
Full test suite, DB/migration/browser suites, commit-dependent lane-floor checks: CI/dispatcher. Opus and Sol-high RED checks not yet done. `/private/tmp/jg-test-tests-policy-boundary-1/` not created. Standard F: no new grants, migration none.
