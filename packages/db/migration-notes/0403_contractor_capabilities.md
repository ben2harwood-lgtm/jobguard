# 0403 — MON-8-P-B slice 2 (RED)

Synthetic only. No backfill, new table, agreement activation, provider call, money
posting or deletion. The current assignment and its latest bound status now have
one private SQL projection shared by the existing session reader and the capability
service. READ COMMITTED and the existing tenant lock (seed 54) fence changes in
agreement authority through each controlled operation.

The service gates work-order/SoR writes, approval-rule configuration, approval-chain
commands and escalation, SSO setup/request creation/session completion/required-mode
enablement, and new contractor billing exports/delivery approvals/delivery claims.
Work-order receipt lookup and approval command-receipt insertion also check it, so
replays cannot bypass suspension. Existing actor, tenant, scope, immutable revision,
amount, approval, audit and idempotency checks remain in the predecessor routines.

Withdrawal, duplicate cleanup, client-link revocation, disabling SSO mappings or
required mode, retained reads/downloads, billing fact imports and unknown-outcome
reconciliation remain available under their existing authorization. Subscription
state and hidden signals are not inputs. An active status on the current contractor
assignment is required; a reference alone, another assignment's status, client
flags and a Solo/Builder plan cannot grant these capabilities. The earlier in-memory
plan helper is not installed as a second enforcement path.

Only runtime EXECUTE on the denial-only capability service is added. The shared raw
facts helper and receipt trigger are private to the migration owner. No returned
value is a bearer credential or commercial approval. Existing scopes still define
what a caller can read or execute; this is not a new tenant authentication bridge.

The migration patches exact predecessor anchors and fails atomically on drift.
Forward fix: amend the capability service/affected controlled routine in a later
reviewed migration. Do not remove the gate or rewrite agreement/command history to
roll back. Existing fictional test setups now seed owner-only explicit status facts;
no application route can create them. The default practice generator still grants
no active status by reference alone; demo setup needs an owner-supplied fictional
agreement fact. Production/pilot activation remains outside this slice.

Real PostgreSQL fresh/upgrade/catalogue, race and behavioral suites run in CI; the
builder sandbox cannot start PostgreSQL. The three added routines are explicitly
accounted for in the privilege inventory and the populated-predecessor upgrade
snapshot; no predecessor checks or recorded fingerprints are removed.
