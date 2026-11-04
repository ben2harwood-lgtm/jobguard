# 0900: dark CIS fixture records (M4-22, RED)

Creates one initially empty, append-only tenant/job fixture table and one
migration-owned SECURITY DEFINER storage routine. The routine is callable only
by runtime, accepts only the synthetic demo database, enforces caller tenant
context and current owner membership on writes, and saves/restores tenant GUC
state explicitly. FORCE RLS includes the owner; no runtime table grants, new
roles, command registry entries or changes to existing routines/tables occur.
This repository operation records fixture lineage, not a domain job mutation or
commercial command. There is no integration or enablement.

Fresh install and upgrade both add an empty table. Exact LP-0, upgrade and tenancy
expectations are in the migration proof, authored from this SQL, not a database.
The claimed number must be checked/renumbered at landing. No existing migration
was edited. No data backfill is needed.

Forward fix is preferred: preserve fixture history and add a reviewed migration.
If abandoning this unpublished fixture feature, revoke routine execution and
archive the rows; do not drop or rewrite history. Runtime cannot update, delete
or truncate rows. Hashes do not protect against a privileged rewrite.

CI must execute the real PostgreSQL integration test, fresh/upgrade migration
suites, LP-0 catalogue/privilege and tenancy checks. Local evidence and limitations
are recorded in the router commit-message handoff. No database/browser suite can
run in this sandbox. Full CI and independent exact-head RED review remain gates.
