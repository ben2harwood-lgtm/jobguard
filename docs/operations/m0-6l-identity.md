# M0-6L identity operations and handoff

Use `/sign-in` for fictional entered-code signup/signin/invitation. `/api/auth/request`,
`verify`, `session` and `invitations` are thin Next adapters to `IdentityApplication`;
Nest exposes the same service at `/auth/...` with generated OpenAPI. The demo session
at `/api/session` remains separate and only works in `synthetic_demo`. Existing synthetic
business services are blocked outside this mode, including Nest requests bypassing Next.
Real identity email remains blocked pending D04. No Auth.js dependency is used; a future
Auth.js implementation belongs only inside `AuthProvider`'s adapter. Mobile clients may
later exchange an opaque token through the provider-neutral authenticate/CSRF/principal
contract; no mobile refresh or native sync is implemented here.

Provision `jobguard_identity` separately from business and Graphile credentials; never
use owner/superuser credentials. Configuration requires `IDENTITY_DATABASE_URL` with that
username, `AUTH_CODE_SECRET` of at least 32 characters and exact `AUTH_ALLOWED_ORIGIN`.
Use TLS/approved DB regions before real data. Do not rotate the HMAC key silently: rotation
invalidates current challenges and sessions; an operator must explicitly plan revocation.
Keep credentials and tokens out of request/response logging. Secure/HttpOnly/SameSite=strict
cookies are used even on loopback; the fixture browser tests rely on loopback's secure-cookie
support. Session expiry is one day and database revocation is checked on every request.

Only the principal bridge constructs real verified tenant contexts. `apps/api/src/auth/context-boundary.test.ts`
proves it by parsing all application source (apps/api/src, apps/web/app, the top-level files of both apps, every package's
src and tools, and repository-root tools) and failing on any other constructor call, alias, cast to `VerifiedTenantContext` or effective-tenant
identifier. Five categories are confined by explicit, individually tested rules: the bridge (one call, verified membership
only), the definition, the worker queue (one cast fed only by a strictly validated payload), the retained synthetic practice
sandbox and the synthetic restore rehearsal. The sandbox is an explicit list of existing files (each must still construct,
and a new caller needs a reviewed edit to the list); its calls and casts may use only the fixed DEMO tenant and membership
constants, which must be the unaliased imports from `@jobguard/db` (inside packages/db, from `./demo-seed`), never a local
declaration, parameter, destructured or renamed look-alike, and the fixture module must define each as a literal UUID. The
constructor and the context type may be imported, re-exported and destructured only under their own names; local aliases
and derivations of the type are tracked as cast targets and may not be exported. Typed context values and their inferred local
aliases (including assignments after declaration) cannot be reconstructed with spread, `Object.create`/`assign`/`fromEntries`,
`structuredClone` or `JSON.parse`/`stringify`; even a copy without a visible tenant replacement is refused. Typed object
initializers, returns and `satisfies` expressions are checked as well. Property writes (including computed keys and
destructuring targets) and reflective/descriptor writes on contexts are refused. Original-value forwarding stays allowed.
The auth principal bridge freezes every context it mints; strict-mode mutation throws. Freezing does not prevent a caller
from substituting a reconstructed object, so the static boundary and independent review remain required. Named synthetic membership objects cannot be mutated through wrapped property accesses, nested destructuring,
deletion or iteration targets before construction. Root-tool collection excludes `.test`/`.spec` files in all supported source
extensions and generated output. The scan is syntactic: it cannot follow a
context laundered through `any`/`never`, arbitrary signature-derived types or a dynamically selected reconstruction helper.
These require review; TypeScript branding alone does not prove runtime provenance. A new caller anywhere else, or a synthetic
one fed anything but the DEMO constants, fails the test. `x-tenant-id` and
`requested_tenant_id` disagreeing or selecting a non-member tenant fail with
`TENANT_FORBIDDEN`. The existing synthetic services retain their merged fixed demo context
helpers; they cannot be used in pilot/production through either deployed composition seam.
They are not a real-user business path. Revoked membership is checked by the bridge and
again by the existing command dispatcher; a context alone never approves a commercial action.

A signed-in user can accept an invitation to another tenant: `/sign-in?invitationId=<reference>` shows the current
account and an "Accept an invitation" section; email and code verification are unchanged, and the memberships are reloaded
afterwards. Verification always issues a session for the address the invitation was sent to. If that is the address already
signed in, the business is added to that account; if it is a different address, the browser is switched to that other account
(its own memberships only) and the previous session cookie is replaced in this browser (the old session itself is not revoked server-side). The page says so before verification and
reports which of the two happened afterwards; it never promises to add the business "to your account" unconditionally. A revoked or expired former member can be re-invited: acceptance adds a new membership and repoints the locator,
keeping the old row as history; only a currently active membership refuses a fresh invitation.

An owner can create an invitation via the authenticated endpoint, with session-bound CSRF
and exact origin. The endpoint returns its immutable reference for fixture use; it sends
nothing. `/sign-in?invitationId=<reference>` verifies the exact invited email; clients cannot
supply a role during signup/verification. Owner invitation grants exclude ownership transfer.
Unknown account/purpose requests share an acknowledgement shape; invitation selectors may
be unknown without changing request acknowledgement. Fixture codes are displayed only for
fictional addresses, are ephemeral browser drafts, and are never persisted in browser storage.

The web adapter uses a conservative shared rate bucket because forwarded IP headers are
untrusted. Before real-user release, the deployment needs a verified edge source for IP
throttling, pending D04/pilot approval; do not relax throttling by accepting client headers.
Nest uses socket peer IP, also subject to deployment proxy review. Operators should alert on
persistent `IDENTITY_UNAVAILABLE`, `DELIVERY_UNAVAILABLE`, blocked route attempts and growing
pending/unknown delivery records. This task specifies signals, not a deployed alert service.
No automatic retry of unknown email delivery is implemented. Users can explicitly request a
new challenge after cooldown; old codes are superseded. Security-event rows contain event type
and UUID reference only. Retention/pruning of rate windows, events and expired sessions remains
blocked for real data pending approved D12, with export/deletion and backup gates unchanged.

Technical acceptance requires actual PostgreSQL 16 fresh/upgrade/catalog/race/rollback results,
Playwright in both projects, prior regressions, and a Claude verdict on the dispatcher commit
plus separate acceptance. Builder unit checks cannot substitute for those results.
