# Restore runbook — M0-13b (RED)

The deployed rehearsal has not happened. The disposable synthetic rehearsal is
fixture evidence only; it does not satisfy the deployed M0-13b acceptance gate.
D07 recovery objectives remain subject to approval. No RPO/RTO numbers, release,
real-data processing or live execution are authorized here; G0–G5 stay closed.

## Prepare an isolated recovery target

Record incident/rehearsal ID: ______; operator: ______; independent operator: ______;
D07 version/approval and objectives: ______; approved region/provider: ______;
source backup ID, capture time and manifest/hash: ______; restore target: ______.
Use the deployed provider's reviewed backup/restore procedure and compatible
PostgreSQL version, roles, extensions and encryption-key access. Record that
procedure/version: ______. Do not treat a running data-directory copy as a backup.
For the disposable cold-copy example only, see
[synthetic-restore-rehearsal.md](synthetic-restore-rehearsal.md).

Before restoring, isolate the target from external providers and public traffic;
stop all workers, schedules and other dispatch processes. Set
`JOBGUARD_COMMERCIAL_OUTBOUND=paused` in every target process before startup.
Keep provider egress blocked and credentials disabled while verifying the restore.
An inherited database pause state is not sufficient: the source may be enabled.
Do not start runtime processes until the database pause below commits. If any step
fails, retain isolation and the pause; preserve evidence for a forward fix.

## Restore and verify while execution is disabled

1. Restore the database from the selected actual backup, including migrations,
   roles, grants, policies, audit/outbox histories, authorization records and
   idempotency keys. Preserve the original backup and manifest unchanged. With an
   independently provisioned human operator login, inspect
   `outbound_control.state` and invoke `outbound_control.command` with a fresh UUID,
   operation `pause` and its current revision. Record command/revision: ______.
   Verify `claims_enabled()` is false as the runtime role before starting it.
   The copied control state is intentionally changed by this audited pause; business
   row hashes must still match the selected backup's expected contents.
2. Restore evidence originals and all referenced immutable object versions, including
   keys, version IDs, content types, byte lengths and server-verified SHA-256 values.
   Use the approved object-store recovery procedure: ______. Never substitute the
   latest object or a preview for a referenced version. Record missing versions and
   hash mismatches: ______. Preserve retention/legal-hold controls under approved
   policy; do not invent a retention period or remove originals to resolve mismatch.
3. Recover checkpoint references from the independently restricted checkpoint store:
   location/access owner: ______; checkpoint ID, tenant, sequence and head hash:
   ______. Verify each restored audit chain against that trusted checkpoint and
   investigate truncation or mismatches. A checkpoint copied only with the database
   is not independent evidence against a privileged rewrite. Preserve restricted
   access; do not grant the business runtime access to checkpoint administration.
4. Run deployed catalog/RLS and tenant isolation checks with the actual non-owner,
   non-superuser, non-BYPASSRLS runtime role. Verify unscoped queries fail closed,
   another fictional tenant cannot retrieve evidence, and representative evidence
   bytes and approved invoice/document hashes match their immutable references.
   Record test commands, versions, results and artifact references: ______.

## Reconcile before resume

Keep deployment pause and isolation in place. Inventory every execution path
(outbox sends, contractor deliveries, subscription/fee actions and schedules),
including attempts committed after the backup, in-flight claims and unknown
outcomes. Compare durable action IDs, provider effect/idempotency keys, attempt
history, provider references and authoritative provider records through approved
read-only reconciliation. A backup may predate an external effect; a pending row
alone is never permission to replay it. Keep unresolved outcomes held, without
blind retry. Never reset completed actions to pending or erase idempotency history.
Use each path's existing authorized reconciliation/compensation command; a reversal
is a new linked fact, not permission to resend or recharge. Recheck current
membership, exact approval, expiry, artifact hash and revision before any new claim.

Retain a restricted reconciliation receipt with backup/target IDs, the inventories,
known completed effects, unknowns held, reconciliation commands/results and verifier
sign-off. Receipt UUID/location/hash: ______. Do not put customer content in the
control-plane reference table. The recorded fact is an operator attestation; it
cannot establish that a provider outcome is correct by itself.

Operator A requests resume against the current paused revision; then records the
receipt UUID for that exact request with
`outbound_control.record_reconciliation(request_uuid, receipt_uuid)`. Operator B,
a different person/login from the pauser and requester, inspects the receipt and
approves that exact request/revision using `approve_resume`. See
[commercial-outbound-pause.md](commercial-outbound-pause.md) for SQL. A later pause
invalidates the request and its reconciliation fact; reconcile again for the new
request. Runtime callers cannot record facts or approve resume.

Only after verification, reconciliation and independent approval may authorized
operators separately clear the deployment pause and restore approved routing.
For this task, run only fake adapters in isolation; no deployed/live resume is
being performed. Check completed fake sends remain completed without replay;
unknown fake work stays held and repeated pending dispatch produces one fake effect.

## Measurements and acceptance — blank until the deployed rehearsal

Backup capture time: ______; latest recovered committed fact time: ______;
measured data loss and method: ______; recovery start: ______;
database ready: ______; evidence/checkpoints verified: ______;
reconciliation finished: ______; safe recovery complete: ______;
elapsed recovery and method: ______; comparison to approved D07 objectives: ______;
remaining failures: ______; independent RED reviewer/exact head: ______;
operational acceptance owner/date: ______. Do not fill these from fixture timings.
