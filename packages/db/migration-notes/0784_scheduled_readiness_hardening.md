LATER-SAFETY-5 item 2 (RED: least privilege). Forward-only hardening of the
0588 scheduled readiness store. Both tenant policies now fail closed for absent
or reset tenant context, preserving their existing roles, grants and forced RLS.
Both tables reject UPDATE, DELETE and TRUNCATE using the same trigger pattern as
0589 inbox metrics, including writes performed as the table owner.

No data backfill, row-shape change, adapter/task change or provider activation.
The store appends plan revisions and proposals; no update/delete path was found.
Both tables already belong to later-empty-tables.ts alongside inbox_metric_receipt;
no new reset exception is needed. Administrative DDL can disable triggers, as it
can for inbox metrics; this is not protection against a malicious administrator.

Rollback/forward fix: preserve stored history and correct a policy or trigger in
a later reviewed migration. Do not delete rows or remove immutable history guards
as an operational workaround. Renumber at landing with the matching proof.

Tests: scheduled-readiness-hardening.integration.test.ts covers populated tables,
missing/reset/foreign tenant contexts, unchanged grants, owner and administrator
UPDATE/DELETE/TRUNCATE refusals and preservation of all stored rows. Its static
migration guard is locally runnable without PostgreSQL; the database tests require
CI. CI must also run existing readiness-store, inbox-metrics, tenancy, LP-0 and
upgrade/migration suites against fresh and upgraded PostgreSQL installations.

Item 1 is stopped under the brief's explicit transaction-boundary condition:
success-fee-composition.ts nests repository.withReader inside store.transaction.
withTenant commits before withReader resolves; the outer store commits afterwards.
ReservationStore's callback exposes a book and source readers, not its transaction
connection or a transaction-lifetime hook. Switching pools cannot retain FOR SHARE
until the reservation commit. A shared reservation transaction contract/implementation
is needed outside this item's allowed files. No 0783 migration or fee reader change
is supplied. Also, the unchanged success-fee-direct-debit integration suite currently
asserts that composing with runtime must fail, conflicting with the requested new
runtime capability. The later-safety-2 dependency merge remains for the router:
.git is read-only and no writing git command was run here.

Local validation (5 Nov 2026): the new static guard first failed because 0784 was
absent, then passed (1 test; 3 PostgreSQL tests deliberately excluded by the local
name filter). Migration proof loader: 76 passed. API watchdog-registry,
context-boundary and identity guards: 278 passed. Installed TypeScript compiler
completed core/config/storage/db/ai builds and API/web no-emit checks. The pnpm
launcher stalled before invoking checks; it was interrupted and the installed
binaries were used directly, without downloading packages. Full lane lint refused
the HEAD/base self-comparison on this uncommitted sandbox; its existing policy
loader/path helper verified the exact five working files and lane allow-list.
The router must run the full lane check after committing. These are local,
deterministic checks, not PostgreSQL evidence or an independent RED review.
