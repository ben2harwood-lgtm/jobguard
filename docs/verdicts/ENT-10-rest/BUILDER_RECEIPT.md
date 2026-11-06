## READY — ent-10-rest repair round 3 — 6 November 2026

RED, plan piece ENT-10-rest, NOPR; Ben-authorized extra repair round. The launcher already completed the main merge at `a2843cad5`; the index has no unmerged entries and the starting worktree was clean. No merge resolution or Git-writing command was needed.

Applied only the three prescribed behavior/test corrections: render the emergency action status paragraph only when its text is nonempty; replace ENT-10d's obsolete no-approver expectation with the exact current owner/two-other-owners sentence; use that same plain sentence for `SSO_EMERGENCY_REFUSED`. Updated this piece's lane with ENT-10d; it equals all 16 non-lane paths changed from local `origin/main` and does not list itself. No SQL, migration, authorization behavior or unrelated source changed.

Actual local checks, installed dependencies only:

- From `apps/api`: `node_modules/.bin/vitest run --maxWorkers=2 src/auth/sso/sso-emergency-owner.test.ts src/auth/sso/sso-emergency.test.ts src/auth/sso/enterprise-access.http.test.ts` — **38 passed**, three files, at most two workers.
- `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit` — **PASS**.
- From `apps/web`: `node_modules/.bin/playwright test ENT-10a.spec.ts ENT-10d.spec.ts ENT-10-emergency-cutover.spec.ts --list --project=mobile-360 --project=desktop --workers=2` — **PASS**, 10 cases discovered in three files across both widths. Discovery only; no browser execution.
- `node tools/agent-lane-boundary-lint.mjs` — **PASS**. Read-only filesystem lane equality against local `origin/main` and `git diff --check` — **PASS**.

READY for router commit/push and CI. The sandbox cannot start PostgreSQL or bind localhost, so CI must execute the three named browser specs headless at both widths with at most two workers, focused real PostgreSQL suites and required checks. Independent RED review remains required at the resulting exact head. No database/browser execution, independent review, commit, push, PR, deployment or launch is claimed.

---

## READY — landing merge verification — 6 November 2026

RED, plan piece ENT-10-rest. The launcher has already completed the main merge at `3d6ad4f98`; the index has no unmerged entries. Compared the resulting filesystem with current local `origin/main` (`daed0c282`). Restored `config/lanes/batch-30.json` byte-for-byte from that main ref, removing this group's inherited edits to another lane. No behavior, test, SQL routine or migration changed in this run. All main workspace export lines remain present. No migration differences exist against main, so no duplicate migration or routine recreation is needed. This lane still equals all 15 non-lane paths changed from main, without listing itself.

Actual local checks (installed dependencies, no Git writes or downloads):

- From `apps/api`: `node_modules/.bin/vitest run --maxWorkers=2 src/auth/sso/sso-emergency-owner.test.ts src/auth/sso/sso-emergency.test.ts src/auth/sso/enterprise-access.http.test.ts` — **38 passed**, three files.
- `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit` — **PASS**.
- `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false` — **PASS**.
- From `apps/api`: `node --import tsx src/generate-openapi.ts --check` — **PASS**. Initial attempts found stale DB/core dist exports from before the main merge. Rebuilt installed sources with `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json` and the same command for `packages/core/tsconfig.json` (both PASS); the final OpenAPI check passed without source changes.
- From `apps/web`: `node_modules/.bin/playwright test ENT-10-emergency-cutover.spec.ts --list --project=mobile-360 --project=desktop --workers=2` — **PASS**, two project cases discovered; discovery only.
- Filesystem lane equality, main workspace export preservation, unchanged batch-30 lane against main and absence of migration differences — **PASS**, checked using read-only Git objects. `git diff --check` — **PASS**.

Official lane lint still reports the historical committed batch-30 lane delta: its local mode unions the committed diff and working-tree paths rather than evaluating their cancellation. The working-tree restoration is exact; router must commit it and rerun `node tools/agent-lane-boundary-lint.mjs` on that resulting head. No scanner or allowlist was relaxed.

READY for router staging/commit/push and CI. Real PostgreSQL and browser execution, required green CI against current main, and independent RED review at the resulting exact head remain required. No commit, push, PR, deployment or release performed.

---

## READY — ent-10-rest repair round 2 (last) — 6 November 2026

RED, ENT-10-rest, NOPR. Fixed finding 4 from `coordinator/prechecks/later-safety-43.md`: the emergency-cutover seed now calls `ContractorRepository.startPractice` for the initial owner grant and audited contractor-track assignment, then uses the existing `seedActiveContractorAgreement` fixture. It no longer inserts into `app.role_grant`. The requester uses the bootstrap's real user/membership; the other two emergency owners use owner memberships following `enterprise-access.integration.test.ts` (ordinary contractor commands intentionally refuse new owner grants). The non-owner revocation target remains read-only. All journey assertions remain byte-for-byte unchanged. No trigger, migration, production code or authorization check changed.

Reused the existing browser specs' native ESM import pattern because Playwright loads specs as CommonJS. An initial direct source import failed test discovery with the core package's missing CommonJS export; the final native import passes discovery. No dependency downloads or package changes.

Actual local checks (installed dependencies only):

- From `apps/api`: `node_modules/.bin/vitest run --maxWorkers=2 src/auth/sso/sso-emergency-owner.test.ts src/auth/sso/sso-emergency.test.ts src/auth/sso/enterprise-access.http.test.ts` — **38/38 passed**, three files.
- `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit --incremental false` — **PASS**.
- From `apps/web`: `node_modules/.bin/playwright test ENT-10-emergency-cutover.spec.ts --list --project=mobile-360 --project=desktop --workers=2` — **PASS**, two project cases discovered. Discovery only, not browser execution.

The unchanged lane matches all 15 branch paths against the merge base with locally available `origin/main`, including this repair and excluding all `config/lanes/` paths, without listing itself. A direct two-dot comparison included newer unrelated mainline work; the merge-base comparison correctly checks this branch alone. The old local `main` branch predates current work; no fetch or Git write was performed. `git diff --check` passes. Read-only comparison verifies the complete test body and every assertion remain unchanged.

Official `node tools/agent-lane-boundary-lint.mjs` was also run and **failed** on the pre-existing branch change to `config/lanes/batch-30.json`. This repair does not modify that file, and the ENT-10-rest lane must not grant another lane file. Router must reconcile that inherited lane change with main before CI can pass; no lint success is claimed.

Router/CI must run the spec headless at both widths with at most two workers, the focused real PostgreSQL enterprise-access suites, required CI against current main, and independent RED review on the resulting exact head. Database/browser execution is explicitly deferred because the sandbox cannot start PostgreSQL or bind localhost. READY means ready for router commit/push and CI, not independently verified or merged. No commit, push, PR, deployment or release performed.

---

## READY — repair handoff — 6 November 2026

RED, plan piece ENT-10-rest, NOPR. Resolved the launcher's working-tree merge conflicts in `apps/api/src/workspace/index.ts` and `docs/security/not-claimed-register.md`: retained every export from both parents, main's batch-30 evidence wording and this branch's HTTP-cutover facts. The Git index remains unmerged because `.git` is read-only; the router must stage the two resolutions and finish the merge.

Applied the independent precheck's exact fix at `apps/api/src/auth/sso/sso-emergency-owner.test.ts:41`: retained all 403/body and EMERGENCY_NOT_OWNER refusal assertions, added the retired handler's zero-refusal-log assertion, then called `f.app.emergency` directly to exercise the application refusal. No other change in that test. Added `config/lanes/ent-10-rest.json` listing all 15 changed paths against local `origin/main`, excluding `config/lanes/` and itself.

Actual local checks (installed dependencies; no downloads):

- From `apps/api`: `node_modules/.bin/vitest run --maxWorkers=2 src/auth/sso/sso-emergency-owner.test.ts src/auth/sso/sso-emergency.test.ts src/auth/sso/enterprise-access.http.test.ts` — **38/38 passed**, three files, including all **15/15** owner-boundary cases. An initial invocation from the repository root was stopped before any test results; the package-directory invocation above completed.
- `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit` — **PASS**.
- Existing `loadLanePolicy` helper accepted the lane; the allowlist equals the complete filesystem diff against local `origin/main` excluding lane files. Read-only comparison verified every workspace export from both merge parents survived. Both resolved files contain no conflict markers. `git diff --check` passed.

Real PostgreSQL and browser execution remain for GitHub CI, followed by independent RED review on the resulting exact head. Existing named holds remain. No Git-writing command, push, PR, merge completion, database startup, localhost binding or release was performed.

---

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

- **E-54, restricted emergency capability (`0612_emergency_dual_owner.sql`):** a named owner requests; two other distinct named owner identities approve within 15 minutes. Self-approval, duplicate approver identities, another tenant and opening without both owners fail. One immutable session lasts exactly one hour, is tied to its requester and secret digest, and cannot be extended/reopened. Each use rechecks the requester's live owner membership and real session/CSRF proof. Allowed actions are inspecting the SSO requirement and revoking non-owner access. There is no commercial, journal, evidence, owner-mutation or tenant-wide SSO-switch authority. A tenant action notice and the audit-chain entry commit atomically with every successful action. All current owners can read the notice projection; the identity screen displays it with the named owner's fictional email. Notice reads are also audited.
- **E-52, bounded SCIM 2.0 profile (`0613_scim2_machine.sql`):** a separate NOLOGIN `jobguard_scim` machine role can execute only the machine routine, without table access or human authority. No login, credentials, binding or controller registration is installed. The tenant is OFF without an owner-configured, enabled, expiring binding. Rotation/disabling serializes with machine calls and rechecks credentials after locking. Users and Groups support collection/resource GET, POST, PUT, bounded PATCH and DELETE through an unregistered Nest transport; SCIM media/error schemas and ETags are returned. Mutations require a UUID `x-request-id`; PUT/PATCH/DELETE require `If-Match`. Replay binds the full normalized operation; changed replay fails. PATCH and its receipt are atomic, so replay after lost acknowledgement does not repeat the effect.
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
2. Fresh and populated upgrade, actual function ACL/argument identities, table RLS/ownership and exact migration proofs for `0612_emergency_dual_owner.sql` and `0613_scim2_machine.sql`. These proofs are reviewed-source expectations, not captured live catalogue results. Full `test:db`/migration/LP guards remain required; no pin/scanner exceptions are inferred from unit success.
3. The browser notice spec is explicitly presentation-only with mocked projections. CI must run it at phone and desktop widths, plus the existing actual SSO/OpenID journeys and owner-session route checks. It does not substitute for real owner authorization or full emergency recovery acceptance.
4. Green required CI against the resulting head/current main and one independent RED review at that exact head. Security approval is separate.

## Named holds for landing

- **Legacy emergency route:** the inherited `ssoEmergencyV2`/`identity.sso_emergency_use` public path still permits the old one-owner tenant-wide switch. This branch does not activate or replace it. Existing tests explicitly require that historical behavior. General usable emergency sign-in must remain unclaimed until a separately reviewed cutover replaces that route with the restricted dual-owner flow and strengthens its route/browser regression coverage. The new dark service is not permission to use the old route as a substitute.
- **Activation/wiring:** SCIM controller and emergency command service are built dark; no machine login or action HTTP registration is installed. Only the owner-notice read is wired to the existing synthetic identity screen. Do not label E-52 or E-54 delivered/merged on this branch's local evidence. Real provider routes and D04/G5 remain held.
- **Catalogue/pins:** no known scanner/pin exception was changed. If CI requires any such change, name the exact scanner/pin for its owner; do not widen it. The new machine role and functions need the independent RED catalogue review.
- **Migration order:** `0612_emergency_dual_owner.sql` and `0613_scim2_machine.sql` are the reserved batch-30 build-ahead migrations; router must reconcile the final queue and landing numbers. No GitHub CI or independent review has yet run for this working tree.

## Design choices / complexity

A separate capability, rather than opening tenant-wide emailed-code sign-in, keeps emergency authorization scoped and avoids copying existing financial/identity state. Side tables preserve fingerprinted row shapes. The SCIM audit helper delegates to main’s `app.lp4_seal_audit`, retaining an explicit `machine:scim:<binding>` actor and checked-operation trust. Directory groups intentionally do not become an alternate grant-authority system. No unrelated refactor was made.

The local sandbox cannot append to the router's `AGENT_CHOICES.md`; the router should record these bounded synthetic choices there. No external approval is inferred.

## Final handoff evidence

- Final API unit run: `apps/api/node_modules/.bin/vitest run --maxWorkers=2 src/auth/sso/enterprise-access.test.ts src/auth/sso/oidc.test.ts src/auth/context-boundary.test.ts` from `apps/api` — **3 files, 215 passed**. Includes the added SCIM HTTP response/error tests and 412 stale-precondition handling.
- Final API TypeScript and CI-only PostgreSQL test compilation — **PASS** after all source/test changes. Earlier web and DB typechecks remain PASS; later changes did not touch web or DB TypeScript source.
- Official `node tools/agent-lane-boundary-lint.mjs` — **refused**, because uncommitted HEAD equals origin/main (self-comparison). No scanner was edited. The initial new lane file was missing the required version/lanes envelope; corrected it, then ran the existing `loadLanePolicy` and `lanePathAllowed` exports against the actual tracked diff plus untracked files: **PASS**, exactly **20 paths**, excluding the lane file itself. The official commit-range check remains for the router after committing.
- Final `git diff --check` — **PASS**. No Git write was performed.

**READY for dark NOPR handoff only.** This is a reviewable restricted-capability build, not acceptance of all ENT-10 Done-when assertions. General emergency sign-in, action-route cutover, database/browser execution, exact-head independent RED review and merge remain explicitly unproved/held above.

## Batch-30 integration handoff — 4 November 2026

**READY. RED. NOPR.** Combines `ent-10-pack-refresh` and `ent-10-rest` against the existing `origin/main` ref `56b74eaec205e86c9eaf7eee75d85ade2599a364`; local `main` is older. No fetch or Git-writing command was run. The register conflict is resolved in working files, retaining the pack's newer merged-control evidence, founder/library/live-route holds, and the incoming dark SCIM/emergency capability with its CI and legacy-route holds. The index remains unmerged for the router to stage and finish.

Migrations are `0612_emergency_dual_owner.sql` then `0613_scim2_machine.sql`, each with its matching proof. Renaming replaced exact filename stems; human-readable references now name those files. No mainline migration changed, no predecessor routine was replaced, and no fingerprinted table gained a column. The existing shared empty-table map retains both main and incoming entries. These identity/security operations add no job mutation routes or business command types. No application runtime writes to the three LP-5c protected command tables were introduced.

The new SCIM audit helper now calls `app.lp4_seal_audit` with the existing machine actor and payload rather than copying the obsolete chain writer. PostgreSQL coverage additionally checks every machine event uses `audit.v2` and `checked_operation`, alongside existing chain verification. This is the required mainline audit integration, with no new product capability. No function carries `SET app.*`. No new web lib/server module or client database import was introduced. The React checklist found the component boundary, primitive effect dependencies, cleanup and scoped alert consistent with the existing design; no unrelated UI refactor was made.

Actual local validation (installed binaries, no package download):

- API: `./node_modules/.bin/vitest run --maxWorkers=2 src/watchdog-registry.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts` — **278 passed**, 3 files.
- DB: `./node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts` — **76 passed**, 1 file; no database started.
- API: `./node_modules/.bin/vitest run --maxWorkers=2 src/auth/sso/enterprise-access.test.ts src/auth/sso/oidc.test.ts src/auth/sso/sso-required.test.ts` — **79 passed**, 3 files.
- Config, storage, core, AI and DB: each package's installed `tsc -p tsconfig.json` — **PASS**, producing local dependency artifacts. API and web: installed `tsc -p tsconfig.json --noEmit` — **PASS**. The two new PostgreSQL test files and their imports also compile using a temporary no-emit configuration extending the repository configuration — **PASS**.
- Initial test imports lacked dependency `dist` artifacts; the successful runs above followed dependency compilation. `pnpm` and turbo's pnpm child setup stalled and were interrupted; installed binaries completed the checks. No stalled check is counted as passing.
- `node tools/agent-lane-boundary-lint.mjs` was run: it refuses the obsolete staged piece-lane paths and pre-rename migration/proof paths left in the read-only merge index. No guard was changed. Validation using its existing `loadLanePolicy`, `selectLane`, `lanePathAllowed` and `migrationOrderViolations` exports against the final filesystem diff — **PASS**, exactly **23 non-lane paths**, no self grant and migrations above the base. Router must stage all resolved changes and rerun the official command.
- `git diff --check` — **PASS**; conflict-marker scan — clear.

CI must still prove fresh/populated PostgreSQL migration replay, actual catalog/ACL/RLS proof equality, LP-0/LP-4/LP-5c and entitlement upgrade guarantees, SCIM revocation and adversarial boundaries, atomic sealed audit behavior, and owner-notice browser journeys. Full required CI, official lane lint after staging, and independent RED review against the final exact head remain outstanding. The legacy emergency-route cutover and general sign-in recovery remain explicitly unclaimed. Nothing live was used or released. Router stages, completes the merge, commits and pushes this NOPR branch.

## Batch-30 PR handoff — 5 November 2026

**READY for router staging, merge completion and PR opening. RED.** Current local `origin/main` is `62081c68933d0b953e7dd75a8cbd7b3a2fb4f304`. The working files resolve the two merge conflicts as an exact union: DB exports keep every incoming export and `EnterpriseAccessRepository`; `laterEmptyTables` keeps all main entries and the seven identity tables. The index deliberately remains unmerged for the launcher. No Git write, fetch, provider call, dependency download, database startup or localhost binding was performed.

The requested `batch-30-harden.md` is absent. Read the existing `batch-30.md`, `batch-9-harden.md`, prior receipt, current repository rules and the supplied PR brief instead. The supplied SIMPLE_LOOP supersedes the older BUILD_RULES/admission workflow.

Landing migrations are **0612_emergency_dual_owner.sql**, then **0613_scim2_machine.sql**, with matching proofs and exact filename-stem references. Main through 0608 has no duplicate of these capabilities; 0609–0611 remain reserved for preceding groups. No mainline migration or predecessor routine was edited. Proof operations are sorted by section/object identity. No fingerprinted table shape, protected baseline, CI image, provider-register source or shared-money filename was changed.

One required hardening correction: `scim2_machine` now saves and restores the caller's tenant/binding settings on GET, mutation, replay and exception paths, without any function-level `SET app.*`. Added a real-PostgreSQL regression exercising the same connection on GET, POST, replay and refusal. This test is compiled locally but requires CI execution. Both identity contracts explicitly name the LP-5 lifecycle hold; machine receipts and sealed audits are not represented as lifecycle dispatch. Legacy emergency cutover, unregistered action/controller wiring, live activation and general sign-in recovery remain held as above. No new product capability was added during merge preparation.

Actual local validation, installed tools only:

- `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json` and `-p packages/db/tsconfig.json` — PASS; refreshed local dependency outputs. Initial watchdog run used stale core exports and failed one classification test; after this rebuild the unchanged test passed.
- `node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --noEmit` — PASS.
- `node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit` — PASS.
- `node node_modules/typescript/bin/tsc -p /tmp/batch-30-test-tsconfig.json` — PASS; compiles both enterprise-access PostgreSQL test files and dependencies, no database execution.
- API installed Vitest: `run --maxWorkers=2 src/watchdog-registry.test.ts src/auth/context-boundary.test.ts src/auth/identity.test.ts` — **278 passed**, 3 files.
- API installed Vitest: `run --maxWorkers=2 src/auth/sso/enterprise-access.test.ts src/auth/sso/oidc.test.ts src/auth/sso/sso-required.test.ts` — **79 passed**, 3 files.
- DB installed Vitest: `run --maxWorkers=2 test/migration-proof-loader.test.ts` — **76 passed**, 1 file.
- New web route imports `@jobguard/api/workspace`, not API source; client identity files have no DB import. Read inspection used the brief's permitted alternative to the Cloudflare build; no production/Cloudflare build is claimed.
- Official lane lint was run and refused the unfinished merge index: mainline staged changes and deleted build-ahead paths are still visible to its HEAD/range check. Do not widen the lane. A working-tree comparison against `origin/main`, checked using the existing `loadLanePolicy`, `lanePathAllowed` and `migrationOrderViolations` exports, passes with exactly 25 changed paths excluding the lane file itself. The launcher must stage the resolved merge and renames, complete it, then rerun the official lint against the final head.
- `git diff --check` and conflict-marker check — PASS.

CI must still run the real PostgreSQL enterprise-access fresh/populated upgrade and adversarial tests, actual ACL/RLS/catalogue equality, setting-restoration regression, LP and existing permission/SCIM suites, plus owner-notice and existing identity browser journeys at phone/desktop widths. Required green CI against current main and one independent RED review on the exact resulting head remain required. Local source inspection, unit execution and test compilation are not independent review or database/browser proof. The router owns commit, push and PR; no merge, deployment or launch is claimed here.

## Batch-30 PR #574 repair — 5 November 2026

**READY — batch-30 sign-in repair for router commit and CI. RED.** Started from `f3c011f66`; the worktree and index were clean with no merge in progress. No Git-writing command was run. Migrations remain **0612** and **0613**. The buyer pack still says **Not to be sent to any buyer until Ben approves it.**

Repairs from the independent check:

- Synthetic bootstrap now provisions and validates `jobguard_scim` before switching to the migration owner, and checks its holders alongside the other restricted roles. SQL-trace tests include the role, its posture, holder checks and setup order.
- E-52 and E-54 use `HELD` in the status column; dark-build/CI-pending detail remains in the row text. The M5-12 allowed-status test is unchanged.
- The two migration proofs add exactly eight LP-0 entries: three migration-owned routine identities and their specific EXECUTE grants (`dark_emergency` and `scim2_configure` to `jobguard_identity`, `scim2_machine` to `jobguard_scim`), plus SCIM role posture and identity-schema USAGE. These are source-derived expectations; actual PostgreSQL catalogue equality remains for CI. No baseline or comparator was weakened. The audit payload correction does not change the upgrade proof's routine signature/owner/ACL snapshot.
- Migration 0612 now supplies `references.membershipId` for the notices audit. The PostgreSQL regression checks the three owners' read-audit references. The browser test no longer mocks the notices endpoint: fictional persisted owner sessions exercise the real route, response cache policy, rendered notice and stored viewer audit reference for requester and both approvers. Other identity panels remain presentation fixtures. This browser/database coverage is written and typechecked, not executed here.
- The lane allowlist matches every changed path against local `origin/main`, excluding all `config/lanes/` paths; it does not list itself.

Local checks, installed dependencies only, each Vitest run at most two workers and three named files:

- DB `vitest run --maxWorkers=2 test/demo-bootstrap.integration.test.ts -t 'bootstrap SQL trace'`: **7 passed**, 3 database tests excluded by the name filter. This is a SQL trace, not PostgreSQL proof.
- DB `vitest run --maxWorkers=2 test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts`: **107 passed**, two files. This validates proof loading/comparator fixtures, not live grants.
- API `vitest run --maxWorkers=2 src/auth/sso/enterprise-access.test.ts src/auth/sso/sso-required.test.ts`: **28 passed**, two files.
- `node --test tools/security-findings.test.mjs`: **2 passed**.
- Installed TypeScript: DB source `--noEmit`, web `--noEmit`, and `/tmp/batch-30-repair-tests-tsconfig.json` covering bootstrap and both enterprise-access database test files: **PASS**.
- `node tools/agent-lane-boundary-lint.mjs`: **PASS** at existing HEAD; filesystem lane equality against local `origin/main`: **PASS**. Router must rerun on the final committed head.
- `git diff --check`: **PASS**.

CI must prove real PostgreSQL bootstrap under the non-CREATEROLE migration owner, fresh and populated migration replay, exact ACL/RLS/catalogue equality (including all 13 LP-0 grant-freeze tests), existing identity/SCIM permission boundaries, sealed notice-read audit success, and all three real notices-route browser cases at phone/desktop widths. Required full CI against current main and independent RED review on the resulting exact head remain outstanding. No database/browser execution, merge, deployment, release or launch is claimed. Router owns staging, commit and push.

## READY — batch-30 second repair of PR #574 — 5 November 2026

**RED: sign-in. Ready for router staging, commit, push and exact-head CI/review.** Started from `b42754cc` with the launcher's main merge in progress. Resolved both working-tree conflicts as exact unions: all DB exports from both parents, and every empty-table proof key/value from both parents. Read-only Git-object comparison verified both unions. The index still contains unmerged entries because this sandbox cannot write `.git`; the router must stage these resolutions and finish the merge. Migrations stay **0612** and **0613**, after #573's reserved **0611**.

- Added five `lp0.routines` records to the existing 0612/0613 proofs, following 0601's shape. Records include the owner-only `emergency_owner` and `scim2_audit` helpers, exact EXECUTE grantees, definer/search-path facts and source-derived static call/write hypotheses. No LP-0 comparator or baseline was weakened. Added a loader regression checking all five identities and their protection facts.
- Filtered only `sso.emergency.notices` in the repository SQL read building the displayed SSO event list. The notice read still appends its audit event. Extended the PostgreSQL regression to compare the displayed events before/after each owner's notice read, retain substantive emergency events, and retain the existing assertion on all three stored viewer audit references.
- Lane equals all **29** changed paths against local `origin/main`, excluding `config/lanes/`; no self-entry. Mainline additions were preserved.

Actual local validation (installed dependencies, at most two workers, at most three named Vitest files):

- From `packages/db`: `node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts` — **108 passed**, two files.
- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` — **PASS**.
- `node node_modules/typescript/bin/tsc -p /tmp/batch-30-second-repair-tests-tsconfig.json` — **PASS**, compiling the changed enterprise-access PostgreSQL test and migration-proof-loader test with their dependencies; no database execution.
- Read-only merge-parent exact-union comparison, filesystem lane equality via the existing lane-policy helpers, and migration-order check — **PASS**. `git diff --check` — **PASS**.
- Initial `pnpm --filter @jobguard/db exec vitest ...` produced no test output and was stopped; the installed Vitest executable above completed the checks. No package installation was run.

CI must prove real PostgreSQL [LP0-17] identity completeness, grant/catalogue equality, fresh/populated 0612/0613 migration replay, emergency/SCIM authorization and audit boundaries, and the added event-list/audit regression. Browser CI must rerun `ENT-10a.spec.ts` (including the two-tab consistency case) and `ENT-10-rest-notices.spec.ts` at phone/desktop widths, with no more than two workers. Full required green CI against current main and independent RED review at the resulting exact head remain required. Router must rerun official lane lint after staging/committing the merge. No PostgreSQL/browser execution, independent review, merge, deployment or launch is claimed here.


## READY — batch-30 catch-up to main after PR #573 — 5 November 2026

**RED: sign-in and privileges. Ready for router staging, commit and push of PR #574's catch-up.** Resolved only the two working-tree conflicts as exact additive unions: retained both EnterpriseAccessRepository and CIS fixture exports in `packages/db/src/index.ts`, and every key/value from both parents in `packages/db/test/later-empty-tables.ts`. No new behavior or test expectation changes. Migrations **0612** and **0613** are byte-for-byte unchanged from HEAD; incoming main ends at **0611**.

Read-only Git-object comparisons confirmed both unions and that every other incoming file equals main. The existing batch-30 lane already lists exactly all **29** changed paths against local `origin/main`, excluding `config/lanes/`, without listing itself; no lane edit needed. `git diff --check` passed. The Git index still has unmerged entries because this sandbox cannot write `.git`; the router must stage the resolutions and finish the merge.

Actual local checks using installed dependencies, at most two workers and three named Vitest files per run:

- `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json --noEmit` — PASS.
- From `packages/db`: `node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts test/lp-0-catalog.test.ts` — 108 passed, two files.
- From `apps/api`: `node_modules/.bin/vitest run --maxWorkers=2 src/auth/sso/enterprise-access.test.ts src/auth/sso/sso-required.test.ts src/cis-fixture.application.test.ts` — final run 39 passed, three files. Initial run passed 28 identity tests but failed 11 CIS tests because local DB dist lacked main's new export. Rebuilt with `node node_modules/typescript/bin/tsc -p packages/db/tsconfig.json` (PASS), then reran the identical command successfully; no source/test change was made for this failure.

Real PostgreSQL and browser suites were not run: the sandbox cannot start PostgreSQL or bind localhost. Required GitHub CI against current main and independent RED review at the resulting exact head remain outstanding. Router must run official lane lint on the staged/committed merge. No independent review, commit, push, merge, deployment or launch is claimed.
