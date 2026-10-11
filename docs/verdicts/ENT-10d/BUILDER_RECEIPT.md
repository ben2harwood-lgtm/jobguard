# ENT-10d builder receipt

Builder: Codex GPT-6.1 Sol. Issued order: ENT-10d, 11 October 2026, RED lane. Migration **0126**. Work is in the working tree only; the dispatcher supplies the final exact commit. No commit, push, merge or PR was made. Fresh Claude Opus review, a separate Sol check, and separate technical acceptance remain required after CI. This document records source inspection and actual local execution; it supplies no independent verdict.

## Base, head and scope

Dispatched base and unchanged HEAD: `bbca5ca5ee55a6a4d7fcdf89de426195d28c3e27` (`origin/main` at task start). Branch: `codex/sandbox/ent-10d`. During construction the shared remote-tracking ref advanced to `dc16fd683e6ab8b319c5b2f555708bc2c7254be2` (FIXLATER-2). `git diff origin/main` therefore includes incoming main changes absent from this checkout; those are not builder edits. Contribution/lane inspection uses `git diff HEAD` plus untracked paths. The dispatcher must reconcile current main, retain its incoming changes, and rerun checks on the resulting exact commit. No stacking on another leaf and no Git mutation was attempted.

The first change added exactly one compact, ordered `ent-10d` lane line with the prescribed 29 allow entries and migration 0126. Working-tree path inspection found **29 files, 29 allow entries, zero violations**. This is source inspection, not a substitute pass for the official lane command. ENT-10b registration overlap remains a serialization/reconciliation matter for the integrator; no BUILD_PLAN.md change or ledger claim is included.

Changed files:

- `apps/api/openapi.json`
- `apps/api/src/app.module.ts`
- `apps/api/src/auth/identity.application.ts`
- `apps/api/src/auth/index.ts`
- `apps/api/src/auth/persisted-auth-provider.ts`
- `apps/api/src/auth/sso/sso-emergency.test.ts`
- `apps/api/src/auth/sso/sso-required-paths.test.ts`
- `apps/api/src/auth/sso/sso-required.application.ts`
- `apps/api/src/auth/sso/sso-required.contracts.ts`
- `apps/api/src/auth/sso/sso-required.controller.ts`
- `apps/api/src/auth/sso/sso-required.test.ts`
- `apps/api/src/workspace/application.ts`
- `apps/api/src/workspace/index.ts`
- `apps/web/app/admin/contractor/identity/page.tsx`
- `apps/web/app/api/auth/sso-required/emergency/route.ts`
- `apps/web/app/api/auth/sso-required/route.ts`
- `apps/web/e2e/ENT-10d.spec.ts`
- `config/agent-lane-assignments.json`
- `docs/contracts/sso-required-v1.md`
- `docs/operations/sso-data-flow.md`
- `docs/verdicts/ENT-10d/BUILDER_RECEIPT.md`
- `packages/db/MIGRATIONS.md`
- `packages/db/migrations/0125_sso_required.sql`
- `packages/db/src/identity-repository.ts`
- `packages/db/src/index.ts`
- `packages/db/src/migrate.ts`
- `packages/db/src/sso-required-repository.ts`
- `packages/db/test/sso-emergency.integration.test.ts`
- `packages/db/test/sso-required.integration.test.ts`

## Definitions and construction status

BUILT here means code and named automated coverage were authored. It never means an unrun PostgreSQL/browser assertion passed. The complete definitions, routes, schema fields, errors, guards, audit rules and holds are recorded in `docs/contracts/sso-required-v1.md`.

| Definition | Status and implementation |
|---|---|
| Explicit tenant switch | BUILT: highest immutable revision wins; no row is OFF. A connection/domain/mapping never enables it. |
| Ordinary/bound sessions | BUILT: ordinary has no binding; bound uses merged SAML issuance and its 15-minute cap. No new session kind. |
| Its people / per-tenant rule | BUILT: merged active membership definition, SQL gate and unchanged provider binding filter. Domain-only non-members are outside this rule. |
| Code request | BUILT: `requestCode` is byte-identical to base, including acknowledgement, challenge and rate limits; no switch lookup on the request path. |
| Verification/session creation | BUILT: only-required active memberships deny after merged provisioning with existing INVALID_CODE; no session/issuance. No-active-membership behavior stays merged. |
| Listing/context resolution | BUILT: one SQL routine reached through the existing provider, both compositions and ordinary bridge callers. Worker retains merged live-binding check. |
| Binding composition | BUILT: positive bootstrap binding read precedes tenant loop; SQL removes rows, then the existing provider filter removes rows. No added gate session-time test. |
| Existing sessions / zero grace | BUILT: no revocation; switch read per listing/context check; other tenants survive; OFF restores live ordinary access. In-flight work past its check may finish. |
| Invitations / first-time joiners | BUILT: creation denied; prior invitation consumes code only before verified/provisioning; SAML JIT remains the join path. A-only to ordinary B invitation is allowed. |
| Group grants | BUILT for ON through bound web/worker authority. OFF behavior remains merged; session-scoped OFF grants are LATER (Q6). |
| ON/OFF administration | BUILT: origin, CSRF, current organisation.manage via merged require_admin, expected revision, reason and tenant lock. Both changes require own live bound session (Q5). |
| Strict lock-out guard | BUILT, **INTERIM Q4**: configured verified-domain/enabled-mapping connection and live successful admin sign-in; every active member linked to their current membership. Re-invited stale subjects block ON. |
| ONE emergency route | BUILT, OFF-only effect **INTERIM Q3**: no sign-in or identity/commercial mutation, mailbox challenge consumed only, short matching approval and unique single use. |
| Emergency approver rule | **HELD Q2**: CHECK(false), no rule/approval writer, configuration, approver action or screen. Every public request refuses uniformly. |
| Non-enumerating response | BUILT: existing INVALID_CODE400 for closed code verification; identical SSO_EMERGENCY_REFUSED403 for every emergency cause; no sign-in page hint. Source/request-shape proof is not a timing measurement. |

## Acceptance evidence matrix

Files: U1 = `apps/api/src/auth/sso/sso-required.test.ts`; U2 = `apps/api/src/auth/sso/sso-required-paths.test.ts`; U3 = `apps/api/src/auth/sso/sso-emergency.test.ts`; D1 = `packages/db/test/sso-required.integration.test.ts`; D2 = `packages/db/test/sso-emergency.integration.test.ts`; B = `apps/web/e2e/ENT-10d.spec.ts`.

The initial new test files were written before implementation; extra boundary cases and fixture corrections were added during construction/self-review. Database/browser tests were authored without execution. The initial test invocation failed at the package-manager launcher before discovery. The first actual unit run happened after workspace build and failed in the new SSO fixture (details below); this is **not** a demonstrated pre-implementation red assertion.

| Criterion | Construction and named test evidence | Actual local evidence |
|---|---|---|
| S1 | BUILT. U2 `[S1] requests have unchanged shape and SQL for required and unknown addresses; verification issues no session or event`, and missing/invalid gate-answer cases. D1 `[S1] only-required signin and signup create no session or issuance; unknown signin has identical INVALID_CODE`. B `[B] [S1] [S3] SSO requirement persists, emailed-code session is refused and SAML still works`. | U2 passed; D1/B NOT RUN. No statistical timing claim. |
| S2 | BUILT. U2 `[S2] Nest listing, controller invitation, global guard, merged SSO view/admin/link and new routes share one ordinary-session denial`; `[S2] Next identity composition filters listings and contexts using the real repository membership query`; `[S2] worker execution refuses an ordinary session id and audits without any business effect`. D1 `[S2] ordinary listing/context/write, SSO admin/link and worker are refused and create nothing`. | U2 passed; D1 NOT RUN. |
| S3 | BUILT. U2 `[S3] A-required B-ordinary account lists, resolves and invites only B`; D1 `[S3] A-required B-ordinary account signs in, lists, resolves and invites only B`; B shared journey above. | U2 passed; D1/B NOT RUN. |
| S4 | BUILT. D1 `[S4] bound session lists and resolves only A; expired and revoked sessions yield no authority`. | NOT RUN. |
| S5 | BUILT. D1 `[S5] preexisting ordinary session loses A immediately, retains B, is not revoked and regains A after OFF`. | NOT RUN. |
| S6a | BUILT. U1 `[S6] SQL refusal SSO_REQUIRED_FORBIDDEN rolls back work and audits the server-derived connection`; D1 `[S6a] no organisation.manage and another tenant administrator cannot change requirement`. | Unit service fixture passed; real rollback/authority NOT RUN. |
| S6b | BUILT. U1 `[S6] SQL refusal SSO_REQUIRED_NEEDS_SSO_SESSION rolls back work and audits the server-derived connection`; D1 `[S6b] ordinary administrator cannot turn ON or OFF even with valid connection`. | Unit passed; D1 NOT RUN. |
| S6c | BUILT. U1 `[S6] SQL refusal SSO_REQUIRED_NO_CONNECTION rolls back work and audits the server-derived connection`; D1 `[S6c] missing connection, verified domain or latest enabled mapping refuses SQL guard`. Missing-connection, mapping-without-domain, and disabled-latest-mapping fixtures use merged admin commands. The bound connection's redundant domain guard is also source-inspected, since a successful bound session already required immutable domain verification. | Unit passed; D1 NOT RUN. |
| S6d | BUILT, INTERIM Q4. U1 SQL UNLINKED_MEMBERS case; D1 `[S6d] unlinked active member and reinvited replacement pointing at retired SAML membership prevent ON`. | Unit passed; D1 NOT RUN. |
| S6e | BUILT. U1 SQL STALE_SSO_REQUIRED case; D1 `[S6e] concurrent expected-revision commands produce one row and replay is stale`. | Unit passed; real independent transaction race NOT RUN. |
| S6f | BUILT. D1 `[S6f] revision and one success audit append atomically; chain verifies and forced rollback changes neither`. | NOT RUN. |
| S6g | BUILT. U1 `[S6g] synthetic gate precedes authentication in view, command and emergency, including missing mode`; D1 `[S6g] SQL refuses a differently named real database independently of server mode`. | Unit passed; D1 NOT RUN. |
| S7 | BUILT. U2 `[S7] closed invitation consumes challenge without verified latch or provisioning` plus missing/invalid invitation-result cases. D1 `[S7] closed invitation creation and acceptance write no member/locator/acceptance; SAML JIT joins and ordinary B invite succeeds`. | U2 passed; D1 NOT RUN. |
| S8 | BUILT. D1 `[S8] finance mapped grant is usable only through bound web/worker authority and ends with the session`. | NOT RUN. |
| S9 | BUILT. D1 `[S9] default OFF gate equals current memberships in both directions for bound, ordinary, unknown and NULL ids`. Existing invite delegates unchanged when OFF. | NOT RUN; unchanged merged local identity/scanner assertions executed as described below. |
| S10a | BUILT. U3 `[S10a] %s has identical public refusal and issues no session` (seven causes), challenge-limit/consume-only case, invalid-origin/input case. D2 `[S10a] held route returns identical refusal for invalid mailbox, outsider, ordinary member and eligible administrator`. | U3 passed; D2 NOT RUN. |
| S10b | BUILT. D2 `[S10b] eligible mailbox administrator commits one separate log and chain event; outsiders produce global record only`. Global diagnostic causes stay server-only. | NOT RUN. |
| S10c | BUILT, rule HELD Q2. D2 `[S10c] held constraint refuses owner rule insertion; identity and runtime cannot insert approvals; no approval writer exists`. | Source-inspected; real constraint/grants NOT RUN. |
| S10d | BUILT for bounded, single-use, expiry, wrong-member/tenant and rollback fixture: D2 `[S10d] one owner-run rolled-back fixture proves bounded single use, expiry, wrong member and tenant`. **HELD evidence conflict:** the two Promise.all submissions use the mandated ONE owner connection and are serialized by pg; this does not prove competing independent transactions. A two-connection test cannot see the uncommitted rule/approval while the latch lift remains in that single rolled-back transaction. Integrator ruling/follow-up evidence is needed; no policy or fixture scope was widened. | NOT RUN. True independent-transaction concurrency is not claimed satisfied. |
| S11 | BUILT. D2 `[S11] refused and owner-fixture uses preserve journal, evidence, earlier audit and every identity authority row byte-for-byte`. Nonempty journal/evidence through merged services; original audit prefix compared for refusal and owner-success; routine body scanned for forbidden operations/table names. | NOT RUN. Storage is a deterministic fake, not live S3. |
| S12 | BUILT. D1 `[S12] catalogs keys, tenant FKs, owner, append-only trigger, FORCE RLS and explicit narrow grants`. Checks owner, SECURITY DEFINER/search_path, identity helper denial, runtime/infrastructure denial, missing/invalid/cross-tenant reads. | NOT RUN. |
| S13 | BUILT. U1 `[S13] strict versioned inputs accept minimal valid values and reject every unknown key`; `[S13] every closed error maps to exactly one HTTP status and controller bodies carry code only`. | Passed. |
| B | BUILT. B journey above: persisted reload/second context, real test-IdP link/JIT, required-member versus unknown sign-in UI, ordinary-session typed refusal and focused alert, dual-company ordinary listing, banner, emergency line, overflow, keyboard/focus/44px targets. Project selection is mobile-360 and desktop. | NOT RUN; no screenshot/browser claim. |

C1–C8 source mapping: persistence/routine/repository/service/transports/admin section (C1); same factory and actual regenerated OpenAPI (C2); synthetic-only test IdP and .invalid addresses, zero external business adapters (C3); identity/control-plane exception and narrow grants (C4); bridge/permission/expected-revision/race tests (C5); unit execution versus separately unrun real DB/Next browser checks (C6); authored reload/a11y/unknown-state browser journey (C7); prescribed lane and outstanding independent RED checks (C8). C6–C8 acceptance remains pending CI/review.

Browser fixture isolation: each configured domain is unique. A separate JIT account exercises dual-company signin using its first code, without changing cooldown rules. Only this test's disposable request-window rows (matching its own challenge emails/timestamps and existing synthetic web-bootstrap IP digest) are deleted in afterEach, after all assertions, to avoid consuming the shared merged-test ten-minute IP bucket. No production rate limit, merged fixture or merged test is changed.

## Exact edits to the three merged identity files

1. `packages/db/src/identity-repository.ts`: memberships accepts sessionId and selects `identity.sso_session_memberships($1,$2)` instead of current_memberships. No other edit.
2. `apps/api/src/auth/persisted-auth-provider.ts`: passes principal.sessionId with the existing provider filter unchanged; missing-membership/non-bound branch alone derives and audits SSO_REQUIRED target; invitation gate before verified/provisioning consumes only; code-signin gate after provision denies session/issuance; refusal records are appended after the transaction through merged EnterpriseIdentityRepository.refusal. Missing/null/invalid gate results refuse. Added mailbox-proof consume-only method and small connection-ID/refusal helpers. Every prior verification statement retains its relative order; requestCode, authenticate, revoke and the single bound TENANT_FORBIDDEN refusal are unchanged. No tenant lock on emailed-code paths.
3. `apps/api/src/auth/identity.application.ts`: invitation SELECT now delegates to sso_invite_member and still includes invite_member/returns id for unchanged fixtures. Missing/null/invalid id records the server-derived refusal and throws existing TENANT_FORBIDDEN. No other behavior edited.

Existing exports, composition/controller registration and migration registration add entries only. The admin page gains one component/section invocation; merged controls and labels are unchanged. Operations data-flow gains one appended section. No dependency, lockfile, configuration package, sign-in page, identity-server helper, guard or context maker changes.

## Migration and security objects

`0125_sso_required.sql`, registered in increasing numeric order. No backfill. Real fresh installation, previous-supported-schema upgrade and repeated migration fixtures are authored; none executed locally. Deploy migration before application code. Forward-fix only: retain immutable event/audit history, use an authorized bound admin to append OFF where needed, then deploy a separately reviewed correction. Do not drop historical rows or lift the held rule as rollback.

**no object from 0111 or 0120 altered or restated**

| New object | Ownership, policy and grants |
|---|---|
| identity.sso_required_event | jobguard_migration; tenant-leading PK, tenant revision UNIQUE, tenant-qualified connection/member FKs; non-null tenant; ENABLE/FORCE RLS; merged immutable trigger; identity SELECT only. Emergency actor cannot write ON. |
| identity.sso_emergency_approval | Same tenant controls; member composite FK plus global rule FK; approver reference/reason hash; expiry greater than approved_at and no more than 30 minutes later; identity SELECT only. No insert writer. |
| identity.sso_emergency_use | Same tenant controls; tenant/approval PK and tenant/event UNIQUE; composite approval/event FKs; identity SELECT only. |
| identity.sso_emergency_event | Same tenant controls; member FK; separate outcome/cause/raw synthetic reason/time log; identity SELECT only. |
| identity.sso_emergency_approver_rule | Global identity/control-plane exception; jobguard_migration owner; immutable trigger; named CHECK(false); privileges revoked from PUBLIC/runtime/infrastructure/identity. Owner insertion is blocked by CHECK. |

All five revoke PUBLIC, jobguard_runtime and jobguard_infrastructure privileges. Tenant policies use verified transaction-local tenant settings, with invalid/missing settings reading nothing. Existing policy/grants are untouched; no column added to any fingerprinted table.

New functions, all SECURITY DEFINER, SET search_path=pg_catalog, migration-owned, with fully qualified business references:

- `sso_session_memberships(uuid,uuid)`
- `sso_code_signin_allowed(uuid)`
- `sso_invitation_accept_allowed(uuid)`
- `sso_invite_member(character,uuid,character varying,character varying)`
- `sso_required_refusal_target(uuid,uuid)`
- `sso_required_command(character,jsonb)`
- `sso_required_view(character,uuid)`
- `sso_emergency_use(uuid,jsonb)`

These eight explicitly revoke all from PUBLIC/runtime/infrastructure/identity, then grant EXECUTE only to identity. The ninth, `sso_required_append(uuid,uuid,uuid,text,boolean,text,integer)`, is an internal shared append helper with **no identity EXECUTE**. This is an intentional restrictive interpretation of the internal-helper requirement: granting it to identity would bypass required admin/emergency checks. Explicit object lists only, no pattern loop touching merged routines. Gates add no session-time comparison or tenant lock; command/emergency locks precede audit heads, with no later business lock acquisition.

Audit successes: sso.required.enabled/disabled; approved fixture emergency path sso.emergency.used. Business refusals roll back before merged global/authorized tenant sso.refused. Eligible emergency refusal commits its protected separate log plus sso.emergency.refused together; other callers only get the global record. Reasons appear as hashes in audit; no email/free text/transcript/media payload. Targets are server-derived, never requested tenant or caller connection. Code and mailbox counters/consumption use existing controlled infrastructure behavior. An unavailable database cannot guarantee durable logging; the public emergency refusal still stays uniform.

S11 compared tables (fixture authored, NOT RUN): `app.journal`, `app.journal_line`, `app.evidence_object`, `identity.sso_connection`, `identity.verified_domain`, `identity.idp_group_role_mapping`, `identity.sso_subject`, `identity.sso_session_binding`, `identity.sso_grant`, `identity.session`, `app.membership`, `app.role_grant`, plus the earlier ordered `app.audit_event` prefix. Nonempty posted journal and verified PNG evidence are created through existing services before comparison. The owner-success transaction always rolls back.

No commercial charge, external provider action, new payment behavior or live route is enabled. RLS does not defend compromised privileged/identity credentials; audit chaining keeps the merged independent-checkpoint limitation. Synthetic switch/emergency reason categories are appended to sso-data-flow; no real-data destination approval is inferred.

## Actual checks and failures

Node `v24.17.0`; existing pinned pnpm `10.28.1`; Vitest `4.1.11`. Dependencies were already installed; no install/download command used. The global pnpm launcher initially attempted its automatic version switch and failed registry-signature/fetch verification before test discovery. No security override was used. Subsequent commands used the existing cached pinned binary via `PATH=/private/tmp/jg-ent-10d-bin:$PATH`; that wrapper executes `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`.

| Actual command | Exit and observed result |
|---|---|
| Initial `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/sso/sso-required.test.ts src/auth/sso/sso-required-paths.test.ts src/auth/sso/sso-emergency.test.ts` | 1, launcher signature/fetch failure, no tests discovered. `/private/tmp/ent-10d-failed-first.log`. |
| `pnpm typecheck` | 0; 7 successful/7 tasks, 4 cached; 44.576s. Run once. `/private/tmp/ent-10d-typecheck.log`. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passed 127 TS files; lane guard refused “Missing branch or self-comparison range; refusing a misleading pass.” HEAD equaled origin/main then. Remaining lint stages/package lint did not run. Run once; no guard alteration. `/private/tmp/ent-10d-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same self-comparison guard failure. Run once. `/private/tmp/ent-10d-lint-lanes.log`. |
| `pnpm turbo run build --filter=@jobguard/api...` | 0; 6 successful/6, 4 cached; 21.341s. `/private/tmp/ent-10d-api-build.log`. |
| New-file Vitest command above, first actual run | 1; 26 passed/1 failed, 3 files. SSO-start fixture metadata was invalid, so it hit INVALID_SSO_INPUT instead of the intended authorization test. Corrected only the new fixture to valid generated test-IdP metadata; no assertion weakened. `/private/tmp/ent-10d-units.log`. |
| Same three new files, next run | 1; 27 passed/1 failed. New worker fixture did not answer transaction-local set_config. Added the expected fixture statement; assertion unchanged. `/private/tmp/ent-10d-units-final.log`. |
| Same three new files, next run | 0; 28 passed/3 files. `/private/tmp/ent-10d-units-final2.log`. |
| Same three new files, after invalid invitation-result coverage | 0; **33 passed/3 files**; 21.24s. `/private/tmp/ent-10d-units-final3.log`. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts src/auth/sso/action-paths.test.ts src/auth/identity.test.ts` | 1; **167 passed, 2 failed of 169; 2 unhandled errors**. Scanner and identity files passed; action-paths 16/18. Both unedited Supertest transport cases fail when listen is denied: `listen EPERM: operation not permitted 0.0.0.0`, surfaced as “Cannot read properties of null (reading 'port')”. No skip/edit/retry/timeout increase. `/private/tmp/ent-10d-merged-units.log`. |
| `pnpm --filter @jobguard/api openapi:generate` | 1; tsx CLI IPC socket EPERM (`.../tsx-501/82250.pipe`). `/private/tmp/ent-10d-openapi-generate.log`. |
| `node --import tsx apps/api/src/generate-openapi.ts` (root cwd) | 1; tsx cannot resolve from root (installed under API). No generated result. |
| `node --import tsx src/generate-openapi.ts` (apps/api cwd) | 0; repository's exact generator regenerated OpenAPI using its existing loader without the tsx CLI IPC server. `/private/tmp/ent-10d-openapi-generate-loader.log`. |
| `pnpm build` | 0; **7 successful/7, 4 cached**, 58.75s. Run once. Actual Next production compilation/static generation completed. Existing CSS/workspace-root and cache IO warnings observed. `/private/tmp/ent-10d-build.log`. |
| `pnpm openapi:check` | 1; tsx CLI IPC EPERM (`.../tsx-501/88486.pipe`). `/private/tmp/ent-10d-openapi-check.log`. |
| `node --import tsx src/generate-openapi.ts --check` (apps/api cwd) | 0; exact repository generator confirms no OpenAPI drift. No script/provider gate modified. `/private/tmp/ent-10d-openapi-check-loader.log`. |
| Working-tree path inspection using existing selectLane/matches exports, read-only Git diff HEAD and ls-files | 0; 29 changed/new files, 29 allows, zero violations. Inspection only; official lint results above remain failures. |
| `git diff --check` and `git diff HEAD --check` | 0; no whitespace errors. |

All test runs were sequential, at most three files, --maxWorkers=2. No repository/package-wide test suite, live provider, PostgreSQL or browser execution occurred. Root typecheck/lint/build were not rerun. Self-review after build adjusted SQL diagnostic causes and new unrun DB/browser fixtures, documentation/test titles; it changed no compiled application behavior. Local logs above are actual captured files, not fabricated CI output.

Required integrator runs, each **NOT RUN (sandbox cannot start PostgreSQL / a browser)**:

```text
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/sso-required.integration.test.ts test/sso-emergency.integration.test.ts test/identity.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/enterprise-identity.integration.test.ts
pnpm test:migrations
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop ENT-10d.spec.ts ENT-10a.spec.ts M0-6L.spec.ts
```

Other protected auth/saml/linking/role-mapping tests were hashed/source-inspected, not executed in this sandbox's allowed command list. No full mandatory regression claim is made. Eval is inapplicable: no model/prompt/AI gateway change. Native/device suites are inapplicable: native is held, no native code changed. Database/migration/browser suites are applicable and remain required, not optional. No clean install was run because downloads were prohibited.

## Protected files: SHA-256 and byte identity

Each file below was read and compared byte-for-byte with `git show bbca5ca5ee55a6a4d7fcdf89de426195d28c3e27:path`; all match. The ten merged tests, scanner and its seven pins are unedited. The two merged migrations are also unchanged. Comparison against then-current origin/main also matched these protected files; incoming FIXLATER-2 edits affect other paths.

| File | SHA-256 |
|---|---|
| `apps/api/src/auth/identity.test.ts` | `7dd6492023f0f2cf8c35ae7d13edbd273aa6413bc504d9fc717dba518e95529c` |
| `apps/api/src/auth/auth.test.ts` | `e5ea5bcca7667779c6cc1c1f717565fd8940b1594f2b305e4c2fb9ea83385d47` |
| `apps/api/src/auth/sso/action-paths.test.ts` | `113888ae986f8380de2dcd35badadf54282da40f32a3ddf55efc691efa740f9a` |
| `apps/api/src/auth/sso/saml.test.ts` | `b8a48bc4169f43a48444a9742218b1cb6cad8135b18b43347d698f9a2604ea5d` |
| `apps/api/src/auth/sso/linking.test.ts` | `9177616e1118b7d7e72e7126fc5404550eda83f9661d87b3b6671a66b3c908ae` |
| `apps/api/src/auth/sso/role-mapping.test.ts` | `c955e6228dc70145c012a38a418753080ac51796630fca70864546fb13baae07` |
| `packages/db/test/identity.integration.test.ts` | `acb11fd447521e629b34fcb90db7f09d783470a7fa717808e97f24981fc44677` |
| `packages/db/test/enterprise-identity.integration.test.ts` | `5facf59c912bea668404c2872365d6adc0503020c77d9d0b9ba189fa91f0d80f` |
| `apps/web/e2e/M0-6L.spec.ts` | `a6b65e45e7416e66fcbc739bb7dfd6d9c17d15b2f9ccdcd037cc16bf442c20cc` |
| `apps/web/e2e/ENT-10a.spec.ts` | `4f806c5b667c9e935fdeda7ffd2f23c15bf05d1b0ae9a44a388356f13a678893` |
| `apps/api/src/auth/context-boundary.test.ts` | `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` |
| `packages/db/src/practice-session.ts` | `9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14` |
| `packages/db/src/contractor-repository.ts` | `56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c` |
| `packages/db/src/contractor-party-repository.ts` | `e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0` |
| `packages/db/src/work-order-repository.ts` | `4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3` |
| `packages/db/src/sor-repository.ts` | `45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5` |
| `packages/db/src/job-scheduling-repository.ts` | `ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d` |
| `packages/db/src/work-order-fixtures.ts` | `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386` |
| `packages/db/migrations/0111_persisted_identity.sql` | `9779d3f643b248b025b0951c204c6cf51d6a936e531e883e783d9e17b85a59e0` |
| `packages/db/migrations/0120_enterprise_identity.sql` | `2045266607de49574a569a5b8140b82529d2048c4a410dcd525b0677a2bd87ac` |

## Held/later work and remaining gates

- **HELD Q2, Ben:** who approves and who reviews emergency use; rule/configuration, approval-recording action and screen, locked-out request screen and review sign-off. No guessed approver.
- **INTERIM Q3:** OFF-only emergency effect awaits founder confirmation.
- **INTERIM Q4:** strict all-active-members-linked lock-out guard awaits founder confirmation.
- **HELD/LATER as ENT-10a:** OIDC library/provider authorization, native path, D04/G5 founder/route evidence; SCIM later ENT-10a2. No live rollout implied.
- **LATER Q6:** mapped grants in OFF tenants remain usable through merged emailed-code sessions. The protection here applies once the switch is ON.
- **LATER Q9 / ENT-10a LATER 13:** re-linking re-invited members, domain capture.
- **Acceptance holds:** real PostgreSQL/migration/catalog/race/evidence tests, Playwright on both projects, final clean committed lane lint and full mandatory CI, origin/main reconciliation, S10d independent-transaction evidence conflict, fresh Opus and separate Sol RED verdicts bound to final commit, separate acceptance. No founder/commercial/security approval inferred from unit/build checks.

ENT-10d2 activation needs all of:

1. Ben's card answer naming the approver and post-use reviewer.
2. Confirmation of the OFF-only effect (Q3).
3. Reviewed migration lifting the latch, versioning the actual rule and introducing exactly one checked/audited approval writer.
4. Approver route/screen, locked-out request screen and review record.
5. Real DB/browser success proof through that approval routine, replacing the owner fixture and proving sso.emergency.used end to end; proper independent-transaction concurrency evidence.
6. Contract/data-flow updates.

## Self-review

Read the whole tracked diff against the dispatched base and current origin/main, and all new source/test/SQL/contract files against the issued header and draft. Distinguished incoming main changes from actual working edits. Checked every S identifier and the evidence limits above, defined session/switch meanings, default-OFF delegation, requestCode byte identity, unchanged statement ordering and bound refusal count, no extra shared-fixture statement, SQL gate fail-closed answers and no added session-time comparison, exact grant lists/private helper, tenant lock before audit, server-derived audit targets, single OFF-only emergency effect and structurally impossible approval, uniform public emergency/code errors, synthetic mode before authentication, origin/CSRF boundaries, lane paths, fingerprinted table prohibition, no merged object/test/pin/dependency edits and requested terminology.

Corrections made during self-review: kept shared append helper private; moved positive SQL binding lookup before tenant filtering so policy-hidden scope cannot open required access; refused invalid/missing routine and invitation IDs; removed an unnecessary emergency row-lock operation because immutable approvals plus tenant lock/unique use own serialization; added server-only emergency refusal causes; added real no-domain fixture and stronger function catalog checks; fixed only new test-IdP/worker fixtures; used stable timestamp arithmetic for the expired approval fixture; created nonempty journal/evidence before comparison and compared original audit prefix after both refusal and owner-success; used unique browser domains and a separate dual-company JIT member without weakening cooldown; scoped test-only request-window cleanup to its own fixture rows. Removed excluded terminology from newly written test/contract text. No code change was made to make a protected test/scanner weaker.

Recorded the S10d single-connection concurrency evidence conflict instead of claiming a pass. Emergency use remains disabled pending the held decision. Build output, .pnpm-store and test-results are removed before handoff; preinstalled node_modules are retained. Intended commit message is written to `/private/tmp/jg-msg-ent-10d.txt` for the dispatcher.

Builder receipt only — not independently verified, not accepted.
