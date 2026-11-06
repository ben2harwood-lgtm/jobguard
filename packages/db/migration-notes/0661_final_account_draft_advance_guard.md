# 0661: final-account draft advance guard

LATER-SAFETY-124-CATCHUP (RED: final-account money and tenant-scoped reads).
The launcher merged origin/main at 02b46ac6f into this branch at 813326f74.
The merge retains main's routine bodies and this piece's additional trigger;
no existing routine is re-created. Migration SQL and behavioural test
expectations are unchanged. The migration and its proof were renamed by stem
only from 0850 to the coordinator's reserved 0661.

The trigger permits a changed draft head only at the next revision, linked to
its previous head and belonging to the same tenant and draft. Its owner-only
routine scopes FORCE-RLS reads to that row and restores the caller's context.
It changes no grants on existing routines or tables and adds no data backfill.
Use a reviewed forward migration for repair after installation.

The proof pins the exact added routine identity, owner, ACL, definer flag and
search path. MIGFIX-7, plan-entitlement lifecycle and the other proof-driven
upgrade tests discover this addition automatically; there are no 0850 rows or
replacement-body pins in those tests to rename. The seven PostgreSQL guard
regressions remain unchanged and require CI in this sandbox.

Local validation: all seven package TypeScript checks passed with installed
`tsc -p tsconfig.json --noEmit` (one process at a time). Installed Vitest ran
`test/migration-proof-loader.test.ts`, `test/upgrade-proof-utils.test.ts` and
`test/audit-api-file-final-account.test.ts` with `--maxWorkers=2`: 84 tests
passed. The pnpm launcher stalled before executing checks and was stopped;
installed binaries were used without downloading packages. Database and browser
suites were not run because this sandbox cannot start PostgreSQL or bind
localhost. GitHub CI and exact-head independent RED review remain landing gates.
