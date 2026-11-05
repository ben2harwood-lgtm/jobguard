# 0585_dsar_offboarding — M5-11 expanded DSAR and offboarding (RED)

Extends M0-13c's four isolated synthetic privacy tables. Adds no tables, runtime
table privileges, provider calls or business/identity writers. Forced tenant RLS
and composite FKs remain. The two checked routines preserve v1 commands and add
v2 inventory-bound review, expanded receipts and a private intake fence after
fictional offboarding/deletion. Real-data D07/D12 gates remain closed.

The dependency is `0584_privacy_operations.sql`; its proof owns the four tables,
forced-RLS/owner expectations and checked runtime entry points. The
`0585_dsar_offboarding.sql` proof adds only the private fence routine and its two
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
and DSAR extension follow as 0584_privacy_operations and 0585_dsar_offboarding;
only complete filename stems were substituted. Both proofs follow those names.
No migration already on origin/main bc8993090 was edited (local main is stale).
Environment configuration keeps both outbound pause and the disabled privacy flag.
Successor snapshots retain both sides through later-empty-tables.ts, plus the
contractor upgrade's explicit expectations. The piece lane is replaced by the
combined batch-11 lane. Working-tree conflicts are resolved; the read-only Git
index deliberately remains for the router to stage and complete the merge.

LATER / SIMPLICITY (initial source inspection): in 0585_dsar_offboarding.sql,
privacy_command's artifact-state CASE repeats queued_work/inflight_work and
access_grant/consent/connector branches after already handling them. A later
focused cleanup can remove unreachable repeats to make retention behavior easier
to maintain. It does not block this exact-union catch-up and is unchanged here.


Prior 3 November hardening validation (installed binaries, Node 24.17.0,
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

## Batch-11 landing reconciliation — 4 November 2026

READY for router staging and merge completion, then PR opening (RED).
The current merge preserves both sides' exports, snapshot table lists and restore
hooks/measurements. Main's 0581 restore reconciliation SQL was byte-identical to
this branch's 0639 copy: retain main's SQL/proof and remove the duplicate. Merchant
hardening already lives at 0559; remove the branch's no-op 0638 placeholder and
proof/note. The only new migrations are 0584_privacy_operations and
0585_dsar_offboarding, renamed by complete stems with matching notes and proofs.
Every migration already on origin/main remains byte-identical. Resume tests use
main's commercial-outbound-pause-fixture, preserving reconciliation before resume.

Current local validation used installed executables, no package downloads and at
most two test workers, with at most three named Vitest files per invocation:
- DB: dsar-migration-proofs, migration-proof-loader, resilience-exercises: 96 PASS.
- API: watchdog-registry, auth/context-boundary, auth/identity: 278 PASS;
  privacy-operations.application: 5 PASS.
- Core: privacy-operations, merchant-conformance-kit, rate-baseline: 40 PASS.
- Config: security-findings: 9 PASS. Node security-findings tests: 2 PASS.
- Installed tsc passed for core (build), config, db, api and web (noEmit).
- synthetic-restore.mjs syntax check and git diff --check passed. Read-only
  source inspection found no web route importing apps/api source, new app.*
  function SET clauses, private command-lifecycle reads or unknown audit classes
  in the batch migrations. Privacy adds only its own table columns; protected
  commercial row shapes and command authority remain unchanged.

The initial API guard failures used stale compiled core exports. Rebuilding core
and rerunning the same three files passed all 278 tests without a source change.
The pnpm wrapper stalled before execution and was stopped; checks used the
repository's installed binaries instead. No pnpm suite PASS is claimed.

The normal lane CLI was run and reported paths from the unfinished merge/index
and old HEAD history. It must run again after router staging/merge completion.
Separate read-only validation verifies exact final diff coverage against
origin/main (excluding config/lanes), consecutive migration numbers above 0583,
and unchanged bytes for every existing main migration.

CI must prove PostgreSQL fresh/upgrade/rerun migrations, restore reconciliation,
LP-0/catalog/RLS/grants, audited authority/replay/isolation, and affected browser
journeys, plus the required full lint/test/build/typecheck gates. No database,
browser, live provider, customer data or release was exercised here. Independent
RED review must bind the exact final head before merge. This READY is a builder
handoff, not independent acceptance or green CI.
