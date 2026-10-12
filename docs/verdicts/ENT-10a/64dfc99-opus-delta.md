VERDICT: PASS — bound to head 64dfc9905fca558bc623cf72551821d7d253aef6
Reviewer: the same fresh Claude Opus that reviewed fecea25; did not build or order this. Lane: RED. Round 2 re-check (the last): the two fixes and regressions only.
Head: `git rev-parse HEAD` = PR #131 head = 64dfc99… at start and end. One commit on top of fecea25, 7 files (the expected ones). Nothing edited, committed or pushed; no test suite run on the Mac.
Honest note: both defects were present at fecea25 and my earlier PASS missed them. The Sol check was right on both.

## Fix 1 — bearer-only subject confirmation: CORRECT
- `saml.ts:86-87`: after the "exactly one SubjectConfirmation" step, the confirmation's `Method` must equal `urn:oasis:names:tc:SAML:2.0:cm:bearer`, else SAML_REFUSED.
- Source of the value: `confirmation.$` from `profile.getAssertion()`, the library's signature-verified parsed assertion, the same object as the earlier five refusals. No second parse of request XML.
- Only adds a refusal. Missing attribute (no `$`), empty, unknown, sender-vouches and holder-of-key all refuse; a prefixed attribute name also refuses (fails closed). "Exactly one" still holds, and that one must be bearer.
- Would fail without the fix: yes. The library has no bearer check at all (no `cm:bearer` anywhere in its lib/saml.js), so the five signed negatives in `saml.test.ts` and the database case would be accepted without this line. The database case pins the exact code SAML_REFUSED, a new audit row, no session binding, membership or subject, then a normal bearer sign-in still succeeds.
- Test identity provider: one test-only option `confirmationMethod`; default output is unchanged (bearer).

## Fix 2 — Nest state-cookie path: CORRECT
- `sso.controller.ts`: Nest now sets and clears `jobguard_sso_state` on `/auth/sso`, where Nest really serves the callback (no global prefix anywhere in apps/api; main.ts sets none). Set and clear use the same path constant.
- Other attributes unchanged: the options are spread from `ssoStateCookieOptions` (HttpOnly, Secure, SameSite=Strict, 600 s). `sso.contracts.ts` and both Next routes are untouched and keep `/api/auth/sso`; the session cookie is untouched.
- Not widened: a cookie on `/auth/sso` goes only to `/auth/sso` and below; one on `/api/auth/sso` only to that tree. Neither prefix contains the other, so on a shared host no path receives a state cookie it should not, and the two transports' cookies never mix. Nothing else lives under `/auth/sso`.
- Is the transport test enough to prove the path rule? Yes. It runs the real controller on the real Nest/Express stack, reads the real Set-Cookie header (path and every other attribute asserted), applies the standard browser path-match rule (I checked the test jar against RFC 6265 §5.1.4), carries the cookie to a real signed callback that returns signed-in, and shows the clear removes it. A second test shows the old path is withheld and that callback gets 403 REQUEST_REFUSED. The stand-in application does real SAML validation; what it does not prove is the real application plus database behind Nest HTTP, which is proven separately (database tests on the application, browser spec through Next).

## Regressions ruled out (by diff)
- Five earlier refusals and service-provider-initiated-only: `saml.ts` changed by two added lines only; `sso.application.ts` and `sso.contracts.ts` unchanged since fecea25.
- Round-1 session-to-tenant binding: `persisted-auth-provider.ts`, migration 0120, repository and all web files unchanged since fecea25.
- `git diff 8db62b3...HEAD` on `identity.test.ts`, `auth.test.ts`, `identity.integration.test.ts`, `M0-6L.spec.ts`, `context-boundary.test.ts` and the seven pinned files: still empty.
- Lane line, package.json files, lockfile, workspace file: unchanged this round (`supertest` and `@nestjs/testing` were already there). Nothing held or deferred built.
- Deep `lib/xml.js` import: still only in `test-identity-provider.ts`, which only tests and the browser spec import.
- Existing assertions in `action-paths.test.ts`: untouched; two import lines widened, new block appended.

## BLOCKING
None.

## LATER (new this round; the 16 earlier items stand, item 1 still needs a decision before any real identity provider)
1. The Nest path is a fixed `/auth/sso`; if Nest is ever served behind a path prefix the callback fails closed. Derive it or pin it with a test at that time.
2. The Nest clearing header carries only the path (no Secure/HttpOnly/SameSite), as before this round; harmless (10-minute, single-use value) but tidy it.
3. Add one full-stack test of the real application and database through Nest HTTP.

## Test evidence for this exact head (GitHub CI run 38160797960, completed success)
- `gh pr checks 131` at the end: checks pass (26m34s), dependency-review pass, secrets pass; the two Vercel lines read "pass" only because the build was skipped.
- Steps green: install, typecheck, lint (lane boundary passed for ent-10a at head 64dfc99…), test, build, browser.
- API tests 1004 passed (996 before + 8 new): `saml.test.ts` 32, `action-paths.test.ts` 18. Database 915 passed: `enterprise-identity.integration.test.ts` 19 of 19.
- Browser: "Running 306 tests" then "306 passed (16.8m)", retries 0, no failed, flaky or skipped lines. The reporter does not print file names on a pass; M0-6L.spec and ENT-10a.spec are in that suite, so both are green.
- Helper's Mac runs (receipt "Round 2"): auth 226, enterprise-identity 19, ENT-10a browser 6, red-before seen for both fixes. Not re-run by me.
