MON-9 persistence (RED money), BUILD_PLAN.md MON-9.

Adds tenant-qualified, forced-RLS election and permanent pursuit-start tables.
Only the owner command dispatcher can elect through the checked SQL routine;
source triggers serialize on the existing case advisory lock. Historical pursuit
messages/events and progressed legacy cases backfill start markers. No earlier
migration or routine is replaced. Direct runtime writes are revoked. Existing
LP-0, tenancy, entitlement-upgrade and SERIOUS-B5 expectations are unioned with
the exact additions.

The repository takes verified session context and session actor, never a caller
tenant or amount. Owner identity/membership is checked inside the transaction
before replay. An election binds case/job, service/points, terms, command, actor,
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

Local evidence is in the router's commit-message handoff. PostgreSQL fresh-install,
upgrade, RLS/grants, race and source/reversal tests are written for GitHub CI and
cannot run in the builder sandbox. They are not claimed as executed evidence.
