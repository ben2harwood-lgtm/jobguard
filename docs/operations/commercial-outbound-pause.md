# Commercial outbound pause (M0-13a, RED)

Migration `0552_commercial_outbound_pause.sql` adds an app-wide control plane in `outbound_control`. It contains
only operational role names, command IDs, revisions and timestamps, with no
customer content. This is an infrastructure exception to tenant RLS. The
business runtime can execute only `claims_enabled()`; it cannot read operator
identities, edit state, approve a resume, or alter the append-only event history.
The migration owner remains privileged; this is not protection against that owner.

Provision one separate database LOGIN per human operator outside the application,
with membership of `jobguard_outbound_operator`. Never grant that role to a
business, identity, infrastructure or shared service login. Distinct database
logins represent distinct people; shared credentials defeat this control.
No HTTP endpoint or queue payload configures this switch.

Using those operator connections, inspect `outbound_control.state`, then call:

```sql
-- Operator A: use a fresh UUID and the current revision.
SELECT outbound_control.command('<pause-command-id>', 'pause', 0);
-- Operator A: request resume against the revision returned by pause.
SELECT outbound_control.command('<request-command-id>', 'request_resume', 1);
-- Operator A: complete reconciliation and retain its receipt independently.
-- Record that receipt UUID against this exact request (migration `0581_restore_reconciliation.sql`).
SELECT outbound_control.record_reconciliation('<request-command-id>', '<reconciliation-receipt-id>');
-- Operator B: inspect the receipt, then approve the exact request/revision.
SELECT outbound_control.command('<approval-command-id>', 'approve_resume', 2, '<request-command-id>');
```

The operator who paused or requested resume cannot approve it. A subsequent pause
invalidates pending resume requests and their reconciliation facts. Migration `0581_restore_reconciliation.sql`
requires a recorded reconciliation fact for the exact current resume request;
missing facts refuse approval with `OUTBOUND_RECONCILIATION_REQUIRED`. The fact
records request UUID, independently retained receipt UUID, `session_user` and time.
It is an operator attestation, not automatic proof of provider outcomes. Exact
replays by that operator are harmless; different receipts or actors conflict.
The business runtime cannot read or write these facts; operators can read them
and use the checked routine, but cannot edit/delete them. See
[restore-runbook.md](restore-runbook.md) for receipt contents and restore ordering. Each successful command and its state change
commit atomically with an event attributed to `session_user`. Exact replays return
the recorded revision without another effect; changed payloads or actors conflict.
Operators can SELECT history but cannot UPDATE, DELETE or TRUNCATE either table.

`JOBGUARD_COMMERCIAL_OUTBOUND=paused` independently disables claims in the worker
process. Only deployment configuration sets this value. `enabled` permits the
database check; it never clears a database pause. An absent value preserves the
existing fake-only worker behavior; invalid values fail closed. Migration `0552_commercial_outbound_pause.sql`
preserves the existing enabled state on upgrade. Set `paused` explicitly before
restoring or starting a deployment that must not dispatch. Keep deployment mode
and all existing no-charge/settlement gates unchanged. This adds no live adapter.

ActionExecutor checks the locked, authorized outbox row before any attempt or
status change. ContractorBillingDelivery checks in the transaction immediately
before `cb_delivery_step(..., 'claim')`. SubscriptionExecutor's repository checks
in the transaction before the `execute_simulation` SQL command, including direct
repository callers; paused execution returns `SUBSCRIPTION_UNAVAILABLE`. The
legacy `executeAuthorizedCommercialAction` adapter boundary also checks before
invocation, returning its existing authorization refusal while paused. Recovery
messages and the worker's quote, purchase-order and invoice adapters use
ActionExecutor. Identity challenge email and storage operations are outside this
commercial switch. A paused action remains queued, with its artifact, evidence and audit
history intact; resume still checks current authorization and expiry. A shared
state lock serializes claim commits with operator changes. Calls already claimed
or in flight when pause is requested cannot be recalled.

1. Commit the operator pause and verify claims are disabled. Stop the workers with a graceful shutdown and wait for in-flight work to drain. Keep discovery and dispatch paused during reconciliation.
2. Review queued work and its attempt history. Keep the artifacts, audit evidence and unknown attempts. Establish each unknown result from independent evidence, or leave it held. Record the reconciliation receipt UUID against the current resume request.
3. Have a separate operator login verify that receipt and approve the exact resume request and revision. Restart workers with delivery enabled only after confirming the new state. Inspect a fictional queued action and its attempt history.

Identity bootstrap messages and read-only
reconciliation are outside this commercial claim path.

The pilot worker discovers opaque action and tenant IDs in the business database and queues them in the pilot queue database. The business worker verifies the ID pair, approval and current source in the claim transaction. It calls the fake email port after commit. The pilot worker accepts checked quote deliveries, invoice-document sends, portal invitations and extra approval requests. Existing recovery-message simulations use their dedicated sink and reconciliation path. The commercial worker uses only fictional `.invalid` addresses and requires a current G1 approval in pilot mode. An unknown fake result is held across process restarts and is never retried automatically. Portal invitations keep the opaque reference in the outbox and derive the sign-in link only for the fake delivery call. Attempt receipts and telemetry exclude the recipient, artifact bytes and sign-in link.

Identity challenges keep their own cooldown, per-recipient and per-IP request limits, global request limit and verification attempt cap. Set `JOBGUARD_IDENTITY_EMAIL=disabled` to stop new identity email delivery independently of the commercial stop. Values other than `enabled` fail closed. Codes already issued can still be verified under the usual limits. See the [identity email data-flow register](identity-email-data-flow.md).

Forward fix: keep deployment paused while applying a new migration. Do not drop
or rewrite the state/event history to roll back a safety control. Removing this
code requires an explicit operational decision; do not roll back only the schema.

Verification: unit tests exercise deployment precedence and fail-closed behavior;
`outbox.integration.test.ts` exercises two real operator logins, runtime privilege
refusal, preserved queue/evidence, exact replay and concurrent one-effect delivery.
PostgreSQL/catalog/upgrade suites must run in CI. Independent RED review is required before merge.
