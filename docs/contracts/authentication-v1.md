# Authentication contract v1 (M0-6 scaffold)

Status: **synthetic scaffold; no live identity or email provider**.

`AuthProvider` is the provider-neutral boundary used by the API. The included
`MemoryAuthProvider` is deterministic test/development infrastructure only: it
keeps keyed code and token digests, never raw values, and sends codes only to an
injected fixture delivery callback. A future Auth.js implementation belongs in
a dedicated adapter; feature modules must not import Auth.js.

Entered-code defaults are an eight-digit cryptographically random code, ten
minute expiry, five failed attempts, one active challenge for each normalized
email/purpose pair, a sixty-second resend cooldown, and ten requests per IP in
ten minutes. Verification atomically marks the challenge consumed before
issuing a session. Request acknowledgement does not reveal account existence.
Identity challenge delivery is the narrow bootstrap-message category and may
not carry commercial content.

Web adapters must put the opaque session token in a `Secure`, `HttpOnly`,
appropriate `SameSite` cookie. State-changing API calls supply the session plus
the session-bound CSRF token and an exact allowed origin. The API principal
bridge—not a page guard—authenticates the session, resolves a current,
non-revoked membership for the selected tenant, and only then creates the
branded database tenant context. `x-tenant-id` and `requested_tenant_id` are
selection requests, never authority; disagreement or absent membership fails.

The provider-neutral session contract is the future mobile exchange extension
point. M0-6 does not implement mobile refresh tokens, live email delivery, or a
third-party identity provider.

### Synthetic practice extension — SBOX-SESSION-1 (5 October 2026)

M0-6L is absent at this task's baseline. The shared synthetic principal bridge is `authenticatePracticeSession` / `PracticeAccess`; it cannot initialize outside server-selected `synthetic_demo` and does not replace or extend live `AuthProvider` authority. `/api/session` issues a cryptographically random opaque UUID cookie only after durable registration of its SHA-256 digest. UUID syntax alone grants nothing. The registry checks revocation, server expiry (seven days for this synthetic extension) and current synthetic owner membership, including role, identity, expiry and revocation. Client tenant selections are checked against that authenticated principal's two fixture memberships. No registry enumeration is granted to business runtime. Treat cookies as bearer secrets: never log or export them. New sandbox run handles and audit actor references derive from the digest, and contain no bearer cookie; old unbound run rows remain inaccessible.

Every practice job has an immutable creator-session digest and server-selected scenario written at creation. Capture writes this binding in the same transaction as the job, source and proposals, and checks it before replaying a capture ID. Generated home scenarios and sandbox runs are also bound at insertion. A valid different session receives the same `NOT_FOUND` / 404 as a nonexistent job. Missing, malformed, invented, revoked and expired cookies fail authentication. Legacy unbound jobs fail closed; a first read, owner claim, capture ID, client metadata or old first-touch row is never ownership evidence.

All job applications share `PracticeAccess`, and request-scoped Next/Nest adapters preserve the caller's actual cookie. Evidence-pack case IDs and decision IDs resolve through their tenant-qualified job links before any read or mutation. Proof upload/evidence commands also verify the referenced object belongs to that authorized job. Decision inbox listings include only owned jobs; the authenticated empty fixture workspace returns an empty list. The unpersisted fee calculator remains pure; its job-scoped transports check ownership first. Contexts are constructed only from authenticated, current membership records and continue to use transaction-local tenant RLS. RLS itself remains a tenant boundary, not protection against a compromised runtime credential that can select arbitrary tenant context.

The control-plane registry is an explicit schema/grant exception with no business content. The job binding has an FK and an immutable guard; ordinary runtime cannot update it, and migration-owner attempts to backfill or transfer it also fail. Production/pilot identities, CSRF/standing authorization, provider sends and fee policy approvals are unchanged and require their existing contracts/gates. A later M0-6L integration must adapt this synthetic extension through its principal bridge, rather than introduce another live identity mechanism. A later practice feed must require this positive creation-time binding before receipts, owner/account claims, commands or replays; no legacy first-touch attribution is allowed.

Practice material catalogue writes also bind merchant, SKU, agreed-rate and
pack-conversion/alias rows to that authenticated digest at insertion. Transaction-
local restrictive RLS filters catalogue reads and revisions before projection;
requirements cannot reference another session's SKU or job. No bearer token is
stored in those rows. Purchase-order pricing and evidence-pack agreement sources
use the same authenticated scope. Legacy/unbound catalogues remain available to
non-practice repository callers and cannot be claimed by a practice session.
As with tenant RLS, a compromised runtime credential able to select a false
session setting lies outside this application authentication guarantee.
