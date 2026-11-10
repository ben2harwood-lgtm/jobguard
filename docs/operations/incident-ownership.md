# M0-13a incident ownership — synthetic preparation

Nothing is deployed. The catalogue is `config/ops-alerts.v1.json`; its strict
validator and fake sink live in `packages/config/src/ops-alerts.ts`. No delivery,
pager, schedule, live monitoring subscription or role holder is installed.
Roles below are responsibilities to assign, not named people or appointments.
The incident commander coordinates escalation to the founder and data/security
owner; those people and their contact/coverage arrangements remain unassigned.

## Queue failure

QUEUE_OPERATOR owns exhausted delivery attempts (`outbox.failure` in
`packages/db/src/outbox.ts`). Inspect durable attempts through authorized tooling;
pause outbound if needed, preserve audit/evidence, fix the cause and revalidate
current approval before an authorized retry. Never delete failed work to clear an
alert. Escalate repeated failures to INCIDENT_COMMANDER.

## Unknown send

INCIDENT_COMMANDER owns `outbox.unknown_outcome` from the same executor, including
stale claims. Pause/drain as described in [outbound pause](commercial-outbound-pause.md).
Reconcile the provider effect identity through the approved read path before any
retry. A timeout does not mean unsent; preserve original artifacts and audit.

## Backup failure

BACKUP_OPERATOR owns failed backup execution or manifest verification. The current
synthetic signal source is the unsuccessful operation/verification boundary in
`packages/db/tools/synthetic-restore.mjs`. Preserve the failed receipt and last
known-good backup; investigate permissions, space and manifest mismatch; rerun a
restore rehearsal in isolation. Never label a failed backup recoverable. Escalate
to INCIDENT_COMMANDER and founder before allowing real-data use.

## Unauthorized route

SECURITY_OPERATOR owns refused provider route attempts. The current synthetic
source is configuration rejection in `packages/ai/src/claude-provider.ts`.
Keep the route disabled; inspect configuration through authorized, redacted tools.
No global fallback. Seek actual D04 provider/region evidence; escalate repeated
attempts to INCIDENT_COMMANDER and the data/security owner.

## Storage verification error

STORAGE_OPERATOR owns original verification rejection in
`packages/db/src/evidence.ts`. Keep the original quarantined/rejected; inspect
exact version, hash, bytes and content type with authorized tooling. Do not
promote pending evidence or overwrite originals to clear an alert. Escalate
repeated failures to INCIDENT_COMMANDER and pause affected downstream actions.

## Wiring and verification boundary

Outbox telemetry can be injected into `FakeOpsSink.outboxTelemetry()`. For the
other three classes, `observeOpsFailure` wraps a synthetic operation, emits only
a closed signal label on failure, and rethrows the original failure. These are
fake harness adapters, not production instrumentation. Real backup scheduling,
route refusal and storage rejection delivery wiring must be chosen and verified
with the actual runtime and sink before a pilot. No arbitrary error message,
subject, recipient, source content or credential enters this fake sink.

`node tools/provider-register.mjs` checks the source-bound destination index.
`node tools/deployment-preflight.mjs <build-output-folder>` scans every regular
file (including source maps) for common secret signatures and configured secret
values. It refuses symlinks, an absent/empty folder, and every non-loopback DB.
Use only a disposable local migrated database with two populated fictional
account tenants. Supply `PREFLIGHT_DATABASE_URL` using literal `127.0.0.1` or
`[::1]` (no query parameters), `PREFLIGHT_TENANT_A`, and `PREFLIGHT_TENANT_B` in
the environment, never command-line credentials.

Preflight runs the existing LP-0 catalogue comparator against the supplied
connection, verifies non-owner/non-superuser/non-bypass runtime posture, checks
M0-4 read isolation with both fictional tenants and cleared context, and runs the
existing full tenancy suite on its own disposable database. It never migrates or
seeds the supplied database. The integration test supplies its own local fixture
when no URL is provided, and proves owner refusal. All runners use one worker.
A secret scan cannot establish absence of every possible secret; review remains
required. No repository/log scanning or deployed-result claim is supplied here.

## Still open for people

Choose and run real alert delivery and a pager; appoint people to these roles and
agree coverage/escalation; real UK deployment, TLS and secret provisioning remain
founder-reserved. Running preflight on a deployed database needs its own explicit
allowance and reviewed removal of this version's local-only restriction. D04 and
all provider/residency, legal, security and G0–G5 release gates remain open/closed
as before. Nothing here supplies approval or enables real data, sends or money.
Database/browser suites cannot run in the builder sandbox and must run in CI.
