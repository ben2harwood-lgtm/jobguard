# MIGFIX-2 builder receipt: failing-first (pre-fix) PostgreSQL evidence

Builder: Claude Sonnet 5.5. Answers Sol's REPAIR finding (missing pre-fix PostgreSQL evidence) for head eba87a63. Not independently verified, not accepted.

## Set-up
- Base = merge-base of the branch with origin/main: `c203bb27893342ca2569272ff4dc908b614267d6`. New scratch worktree `.worktrees/migfix-2-base` (detached at the base; not removed).
- Only the two new test files were copied from head eba87a63 as uncommitted files (`git checkout eba87a63 -- <files>`): `packages/db/test/migfix-2.integration.test.ts`, `packages/db/test/migfix-2-upgrade.integration.test.ts`. No other file differs from the base, so migration 0151 and its `migrate.ts` registration are absent there. No test edited.
- `pnpm install --frozen-lockfile` (0); `turbo run build --filter=@jobguard/db...` (0, needed so @jobguard/storage resolves); embedded-PostgreSQL dylib symlinks copied from the hydrated migfix-2 worktree (a first run failed with "Postgres init script exited with code null": set-up error, fixed, not counted as evidence).

## Command (both worktrees, inside the package dir `packages/db`)
`heavy-slot <worktree> pnpm exec vitest run test/migfix-2.integration.test.ts test/migfix-2-upgrade.integration.test.ts --maxWorkers=2`

| Where | Exit | Result | Log |
| --- | --- | --- | --- |
| BASE c203bb27 + test files | 1 | 2 files failed; 7 tests failed, 4 skipped (suite aborted) | prefix-evidence/base-run.log |
| PR HEAD eba87a63 | 0 | 2 files passed; 11 tests passed | prefix-evidence/head-run.log |

## Failures on base, and why (all are the missing 0151 fix, none is a set-up error)
migfix-2.integration.test.ts (PostgreSQL ran; 7 of 7 failed):
- MIGFIX-2-1 allows only one full reversal: expected 1 success, got 2 (duplicate full reversal accepted; no unique constraint).
- MIGFIX-2-2 accepts replacement payment after settlement reversal: `settlement exceeds outstanding receivable` (old 0004 routine does not release the reversed settlement).
- MIGFIX-2-3 refuses settlement of a fully reversed obligation: promise resolved instead of rejecting.
- MIGFIX-2-4 rejects identical obligation accounts: promise resolved instead of rejecting.
- MIGFIX-2-5 settlement/reversal race under the obligation lock: outcomes did not match the expected serialized result (no lock in old routines).
- MIGFIX-2-AUTH classified same-book accounts: got FK error `journal_line_tenant_id_book_id_account_id_currency_fkey` instead of the expected `23514` check error.
- MIGFIX-2-CATALOG: `journal_full_reversal_uq` / `UNIQUE (tenant_id, reverses_journal_id)` not present (empty result).

migfix-2-upgrade.integration.test.ts: the file failed in `beforeAll` (all 4 tests skipped) with ENOENT reading `packages/db/migrations/0151_ledger_corrections_fix.sql`. That test deliberately loads the 0151 SQL file, so it fails on base only because the fix file does not exist; its individual assertions did not execute on base. This is the expected reason (the missing fix) but is weaker evidence than the seven behavioural failures above. Its mutation and permissive controls are proven only by the passing head run and by CI.

## Not run
Other suites, e2e, build/typecheck on head (unchanged; CI covers them).

## Repair round: lane allow list and main merge

- Merged origin/main (c884b138) keep-both: lane file via lane-union.py; migrate.ts and MIGRATIONS.md now list 0150 then 0151. Migration-count assertions are derived from MIGRATION_URLS.length, so no edits.
- Added exactly three paths (BUILDER_RECEIPT_prefix.md, prefix-evidence/base-run.log, head-run.log) to the migfix-2 lane allow list, as its own commit.
- Commands: agent-lane-boundary-lint (LANE_BASE_REF=origin/main) exit 0; pnpm typecheck exit 0; pnpm lint exit 0; migfix-2.integration + migfix-2-upgrade.integration via heavy-slot exit 0 (2 files, 11 tests).
- Not run: full suite, openapi regeneration (not touched), CI.
- Not independently verified, not accepted.
