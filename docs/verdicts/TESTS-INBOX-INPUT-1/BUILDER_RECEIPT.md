Built by Claude Sonnet (Codex stand-in), dispatcher 14

# TESTS-INBOX-INPUT-1 builder receipt

Base 1bcd8db8; branch codex/sandbox/tests-inbox-input-1. Test-only; decision 74 BUILD-DON'T-MERGE.

## Changed
- apps/api/src/inbox-relevance.boundary-missing.test.ts (new, 25 tests): IB1 strict commands (extra tenantId/membershipId/digest/context/jobId refused; valid input reaches its own repo method), IB2 budget 0/100 pass, 101/1000/-1/fractions/strings/null/NaN/Infinity/boolean/missing refused with no repo call, IB3 barrier-interleaved applications keep own job/context/membership/digest for seed/budget/dismiss/view, IB4 invalid body -> no repo call and access denial wins over validation error.
- config/lanes/tests-inbox-input-1.json (lane from order, verbatim)
- docs/ledger/TESTS-INBOX-INPUT-1.md, this receipt.

## Scratch mutations (each reverted from backups; source unchanged, `git status` shows only the new files)
- Remove `.strict()`: 3 fail (IB1 seed/budget/dismiss).
- budget max 100 -> 101: 2 fail (IB2 101, IB4 invalid budget).
- Budget ownership lookup uses another request's job: 1 fail (IB3).
- Validate before authority in budget: 1 fail (IB4 access-denial order).

## RED note
Against unchanged source all 25 new tests PASS (the behaviour already exists; they are missing-coverage tests). "RED" refers to the check lane, not failing tests. The failing runs are the scratch mutations above.

## Commands run
- df -g: 48 GB free.
- `pnpm --filter @jobguard/db... build` first (needed for @jobguard/db resolution in vitest; dist not committed).
- vitest boundary-missing + session tests (--maxWorkers=2): 2 files, 29 passed.
- turbo typecheck --force --concurrency=2: 7/7. turbo lint (LANE_BASE_REF=origin/main): 7/7. pnpm build --force --concurrency=2: 7/7. git diff --check: clean.

## NOT RUN
Full test suite, DB/migration/browser suites, commit-dependent lane checks (CI). No PostgreSQL used.
