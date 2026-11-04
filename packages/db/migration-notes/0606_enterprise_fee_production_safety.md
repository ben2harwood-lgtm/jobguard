# M4-9 contractor production safety preparation (RED, dark)

Migration `0606_enterprise_fee_production_safety.sql` adds a separate production command that always refuses, before any
business read or write. No request approval, environment variable or GUC activates
it. Synthetic routines keep their existing environment, finance-session, exact
statement authority and stale-fact checks. No D16 or G4-C approval is created.

The existing contractor kernel is reused. Its new insert trigger locks the tenant
and agreement version independently of client contract/month, rebuilds exact
principal, rounded cumulative fee and allocation attribution from immutable billing
facts, and checks section/derivation equality before posting. Compensation is
bounded by both the agreement's excess liability and the linked accrual's remaining
balance. Original journals, sources and statements are preserved. Negative journals
remain visible to the later platform credit/refund workflow; no balance is clamped.
There is no new table, dependency, provider, worker or operational alert.

Forward fix only: stop posting and apply a reviewed replacement migration if the
new guard needs correction. Do not edit historical migrations, facts or journals.
The migration is additive; tests preserve populated books and repeat migration.

This is preparation, not completion of the requested production-policy slice.
Origin/main's source reader selects synthetic jobs, agreement versions permit only
synthetic_demo, finance authentication uses practice sessions, and M4-9-S remains
source-adapter-bound. Production derivation/accrual still needs an authoritative
production source/session adapter and approved-policy binding, behind G4-C/G4-S.
This change deliberately does not relabel synthetic facts as production proof.
Collection/refund execution and tax documents belong to later pieces.

Local verification and the explicit handoff state are in the router commit-message
file. PostgreSQL suites require CI in this sandbox. Required review remains one
fresh Claude RED review against the exact head.

Catch-up to main (3 November 2026): preserve both the dark production schema
and main's simulated-invoice schema. Renumber only this branch's migration stem
from `0589_enterprise_fee_production_safety` to
`0606_enterprise_fee_production_safety`, including its proof and test lookup.
No existing SQL routine is replaced; main's LP-4 audit sealing, LP-3/LP-5 command
authority and MON-8 entitlements are retained. The new production routine always
raises before any business operation and needs no command registration.

Landing preparation (4 November 2026): the merge is complete against local
`origin/main` fb61ec367. The six non-lane paths exactly match this piece's lane;
no other piece's lane file differs from that base. The migration adds no columns
or tables and replaces no existing routine. Its proof uses identity arguments
without defaults and records an owner entry only for the runtime-reachable
production stub. There is no new job mutation, registered command, application
service, client module or browser spec. The production stub raises before any
mutation or command receipt; its caller takes an existing verified context.
Neither the repository addition nor its tests write command/decision authority
as the runtime login. No compatibility correction or behaviour change was needed.

Local checks: installed Vitest 4.1.12, one worker per run and at most two test
workers total; watchdog-registry (126), context-boundary and identity (152),
migration-proof-loader and enterprise-fee-repository (83): 361 tests passed.
Missing/stale ignored workspace builds initially prevented suite imports;
rebuilding core, config, storage, db and ai with installed TypeScript resolved
them. Database `--noEmit`, lane boundary and PL/pgSQL CASE-condition lint passed
(232 migrations). The pnpm typecheck wrapper stalled; installed TypeScript
compiled core, config, storage, db and ai successfully, and direct API and web
`--noEmit` checks passed (web with incremental output disabled).
PostgreSQL and browser suites were not run in this sandbox. CI must still prove
the populated upgrade/fingerprint and LP catalog guards, contractor concurrency,
receipt splitting/replay, origin exclusions, exact authorization and reversal
compensation against real PostgreSQL; required browser journeys and green CI
against current main precede landing, with an independent exact-head RED review.
