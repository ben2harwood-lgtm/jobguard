# FEE-STORE-UPDATE-GRANT — RED, forward guard (1060 provisional)

This migration revokes runtime UPDATE(book); SELECT and INSERT remain, with a
restrictive INSERT policy permitting only the exact empty v1 book. DELETE and
TRUNCATE remain absent. No financial formulas, routes, rails or executor calls
change. No columns or predecessor migrations change.

The lock and replace routines run as jobguard_migration with a fixed search path,
explicit tenant checks and FORCE RLS. The book policy includes that owner. Replace
locks again, checks immutable identity exactly as identity() does (all fields
except state, paymentState and providerObjectId), explicit executor transition
edges, events and ordered audit retention. Removed released attempts require an
identical archive record; unknown attempts cannot disappear or return to reserved.
Changed states require an appended commandId/state audit entry in the same call.
These checks do not authenticate provider results.

The store first persists the validated full history, then inserts compact()'s
archive records, then replaces the full book with the compacted one. This extra
in-transaction write lets the routine distinguish a new transition's audit tail
from old archived history. Source locks still precede persistence; the chained
audit lock remains last. Any error rolls the entire transaction back. Existing
archive grants are untouched; runtime UPDATE/DELETE/TRUNCATE remain denied.

## Archive owner visibility

1060 adds the named policy `migration_tenant_select` on
`app.fee_reservation_archive`: PERMISSIVE SELECT only, roles
`{jobguard_migration}`, using the existing tenant test
`tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid`, with no
WITH CHECK. Its named LP-0 and upgrade proof entries describe that addition.
The runtime policy and all archive grants remain unchanged. The owner gets no
INSERT, UPDATE or DELETE policy; FORCE RLS still applies. Both routines retain
the explicit session-tenant check before accessing history.

## Upgrade and recovery

No backfill runs. Populated books are unchanged by migration and compact lazily on
the next store transaction. Tests cover a populated unknown predecessor, the
archive predecessor, real row changes under FORCE RLS and migrate() replay.
Forward-fix any defect; never restore raw runtime UPDATE or discard history.
The migration runner records successful application; this SQL is applied once.

## Named holds for landing

UNKNOWN-RESULT-AUTHORITY: A caller with the runtime login can still call the routine to report a definite result for an outcome_unknown attempt, and the routine leaves an audit entry. Before any route or rail uses this store, results must arrive by an authenticated provider result or reconciliation path.

Renumber 1060 at landing. Exact-head independent RED review, green CI on current
main, PostgreSQL integration/migration/upgrade/tenancy/LP-0 and full mandatory
checks remain required. No scanner or source pin has been changed. No plan piece
is finished; G0–G5, provider and real-user gates remain closed.

## Local evidence from the second run

The guarded SQL adapter regression failed against the raw SQL path and passed
with the guarded path. Installed Vitest: store 15/15; watchdog registry 126/126;
context-boundary and identity 152/152; migration proof loader 76/76. Installed
TypeScript checks passed for API, DB, AI and web (core/config checked separately).
These are deterministic/source checks, not database or independent RED evidence.
The pnpm commands could not switch to the pinned release because registry fetch
and signature verification failed; installed binaries were used without package
installation. Lane lint cannot pass while the read-only index still records the
unfinished merge and inherited lane files; the router must complete its exact
union merge before checking the committed range. No git write or fetch ran.
PostgreSQL syntax, permission refusals, real row changes, concurrent reservations,
archive compaction and populated upgrade/replay require CI. No browser ran.

## Third-run local evidence

ARCHIVE-OWNER-SELECT is resolved by `migration_tenant_select`; the
UNKNOWN-RESULT-AUTHORITY wording above remains the landing hold. The earlier
builder receipt is historical; this migration note and the third-run commit
message describe the current draft.

Installed repository runners, no downloads, at most two workers per Vitest run:
- API Vitest: `src/fee-collection/postgres-reservation-store.test.ts` and
  `src/watchdog-registry.test.ts`, `--maxWorkers=2`: 141 passed.
- API Vitest: `src/auth/context-boundary.test.ts` and `src/auth/identity.test.ts`,
  `--maxWorkers=2`: 152 passed.
- DB Vitest: `test/migration-proof-loader.test.ts`, `--maxWorkers=2`: 76 passed.
- Installed TypeScript `--noEmit`: API, web (incremental disabled), DB, AI, core,
  config and storage passed.
- `node --test tools/plpgsql-case-in-if-lint.test.mjs`: 15 passed.
- Changed PostgreSQL test files: TypeScript syntax check passed; no database ran.
- `git diff --check` passed. Lane paths exactly match the 41-path working-tree
  delta from local batch-25 plus the preserved untracked draft, excluding
  config/lanes and the lane itself. Lane CLI rejected inherited batch-25 paths
  still staged in the unfinished merge; launcher staging/merge completion and
  the committed-range lane check remain required. No git writes or fetch ran.

CI must execute the new real-PostgreSQL compaction and subsequent store-call
checks, matching/mismatching/cross-tenant archive removal refusals, owner reads
with correct/wrong/absent tenant context, owner INSERT refusal and zero-row
UPDATE/DELETE with unchanged archive rows, preserved runtime grants, and all
existing history/identity/state/audit/event attacks, races, replays, upgrades and
mandatory suites. Local source/unit checks establish none of those database
outcomes. Exact-head independent RED review remains required. No browser,
provider, real customer data, paid call or live activation was used.
