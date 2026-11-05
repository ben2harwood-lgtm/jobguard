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


## Batch-40 landing preparation (5 November 2026)

RED; NOPR. The clean preassembled union of later-safety-2 through later-safety-5
was checked against the available origin/main base 567604fdc (local main is stale;
no fetch or Git-writing command was run). Migrations and matching notes/proofs now
use these stems, in dependency order:

- 1030_company_import_once
- 1031_ais_private_reads
- 1032_billability_one_line
- 1033_dunning_owner_approval
- 1034_scheduled_readiness_hardening

Only complete filename stems were replaced. The recreated import and dunning
bodies retain the latest base bodies except their existing intended predicates.
The entitlement upgrade guard names each changed routine and binds the exact
replacement body. No table columns or new tables were introduced. The existing
later-empty-tables register already includes both scheduled stores and metrics.
The four added piece lanes were removed in favor of batch-40's exact 67-file
allow-list (excluding config/lanes). This preparation adds no product behavior.

Local deterministic validation: 534 tests passed across 22 named Vitest files,
with at most two workers and three named files per invocation. This includes the
278 watchdog-registry/context-boundary/identity tests, migration-proof-loader,
later-safety-3, inbox-metrics, dunning repository, payment-fee collection,
enterprise live prompt, readiness store, Deepgram fixture, shadow pilot report,
web transports/screens/pages, and the scheduled-readiness static guard. That last
invocation selected only the static test; its three PostgreSQL tests were not run.
Installed TypeScript compiled core/config/storage/db/ai and passed API/web no-emit
checks. Initial test discovery lacked built workspace dependencies; after those
builds all selected suites passed. The pnpm version probe stalled and was stopped;
installed package binaries were used without downloads. A direct Node import of
the TypeScript proof loader cannot resolve source .js aliases; the actual Vitest
proof-loader and complete-chain tests passed through the repository runner.

The required lane lint was run: it still reads committed HEAD's superseded paths
and therefore refuses the old lanes/migration names before the router commits.
Its exported policy/path/order helpers independently verified the working-tree
allow-list is exact and all five added migrations have matching proofs. The router
must rerun the full lint on the committed head. git diff --check passed.

CI must prove fresh and populated-upgrade PostgreSQL behavior, LP-0 catalogue,
RLS/grants, command authority, fingerprint preservation, audit integrity,
entitlement lifecycle and migration suites, plus affected browser journeys.
Exact-head independent RED review and green CI remain required before merge.
Nothing live, no customer data, no providers, no PR or release was performed.
The stopped fee reservation transaction item described above remains omitted;
this union does not claim that item or any whole plan piece is finished.

LATER / SIMPLICITY: apps/api/src/readiness-store.ts and
packages/db/src/inbox-metrics-repository.ts repeat the strict membership/identity
actor schema. A later shared contract export could keep that boundary shape in
one place while preserving each operation's independent permission checks.


## Current-main merge verification (5 November 2026)

READY for router commit/push and subsequent CI/review. The launcher already
committed the merge at 2fd1fb88b with origin/main d16ef1978. No unresolved index
entries or conflict markers remain. Local main is stale and was not used as the
comparison base. No Git-writing command was run in this sandbox.

Compared both replacement routines against the latest definitions on origin/main:
1030 retains the complete 0534 import body with only its tenant/source duplicate
predicate; 1033 retains the complete 0564 dunning body with only its current-owner
approval predicate. No main behavior was removed. All five migrations are absent
from main, above its 0613 maximum, and have matching proofs. No migration needed
dropping. Main's new rows in the shared registers were retained by the merge.
The lane allow-list equals all 68 changed paths outside config/lanes and does not
list itself. LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs
--lane=batch-40 passed. SQL CASE-in-IF lint passed for all 283 migrations.

Local installed Vitest binaries passed 232 tests in 13 named files, never more
than three named files per invocation or two Vitest workers total. Selected files:
DB later-safety-3, inbox-metrics, dunning-repository, payment-fee-collection-repository,
enterprise-live-prompt-repository and migration-proof-loader; API readiness-store
and deepgram-fixture.service; web recovery-billability-server,
managed-recovery-server and duplicate-candidates/transport; core shadow-pilot-report;
and only the static policies/immutability test in scheduled-readiness-hardening.
The latter explicitly did not run its three PostgreSQL tests. The initial pnpm
launches failed before running checks because the launcher could not fetch/verify
the pinned package-manager release; installed binaries supplied all test evidence.
No packages were downloaded. Stale migration references in the dunning note and
upgrade test title were corrected; no behavior or assertions were changed.

PostgreSQL, browser suites, green CI against the committed head and independent
RED review remain required. This is merge preparation, not completion of a plan
piece or approval to release.

Installed TypeScript checks passed: packages/db, apps/api and apps/web each ran
./node_modules/.bin/tsc -p tsconfig.json --noEmit from its package directory.
git diff --check passed. No further simplification was added on this follow-up;
the initial review suggestion above remains LATER only.
