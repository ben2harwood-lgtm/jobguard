# Authentication contract v1 (M0-6L persisted implementation)

Status: **persisted synthetic identity; real email dispatch blocked pending D04**.

`AuthProvider` is the provider-neutral boundary used by the API. The included
`MemoryAuthProvider` is test-only infrastructure: it
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


M0-6L uses `PersistedAuthProvider` outside tests, with separate restricted identity
credentials. Signup verifies an eight-digit code before creating one tenant and owner;
existing-email signup cannot create another tenant. Invitations carry an immutable UUID,
normalized email, tenant, account, assigned role, issuer and expiry. Challenge request and
verification may include `invitationId`; acceptance must match it and the email exactly.
Clients cannot provide tenant/role during signup or verification. Creating an invitation
requires the current owner, CSRF and origin; owner transfer is not an invitation role.

Challenges and sessions store keyed digests only, with a challenge-specific salt in the
code digest. Failed-attempt updates commit even on invalid verification; transactions
serialize the IP window before email locks, and all purposes share an email lock. Issuing
a session, provisioning and consuming a code are atomic. Delivery follows commit and
records fixture-delivered/pending/outcome-unknown; it never occurs inside a transaction.
Identity security events are append-only for identity credentials and contain no addresses,
codes or tokens. The fixture-only session records its environment and is refused in pilot
or production. Live route initialization is absent and `.invalid` is enforced in the adapter.

HTTP schemas are `identity-request.v1`, `identity-verify.v1` and
`identity-invitation.v1`; `GET /api/auth/session` returns `identity-session.v1` with
persisted principal UUID, CSRF token and current memberships. Next and Nest share the
same application service. Opaque session tokens appear only in Secure HttpOnly
SameSite=strict cookies, never response JSON. Fixture requests display an ephemeral
fixture code only in `synthetic_demo`. API errors expose typed codes rather than raw
validation/DB/provider content. No arbitrary client forwarded IP or tenant authority is trusted.

The identity credential and authentication service remain a load-bearing trust boundary:
RLS does not protect against their compromise or against a privileged database rewrite.
Existing synthetic business modules cannot be executed as real-user commands. No real
user enrollment, provider send, rollout or independent acceptance is claimed by this task.
