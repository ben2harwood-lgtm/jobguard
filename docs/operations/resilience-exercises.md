# M5-10 synthetic resilience exercises

This wrapper improves the M0-13b cold-restore baseline; it does not replace it.
It is AMBER fixture tooling. It authorizes no release: G0–G5 stay closed.
Only made-up disposable local fixtures and fake adapters are used. No supplied
DB URL is opened, including a local one; non-local URLs are explicitly refused.
No application credentials, real customer data, live provider or paid call is used.

## Run and retain evidence

With the pinned Node/pnpm and installed dependencies, build the existing packages:

```sh
pnpm turbo run build --filter=@jobguard/db...
```

Create an options JSON file outside the repository, for example:

```json
{
  "version": "resilience-exercises.v1",
  "runs": 3,
  "outputDirectory": "/tmp/jobguard-resilience-receipts"
}
```

```sh
node packages/db/tools/resilience-exercises.mjs /tmp/resilience-options.json
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/resilience-exercises.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/resilience-exercises.integration.test.ts test/restore-rehearsal.integration.test.ts
```

Runs are sequential. Each uses a new disposable PostgreSQL cluster and fixture
identity and writes a separate `jobguard-resilience-exercise-receipt.v1` JSON file,
with `synthetic: true`, unique run ID and actual recording time. Files use exclusive
creation; earlier receipts are never overwritten. A failed baseline aborts the
batch; prior completed receipts remain available. Do not interpret an incomplete
batch as three completed runs. The wrapper prints the receipt paths on completion.
Retain receipts in the existing exercise/incident evidence store under its access
and retention policy; do not commit disposable credentials or key material.

## Measurement boundary

Database, DB-backed evidence versions and local audit checkpoint recovery times
are measured with a monotonic clock from the start of copying the cold backup to
the restored cluster through each dependency's verification. These are cumulative
recovery times, not individual operation durations. All-row hashes/counts, exact
object bytes/version/hash and the recorded audit checkpoint are compared with the
quiescent source. Data-loss windows are zero **only for that stopped snapshot**:
there are no source writes after backup. This does not measure a production RPO,
an ongoing outage, a missing deployed backup or post-backup write loss.

Fake keys and fake provider state are separate disposable JSON fixtures. Their
recovery times run from copying the fixture backup through key hash verification
and provider reconciliation respectively; the source is quiescent, with zero loss.
Their clocks are independent of the PostgreSQL restore clock. No key bytes appear
in the receipt. A fake send and fake collection actually execute once before the
fixture snapshot. Its local execution ledger deliberately records unknown outcomes;
restore reads the independent fake provider's executed/settled facts, reconciles,
and tries repeated dispatch. Both effect counters must remain one. Unknown or
missing facts refuse replay. These are adapter fixtures, **not** real payment
collection, key-vault recovery or provider integration evidence.

The nested unmodified baseline checks additionally prove that an executed outbox
send is not resent, the unknown action stays held, the pending fake action executes
once, and an existing manual receipt cannot be recorded twice. Restored dispatch
is paused before runtime connects, fixture reconciliation precedes a fixture-only
two-operator resume, and the run finishes paused. Fixture operators imitate no
human approval and do not authorize deployed resumption.

Sync and external audit anchors explicitly say `not exercised` with reasons.
The local checkpoint is not an external timestamp. The nested baseline's `notRun`
list also names deployed backups, MinIO/S3 versions, real operators and other gaps.
A successful synthetic check is not an operational recovery pass.

## Objectives file

Without an objectives file, or with `approval: null`, the result says exactly
`no approved objective`; it never passes. Optional `objectivesFile` points to a
JSON document with version `resilience-objectives.v1`, `approval` and `dependencies`.
`approval` is null until people supply actual D07 decision evidence. Only an
existing approved decision may supply `decisionReference`, `approvedBy` and an
ISO `approvedAt`; this tool merely records supplied evidence, it does not verify
or grant approval. Never fabricate those fields to obtain a pass.

Each dependency limit contains nonnegative finite `recoveryMilliseconds` and
`dataLossMilliseconds`. Allowed dependency names are `database`, `evidenceVersions`,
`auditCheckpoint`, `fakeKeys`, `fakeProvider`, `sync`, `externalAuditAnchors`.
Missing limits say `no approved objective`; unavailable measurements say
`not exercised`; breached limits say `objective missed`. All dependencies would
have to be exercised and within supplied limits to report `within synthetic
objective`. Production recovery remains unestablished in every receipt.

## Owner roles and escalation (assignments remain open)

| Role | Responsibility and escalation |
| --- | --- |
| Exercise lead / incident commander | Arrange people, schedule, record exact code and receipt paths; stop on any unexpected external connection or effect. Escalate incomplete runs and unresolved defects to the service owner. |
| Database recovery operator | Use approved least-privilege backup/restore access and recovery material from the restricted recovery store. Escalate hash, role, region, journal or audit failures to the incident commander and security owner. |
| Evidence and key custodian | Verify version-specific evidence and accessible restricted recovery material; escalate unavailable keys or bytes to the security owner. No real credentials are needed for this fixture. |
| Provider reconciliation operator | Keep execution dark; reconcile unknown sends and collections with authoritative provider records in a separately approved real exercise. Escalate uncertainty to the finance/service owner; never retry blindly. |
| Independent resumption approver | Verify reconciliation and current authorization before any deployed unpause. Fixture operators are not this person. |
| Service owner / D07 decision owner | Supply approved objectives, assign people and resolve remediation/release decisions; consult security/commercial owners where affected. |

For a real incident, use the contact/escalation directory and restricted recovery
store referenced by [restore runbook](restore-runbook.md), together with
[commercial outbound pause](commercial-outbound-pause.md). People must confirm
contact accessibility and least-privilege recovery credentials before a deployed
exercise; this document does not claim those checks happened. Never put secrets
in receipts or defects. On any duplicate effect or integrity failure, keep
execution paused and escalate; no automatic remediation or unpause is provided.

## Defects and remediation

This table is intentionally blank pending observed exercises. Add actual receipt
references, observations, accountable roles and human remediation decisions only.

| Receipt / run | Observed defect | Owner role | Escalation | Remediation decision / evidence | Retest evidence |
| --- | --- | --- | --- | --- | --- |

## Still open for people

M5-10 remains open: D07 objectives and approval; real failover and restoration
from deployed backups; real evidence storage, key and provider recovery; sync and
external anchors; people performing operational exercises and independent
resumption; defect triage and remediation decisions. No owner assignment, legal
approval, provider result or human exercise is implied by this build. No migration
or production behavior changes are introduced.
