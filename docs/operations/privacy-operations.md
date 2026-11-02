# M0-13c privacy operations and retention policy

Policy: `privacy_rehearsal_v1`. Status: synthetic reference procedure, not D07 or D12 approval.
D07 `pilot_data_operations_policy_v1` and D12 `third_party_data_protection_policy_v4`
remain proposed. No retention duration, lawful basis, WORM setting, legal hold or
real-data activation is approved by this change. No deployed-backup rehearsal was run.

## Dark route and authority

`JOBGUARD_PRIVACY_REHEARSAL_ENABLED` defaults to `false`. Both that flag exactly
`true` and server `JOBGUARD_ENV=synthetic_demo` are required. SQL independently
requires database `jobguard_synthetic_demo`, a current persisted synthetic identity
session and active owner/admin membership in the selected company. Practice cookies
alone cannot execute this route. Membership/session revocation blocks the next read,
instruction, execution and replay. Use the existing identity/session revocation path
for real authentication; rehearsal access grants below are fictional inventory only.

POST `/privacy-rehearsal/commands` accepts strict `privacy-command.v1`: commandId,
action `open` (subjectId, operation access/export/delete), `instruct` (requestId,
expectedRevision, instructionRef, instructionHash), or `execute` (requestId,
expectedRevision). POST `/privacy-rehearsal/read` accepts `privacy-query.v1` and
requestId. Both require the normal signed-in session cookie, selected company header,
CSRF token and allowed Origin; responses are no-store. There is no public intake,
provider call, delivery link, email, deployment or background job.

Only operator/test setup can populate the isolated `privacy_subject` and
`privacy_artifact` rehearsal inventory. Never put real people or records there.
The route cannot discover or mutate actual job, shadow, evidence, money, session,
object-store or backup records. It proves a durable synthetic procedure; it does not
claim that an operational deletion adapter exists for the full live schema.

## Controller routing and instruction

A server-registered resident or client subject creates an `awaiting_instruction`
request addressed to the subject's tenant contractor as controller. The requesting
operator gives that controller the request ID through its authorized process; this
route sends nothing. Merely opening a request exposes no artifact content and starts
no export, deletion or work cancellation. An active owner/admin of that contractor
must record the documented instruction reference and SHA-256 before execution. The
record binds that reference/hash, actor and server time to the immutable request
subject and operation. It cannot be replaced or transferred to another request.
An unrelated tenant cannot inspect or instruct it. D12 assigns JobGuard's own builder
account requests to JobGuard as controller; these are ready for its authorized
operator without a contractor instruction. All execution remains synthetic.

For real requests, separately verify identity, controller authority, scope, legal
exceptions and other people's data before recording an instruction or releasing an
export. A hash identifies the instruction; it does not establish the signer's legal
authority. Data/legal owner review and D07/D12 approval remain prerequisites.

## Retention and rehearsal disposition

| Class | Access/export rehearsal | Deletion rehearsal | Real-data gate |
|---|---|---|---|
| Source (text/media originals and versions) | Include fixture content | Tombstone fixture payload | Version-specific storage inventory and approved deletion period |
| Derived (transcripts, previews, indexes, caches, prior exports) | Include fixture content | Tombstone; clear every prior export for this subject | All derivatives/replicas inventoried before erasure claim |
| Accounting and legal | Include authorized fixture content | Retain without alteration | Document lawful basis, minimum fields, restriction and reviewed expiry; no invented duration |
| Logs | Include scoped fixture log | Redact fixture payload | Locate logs/subprocessors; enforce redaction and approved expiry |
| Backups | No raw backup export | Retain, explicitly `backupsErased=false` | Approved expiry and isolated restore reconciliation; never promise immediate erasure |
| Queued work | Excluded from subject export | Cancel and clear fixture payload | Fence dispatch before removing source data |
| In-flight work | Excluded from subject export | Mark outcome unknown; retain reconciliation reference | Reconcile accepted external work; no blind retry or erasure of execution history |
| Access grants | Excluded from subject export | Revoke fixture grant; mark subject revoked | Existing identity/session revocation plus object URLs and sync projections must be verified |

Retained records are restricted to the controller's authorized operator in the
rehearsal. No runtime table SELECT/INSERT/UPDATE/DELETE is granted. Command history
and audit hold IDs/hashes and result metadata, never exported contact/content data.
Deletion is a tombstone operation, not removal of immutable commercial history.
Existing exports are cleared atomically with source/derived tombstones. Retained
accounting, legal and in-flight references remain; the result says `rehearsed`, not
that the person is erased from all systems.

## Operational procedure and remaining release gates

1. Register the request and verify identity without adding contact details to audit.
   For residents/clients route to the contractor controller; wait for its instruction.
2. Inventory subject-linked source/derived objects, versions, logs, caches, providers,
   exports and work. Review legal/accounting retention and any hold with the owner.
   Unknown systems or durations block completion; do not silently omit them.
3. Fence access and queued work, reconcile in-flight outcomes, then apply the approved
   disposition. Use tenant-qualified identities throughout. Export only to the
   verified recipient after reviewing third-party/hidden material. Before real
   shadow disclosure, the existing disclosure path must permanently mark the signal
   fee-ineligible; this rehearsal never reads hidden data or bypasses that control.
4. Record scoped results and exceptions, including retained classes and backup expiry.
   Never claim backup erasure until expiry has been verified. Keep a restricted
   deletion/tombstone register so a restore re-applies requests before access or
   outbound execution resumes. Restore must first have external execution disabled.
5. D07/D12 approvals, production adapters for every inventory class, independent RED
   review, green PostgreSQL catalog/isolation/upgrade suites, and an operator rehearsal
   are required before real activation. A rehearsal using real deployed backups and
   all deployment decisions remain Ben's call and are excluded from this piece.

The executable CI rehearsal uses two made-up tenants, validates instruction holds,
cross-tenant reads/writes, source/derived redaction, prior-export clearing, retention,
work cancellation, access fencing, conflicts, concurrent replay and revocation.
