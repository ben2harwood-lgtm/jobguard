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
