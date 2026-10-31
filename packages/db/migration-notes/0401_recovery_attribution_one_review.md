# SV-6 one review per assessment (RED)

Piece: `sv6-one-review-index`, before-live follow-up to #422. Migration 0400 is
present in the neighboring `lock-order-418` worktree, so this piece uses 0401.

Adds a partial unique index on `(tenant_id, assessment_id)` for command rows whose
payload action is `approve_review`. The existing routine, locking, error handling,
assessment commands, historical receipts and idempotent replay are unchanged.
No grants, routines, RLS policies, money postings or external actions are changed.

Existing fixtures contain no direct inserts of duplicate review commands. The
PostgreSQL regression suite checks direct duplicate insertion (SQLSTATE 23505 and
the named index), competing direct inserts, competing normal review commands,
and the existing assessment/replay/authorization/audit/reversal flows. Database
execution and the full fresh-install/migration suites remain CI gates.

Installation takes PostgreSQL's normal index-build table lock. It fails atomically
if historical duplicates exist, preserving every immutable receipt. Preflight:

```sql
SELECT tenant_id, assessment_id, count(*)
FROM app.recovery_attribution_command
WHERE payload->>'action' = 'approve_review'
GROUP BY tenant_id, assessment_id
HAVING count(*) > 1;
```

Do not delete or rewrite duplicate receipts. Investigate any result before a
separately reviewed forward fix. A rollback requires a new reviewed migration
dropping only this index; that would restore the code-only guard, so retain the
before-live gate until the invariant is restored. Never edit applied migrations.

Local validation (Node 24.17.0, cached pinned pnpm 10.28.1; no downloads):

- `pnpm --filter @jobguard/core build`: passed (dependency prerequisite).
- `pnpm --filter @jobguard/db typecheck`: passed.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/recovery-attribution-repository.test.ts`:
  seven tests passed. Initial attempt lacked core build output; rerun after the
  dependency build passed.
- `pnpm --filter @jobguard/db exec vitest list --maxWorkers=1 test/recovery-attribution-review.integration.test.ts`:
  26 cases registered, including all three new regressions; not DB execution.
- Money arithmetic, commercial boundary and PL/pgSQL CASE lint: passed.
- Working-tree diagnostic using existing lane and migration-order validators:
  passed, four changed paths, own lane file implicit, 0401 above current main.
- `git diff --check`: passed.
- Root `LANE_BASE_REF=origin/main node tools/lint.mjs`: core purity passed; lane
  check refused a self-comparison range because this worktree is uncommitted and
  HEAD equals main. Router/CI must rerun after commit; no check was weakened.

Database/browser suites were not run: this sandbox cannot start PostgreSQL or
bind localhost. No git writes or provider actions. One independent exact-head
RED review and green CI remain required before merge.
