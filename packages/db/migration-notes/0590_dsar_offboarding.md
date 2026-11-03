# 0590_dsar_offboarding — M5-11 expanded DSAR and offboarding (RED)

Extends M0-13c's four isolated synthetic privacy tables. Adds no tables, runtime
table privileges, provider calls or business/identity writers. Forced tenant RLS
and composite FKs remain. The two checked routines preserve v1 commands and add
v2 inventory-bound review, expanded receipts and a private intake fence after
fictional offboarding/deletion. Real-data D07/D12 gates remain closed.

The dependency is `0589_privacy_operations.sql`; its proof owns the four tables,
forced-RLS/owner expectations and checked runtime entry points. The
`0590_dsar_offboarding.sql` proof adds only the private fence routine and its two
triggers. Replaced routine catalog metadata is unchanged. Primary-key index RLS
is off because RLS applies to the parent tables, which all force RLS.

Catch-up to main `111865cf6` resolves API registration and core exports by retaining
main's registrations/exports plus privacy. Main does not yet contain M0-13c, so
that dependency remains included. Reserved migration stems are renamed throughout
SQL, proofs and lookups. Both privacy command bodies now use main's
`app.lp4_seal_audit(..., 'checked_operation')` after their business locks, rather
than inserting audit rows or allocating chain hashes themselves. No main routine
body or migration is recreated or changed. Exact upgrade snapshot lists include
only the four new empty privacy tables; existing assertions are preserved.

Old requests receive expanded=false and null review/receipt. No payload backfill.
V1 cannot bypass v2 or held data. Backups/native stores remain pending, without
claiming erasure; existing financial obligations are reconciled without new fees.
The inherited backup expectation and all other behavior assertions are unchanged
by this catch-up.

Forward-fix once v2 receipts exist: keep the flag off, preserve request/command/
audit history, and correct routines in a new migration. Do not remove holds,
re-enable work or drop retained history to roll back. Never edit a landed migration.

Local checks use installed Vitest 4.1.12 with maxWorkers=2 and installed TypeScript.
Core privacy boundaries: 4 tests passed. API privacy and existing auth context
boundaries: 150 tests passed. DSAR proof composition and migration-proof loader:
112 tests passed across proof composition, migration-proof loader and LP-0 catalog
unit suites, including the sealed-writer regression. Core, database and API typechecks passed.
The pnpm launcher could not fetch signature metadata for its pinned version, so
installed repository binaries were invoked directly; no packages were installed.
Workspace compilation (core/config/storage/AI/database/API) passed. OpenAPI was
regenerated through the source generator, adding only the existing privacy routes.

PostgreSQL and browser execution are unavailable in this sandbox. CI must prove
fresh/previous-schema/repeated migration, forced RLS/catalog/privilege checks,
command replays, tenant isolation, sealed audit execution and the full database
suite. Independent RED review against the exact head and green CI remain required.
This remains NOPR build-ahead work; migration numbering may change at landing.
