MON-9 persistence (RED money), BUILD_PLAN.md MON-9.

Adds tenant-qualified, forced-RLS election and permanent pursuit-start tables.
Only the owner command dispatcher can elect through the checked SQL routine;
source triggers serialize on the existing case advisory lock. Historical pursuit
messages/events and progressed legacy cases backfill start markers. No earlier migration is edited. The latest installed LP-5 result routine is
extended with one checked election adapter; all earlier branches are retained. Direct runtime writes are revoked. Existing
LP-0, tenancy and SERIOUS-B5 expectations are unioned through the explicit
0567_managed_recovery_election.proof.json fragment; the entitlement upgrade
retains its two exact empty-table additions.

The repository requires the server's opaque session digest alongside the verified
tenant context. mon9_session resolves identity from an active synthetic identity
session under a shared lock, applies the existing SSO membership bridge, and
restores the tenant context. A differing supplied identity or membership is refused.
The resolved identity drives the live owner check inside the transaction before
replay and preview; revoked, expired and unknown sessions fail closed. An election binds case/job, service/points, terms, command, actor,
server time and exact authorization, with a checked audit batch through app.lp4_seal_audit. The election is registered
with LP-5; completion derives its result from the same-transaction stored election,
never the handler output. The command writer has a tenant-filtered SELECT-only
policy on the election table. Replays keep
one effect. Preview principal uses stored ordinary customer-recovery allocations,
net of reversals, with current approved policy, finalized evidence and settled,
identified receipts; invalidated proof, reversed payments and duplicate holds
fail closed. Manual landing records do not qualify. Missed-variation/shadow and
contractor cases are outside this synthetic boundary. The core computes the
unchanged success-fee illustration separately from the service-charge preview.

No service is offered or charged; no provider, invoice, ledger or fee writer is
introduced. Exact D01 terms, solicitor/DBA review, pilot evidence and live release
gates remain required. The base success-fee writer remains dependency-bound.

Forward fix: retain append-only election/start history and install a correcting
migration; disable the calling surface if needed. Never delete an opt-in or
pursuit marker to reverse this migration. No destructive rollback is supported.

Historical validation on 1 November 2026 (before this catch-up): the managed-recovery repository, integration
and upgrade tests, migration-proof-loader, SERIOUS-B5 upgrade, LP-0 grant-freeze
and tenancy suites passed together (7 files, 81 tests) using real embedded
PostgreSQL 16 and at most two Vitest workers. Another 13 core tests and six contractor
entitlement-upgrade tests passed; core, storage and database builds passed.
The known main-side missing legacy
entry for 0510_read_value_job_combined_final.sql was added only in a scratch test
copy; the committed legacy list is unchanged. Proof expectations come from SQL
and reviewed source expectations, never from a database catalogue.

Catch-up on 3 November 2026: retained main's complete contractor entitlement
upgrade proof and added only the two exact empty MON-9 successor tables.
Renamed the full migration stem to 0567_managed_recovery_election. Main already
contains the MON-9 pure core implementation from batch 1; this piece retains its
barrel export and adds only persistence. No earlier migration, fee calculation,
entitlement rule, browser surface or live offering is changed.

Validation: installed Vitest 4.1.12, maxWorkers=2: managed-recovery repository,
migration-proof-loader and late-source-import-migration (89 tests); core
managed-recovery (13 tests). Core and database TypeScript checks passed via the
installed tsc. pnpm invocations stalled before runner startup; direct installed
executables completed. PostgreSQL, migrations, RLS, concurrency and browser
execution remain unproved locally because this sandbox cannot run those services.
CI and an independent RED review at the exact final head remain required.

LATER / SIMPLICITY: packages/db/src/managed-recovery-repository.ts preview
qualification SQL overlaps the recovery allocation readers. A future separately
scoped change could share a reviewed qualifying-principal reader, reducing the
risk of eligibility filters drifting; retain all proof/reversal checks.

The installed result adapter is extended from pg_get_functiondef rather than a
stale copied routine body so main's MON-8, LP-3/LP-5 and LateSource behavior is
retained. The registry catalogue and its exact equality assertion now include
the explicit MON-9 command; no existing entry or assertion is removed. The SQL
projection intentionally reconstructs the core election binding independently
from stored facts, as required by LP-5 completion authority.
