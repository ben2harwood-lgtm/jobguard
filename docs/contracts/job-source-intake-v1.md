# Job source intake v1 — pure build-ahead contract

SV7A-INT-C, issued 23 October 2026 under decision 74. This additive contract supplies no executable intake, storage, worker, site activity, customer or meter authority. C1: pure core; no web journey. Parent SV-3/CH-4 and later MON-1/17-October integration gates remain held.

## Existing request bodies

`classifyJobSourceIntake(kind, input)` takes `diary` with the unchanged strict `diaryInputV1` (`job-diary-input.v1`), or `customer_message` with unchanged strict `customerMessageInputV1` (`customer-message-input.v1`). Unknown kinds, mismatched versions, invalid inputs and extra keys throw `JobSourceIntakeError("INVALID_JOB_SOURCE_INPUT")`. No request schema or GET version is replaced.

Both bodies contain `commandId` and exact reviewed `text`. Diary also contains `entryMode: typed | dictated_text` and boolean `onSite`; dictated text is reviewed text only, never audio. Message also contains `fictionalCustomer: { kind: named_fictional_customer, name }`. Fictional names or roles confer no authenticated tester/customer identity. The existing fictional-name metadata validation is unchanged.

Reviewed text remains byte-for-byte unchanged: no trim, normalization, Unicode replacement or newline rewriting. Blank text, NUL and unpaired surrogates fail; the existing limit is 8,000 UTF-16 code units. Valid Unicode under this limit occupies at most 24,000 UTF-8 bytes and therefore cannot exceed the existing 32,000-byte ceiling. No filename, stamp, caller hash or object version can override either limit; these are not accepted request fields. Server storage still must verify actual bytes and hashes.

## Receipt

`jobSourceIntakeReceiptV1` is a strict union discriminated by `sourceKind`, inferred as `JobSourceIntakeReceipt`. Common fields:

| Field | Value |
| --- | --- |
| `version` | `job-source-intake-receipt.v1` |
| `jobId` | UUID |
| `environment` | `synthetic_demo` |
| `realExternalActions` | `0` |
| `sourceKind` | `diary` or `customer_message` |
| `record` | Corresponding unchanged `diaryEntryV1` or `customerMessageV1` |

Diary receipts additionally require exact `notice: JOB_DIARY_NOTICE` and `noticeVersion: JOB_DIARY_NOTICE_VERSION` from `job-sources.ts`:

> Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.

Notice version is `job-diary-notice.v1`. Message receipts carry no notice. Each immutable record preserves its source/command IDs, exact text, authenticated `actualTesterMembershipId`, and existing `jobSourceEvidenceV1` (evidence ID, immutable object version, SHA-256 and original server receive time, including microseconds). Parsing freezes the receipt and existing nested record/evidence schemas; it does not establish authenticity or finalization. A later server writer must supply verified persisted facts after current authorization checks. The schema does not manufacture records or receive times.

Unknown properties are rejected at every schema object boundary. There are no hidden detection counts/status, fees, processing flags, approvals, client timestamps or caller authority fields. Existing records explicitly contain server evidence metadata; requests cannot supply it. Parsing never spreads unexpected caller/source properties into output.

## Pure classification

| Input | `evidenceKind` | `observationKind` | `onSiteDiary` |
| --- | --- | --- | --- |
| On-site diary | `job_diary_text` | `note_or_voice` | `true` |
| Off-site diary | `job_diary_text` | `note_or_voice` | `false` |
| Customer message | `customer_message_text` | `customer_request` | `false` |

These are the only classification fields. On-site diary alone can request the later checked CH-4 source adapter. This boolean proves neither physical location nor current permission, work state, eligibility, activity interval, capacity admission or charge. Off-site diary and messages remain evidence without requesting site activity. No CH-4 algorithm or new source variant is installed here.

## Failures and trust boundary

`JobSourceIntakeError` has `name: JobSourceIntakeError`, a stable typed `code`, and `message` equal to that code. Supported codes are `INVALID_JOB_SOURCE_INPUT`, `JOB_SOURCE_FORBIDDEN`, `SYNTHETIC_MODE_REQUIRED`, `IDEMPOTENCY_CONFLICT`, `SOURCE_NOT_FINALIZED`, `JOB_SOURCE_UNAVAILABLE`. The pure classifier emits only the first; other codes are vocabulary for later checked integration. Errors contain no submitted text, raw SQL, provider exceptions or hidden state. Existing CH-4/MON-1 lifecycle/admission errors must propagate through their own checked contracts, including `linkedJobOfferV1` and its exact copy; this module neither wraps nor invents those errors.

No database, network, platform/provider import, write, queue, permission check, payment or hidden-shadow access occurs here. Shape validity grants no authority. Server-selected mode, authenticated ownership, tenant/job binding, durable idempotency, finalized original bytes, server-derived actor/time/hash/version and atomic lifecycle admission remain responsibilities of held runtime leaves. The coordinator alone adds public barrel exports and later routing/worker composition. Acceptance of these pure tests cannot close SV-7A, Test O or DEMO-S.
