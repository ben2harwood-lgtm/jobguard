# M4-19 durable notice fixture records — dark v1

RED: tenant isolation and legal-looking fixture records. This adds persistence to
construction-notices-dark-v1.md; it does not finish M4-19. Professional review,
D06 v2 templates, real generation/service and gates G0–G5 remain held.

`NoticeFixtureRepository.command(context, actor, raw)` accepts the strict
`notice.fixture-record-command.v1` envelope (commandId, jobId, noticeId, kind,
data). Kinds are revision, decision and service_event. Tenant and actor fields,
clocks and enablement flags are forbidden in the envelope. Revision data uses the
existing notice input schema minus tenant/job/notice identifiers. Decision data
contains id, noticeRevisionId, resolution and expiresAt; its exact canonical
preview and actor are supplied by the server. Service data uses the core event
schema minus version, environment, tenant/job and recordedAt.

The separately supplied actor is `{kind: 'human', sessionDigest}` from the caller's
session bridge, never from raw input. The SQL routine authenticates that synthetic
session and derives the active owner/admin membership on every command, including
replay and after lock waits. No route or application composition is registered.
Read takes a genuine VerifiedTenantContext, jobId and noticeId. Missing notice,
wrong job and foreign tenant produce the same NOT_FOUND. Read authority depends
on the trusted context constructor; RLS does not defend a compromised runtime
that can deliberately set another tenant's context.

One migration-owned, FORCE-RLS table stores one immutable row per command:
revision, decision or service event, canonical record bytes and SHA-256, exact
request, sequence, membership, synthetic label and watermark. Only the one routine
is runtime-executable; there are no runtime table grants. Notice and command locks
serialize append and replay. Reusing a command with different content/actor/scope
is a conflict. A new command cannot branch from an old revision. Reads rebuild
history, preview, decisions and individual service books from stored facts through
the existing core functions; hashes and ordered rows are checked before use.

An approval targets one exact revision/preview. Its identity may subsequently be
revoked or superseded by the same human; it cannot be reapproved or edited. Such
a resolution is a new immutable record. A later revision needs a new decision and
service book. Historical service books retain their original decision as historical
facts; the separate decisions projection carries subsequent revocation. Service
commands check the latest stored decision and current revision at server time.
Expiry is enforced again in SQL at append, including when a transaction waited.

Queued, provider_accepted, outcome_unknown, read and legally_served remain separate
synthetic assertions. The latter requires its separate legal assessment reference.
They are never a sent notice or actual proof of service. Every record/read carries
`synthetic` and CONSTRUCTION_NOTICE_WATERMARK. No real notice is generated, no
external action authorized, and no provider/outbox/worker or financial table is
written. The unconditional real-notice gate and literal false flag are unchanged.

The core remains the rule authority for fictional profiles, dates, preview and
service-state validation. SQL independently enforces durable identity, exact stored
bindings, expiration, hashes and append-only scope. This is fixture infrastructure,
not a production legal authorization or independent audit checkpoint. PostgreSQL
catalogue, RLS, concurrent revisions, privileges, upgrade and fixture persistence
need CI execution plus an independent exact-head RED review. No local database or
browser execution is claimed. Migration number 0754 is reserved and is renumbered
at landing; the db index and later-empty-tables exports overlap other work.
