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
