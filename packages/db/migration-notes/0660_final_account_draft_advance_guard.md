# 0660: final-account draft advance guard

LATER-SAFETY-124-CATCHUP (RED: final-account money and tenant-scoped reads).
The launcher merged origin/main at 02b46ac6f into this branch at 813326f74.
The merge retains main's routine bodies and this piece's additional trigger;
no existing routine is re-created. Migration SQL and behavioural test
expectations are unchanged. The migration and its proof were renamed by stem
only from 0850 to the coordinator's reserved 0660.

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

Final CI repair round 2 (PR #627): the launcher's current-main merge at
`d0adb6465` is already complete. This repair preserves main's product code and
this branch's migration, proof and seven guard regressions unchanged.
Source inspection traced MON-6's seed failure to its direct
`UPDATE app.final_account_draft SET revision=2,current_revision_id=...`:
the inserted revision 2 omitted `previous_revision_id`, leaving NULL while
the draft's current head was revision 1. The seed, unlike product assembly,
therefore attempted a non-descendant advance. The seed now inserts the link to
`account.revisionId` and calls `app.advance_final_account_draft` within the same
tenant-scoped transaction as the revision and lines. No trigger is relaxed,
and every existing browser assertion is retained.

This round's local checks: installed web `tsc -p tsconfig.json --noEmit
--incremental false` passed; installed DB Vitest with `--maxWorkers=2` passed
all 84 tests in `migration-proof-loader.test.ts`, `upgrade-proof-utils.test.ts`
and `audit-api-file-final-account.test.ts`. Node's module syntax check passed
for the extracted embedded seed script. Read-only checks confirmed the browser
test body is identical to main and lane coverage exactly matches changed paths
outside `config/lanes/`. `git diff --check` passed. PostgreSQL guard tests and
MON-6 at both widths still require GitHub CI; exact-head independent RED review
remains required before merge.
