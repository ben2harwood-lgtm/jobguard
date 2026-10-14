# MIGFIX-3 builder receipt: failing-first (pre-fix) PostgreSQL evidence

Builder: Claude Sonnet 5.5. Answers Opus LATER note / coordinator ruling 2 (no recorded failing-first PostgreSQL evidence) for head b2b891f2. Not independently verified, not accepted.

## Set-up
- Base = merge-base of the branch with origin/main: `c884b138b69d65ebb494e2fb5673d9c2efdfb258` (equals current origin/main). New scratch worktree `.worktrees/migfix-3-base` (detached at base; not removed).
- Only the two new test files were copied from b2b891f2 (`git checkout b2b891f2 -- <files>`, uncommitted): `packages/db/test/migfix-3.integration.test.ts`, `packages/db/test/migfix-3-upgrade.integration.test.ts`. Migration 0152 and its registration are absent on base. No test edited.
- `pnpm install --frozen-lockfile` (0); `turbo run build --filter=@jobguard/db...` (0). First run failed with "Postgres init script exited with code null" (missing embedded-PostgreSQL dylib symlinks): set-up error, log kept as prefix-evidence/setup-error-run.log, not counted. Fixed by copying the dylib symlinks from the hydrated m4-6-s worktree (no hydrate script exists in packages/db).

## Command (inside packages/db, via heavy-slot, --maxWorkers=2)
`vitest run test/migfix-3.integration.test.ts test/migfix-3-upgrade.integration.test.ts`

| Where | Exit | Result | Log |
| --- | --- | --- | --- |
| BASE c884b138 + 2 test files | 1 | 2 files failed; 11 tests failed, 1 passed, 1 skipped | prefix-evidence/base-run.log |
| PR HEAD b2b891f2 | 0 | 2 files passed; 13 tests passed | prefix-evidence/head-run.log |

## Failures on base, and why (PostgreSQL ran; none is a set-up error)
migfix-3.integration.test.ts (11 of 12 failed):
- 3.1 replacement proof resolves rework; 3.2 replacement can be invalidated and repaired: `COMMAND_CONFLICT` (old routine has no replacement command identity).
- 3.3 invalidation replays once: replay lookup returned null (no durable command result).
- 3.4 identical/conflicting command IDs: expected 1 fulfilled, got 2.
- 3.5 response failure rolls back; revoked/expired actors: promise resolved instead of rejecting.
- 3.6 (two tests) upload lock vs stale eligibility: promise resolved instead of rejecting; completion-before-invalidation ordering assertion false.
- 3.4/5 replacement retries: got `COMMAND_CONFLICT`, expected `replacement_response_failed`.
- 3.5 missing audit event: error from old function `app.invalidate_proof_command` absent/ mismatched, not the expected audit/FK refusal.
- 3.7 pending/rejected/wrong-job/foreign-tenant evidence; 3.7 history tenant-isolated, append-only, no runtime write grants: failed (new tables/function absent).
- Passed on base (1): `[MIGFIX-3.5/7] authority precedes lifecycle and invalid proof keeps PROOF_NOT_FINAL` (behaviour already held before the fix; it guards against regression, not failing-first).
migfix-3-upgrade.integration.test.ts: fails in `beforeAll` at `expect(own).toBeGreaterThan(0)` (got -1) because 0152 is not in MIGRATION_URLS on base (the missing migration, not ENOENT); its single test did not execute on base. Weaker evidence than the 11 behavioural failures; its controls are proven only by the passing head run and CI.

## Repair in this set
- Product commit: proof-repository.ts `invalidate` catch now ends with `rethrowJobWorkState(error)` instead of `throw error` (origin/main's invalidate ended `.catch(rethrowJobWorkState)`; head had dropped it; rethrowJobWorkState rethrows unknown errors unchanged).
- Re-run after the change: migfix-3.integration, migfix-3-upgrade.integration, tenancy.integration via heavy-slot: exit 0, 3 files, 22 tests passed.

## Not run
Full suite, e2e, typecheck of other packages, CI.
