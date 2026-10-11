# Enterprise identity v1 — ENT-10a

Status: SAML synthetic construction only; D04/G5 founder evidence held. No live route approved. Every non-synthetic mode and every non-test IdP is refused server-side. Metadata, credentials or a feature flag cannot authorize a real route.

## Sign-in and tenant boundary

`SsoAuthProvider` implements the existing `AuthProvider` contract and delegates entered-code authentication to `PersistedAuthProvider`. `SsoApplication` is composed through `createWorkspaceApplication` with the existing identity application and its restricted identity pool. Next and Nest use this same service. No credential, stamped tenant context or bearer token is retained in a business service. Admin calls mint context only through the merged principal bridge; repositories take the original stamped context per call. Pre-authentication SAML provisioning is an identity/control-plane exception: `sso_load_connection` resolves exactly one immutable connection UUID, uses a temporary connection-specific RLS selector, and binds its own persisted tenant before provisioning. A client tenant selector cannot supply that authority.

Only service-provider-initiated sign-in is supported. All unsolicited Responses are refused, including an IdP-initiated Response naming the wrong tenant. Issued request IDs live in PostgreSQL, with connection-qualified keys, a ten-minute lifetime, hashed browser state and optional authenticated linking-session ID. The library consumes the issued ID during validation; the database also consumes each assertion ID once, inside the sign-in transaction. Assertion identity has a global unique constraint as additional protection across connections. The callback requires the initiating browser's Secure HttpOnly state cookie. A Response issued for A posted to B fails even if both connections trust the same public key.

`@node-saml/node-saml` **5.1.0** owns all XML parsing, canonicalisation, signature, audience and time validation. Both Response and Assertion must be signed. Settings include explicit audience, `ValidateInResponseTo.always`, 30-second positive skew, ten-minute maximum assertion age and request lifetime, SHA-256 for signing options, and the injected database cache. The adapter only adds refusals using the library's verified profile/text/object: assertion issuer must match; bearer confirmation recipient must equal the exact callback; Conditions must include both time bounds; confirmation must include the matched request ID; SHA-1 signatures/digests and entity-obscured algorithm attributes are refused. One bearer confirmation is required to avoid ambiguity. It never performs its own XML/signature verification.

The test signer is test-only, imports the approved library's `signXml` internally, and generates RSA keys at runtime. No production route imports that signer or sends to an IdP. Start returns a locally addressed library-generated AuthnRequest URL for the test harness; the in-process test harness signs the Response and posts it through the real callback. This is a synthetic JSON callback contract, not live IdP interoperability evidence.

## Linking, domains and grants

A connection accepts fictional `.invalid` emails only. Its domain must first have an immutable verified-domain record. Synthetic verification is an explicit admin command with a proof bound to connection and domain; it verifies no real DNS ownership. A domain can belong to only one connection across all tenants. Domain takeover and cross-tenant links fail closed.

An email collision never silently links an entered-code identity. Linking requires the user to explicitly request `linkExisting` at start with a current authenticated session, exact origin, CSRF token and membership in this connection's tenant; callback rechecks that same session, user and active contractor membership. NameID is the connection-scoped subject identity; an existing subject cannot change email or become a different user. Revoked memberships cannot be reprovisioned by signing in again.

JIT creation requires at least one explicitly enabled group mapping. Memberships have base `read_only` role; every contractor grant is an immutable ENT-1 `role_grant` with explicitly mapped role and scope. No owner/client-approver mapping exists. `finance` is tenant scoped and `commercial_manager` is granted only by an explicit mapping. Unmapped group names grant nothing. Operatives also require existing ENT-1 team assignment before operational access; SSO does not fabricate that assignment. Existing independently granted account authority survives explicit linking; only SSO-derived grants are reconciled by SSO.

Group changes append revisions with optimistic per-group revision checks. Add/change/disable commands append audit events in the same transaction. At a verified next sign-in, old SSO sessions are revoked and previous SSO-derived grants receive immutable revocations before current mappings are applied. No remaining mapped groups returns a typed denial while committing those revocations. No SCIM endpoint is built.

## Sessions and execution

New sessions are inserted into the existing `identity.session` table with its existing digest, CSRF and environment conventions. Nothing changes that table, its grants, policies or routines. Sessions last at most **900 seconds**, enforced by both the session expiry and the controlled SAML issuer. `PersistedAuthProvider`, shared by the Nest and Next identity factories, restricts SAML sessions to their persisted tenant and exact membership and rechecks revocation as well as expiry. Ordinary entered-code sessions without an SSO binding retain their existing membership listing and authority. The session listing, ordinary principal bridge, invitation creation and SSO wrapper all consume this provider. An attempted ordinary identity context or invitation outside the binding returns the existing `TENANT_FORBIDDEN` refusal (HTTP 403), creates no invitation, and records the refusal against the persisted connection. Invitation acceptance uses an independently verified entered-code challenge and issues its own ordinary session; it consumes no existing browser session authority. No invitation-revoke command is merged. `SsoAuthProvider` remains the SAML-facing facade over the same persisted authority.

`checkWorkerAction` accepts a versioned queued-action input and the caller's already-stamped context per execution. Its SQL routine rechecks the connection, tenant, persisted session expiry/revocation, active membership and current scoped ENT-1 permission. It grants no Decision, commercial send or network effect. Existing `ActionExecutor`/command authorization remains unchanged; its real revoked-membership path is included in the new PostgreSQL tests. The worker helper is exposed at the composition seam for SSO-authorized worker consumers; this leaf schedules no new worker jobs. Exact approved Decisions are still required by the existing command/executor boundary.

## Storage and audit

Migration `0120_enterprise_identity.sql` adds identity-scoped `sso_connection`, `verified_domain`, `idp_group_role_mapping`, `sso_request`, `sso_assertion_use`, `sso_subject`, `sso_session_binding` and `sso_grant`. Each has tenant-qualified keys/relationships, FORCE RLS and migration ownership. Identity runtime can read only under the scoped policies; writes occur through narrow controlled routines. Business runtime and infrastructure receive neither identity schema usage nor new-table/routine privileges.

Global `sso_refusal_event` is the reviewed identity-bootstrap exception for refusals whose connection cannot resolve a tenant. It contains only a route hash, typed code, UUID and server time; identity runtime has INSERT only. Known-connection refusals also append to the existing per-tenant audit chain through new narrow wrappers. No existing audit grant changes. Append-only tables deny update/delete; runtime cannot truncate. Logs/events exclude raw assertions, email, public keys and session/state tokens. Audit hash chaining retains the existing trusted-head/checkpoint limitations.

All SAML/domain/link/tenant validation failures create no new membership or session. A savepoint rolls back the failed sign-in work and permits its refusal event to commit. A verified no-group refusal additionally records the required revocations. Database unavailability fails closed; it cannot promise a durable audit write while PostgreSQL itself is unavailable.

## HTTP contracts

- `GET /api/auth/sso/:connectionId/start?requested_tenant_id=...`: current admin view, authenticated session, CSRF and selected tenant. The admin screen uses `new` as the route selector. Reads derive the configured origin when same-origin GET omits Origin; CSRF and membership still apply.
- `POST .../start`: strict `sso-admin.v1` connection/domain/mapping command, or strict `sso-start.v1` sign-in request. Mutations require the exact configured Origin. Admin commands also require current scoped tenant administration.
- `POST .../callback`: strict `sso-callback.v1`, matching browser state and exact configured Origin. Sets an opaque Secure HttpOnly SameSite=strict session cookie, clears state, and returns CSRF/tenant references without the bearer token.
- Worker input: strict `sso-worker-action.v1`; connection/session/membership/permission/scope identifiers only.

All responses are uncached. Admin audit display is a restricted projection of event references; it is not an audit export.

## Outstanding scope

OIDC and emergency-access administration are HELD for Ben. SCIM is later ENT-10a2; audit export/DW6 later ENT-10b; assurance pack/DW7 later ENT-10c. Native M1 coverage waits for M3. Founder D04/G5 evidence remains held. Technical acceptance can only be “SAML synthetic, M4 held,” after the required independent reviews, CI and separate acceptance; this contract asserts none of those outcomes.
