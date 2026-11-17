# M3-1 offline server profile v1 — named partial

Status: synthetic server-contract and automated-test slice only. Aggregate M3-1 remains incomplete. This profile adds no route, provider, database writer, grant, native queue or authentication mechanism. Device, encryption, sync hosting and D08 approval are HELD. The issued check lane is AMBER, overriding the draft's RED label.

The foundation is the merged M0 command/auth contracts and the existing contractor operations. BUILD_PLAN §11.4's physical-device acceptance still applies to the aggregate task. This document is not D08 approval or real-data distribution authority.

## Executable envelope

All four object levels are strict: envelope, clientMetadata, hlc and body. Extra keys are refused, including authority fields. There is exactly one executable probe operation, note-only LogSiteExtra:

```json
{
  "version": "offline-intent.v1",
  "jobId": "10000000-0000-4000-8000-000000000001",
  "clientMetadata": {
    "capturedAt": "2000-01-01T00:00:00Z",
    "hlc": { "wallTimeMs": 0, "logical": 0, "nodeId": "fictional-crew" }
  },
  "body": {
    "version": "log-site-extra.v1",
    "commandId": "01960000-0000-7000-8000-000000000001",
    "note": "Fictional note",
    "description": "Fictional extra"
  }
}
```

jobId is a UUID selector, never authority. commandId must have UUIDv7 version and RFC variant bits; the client retains the same value on retry. The timestamp bits are client controlled and provide no trusted chronology or permission. No production UUID generator is introduced.

capturedAt is a valid UTC date-time string accepted by the existing Zod datetime convention. HLC wallTimeMs and logical are nonnegative safe integers, at most 9,007,199,254,740,991. nodeId is an opaque 1–100 character string containing a non-whitespace character. It is not an authenticated device identity. No ordering relation between capturedAt, UUID bits and HLC is required. Equal tuples, backwards clocks and far-ahead clocks grant no authority and select no winning business state.

The body reuses strict logSiteExtraV1: nonblank note, 1–5000 characters; nonblank description, 1–500 characters. Conversion preserves text and command identity exactly, without trimming. Conversion returns only `{ jobId, body }`. The existing application gets body.version; the repository adapter supplies only commandId, jobId, note and description. Client metadata is not forwarded or persisted by this probe.

Unknown envelope versions produce OfflineContractError OFFLINE_UNSUPPORTED_VERSION. Unknown string body versions/operations produce OFFLINE_UNSUPPORTED_OPERATION. Missing, malformed or additional fields produce OFFLINE_INVALID_INTENT. The public schema itself returns normal Zod validation failures; the parser supplies the closed typed errors. There is no version guessing, downgrade, arbitrary command passthrough or executor.

## Three operation classes

| Class | Meaning | Enabled here |
| --- | --- | --- |
| Allowlisted non-commercial field merge | Only an explicit field allowlist could permit last-writer-wins | Empty executable field-merge allowlist; no merger |
| Append-only facts | Preserve identity, actor and provenance; duplicates do not rewrite facts | Only note-only log-site-extra.v1 through existing server/repository paths |
| Validated state/financial commands | Require current server authority and applicable state, expected revision and exact approved Decision | Classification only; no execution via this transport |

Money, approvals, origin, evidence state and permissions have no merge path. Native uploads, evidence registration, priced extras, visit operations, invoice issue, commercial sends, payments, fee actions and all generic table writes are unsupported by this profile. State/financial operations can never become last-writer-wins or acquire refreshed approval from reconnecting.

## Server authority, order and replay

SiteExtraApplication resolves the server-selected persisted session using its unchanged boundary. Tenant/member/role/grant/environment fields cannot come from intent metadata. assignedJobs uses the merged minimal assigned-job projection; it includes job/order identifiers, reference, priority, issued/due dates and the caller's open visit ID. It exposes no money, resident, contact or address data. The repository tests use synthetic fixture memberships; the service tests use labelled session/repository doubles. Neither proves mobile authentication.

Transactions, locks, committed revisions/events and audit sequence establish server order. UUID/HLC order does not. The existing canonical request hash, command receipt and result remain authoritative; there is no second hash or offline receipt. Concurrent independent captures converge to the same semantic command-to-extra set with one effect per command. Server timestamps and audit ordering may differ between schedules.

Exact successful replay returns the stored first result, including after a later work-order revision. Changed significant input under the same identity conflicts; another accessible job under the same identity conflicts. Internally COMMAND_CONFLICT maps through existing siteExtraHttpFailure to HTTP 409 IDEMPOTENCY_CONFLICT. An identical successful retry is the probe's successful no-op, keeping identity without new effects.

Authority precedes lifecycle disclosure. Forbidden roles receive the identical HTTP 403 site-extra-error.v1 EXTRA_FORBIDDEN for unknown, foreign, not-live and live jobs. Permitted but out-of-scope work receives the existing NOT_FOUND. An authorized not-live job receives JOB_NOT_LIVE with no new receipt, scope, variation, origin, logged event or audit effect. Other refusals can retain the existing security-refusal audit.

## Stale intent and unknown outcomes

| Situation | Existing operation's behavior |
| --- | --- |
| New permitted note capture after the work order changes | Uses the server's current baseline provenance; v1 intentionally has no expected-revision field |
| Previously successful capture, unchanged request and current access | Returns the first result and original provenance, not today's state |
| Membership/grant revoked, expired or assignment lost | Rechecks current access for new work and replay; a receipt is not a permission token |
| Job no longer live | Existing authorized live-job guard refuses; clocks cannot reopen it |
| State/revision/price/approval-dependent command | Unsupported here; its owning command must validate current authority, expected state and exact approval, with explicit conflict/review as applicable |
| Response lost after commit | Outcome remains unknown to the caller; retry the same identity/request to recover the committed result |
| Failure before commit | Transaction rolls back; no partial successful capture or terminal receipt |

The profile never silently rebases, merges, reauthorizes or reports a queued operation as committed, sent or settled. Parsing proves shape only.

## Data classification and limits

| Category | Inclusion/exclusion |
| --- | --- |
| Fictional text | Synthetic note/description only in this probe; ordinary real text could contain personal data and is not approved here |
| Identifiers | Job/command IDs included as selectors; existing result identifiers are references, not credentials or authority |
| Client metadata | Advisory capture time and HLC included in the envelope, discarded by conversion; opaque nodeId is not a verified device |
| Credentials | Excluded from envelope, logs, fixtures and audit; existing session is supplied separately through its normal server boundary |
| Evidence | Bytes, object keys, upload state, hashes and resident confirmation excluded from this note-only profile |
| Financial data | Amounts, prices, settlement, entitlement and approval content excluded; no money write or commercial execution |

No retention period or offline access lease is selected. No deletion, remote-erasure, lost-device or revocation promise is added. D08 remains proposed. Existing RLS requires a correctly verified tenant context and does not authenticate PowerSync downloads or defeat a privileged connection.

## Versions, migration and compatibility

The new envelope is offline-intent.v1. The probe retains log-site-extra.v1, site-extra-logged.v1, site-assigned-jobs.v1, the existing extra-origin/event persistence formats and audit.v1. Old direct requests gain no required field; their existing UUID contract is unchanged. Unknown transport versions do not rewrite stored history. Transport observations are excluded from the business hash.

There is no PostgreSQL migration, new grant, column, routine or backfill. Reversion removes the pure module and additive export; it requires no stored-data deletion. Native/local schema migrations are HELD. Future native compatibility work must explicitly version local schema/events, validate pending intents without rewriting identity/content or approval, and refuse unsupported versions until supported; this slice implements no local migration engine.

## Evidence still owed

Physical supported iOS/Android development builds; exact Expo/native/adapter versions and build flags; encrypted SQLite/PowerSync compatibility; encrypted queue and restart recovery; actual native authorized read and queued-command round trip; mobile session exchange/refresh; download-rule isolation/revocation; approved sync processing/storage/log/backup route; dated D08 approval; G3 and the whole applicable LP real-data gate are all HELD. Expo Go or Node tests cannot supply this evidence. There is no unencrypted or global fallback. M3-2 and downstream native work cannot treat this partial as aggregate M3-1 acceptance.

## M3-4 DARK server upload slice (additive)

`POST /offline/uploads` accepts one strict `offline-upload.v1` per request, under the existing persisted synthetic session and allowed Origin. The server refuses all modes except `synthetic_demo`, including when the application is invoked directly. D08 and G3 remain held. This transport does not change the M3-1 envelope above.

The envelope contains `commandId`, `jobId`, `payloadHash`, `expectedRevision`, and `body`. `commandId` must equal the body's existing command ID. The SHA-256 is over UTF-8 `JSON.stringify({jobId, body})` after parsing the body with its strict versioned schema (schema declaration order, as implemented by `offlineUploadPayloadHash`). Hashes are integrity checks, never authorization. Credentials, clock metadata and tenant selectors are excluded. The expected revision must equal the command body's revision; append-only note captures explicitly use `null` and never merge fields.

The executable allowlist is `log-site-extra.v1` and `job-work-state-command.v1`. Uploads recheck current persisted access before dispatching the exact body through the existing owning application. Those commands retain their own transactional authority, durable command receipt, payload conflict, revision and immutable event checks. There is no second receipt or process-memory replay cache, and no table-write passthrough. A retry keeps the same command ID/body/hash; a changed payload under a committed ID conflicts. A command rejected before commit has no claimed successful receipt and can be re-reviewed. One failed item cannot hold unrelated requests behind a transport queue.

`offline-commercial-intent.v1` is a non-executable request for online review: command ID/revision, accepted quote version selector, authorization selector, action type (`send_quote`, `issue_invoice`, `place_order`), fictional recipient ending `.invalid`, content hash, bounded GBP pence and policy version. Read-only, tenant/job/member-scoped comparisons return explicit stale-revision, stale-price, accepted-version, expired/revoked-approval or authority-change conflicts. Even a matching grant returns `ONLINE_REVIEW_REQUIRED`. No offline request creates or renews approval, issues a document, sends, charges, allocates, reverses money or enters an outbound executor. Commercial intents remain in the client queue for a fresh online review using the owning flow; the server does not persist a second commercial queue. Changed recipients/content require renewed authority there.

The versioned response contains only command ID, state, a closed error code and `realExternalActions: 0`; it never includes a business projection, hidden data or arbitrary error text. `acknowledged/RECORDED` (HTTP 200) means the owning fact command committed or replayed its durable result. `conflict` (409) requires reconciliation/re-review, including locked-bill and completion conflicts. `rejected` (400, or 403 for current access refusal) is not an acknowledgment. `retryable/UNAVAILABLE` (503) preserves an unknown outcome: retry the exact identity, never infer sent/paid or mint another ID. Malformed envelopes are HTTP 400; mode/Origin refusals are 403. Responses use `Cache-Control: no-store`.

No migration, grant, stored format, dependency, provider, key or deployment is added. Native encrypted queue, retry/backoff, reinstall recovery, reconciliation UI, physical-device and browser evidence remain outside this server slice. PostgreSQL persistence/concurrency, cancellation lineage, isolation/revocation and commercial preflight regression tests are included for CI; local test doubles alone do not prove these database guarantees.
