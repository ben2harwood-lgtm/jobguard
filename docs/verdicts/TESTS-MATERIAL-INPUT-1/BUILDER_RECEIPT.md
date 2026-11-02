Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-MATERIAL-INPUT-1 — builder receipt

Branch `codex/sandbox/tests-material-input-1`, base `1bcd8db8e129809e9b6a84d0c8acc9c09e66a3f4`. Read AGENTS.md sections 2 and 5 and `apps/api/src/material.contracts.ts`. Status: HOLD for RED two-model check (Opus, Sol-high), then PARK (decision 74). No independent review is claimed.

## Changes
- `apps/api/src/material.contracts.boundary.test.ts` (new, 29 tests): MI1 price boundaries, MI2 calendar/interval boundaries, MI3 omitted end and retained fields.
- `config/lanes/tests-material-input-1.json` (new lane, order-specified), `docs/ledger/TESTS-MATERIAL-INPUT-1.md` (new), this receipt.
- No product code, existing test, pin or expectation changed.

## Red-first evidence (scratch copies, kept in /private/tmp/jg-test-tests-material-input-1/)
- Scratch copy of the contract without `.max(1_000_000_000_000)`: 2 failed / 27 passed (above-the-maximum, unsafe-integer prices accepted).
- Scratch copy without the `.refine` interval check: 1 failed / 28 passed (end-before-start accepted).
- Unchanged source: 29 passed.
Note: `pnpm --filter @jobguard/core build` was needed once so `@jobguard/core` resolves (dist is not tracked).

## Not run locally
Full tests, DB/migration/browser suites and commit-dependent lane checks: NOT RUN locally; CI retains them.

## Commands run (LANE_BASE_REF=origin/main)
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/material.contracts.boundary.test.ts`: 1 file, 29 passed.
- `pnpm exec turbo run typecheck --force --concurrency=2`: 7/7 successful.
- `pnpm exec turbo run lint --force --concurrency=2`: 7/7 successful.
- `pnpm build --force --concurrency=2`: 7/7 successful.
- `git diff --check`: clean. Free disk 52 GB (gate 33 GB per Ben decision 82).
