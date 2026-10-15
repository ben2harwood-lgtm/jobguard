# SV-7A synthetic job sources — independent storage/read slice

Issued 13 October 2026, lane AMBER, migration `0164_job_sources.sql`. Catch-up
base `origin/main` is `6671538c8d69936c162368c760dd6ce0f7f10493`, including
merged CH-4/0144. The old 0149 allocation and build-ahead base are superseded.
CH-4 still has no diary source key or checked diary adapter; that integration
requires a coordinator-owned prerequisite and Q3's authority ruling.

`BUILD_PLAN.md` §§4 C3, 8 CH-2, 10.2.1–10.2.11, 10 SV-7/CH-4 and
12.1/12.3 govern this slice. The diary and customer-message schemas are strict,
versioned contracts only. Schema validity grants no mutation authority. Reviewed
fictional text may be typed or dictated text: no raw audio, microphone, provider
call or live-model inference is implemented. Text is nonblank, contains no NUL,
and is at most 8,000 UTF-16 code units / 32,000 UTF-8 bytes. Unpaired Unicode
surrogates are refused so UTF-8 encoding cannot replace submitted characters. Originals preserve
exact bytes without trimming, normalization or paraphrase.

Every diary read contains exactly:

> Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.

Notice version: `job-diary-notice.v1`. No per-note suggestion, fee hint, signal
count or detection status appears. The on-site field is an assertion, not verified
location. Saving evidence never creates scope or commercial authority.

## Holds and adopted answers

BEN-ANSWERS-20261013.md, card
`jobguard-twenty-product-decisions-2026-10-13`, answer 20 (SV-7A Q4):

> Allow named fictional roles; record who actually acted.

Read records label `fictionalCustomer.kind = named_fictional_customer`, preserve
the character name separately, and include `actualTesterMembershipId` from the
immutable actor reference. A fictional name is metadata: it establishes no
authentication, customer approval or permission. Privileged labelled fixture
storage/read evidence demonstrates this principle only. Customer-message session
binding, provisioning, authentication and exact intake permissions remain held.
No customer-message creation function, grant, repository method or POST exists.

Answer 1 (SV-7A Q8), same source/card:

> Keep real use off until those promises are approved.

The application and transports require server-selected `synthetic_demo`. These
answers approve no retention, lawful basis, Article 14, safety threshold, provider,
commercial or release promise. Real customer information stays OFF. Connectors,
fees and spending remain disabled.

Q3 holds post-lock off-site diary permission. The intake contract accepts both
on-site and off-site records; exposing it requires answering that policy for
locked jobs. CH-4/0144 provides private existing-source triggers, not an issued
diary adapter or a diary execution contract. Therefore this slice holds the
whole executable diary routine/transport and all dependent intake acceptance.
It adds no blanket post-lock ban, refusal or new activity classification. The
CH-4 event linkage, on-site event creation and new-site-work redirect execution
remain unbuilt here. Existing CH-4 source paths and 422 mapping stay unchanged.
UI/pages, dictation controls, full Test O and customer portal remain outstanding.

## Persistence and authority

`app.job_diary_entry`, `app.customer_message_source`, `app.job_source_original`
are append-only, migration-owned, tenant/job-qualified and ENABLE/FORCE RLS.
Runtime receives SELECT only; all other business-role grants are revoked.
Originals are a private synthetic byte adapter, not live S3. Their evidence tuple
binds tenant/job/id/version/hash/original receive time. A deferred constraint
checks reverse source identity, actor/receipt identity, finalized verified text
upload and evidence, null scope, concrete object key, byte length and MIME.
Private BEFORE INSERT integrity checks require the synthetic small-builder track,
active stored actor for source rows and CH-2 live locking. These guards are
constraint protection for fixture storage; they expose no source-creation authority.
No event, ledger, approval, meter or commercial send is produced.

Installed read signature:

```sql
app.read_job_sources(t uuid, j uuid, digest text, source text) RETURNS jsonb
```

SECURITY DEFINER, owned by `jobguard_migration`, search path `pg_catalog`, PUBLIC
revoked; runtime EXECUTE only. It rechecks `app.authenticate_practice_session`,
transaction tenant, unchanged practice ownership/adoption semantics and synthetic
small-builder track itself. It accepts `diary` or `customer_message` after
authority checks. Reads survive exit from live. Genuine `PracticeAccess.job()`
contexts pass whole per call into `withTenant`; no new context constructor or
principal container exists. RLS does not prove a compromised application's
tenant selector safe. Authentication/membership/source boundaries still matter.

GET `/jobs/:id/diary` and `/jobs/:id/customer-messages` plus matching Next
`/api/jobs/[id]/...` routes use shared workspace/application methods, no-store
responses, strict query schemas and typed failures. POST is absent. No mutation
registry key is added while execution is held; future authorized keys must be
`watchdog_live_only`. No shared guard or command harness changes.

## Worker observations

The existing `ShadowObservationReader` retains its live/generated, terms-check
seam, lock/import restrictions, capture reads and existing decoders. An additive
runtime-RLS reader validates exact original/evidence/upload/source bindings,
verified state, invalidation and server SHA-256 before decoding. Diary maps to
`note_or_voice`, message to `customer_request` under unchanged `observation.v1`.
Evidence/version identities deduplicate existing/new scans. All source timestamps
use six-digit database UTC text without Date roundtrips.

Only exact fictional `Fitted outside tap.` / `job-source:outside-tap.v1` and
`Please fit an outside tap.` / `job-source:request-tap.v1` originals decode.
Facts are labelled synthetic adapter facts with unknown price, job-wide scope
and exact full-text citations. Edited/unknown text remains saved and unprocessed.
These records convey no verified customer instruction or financial authority.
The worker alone gates accepted terms and proposes/persists held signals using
its existing shadow sink. Builder reads never query shadow or run/enqueue
detection. Existing must-surface behavior, scheduling and composition are unchanged.
Fixture source-to-observation/sink proofs are not the held real diary-intake
Test O source segment and do not complete full Test O.

## Upgrade contract (verbatim)

An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

The unchanged upgrade utilities compare canonical `row_to_json(t)::text`, named
full types and original primary-key identities. Controls cover a microsecond
change, retype, added nullable column/function replacement and a later insert.
No history backfill. On failure disable read entrypoints and use a reviewed
forward-fix migration; preserve committed originals and history. Q2 catalogue
coverage is coordinator-owned and blocks mandatory acceptance. Independent
exact-commit verdict, separate acceptance and release gates remain required.
