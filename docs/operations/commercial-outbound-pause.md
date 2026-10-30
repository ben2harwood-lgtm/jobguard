# Commercial outbound pause (M0-13a, RED)

Migration 0474 adds an app-wide control plane in `outbound_control`. It contains
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
-- Operator B: approve that exact request against its returned revision.
SELECT outbound_control.command('<approval-command-id>', 'approve_resume', 2, '<request-command-id>');
```

The operator who paused or requested resume cannot approve it. A subsequent pause
invalidates pending resume requests. Each successful command and its state change
commit atomically with an event attributed to `session_user`. Exact replays return
the recorded revision without another effect; changed payloads or actors conflict.
Operators can SELECT history but cannot UPDATE, DELETE or TRUNCATE either table.

`JOBGUARD_COMMERCIAL_OUTBOUND=paused` independently disables claims in the worker
process. Only deployment configuration sets this value. `enabled` permits the
database check; it never clears a database pause. An absent value preserves the
existing fake-only worker behavior; invalid values fail closed. Migration 0474
preserves the existing enabled state on upgrade. Set `paused` explicitly before
restoring or starting a deployment that must not dispatch. Keep deployment mode
and all existing no-charge/settlement gates unchanged. This adds no live adapter.

The check runs on the locked, authorized outbox row before any attempt or status
change. A paused action remains queued, with its artifact, evidence and audit
history intact; resume still checks current authorization and expiry. A shared
state lock serializes claim commits with operator changes. Calls already claimed
or in flight when pause is requested cannot be recalled. Stop/drain workers and
reconcile unknown outcomes before resuming after an incident or restore. Do not
blindly retry unknown outcomes. Identity bootstrap messages and read-only
reconciliation are outside this commercial claim path.

Forward fix: keep deployment paused while applying a new migration. Do not drop
or rewrite the state/event history to roll back a safety control. Removing this
code requires an explicit operational decision; do not roll back only the schema.

Verification: unit tests exercise deployment precedence and fail-closed behavior;
`outbox.integration.test.ts` exercises two real operator logins, runtime privilege
refusal, preserved queue/evidence, exact replay and concurrent one-effect delivery.
PostgreSQL/catalog/upgrade suites must run in CI; the builder sandbox cannot start
PostgreSQL. Independent RED review is required before merge.
