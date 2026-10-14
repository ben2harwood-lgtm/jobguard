# MIGFIX-8 builder receipt: failing-first (pre-fix) PostgreSQL evidence

Builder: Claude Sonnet 5.5. Not independently verified, not accepted.

## Set-up
- Base = current origin/main `27d1ad6b976ec3ef48d92e4fd2c7e5b1ece738c3` (contains 0150, 0151; no 0154). Scratch worktree `.worktrees/migfix-8-base` (detached at base; not removed).
- Only the two new test files were copied from head `0ac57892` (`git checkout 0ac57892 -- <files>`): `packages/db/test/migfix-8.integration.test.ts`, `packages/db/test/migfix-8-upgrade.integration.test.ts`. No other file differs from base, so migration 0154, its registration and the repository changes are absent there. No test edited.
- `pnpm install --frozen-lockfile` (0); `turbo run build --filter=@jobguard/db...` (0); embedded-PostgreSQL dylib symlinks copied from the hydrated worktree (a first run failed with "Postgres init script exited with code null": set-up error, not counted).
- First head runs (1ac937b) showed test-fixture defects in the new files themselves (reused fixed object keys and invoice number, runtime pool pointing at a missing database, an ORDER BY on an output alias). Fixed in commit 0ac57892 (fixtures only, no expectation changed) before any evidence below was taken. Earlier receipt claims that these suites were written but never executed stand: this is their first real execution.

## Command (inside `packages/db`)
`heavy-slot <worktree> pnpm exec vitest run test/migfix-8.integration.test.ts test/migfix-8-upgrade.integration.test.ts --maxWorkers=2`

| Where | Exit | Result | Log |
| --- | --- | --- | --- |
| BASE 27d1ad6b + test files | 1 | 2 files failed; 7 failed, 1 passed (8) | prefix-evidence/base-run.log |
| PR HEAD 0ac57892 | 0 | 2 files passed; 8 passed (8) | prefix-evidence/head-run.log |

## Failures on base, and why (all are the missing 0154 fix, none a set-up error)
- MIGFIX-8.UPGRADE: `own migration registered: expected undefined to be defined` (0154 absent).
- MIGFIX-8.CATALOG: calling `app.recovery_follow_up_run_fence` gave 42883 (function does not exist) instead of 42501.
- MIGFIX-8.1, .2, .3, .4: `expected the competing transaction to wait on the run fence` (no shared run fence, so the barrier test sees no wait).
- MIGFIX-8.3 sandbox concurrent final advances: duplicate key `audit_event_tenant_id_id_uq` (unfenced concurrent advances).
- Passed on base: MIGFIX-8.5 (archived run, changed case, undelivered source refusals; these refusals pre-exist and the test guards them).

## Not run
Other suites, e2e, CI.
