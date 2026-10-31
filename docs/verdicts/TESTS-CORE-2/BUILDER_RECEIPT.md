Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-CORE-2 builder receipt

## Changed (all new files; no existing file edited)
- config/lanes/tests-core-2.json (exactly as the order gives it)
- packages/core/src/customer-billing.history-boundaries.test.ts (CM1, 7 tests)
- packages/core/src/allocation.refusals.test.ts (CM2, 7 tests)
- packages/core/src/money.negative-limits.test.ts (CM3, 6 tests; asserts MoneyError code "overflow", and "magnitude_exceeded" for direct money())
- docs/ledger/TESTS-CORE-2.md, this receipt

## Commands run
- `vitest run --maxWorkers=2` on the three files: 3 files, 20 tests passed on unchanged source.
- Scratch mutations (each reverted from backup; `git status` shows no source change):
  - removed `||reversed.pence>received.pence` in customer-billing.ts: 2 intended failures (reversal exceeding received; reversal with nothing received).
  - removed duplicate-ID check in allocation.ts: 2 intended failures (duplicate IDs).
  - removed `pence < -limit ||` in money.ts: 3 intended failures (bigint conversion, subtract, add overflow).
- `turbo run typecheck --force --concurrency=2`: 7/7 successful.
- `LANE_BASE_REF=origin/main turbo run lint --force --concurrency=2`: 7/7 successful.
- `pnpm build --force --concurrency=2`: 7/7 successful.
- `git diff --check`: clean.

## NOT RUN
Full test suite, DB/migration/browser suites, commit-dependent lane check (CI). `/private/tmp/jg-test-tests-core-2/` and `/private/tmp/jg-msg-tests-core-2.txt` were not produced.
Two-model RED check (Opus, Sol-high) not done by the builder.
