# ENT-10-rest — second-run emergency HTTP cutover (dark, RED, NOPR)

4 November 2026. Resumed existing branch `codex/sandbox/ent-10-rest` at `ae87a70e1bb0d40dc274abd082e4b071c967338c`. No merge/fetch, git write, push, PR, dependency download, database startup, browser run, real provider or release. Router owns commit/push. This section supersedes the first-run action-wiring and legacy-HTTP holds in the historical receipt below.

## Scope built in this run

- Added `POST /api/auth/sso-required/emergency-actions/{request|approve|open|inspect|revoke_member}` through one dynamic Next route and the shared `emergencyOwnerPost` transport. Strict `emergency-route.v1` envelope contains `requested_tenant_id` and the existing `emergency.v1` command. Operation must match the URL. Every response is no-store. The synthetic gate precedes parsing/authentication. The principal bridge proves the actual session, origin, CSRF and matching tenant selector; a read-only owner membership lookup avoids the ordinary provider's refusal-log write. Existing SQL rechecks live owner/session authority under lock before writing. No context is minted by the service. No new operation, sign-in method, role, grant or SQL migration.
- Identity screen provides reason hashing, request ID sharing, separate-owner approval, one-time opening, inspection and non-owner revocation. The randomly generated capability hash stays only in component memory, bound to the selected tenant/session. Successful actions refresh the existing named-owner notice projection. The existing audit routine remains authoritative.
- Both legacy HTTP handlers unconditionally return the existing 403 `SSO_EMERGENCY_REFUSED`, without parsing the Next body, constructing a service, proving a mailbox or invoking the repository. `SsoRequiredApplication.emergency`, its repository and `identity.sso_emergency_use` remain unchanged. Undoing the HTTP refusal requires changing both handlers.
- Only the old HTTP-call portion of `sso-emergency.test.ts` changed: line 14 supplies the formerly successful repository result for the valid administrator; lines 18–19 now require zero mailbox/refusal/repository calls. The existing line 17 public refusal assertions remain. Application/repository/mailbox-proof tests and `sso-required.test.ts` are unchanged.
- Package export registry `apps/api/src/workspace/index.ts` adds exactly the shared transport export needed by the Next adapter and its package/type boundary. No route scanner, protected pin or guard is edited. OpenAPI changes only remove the retired handler's success response and correct its summary; Next-only action routes are outside the Nest OpenAPI generator.
- E-54 records the dark cutover and pending proof without claiming general emergency sign-in.

## Evidence from this run

- API and web installed TypeScript compilers (`node node_modules/typescript/bin/tsc -p <package>/tsconfig.json --noEmit`) — PASS. CI-only PostgreSQL tests plus the new browser spec compile through `/tmp/ent-10-rest-test-tsconfig.json` — PASS, with the API's existing decorator settings enabled in that temporary compile configuration.
- API Vitest, maxWorkers=2: `src/watchdog-registry.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts` — 278 PASS.
- API Vitest, maxWorkers=2: `src/auth/sso/enterprise-access.http.test.ts src/auth/sso/sso-emergency.test.ts src/auth/sso/sso-required.test.ts` — 32 PASS. Covers strict authority, owner/session/CSRF/origin/tenant boundaries, dark-mode refusal and both retired handlers. The first route-unit invocation failed to resolve its cross-package dynamic import; corrected to an absolute module URL and this final run passed. The unchanged enterprise-access unit file also passed 19 tests in that initial invocation.
- DB Vitest, maxWorkers=2: `test/migration-proof-loader.test.ts` — 76 PASS (unit guard only).
- OpenAPI equality: `node --import tsx src/generate-openapi.ts --check` from apps/api — PASS. The initial tsx CLI could not create its IPC pipe under the sandbox; the direct loader completed without that CLI pipe.
- `node tools/agent-lane-boundary-lint.mjs` — PASS after updating this lane's exact full diff from origin/main, excluding config/lanes. Initial run correctly refused the as-yet-unlisted new paths; no scanner was changed.
- `git diff --check` — PASS. All Vitest runs named at most three files and at most two workers. No full-suite, build, clean-install, DB execution or browser pass is claimed.

## What CI and independent review must prove

1. Run the extended `packages/db/test/enterprise-access.integration.test.ts` on real PostgreSQL. Its POST tests call the exact shared transport used by Next: two distinct other owners; required SSO remains on; self/duplicate/one-owner/wrong-tenant refusal; removed membership; missing/wrong CSRF; expired login, approval and emergency windows; replayed opening; non-owner revocation and owner protection; named notices and audit-chain verification. Refusals compare unchanged emergency, membership, grant-revocation and audit rows. Retired Nest/Next calls leave the valid mailbox challenge unchanged and SSO required, without opening any legacy window.
2. Run `apps/web/e2e/ENT-10-emergency-cutover.spec.ts` headless at mobile-360 and desktop, at most two workers. It seeds four fictional identities, uses three separate owner browser contexts and real action routes (no mocked authorization), checks visible notices, SQL revocation/audit presence and retired-route refusal. It is written and compiled, not executed here. Real PostgreSQL integration additionally verifies the chain itself.
3. Keep all first-run DB fresh/upgrade/catalogue/RLS, SCIM, permission and SSO suites required. The 0950/0951 reservation and renumbering checks remain. No new 0774 migration was needed.
4. Required green CI against the final head/current main, one independent RED review at that exact head, and router-controlled landing. No security/commercial approval is inferred.

## Named holds for landing

- Owners locked out with **no live session** cannot use this flow; router must rule before landing. No alternate sign-in path was designed.
- Companies with **fewer than three distinct owners** cannot open this capability; router must rule before landing. No fallback or weaker approval was designed.
- The grant on legacy `identity.sso_emergency_use` remains deliberately unchanged. HTTP refusal does not revoke SQL authority; grant cutover requires separate scope/review.
- SCIM controller registration and machine logins stay dark. Native E-57, D04/G5 E-70, real identity providers and general emergency sign-in remain closed. No money, evidence, journal or tenant-wide sign-in-switch authority is added.
- DB/browser execution, exact-head independent RED review, migration landing order and required CI remain outstanding. If a scanner or protected pin edit is demanded, its owner must resolve that separately; none was made here.

**READY for router commit and dark NOPR handoff.** This is scoped implementation readiness, not ENT-10 completion, acceptance, merge or release. The router must record the routine choice in AGENT_CHOICES.md, which this sandbox cannot write.

---

# Historical first-run receipt (evidence retained; superseded holds are not current status)

# ENT-10-rest — dark RED builder receipt

4 November 2026. Base/main: `56b74eaec205e86c9eaf7eee75d85ade2599a364`. Branch: `codex/sandbox/ent-10-rest`. NOPR. Working tree only; router owns commit/push/PR. No git-writing command, package installation, PostgreSQL startup, localhost binding, real provider, real identity, live money or release was performed.

## Scope built

- **E-54, restricted emergency capability (0950):** a named owner requests; two other distinct named owner identities approve within 15 minutes. Self-approval, duplicate approver identities, another tenant and opening without both owners fail. One immutable session lasts exactly one hour, is tied to its requester and secret digest, and cannot be extended/reopened. Each use rechecks the requester's live owner membership and real session/CSRF proof. Allowed actions are inspecting the SSO requirement and revoking non-owner access. There is no commercial, journal, evidence, owner-mutation or tenant-wide SSO-switch authority. A tenant action notice and the audit-chain entry commit atomically with every successful action. All current owners can read the notice projection; the identity screen displays it with the named owner's fictional email. Notice reads are also audited.
- **E-52, bounded SCIM 2.0 profile (0951):** a separate NOLOGIN `jobguard_scim` machine role can execute only the machine routine, without table access or human authority. No login, credentials, binding or controller registration is installed. The tenant is OFF without an owner-configured, enabled, expiring binding. Rotation/disabling serializes with machine calls and rechecks credentials after locking. Users and Groups support collection/resource GET, POST, PUT, bounded PATCH and DELETE through an unregistered Nest transport; SCIM media/error schemas and ETags are returned. Mutations require a UUID `x-request-id`; PUT/PATCH/DELETE require `If-Match`. Replay binds the full normalized operation; changed replay fails. PATCH and its receipt are atomic, so replay after lost acknowledgement does not repeat the effect.
- New users receive only `read_only` membership, must have a verified fictional domain, and cannot collide/link with an existing email-code identity. The immutable subject binding reuses the merged sign-in path. Deactivation reuses `identity.scim_deactivate`, revoking membership, bound sessions and grants together. Owner and emergency-approver mutation is refused, including the last owner. Groups are directory data; they never create grants. Existing explicitly audited SSO role mapping remains authoritative. Unsupported query/filter/pagination, identity renaming and reactivation fail explicitly. This is a bounded synthetic profile, not a claim of complete SCIM interoperability.
- **E-51:** reused the merged `openid-client` adapter and in-process issuer. Ran its signature/unsigned/altered/expiry/audience/issuer, unsolicited/wrong-tenant, nonce/state/browser/PKCE, replay/concurrent exchange and bounded-transport attack tests. This is local conformance-style testing, not OpenID certification or a real identity-provider integration.
- Updated E-51/E-52/E-54 and stale matrix references honestly. E-57 native and E-70 D04/G5 remain HELD. No scanner, pin or protected fingerprint was edited; no existing table gained columns and no existing SQL routine was replaced.

## Local evidence

Installed Node `v24.17.0`; installed TypeScript and Vitest `4.1.12`, invoked directly from their repository bins. The ambient pnpm launcher reported ignored override settings and stalled before running either requested package typecheck; both sessions were interrupted. No dependency download/install was requested. Direct repository TypeScript commands supplied the actual results below.

- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` — PASS.
- `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit` — PASS (final rerun recorded below).
- `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit` — PASS.
- `node node_modules/typescript/bin/tsc -p /tmp/ent-10-rest-test-tsconfig.json` — PASS; compiles the two new PostgreSQL test files and imports. This does not execute PostgreSQL.
- Built the existing config/core/storage/db/AI packages with their installed TypeScript compiler to provide the package exports required by API unit tests. Initial test discovery failed on missing built config/db, then AI exports; these were setup failures with no tests executed in the affected files. No test or check was weakened.
- API Vitest, `--maxWorkers=2`, three named files per run: new enterprise-access + OpenID attacks + context-boundary — **213 passed** before the final HTTP/precondition additions; final rerun below. OpenID application + existing SCIM + new boundary tests — **85 passed**. New boundary/HTTP + existing emergency-owner + SSO disclosure — **51 passed** before the final precondition-code adjustment.
- DB Vitest `--maxWorkers=2 test/migration-proof-loader.test.ts src/later-sso-refusal.test.ts` — **85 passed**; final proof-loader-only rerun after index/policy proof additions — **76 passed**. These are unit guards, not PostgreSQL tests.
- `git diff --check` — PASS. Lane scanner and final runs recorded below.

No full suite, clean install, production build, OpenAPI regeneration, PostgreSQL test, browser run, independent review, merge or deployment is claimed. Every Vitest invocation named at most three files and capped workers at two. One short API/DB unit verification pair overlapped; subsequent checks were serialized.

## What CI and review must prove

1. Run `enterprise-access.integration.test.ts` and `enterprise-access-upgrade.integration.test.ts` on real PostgreSQL. They cover dual approval, wrong tenant/actor, one-owner refusal, expiry, replay/no extension, protected/last owner, scoped recovery, machine ACLs, disabled/missing binding, Users/Groups, cross-tenant member refusal, existing-account collision, immediate next-request deactivation and audit-chain verification. Re-run existing SSO, permission conformance and SCIM access tests unchanged.
2. Fresh and populated upgrade, actual function ACL/argument identities, table RLS/ownership and exact migration proofs for 0950 and 0951. These proofs are reviewed-source expectations, not captured live catalogue results. Full `test:db`/migration/LP guards remain required; no pin/scanner exceptions are inferred from unit success. 0952–0954 are unused.
3. The browser notice spec is explicitly presentation-only with mocked projections. CI must run it at phone and desktop widths, plus the existing actual SSO/OpenID journeys and owner-session route checks. It does not substitute for real owner authorization or full emergency recovery acceptance.
4. Green required CI against the resulting head/current main and one independent RED review at that exact head. Security approval is separate.

## Named holds for landing

- **Legacy emergency route:** the inherited `ssoEmergencyV2`/`identity.sso_emergency_use` public path still permits the old one-owner tenant-wide switch. This branch does not activate or replace it. Existing tests explicitly require that historical behavior. General usable emergency sign-in must remain unclaimed until a separately reviewed cutover replaces that route with the restricted dual-owner flow and strengthens its route/browser regression coverage. The new dark service is not permission to use the old route as a substitute.
- **Activation/wiring:** SCIM controller and emergency command service are built dark; no machine login or action HTTP registration is installed. Only the owner-notice read is wired to the existing synthetic identity screen. Do not label E-52 or E-54 delivered/merged on this branch's local evidence. Real provider routes and D04/G5 remain held.
- **Catalogue/pins:** no known scanner/pin exception was changed. If CI requires any such change, name the exact scanner/pin for its owner; do not widen it. The new machine role and functions need the independent RED catalogue review.
- **Migration order:** 0950/0951 are the reserved build-ahead numbers; router must reconcile the final queue and landing numbers. No GitHub CI or independent review has yet run for this working tree.

## Design choices / complexity

A separate capability, rather than opening tenant-wide emailed-code sign-in, keeps emergency authorization scoped and avoids copying existing financial/identity state. Side tables preserve fingerprinted row shapes. The only copied algorithm is the existing audit chain writer with an explicit `machine:scim:<binding>` actor, because attributing a machine request to a fictional human membership would be false. Directory groups intentionally do not become an alternate grant-authority system. No unrelated refactor was made.

The local sandbox cannot append to the router's `AGENT_CHOICES.md`; the router should record these bounded synthetic choices there. No external approval is inferred.

## Final handoff evidence

- Final API unit run: `apps/api/node_modules/.bin/vitest run --maxWorkers=2 src/auth/sso/enterprise-access.test.ts src/auth/sso/oidc.test.ts src/auth/context-boundary.test.ts` from `apps/api` — **3 files, 215 passed**. Includes the added SCIM HTTP response/error tests and 412 stale-precondition handling.
- Final API TypeScript and CI-only PostgreSQL test compilation — **PASS** after all source/test changes. Earlier web and DB typechecks remain PASS; later changes did not touch web or DB TypeScript source.
- Official `node tools/agent-lane-boundary-lint.mjs` — **refused**, because uncommitted HEAD equals origin/main (self-comparison). No scanner was edited. The initial new lane file was missing the required version/lanes envelope; corrected it, then ran the existing `loadLanePolicy` and `lanePathAllowed` exports against the actual tracked diff plus untracked files: **PASS**, exactly **20 paths**, excluding the lane file itself. The official commit-range check remains for the router after committing.
- Final `git diff --check` — **PASS**. No Git write was performed.

**READY for dark NOPR handoff only.** This is a reviewable restricted-capability build, not acceptance of all ENT-10 Done-when assertions. General emergency sign-in, action-route cutover, database/browser execution, exact-head independent RED review and merge remain explicitly unproved/held above.
