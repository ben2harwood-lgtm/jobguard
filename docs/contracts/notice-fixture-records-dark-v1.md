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
browser execution is claimed. Migration number 0865 is reserved for batch-22; the db index and later-empty-tables exports overlap other work.

## Session route and practice preview screen (M4-19 remains open)

The NOPR continuation adds `NoticeFixtureApplication`, a server-only composition,
GET/POST `/api/jobs/[id]/notice-fixtures`, and the practice page at the same job's
`notice-fixtures` path. The page uses the job ID as its one fixture notice ID;
GET also accepts an explicit noticeId for existing stored books. Existing records
and strict commands are unchanged. Session authentication, CSRF, trusted origin
on POST, current membership, tenant context and owner/admin read authority are
checked before repository access; command authority is rechecked by SQL. Other
environments return not-found and every response is no-store. Path/body job IDs
must agree. Tenant selectors are checked against session membership, never trusted
as authority. Tenant/actor/enablement fields in the command remain forbidden.

The server returns the exact persisted preview and unconditional real-notice gate
refusal. The client displays those bytes and retains an uncertain command's exact
body/ID in sessionStorage across reloads; new commands stay blocked until the same
command receives a definite response. Missing/unsupported facts are advice flags,
not stored revisions or approvals. Approvals target the displayed immutable
revision; later facts invalidate reuse. Each service assertion is separately
recorded, with the existing separate legal-assessment requirement. None is a real
notice or proof of service. No migration, grant, role, provider, outbox, timer or
financial path is added. No existing record is removed or rewritten.

Unit boundary checks run locally; the new real-PostgreSQL route integration suite
must prove persisted replay/conflict, stale approval refusal, role/session/tenant
refusals and unchanged outbox/queue state. The headless browser spec must run in
CI's mobile-360 and desktop projects to prove reload, uncertain retry, exact
preview/approval, distinct service facts and 44px targets without horizontal
scroll. CI must also run required repository checks and the Cloudflare bundle
boundary. These tests are written, not claimed as executed locally. An independent
exact-head RED review remains required. Professional review, D06 v2 templates,
generation, sending and gates G0–G5 stay closed; this does not finish M4-19.

LATER / SIMPLICITY (initial source review):
`packages/db/src/notice-fixture-repository.ts` repeats construction of the current
preview target during projection and decision creation. If this path grows,
returning that canonical target once with the repository view could reduce
repeated serialization and keep future consumers aligned. No change is needed
for this bounded screen; retaining the existing authority avoids a format change.
Shared export/registry overlap: serialize the workspace export line in
`apps/api/src/workspace/index.ts` and the route classification in
`packages/core/src/watchdog.ts` when the router catches up this older branch.
