MON-9 persistence (RED money), BUILD_PLAN.md MON-9.

Adds tenant-qualified, forced-RLS election and permanent pursuit-start tables.
Only the owner command dispatcher can elect through the checked SQL routine;
source triggers serialize on the existing case advisory lock. Historical pursuit
messages/events and progressed legacy cases backfill start markers. No earlier
migration file is edited. The current LP-5 completion routine is extended below. Direct runtime writes are revoked. Existing
LP-0, tenancy and SERIOUS-B5 expectations are unioned through the explicit
0582_managed_recovery_election.proof.json fragment; the entitlement upgrade
retains its two exact empty-table additions.

The repository requires the server's opaque session digest alongside the verified
tenant context. mon9_session resolves identity from an active synthetic identity
session under a shared lock, applies the existing SSO membership bridge, and
restores the tenant context. A differing supplied identity or membership is refused.
The resolved identity drives the live owner check inside the transaction before
replay and preview; revoked, expired and unknown sessions fail closed. An election binds case/job, service/points, terms, command, actor,
server time and exact authorization, with the normal audit batch. Replays keep
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

Local validation on 1 November 2026: the managed-recovery repository, integration
and upgrade tests, migration-proof-loader, SERIOUS-B5 upgrade, LP-0 grant-freeze
and tenancy suites passed together (7 files, 81 tests) using real embedded
PostgreSQL 16 and at most two Vitest workers. Another 13 core tests and six contractor
entitlement-upgrade tests passed; core, storage and database builds passed.
The known main-side missing legacy
entry for 0510_read_value_job_combined_final.sql was added only in a scratch test
copy; the committed legacy list is unchanged. Proof expectations come from SQL
and reviewed source expectations, never from a database catalogue.

3 November catch-up to main 111865cf6 (RED): migrations renamed by full stem to
0582_managed_recovery_election and 0583_managed_recovery_actor_bind. Main already
implements exact sequential proof replacement; its loader is retained. The prior
branch loader change is redundant. MON-9 regression coverage remains.

Main's LP-5 lifecycle now requires explicit command registration and database-derived
completion. This migration registers only managed_recovery.elect and adds its exact
stored-election adapter to the latest body from 0541_late_source_import, preserving
all previous adapters. The command writer receives SELECT under a tenant policy on
only the election table. The adapter derives the existing core-state DTO and binding hash from the stored
election, preserving the receipt/result shape and replay behavior. Main's complete_command retains
its final checked audit seal through app.lp4_seal_audit; no audit writer is replaced.
The existing elected event still goes through main's append_audit boundary.

LATER / SIMPLICITY: 0582_managed_recovery_election.sql, lp5_command_result. A separately
reviewed completion-adapter extension point could avoid copying the whole routine
when adding an adapter, reducing stale-body maintenance risk. This is outside this
catch-up; the regression compares all retained body text against latest main.

Local evidence for this catch-up is in the router commit-message handoff. Earlier
1 November PostgreSQL results above apply to that historical head only. PostgreSQL,
upgrade/catalogue/privilege execution and browser journeys remain unproved here;
GitHub CI and an independent RED review at the resulting head are still required.
