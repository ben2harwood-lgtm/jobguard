VERDICT: PASS — bound to head fecea2582838094ba0a4649fb83f97952e2dcaba
Reviewer: fresh Claude Opus (Opus 5.5); did not build or order this piece; did not coordinate with the Sol check.
Lane: RED
Piece: ENT-10a, PR #131, base origin/main 8db62b3. `git rev-parse HEAD` = PR head = fecea25… (confirmed at start and end). Nothing edited, committed or pushed.

## (1) Does it meet the order? Criterion by criterion
- Scope, SAML only: MET. No OIDC, SCIM, emergency access, audit export or assurance pack (file list and added-line scan). Native path and founder D04/G5 evidence stay held.
- One dependency: MET. `apps/api/package.json` adds only `@node-saml/node-saml` 5.1.0 (exact pin). Lockfile adds it plus its own transitive XML packages. No other package.json, no workspace change, no install script enabled. CI dependency-review passed.
- Library does all SAML checking: MET. `saml.ts` sets wantAssertionsSigned, wantAuthnResponseSigned, explicit audience, ValidateInResponseTo.always, skew 30 s (positive), max assertion age 10 min, sha256, and the cache is the database (`identity.sso_cache`). Production code never imports `lib/xml.js` (only `test-identity-provider.ts`, imported only by tests and the browser spec). No canonicalising or signature code of our own.
- Five added refusals: MET, each with a unit test in `saml.test.ts` (gap 1–5) and a database case. Issuer = `profile.issuer`; Recipient, both Conditions bounds, confirmation InResponseTo and assertion ID are read from `profile.getAssertion()`, which in 5.1.0 is built from the signature-verified XML (I read lib/saml.js 505–570, 899–901), with exactly one Subject/SubjectConfirmation/Conditions required. No second parse of attacker XML. The SHA-1 check is a text match on Algorithm attributes that can only refuse; entity-encoded values are refused too. Assertion ID is recorded inside `identity.sso_complete` (same transaction as the session), with a global UNIQUE rule as backstop.
- Service-provider-initiated only: MET. Unsolicited Responses refused by the library; A's Response on B's callback refused (request cache is keyed by connection, plus audience and Recipient); the request is tied to the starting browser by an HttpOnly state cookie whose digest is stored with the request and rechecked in the database.
- Tenant binding inside sign-in: MET. The tenant comes only from the connection named in the route (`sso_load_connection`); every row written in `sso_complete` uses that tenant.
- Round-1 rule, binding on every path: MET (trace below). Ordinary two-tenant entered-code session unchanged, with tests (`action-paths.test.ts:126`, database test :416). Bound session works inside its own tenant, with tests (:136, :416).
- Hard limit: MET. Diff of `identity.test.ts`, `auth.test.ts`, `identity.integration.test.ts`, `M0-6L.spec.ts`, `context-boundary.test.ts` and all seven pinned files is empty. Lane registry: one added line, ENT-10a's own (numstat 1/0). Shared identity code changed in one file only, `persisted-auth-provider.ts` (in the round-1 allowed set).
- Linking and roles: MET. Email collision gives LINK_REQUIRED; linking needs a live signed-in session, CSRF, origin and membership, rechecked at callback; unverified domain refused; domain can be claimed once; `finance`/`commercial_manager` only via an explicit mapping row; mapping changes audited in the same transaction; just-in-time accounts need a verified domain and at least one mapped group and get base role read_only; next sign-in revokes earlier SSO sessions and SSO grants; session capped at 15 minutes in the database. See LATER 1 for the limit of this.
- Every refusal typed, creates nothing, audited: MET (savepoint rollback then audit; database test :215). HTTP bodies carry `{code}` only on both Nest and Next; the kept `cause` never leaves the server (test :35).
- Migration 0120: MET. New tables and new routines only; no ALTER, policy, grant or role change on anything from 0111 or earlier. The session binding went into a new table `identity.sso_session_binding` and a new routine `identity.sso_session_scope`; `identity.session` is untouched. Eight tenant tables have tenant-qualified keys, FORCE row-level security, append-only triggers (request table excepted, it must be marked used). Registered after 0115 in numeric order; position test is by name and order.
- Synthetic only: MET. Three independent locks: mode must be synthetic_demo with the literal test provider (`requireSyntheticSso`), stored metadata must equal the locally derived endpoints, and the database routines refuse unless the database is the synthetic one. A flag alone cannot enable it (tests).

## Session-to-tenant paths traced (none left unbound)
1. Bridge `resolveVerifiedTenantContext` (principal-bridge.ts) → provider.authenticate + findMembership. The only maker of a tenant context from a session.
2. Nest `ApplicationAuthGuard` (global guard) → IdentityApplication.context → bridge.
3. Nest IdentityController: session (provider.memberships), invitations (context, then `identity.invite_member`).
4. Nest SsoController: view, admin, start-with-link → bridge through SsoAuthProvider, which wraps the same provider.
5. Next `/api/auth/session`, `/api/auth/invitations`, `/api/auth/sso/*` → same `createIdentityApplication` factory.
6. `TenantAuthGuard`: tests only, not wired in production.
7. Worker: `checkWorkerAction` → `identity.sso_action_allowed` rechecks binding, tenant, expiry, revocation, permission. No worker turns a session into a context; they use stamped contexts.
8. Commercial modules: a real signed-in person is always refused there (SYNTHETIC_WORKFLOW_ONLY); the sandbox cookie is a different mechanism.
Binding lives in `PersistedAuthProvider` (authenticate, memberships, findMembership), which both compositions build. Invitation accept is an entered-code flow and uses no session. Note: `invite_member` and `sso_require_admin` take the session digest and do not read the binding themselves; safe because the bound provider check always runs first for the same tenant.

## (2) Could it cause a hole or break a journey? Cases I reasoned through
- Same assertion in two concurrent requests: the tenant lock serialises them; the second finds the request used or the assertion recorded; UNIQUE rule is the backstop. Safe.
- Person in A and B signs in through A, calls a B route: memberships are filtered to the bound tenant and membership, so B gives TENANT_FORBIDDEN, nothing created, refusal audited. Safe.
- Signed assertion beside an unsigned second one: Response must itself be signed, the library refuses more than one assertion and reads the assertion from the signed bytes. Safe (no explicit test here, LATER 6).
- Membership revoked after sign-in: next request fails at authenticate (scope returns revoked). Safe.
- Expired or used request ID: database `get` returns nothing; `sso_complete` rechecks expiry, used-mark and browser state. Safe.
- Ordinary entered-code sign-in: unchanged code path; signed-in calls make one extra read that returns "no binding" for ordinary sessions in any database. Safe once migration 0120 is applied before the new code.
- Money, journals, evidence: untouched.

## M0-6L spec red on the Mac: not caused by ENT-10a
The failing step is a wrong entered code. That path (`verifyCode`, verify route, `identityStatus`, sign-in screen) is untouched. The symptom is the error class not being recognised across separately compiled routes in the Next dev server (the identity service is cached on globalThis); the helper reproduced it on clean main. GitHub CI runs the production build and M0-6L passed there on this head.

## BLOCKING
None.

## LATER
1. IMPORTANT, decide before any real identity provider: an account created or linked by SAML can still sign in by emailed code and get an ordinary 24-hour, unbound session; grants given by a group mapping stay in force for it until that person's next SAML sign-in. So "access ends within 15 minutes" is true of the SAML session, not of the account. No new exposure in synthetic mode (codes are shown on screen to anyone), and the order's test as written is met. Needs an "SSO required" rule or session-scoped grants.
2. Session expiry has zero margin: the app sends now+900 s and the database refuses anything over its own now+15 min, so an app clock slightly ahead of the database refuses every SAML sign-in (fails closed). Compute expiry in the database.
3. `SsoApplication.start` with linkExisting calls the provider (pool) while holding a transaction client from the same 4-connection identity pool with no timeout; four concurrent calls naming a real connection can wedge that pool, which ordinary sign-in shares. Authenticate before opening the transaction. Not reachable in today's demo (no product path creates a connection).
4. No rate limit or clean-up: unauthenticated start/callback and failed admin calls add request rows and audit events; a failed admin call naming another tenant's connection id writes the refusal into that tenant's chain.
5. Many database tests assert only "has a code"; pin exact codes so an availability error cannot pass as a refusal. The browser replay check has the same weakness.
6. Add an explicit signature-wrapping test and a database test of the 10-minute request expiry.
7. `jobguard_identity` gets SELECT on all eight new tables; routes read only three directly. Narrow it.
8. Function ownership/grant loop uses `LIKE 'sso_%'` (underscore is a wildcard); use an explicit list.
9. `SsoApplication` constructor defaults the mode to synthetic_demo; make it a required argument.
10. `SamlAdapter.validate` drops the cause; a database fault during validation shows as SAML_REFUSED.
11. The test signer sits in shipped `src` (compiled, not exported); exclude it from the build.
12. Sol finding 3 (36-character junk route reported as unavailable) is still present, as the order allowed.
13. A re-invited member's SAML subject keeps pointing at the revoked membership, so SAML sign-in stays refused; needs a re-link path.
14. If the binding row were ever hidden by a policy change, a bound session would be treated as ordinary (fails open by shape); keep the database regression test and consider a positive marker.
15. The identity entry point now loads the SAML library for every sign-in route (start-up cost).
16. PR title and early receipt sections still say 0114. Separate lane: fix the dev-server error-class miss behind the Mac M0-6L failure.

## Executed, inspected, not verified
- Executed by me: `pnpm --filter @jobguard/api exec vitest run src/auth` → 7 files, 218 passed (includes the boundary scanner). `gh pr checks 131` and the CI log.
- Inspected in full: migration 0120, all `apps/api/src/auth/sso/*.ts`, `enterprise-identity-repository.ts`, the shared-identity diff, both web SSO routes, 0111's routines, the library's validation code, the lane/dependency/hard-limit diffs. Tests read in part.
- Not verified by me: I ran no database or browser suite and did not mutation-test the five refusals (I rely on the Step 0 receipt rows y1–y5 that the library alone accepts each case). No real identity provider, deployment or founder evidence was checked.

## Test evidence seen for this head
- GitHub CI run 38155573542 on fecea25, completed success: checks pass (19m57s) with typecheck, lint (lane boundary passed for ent-10a), test, build and browser steps all green; database package 70 files / 914 passed; browser "Running 306 tests" → "306 passed (13.1m)", retries 0, no failed, flaky or skipped lines, so M0-6L and ENT-10a specs are green. dependency-review pass, secrets pass. The two Vercel checks show "pass" only because the build was skipped (no preview was built).
- Helper's Mac runs (receipt "CI repair 2"): enterprise-identity 18/18, test:migrations 13/13, identity + contractor 30/30, api src/auth 218/218, ENT-10a.spec 6/6; M0-6L.spec 2 of 4 failing locally for the dev-server reason above.
