# 0641_dsar_offboarding — M5-11 expanded DSAR and offboarding (RED)

Extends M0-13c's four isolated synthetic privacy tables. Adds no tables, runtime
table privileges, provider calls or business/identity writers. Forced tenant RLS
and composite FKs remain. The two checked routines preserve v1 commands and add
v2 inventory-bound review, expanded receipts and a private intake fence after
fictional offboarding/deletion. Real-data D07/D12 gates remain closed.

The dependency is `0640_privacy_operations.sql`; its proof owns the four tables,
forced-RLS/owner expectations and checked runtime entry points. The
`0641_dsar_offboarding.sql` proof adds only the private fence routine and its two
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


Batch-11 union, 3 November 2026: preserved the existing merchant/rate/resilience/
findings batch at HEAD 87ac3e32c and its migrations 0638–0639. The privacy dependency
and DSAR extension follow as 0640_privacy_operations and 0641_dsar_offboarding;
only complete filename stems were substituted. Both proofs follow those names.
No migration already on origin/main bc8993090 was edited (local main is stale).
Environment configuration keeps both outbound pause and the disabled privacy flag.
Successor snapshots retain both sides through later-empty-tables.ts, plus the
contractor upgrade's explicit expectations. The piece lane is replaced by the
combined batch-11 lane. Working-tree conflicts are resolved; the read-only Git
index deliberately remains for the router to stage and complete the merge.

LATER / SIMPLICITY (initial source inspection): in 0641_dsar_offboarding.sql,
privacy_command's artifact-state CASE repeats queued_work/inflight_work and
access_grant/consent/connector branches after already handling them. A later
focused cleanup can remove unreachable repeats to make retention behavior easier
to maintain. It does not block this exact-union catch-up and is unchanged here.


Batch-11 local validation (this run; installed binaries, Node 24.17.0,
Vitest 4.1.12; no downloads):
- packages/core: vitest run --maxWorkers=1 src/privacy-operations.test.ts:
  4 passed. Merchant conformance/connectors/rate tests: 40 passed across 3 files;
  rate-baseline-architecture.test.ts: 1 passed.
- packages/db: vitest run --maxWorkers=1 test/dsar-migration-proofs.test.ts
  test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts: 112 passed.
  src/merchant-ingestion.test.ts and test/resilience-exercises.test.ts: 21 passed.
- apps/api: vitest run --maxWorkers=2 src/privacy-operations.application.test.ts
  src/auth/context-boundary.test.ts src/auth/auth.test.ts: 166 passed.
- packages/config: security-findings.test.ts, maxWorkers=1: 9 passed.
  node --test tools/security-findings.test.mjs: 2 passed. Total: 355 passed.
  No invocation named more than three Vitest files; at most two test workers.
- Installed tsc --noEmit passed for packages/core, packages/db and apps/api.
  Installed tsc compilation passed for core, config, storage, AI and database.
- OpenAPI: node --import tsx src/generate-openapi.ts --check passed in apps/api.
  The tsx CLI itself was blocked by sandbox IPC listen EPERM; invoking its Node
  loader performed the same source check successfully without a listener.
- git diff --check HEAD passed. Read-only static validation passed: batch lane
  exactly covers the 65 existing changed files against origin/main, no lane
  paths; all base SQL migration bytes unchanged; four new migrations consecutive
  from 0638 with matching proofs; no conflict markers or obsolete privacy stems.

CI must still prove PostgreSQL fresh/upgrade/repeated migrations, LP-0/catalog/
RLS/privileges, sealed audit execution, command replay/authority and tenant
isolation, full database/migration suites, plus affected browser journeys and
required full typecheck/lint/test/build gates. No database or browser was run
locally. Synthetic data only; no live providers, releases or customer data.
READY for router staging/merge completion on the NOPR branch, not acceptance:
independent RED review at the exact head and green CI remain pending.
