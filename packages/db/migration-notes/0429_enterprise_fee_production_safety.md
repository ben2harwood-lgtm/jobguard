# M4-9 contractor production safety preparation (RED, dark)

Migration 0429 adds a separate production command that always refuses, before any
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
