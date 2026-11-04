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

## M5-11 expanded inventory and tenant exit (dark v2)

`privacy-command.v2` uses the same disabled-by-default route, independent database
name check, current persisted owner/admin session, tenant context, CSRF and Origin.
It preserves v1 for the original nine-class rehearsal. A v1 command cannot execute
a v2 request, or process an expanded/held inventory through the legacy path.
`open` also accepts `offboard`, anchored to a builder subject in the exiting tenant.
Offboarding requires the tenant controller's recorded instruction even for that
builder subject; all resident/client requests still require contractor instruction.

Before v2 `execute`, use action `review` with requestId, expectedRevision,
identityRef, authorityRef, retentionReviewRef and reviewHash (SHA-256 of the exact
external review record). References identify restricted owner-reviewed records of
subject identity verification, representative/controller authority, the scope of
release, third-party redactions and retention/legal-hold review. The authenticated
operator records them; they are not self-service identity proof or legal approval.
No contact details or review document content belongs in these fields.
The server stores actor/time and hashes the exact tenant-qualified subject and
artifact inventory. A changed subject, payload, hold, retention field or inventory
membership invalidates execution; open a fresh request and repeat instruction/review.
Review is recorded once and does not approve D07/D12 or invent a retention duration.
`instruct`, `review` and `execute` increment revision and bind idempotency to the
exact actor, version and payload. Current access is checked again before replay.

The following inventory covers every required data class. These are locations to
inventory before real activation, not claims that a live erasure adapter is present.
The executable rehearsal registers fictional entries in `app.privacy_artifact`,
with category, subject, optional hold_ref, retention_basis, retention_review_ref and
expiry_at. Record each original/version/replica separately; never hide multiple
unreviewed storage destinations behind one fictional entry.

| Class | Where to locate the data and its copies | Rehearsal disposition / owner review |
|---|---|---|
| source | Job/capture/diary/customer/supplier records in `app`; private evidence originals and object versions; import staging | Tombstone payload; data owner inventories subject/job/version links |
| derived | AI extraction/proposals, transcripts, previews, search indexes, generated quote/invoice/export documents | Tombstone and clear previous subject exports; derived immutable commercial snapshots follow accounting/legal class |
| observation | Imported observations, capture provenance, watchdog findings and shadow signals | Tombstone fictional payload; shadow disclosure requires the existing permanent fee-ineligibility path before any real release |
| model | `packages/ai` evaluation/input/output provenance; provider processing/log copies | Tombstone fictional payload; provider retention/training deletion evidence required; no model unlearning claim |
| log | API/worker/infrastructure monitoring, traces and provider logs | Redact fixture payload; operations owner reviews identifiers, redaction and expiry |
| cache | Web/API caches, search and sync projections, previously generated exports | Tombstone; all old exports cleared in the same tenant/subject scope |
| native | Encrypted SQLite/PowerSync replicas and device attachments, if deployed; browser offline stores | Pending device acknowledgement; remote offline erasure is not promised; revoke sync and purge on next verified connection |
| connector | Tenant provider connection credentials, consent and scheduled connector work | Disconnect fictional connector and cancel queued work; connector owner verifies revocation at the provider before a real claim |
| connector_copy | Merchant/bank/provider-hosted copies and downstream subprocessors | Pending controller/provider acknowledgement and retention review |
| backup | PostgreSQL snapshots/WAL, S3/MinIO versions/replicas, operational/provider backups | Pending verified expiry; restore must reapply tombstones/fences before access or execution |
| locked_evidence | Immutable object versions, Object Lock/legal holds and evidence references | Retain/restrict; evidence owner reviews expiry and legal basis; never shorten a lock |
| key | KMS/secrets/encrypted-store keys and restore dependencies | Pending dependency review; no key destruction while retained records/backups require decryption |
| accounting | Posted journals, payments/allocations, accepted commercial snapshots, obligations/fee statements and corrections | Retain/restrict under reviewed policy; reconcile existing obligations only; no new or retroactive pilot charge |
| legal | Audit/checkpoints, approvals, instructions, request receipts, holds, disputes and legal records | Retain/restrict with basis and owner review; no deletion of immutable audit history |
| queued_work | Durable action/outbox/worker schedules, including future recurring work | Cancel and fence fictional work; retain held bytes if necessary while stopping execution |
| inflight_work | Dispatch attempts, provider references, reconciliation records | Outcome unknown, pending reconciliation; no blind retries or claim of cancellation after provider acceptance |
| access_grant | Memberships, sessions, device/object URL grants, sync authorization | Revoke fictional grant and subject access even when underlying bytes are held |
| consent | Standing authorizations, connector consent and delegated authority | Revoke fictional consent; no new authorized work; retain held record only as restricted evidence |

For a complete deployed inventory the operations owner must enumerate actual
PostgreSQL catalogs (including identity/control-plane and worker exceptions), all
object versions, service destinations from the provider register, logs, backups and
device replicas, map every location to a class/subject and review missing mappings.
The migration-only rehearsal is **not** that deployed inventory: real adapters and
unmapped systems remain a release hold. Shared identity belongs to a person across
tenants: a real tenant exit must revoke tenant membership/sync/consent without
revoking another company's access or destroying shared keys. There is no native
client in this checkout; native cleanup remains a pending procedure.

`delete` affects only the request subject. `offboard` affects every fictional subject
and artifact in the selected tenant. Both fence access, cancel queued work, revoke
consent, disconnect connectors, mark in-flight work unknown, clear prior exports,
redact mutable data, preserve held/locked/legal/accounting records, and leave native,
provider copies, keys and backups pending. A database trigger fences new fictional
subjects/artifacts and active work after tenant exit; a revoked subject cannot get
new artifacts after deletion. Historical request receipts stay readable by current
authorized privacy operators. Existing fictional in-flight and financial references
remain available for reconciliation; this creates no fee or settlement fact.

`privacy-receipt.v2`, returned on execution and read, lists artifact IDs/categories
under completed actions, retention/hold exceptions and pending acknowledgement,
unknown-outcome or expiry handling. It includes review references, zero external
actions/new charges and explicit `backupsErased=false`, `offlineDevicesErased=false`.
`rehearsed_with_exceptions` never means fully erased or legally approved. A pending
expiry remains pending even if its date has passed: an owner must verify removal.
The immutable command receipt and audit hashes bind the result without copying raw
subject payloads into audit. Use the existing operations/request record to track
owner review and closure; no automatic completion based only on elapsed time.

M5-11 requires CI PostgreSQL fresh/upgrade, tenancy and LP-0 checks plus the
`dsar-offboarding.integration.test.ts` rehearsals, green CI and an exact-head
independent RED review. Live session/consent revocation, provider disconnection,
actual erasure, restore/native rehearsals and policy approval remain unimplemented
release gates. The feature flag cannot activate them.
