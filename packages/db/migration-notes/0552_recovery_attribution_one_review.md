# SV-6 one review per assessment (RED)

Piece: `sv6-one-review-index`, before-live follow-up to #422. After catching up
with main, the migration is `0552_recovery_attribution_one_review.sql`.

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

Catch-up validation (2 November 2026; Node 24.17.0, cached pinned pnpm
10.28.1, installed Vitest 4.1.12; no downloads):

- `pnpm --filter @jobguard/db typecheck`: passed.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/migration-proof-loader.test.ts src/migrate-discovery.test.ts src/recovery-attribution-repository.test.ts`:
  36 tests passed across three files, including real proof discovery and composition.
- `pnpm --filter @jobguard/db exec vitest list --maxWorkers=1 test/recovery-attribution-review.integration.test.ts`:
  26 cases registered, including the three existing branch regressions; not DB execution.
- Working-tree diagnostic using existing lane and migration-order validators:
  passed; exactly five changed paths against `origin/main`, own lane file implicit.
  Local `main` is stale; `origin/main` is the base merged by the launcher.
- The renamed SQL is byte-for-byte identical to the original branch migration.
  Its table, columns and review action remain present in main's latest schema.
- The proof records only the new index relation owned by `jobguard_migration`;
  no row, routine, privilege, RLS or tenancy allowance changes.
- Money arithmetic, commercial boundary and PL/pgSQL CASE lint: passed.
- `git diff --check`: passed.

Database/browser suites were not run: this sandbox cannot start PostgreSQL or
bind localhost. No git writes or provider actions. One independent exact-head
RED review and green CI remain required before merge.
