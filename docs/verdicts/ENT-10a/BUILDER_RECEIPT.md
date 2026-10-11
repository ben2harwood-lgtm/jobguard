# ENT-10a builder receipt — 11 October 2026

Builder receipt only — not independently verified, not accepted.

## Base, head and result

Branch `codex/sandbox/ent-10a`. Original base / current merge-base: `ff072c70d577c47847de56c8b30e708bee4267dd`. HEAD is still the dispatcher's Step 0 commit `8830a6c55fac2f26f955bedc25bc273844c9cc91`; implementation is an uncommitted working-tree diff. Dispatcher supplies the implementation commit for independent review. No project git write, push, merge or PR performed.

`origin/main` advanced during work to `530681c030a2333ec8f27f4d1a2cf4803a833465` (FIXLATER-1). Direct `git diff origin/main` includes reverse differences for those upstream files; these are not builder edits. Lane inspection uses merge-base plus committed/working/untracked changes. No upstream work was copied or reverted.

Approved library: **`@node-saml/node-saml` 5.1.0**, exact pin supplied by Step 0. Builder did not change package files, lockfile or workspace configuration, download packages or request another dependency. First builder change was exactly one compact name-ordered `ent-10a` lane line. Shared registration edits are additive within this leaf; existing tests/catalog assertions remain unchanged.

Built synthetic SP-initiated SAML behind `AuthProvider`; persisted request/assertion consumption; verified fictional domains; explicit authenticated account linking; mapped scoped contractor grants; bounded persisted sessions; typed audited refusals; shared Nest/Next composition, admin screen, generated OpenAPI and tests. The real composition seam passes the configured mode; pilot, production, missing and unknown values fail closed.

Both Assertion and Response signatures are mandatory. Library owns XML parsing, canonicalisation, signature, audience and time validation. Explicit audience, `ValidateInResponseTo.always`, positive 30-second skew, ten-minute assertion/request bounds, SHA-256 signing options and database cache are configured. Additional verified-output refusals cover expected issuer, exact recipient, both Conditions bounds, confirmation InResponseTo and SHA-1 (including entity-obscured algorithm attributes). Signer is test-only, uses approved `signXml`, and generates keys at runtime. No production signer import or provider outbound action.

**Every unsolicited/IdP-initiated Response is refused**, deliberately stricter than the draft. Solicited A Responses posted to B are tested. Sessions expire within 900 seconds; verified next sign-in revokes prior SSO sessions and reconciles SSO-derived grants. No mapped group commits revocations while denying a new session. Independently granted email-code authority survives explicit linking. Worker helper rechecks tenant, bound session, membership and scoped permission; no new worker job or commercial effect. Existing exact Decisions and executor remain authoritative.

BUILT means implementation and automated coverage authored; it does not mean NOT RUN tests passed or acceptance occurred.

## Done-when map

| Assertion | Status and tests |
| --- | --- |
| DW1 SAML | BUILT: `saml.test.ts` (27 strict adapter cases); PostgreSQL “replays an assertion … database race”, “audits refusal … every hostile assertion”, “refuses every unsolicited response … B's callback”. Typed errors, audit and zero new memberships/sessions asserted. |
| DW2 | BUILT: PostgreSQL “refuses unverified domains, domain takeover and email-only account collisions” includes authenticated explicit linking and cross-tenant refusal; `linking.test.ts` strict input/metadata. |
| DW3 | BUILT: PostgreSQL “adds, changes and removes audited mappings …” checks finance/commercial-manager explicitness, revisions, downgrade, actor membership and exact command hash. |
| DW4 second half | BUILT: PostgreSQL “without SCIM, next sign-in revokes all prior sessions …”, fake-clock expiry, “persists a bounded session …”; AuthProvider web tests. |
| DW4 first half / SCIM | LATER SUB-LEAF ENT-10a2, optional SCIM routes/events/deactivation tests not built. |
| DW5 / M2 | BUILT coverage: unchanged ENT-1 conformance suite plus new least-privilege, “keeps identity audit append-only and commercial approval authority unchanged” and real `ActionExecutor` revocation cases. ENT-1 database suite NOT RUN; no passing claim. |
| M1 web / background | BUILT coverage: PostgreSQL collision/takeover/link/replay cases, revocation/downgrade cases, persisted worker checks and actual revoked-member executor case; `action-paths.test.ts`; real-route browser journey. DB/browser execution outstanding. |
| M1 native | HELD: native M3 not built. |
| M3 emergency administration | HELD for Ben: approver/control unspecified. No emergency table, routine, permission, screen or test. |
| M4 executable (a) | BUILT: strict `sso-metadata.v1` and full `sso-data-flow.v1`; unit test deletes every data-flow field and asserts refusal; server-computed entity/route metadata and synthetic data-flow register. |
| M4 executable (b)–(c) | BUILT: non-test provider refusals in all modes, flag-only enablement refusals, and real composition-seam pilot/production/missing-mode audited refusals. Existing D04 gate reused; no config/gate edits. |
| M4 founder D04/G5 | HELD: no real-route approval or founder evidence. Technical acceptance scope **“SAML synthetic, M4 held”**. |
| DW6 / B2 | LATER SUB-LEAF ENT-10b: no audit-export code/verifier/key administration. Admin event references are not an export. |
| DW7 / B3 | LATER SUB-LEAF ENT-10c: no assurance pack or assessor/certification claim. |
| OIDC | HELD for Ben: no adapter, route, OIDC-only column, test or second library. |

## Security, migration and operations

Each issued security rule has coverage: double-signature/alteration/untrusted-key/expiry tests; assertion uniqueness inside sign-in transaction raced across requests/replicas; shared-cert A/B callback and borrowed-request cases; all unsolicited Responses denied; verified domain before JIT/link; explicit current authenticated same-tenant linking; typed refusals, durable bootstrap/tenant audit and rollback of failed identity effects. DB unavailability fails closed and cannot promise an audit write.

Migration **0114_enterprise_identity.sql**, registered numerically after 0112; 0113 reserved for CH-7. Tests assert migration name and increasing order, never “last”. Eight tenant-scoped identity tables: `sso_connection`, `verified_domain`, `idp_group_role_mapping`, `sso_request`, `sso_assertion_use`, `sso_subject`, `sso_session_binding`, `sso_grant`. All have non-null tenant IDs, composite tenant keys/relationships, migration ownership and FORCE RLS. New narrow `sso_*` routines perform lookup, admin authorization, cache, JIT/link/session creation, scoped session/worker checks and audit bridging. New lookup policies affect only new tables. Business/worker runtime and infrastructure receive no identity access.

Global `sso_refusal_event` is the documented reviewed identity-bootstrap exception: UUID, route hash, typed code and server time; identity has INSERT only. Known connections also append existing tenant audit through new narrow wrappers. No raw assertions, email, keys or tokens in audit. Existing table/role/policy/grant/auth/session routine DDL is not altered, dropped or rewritten. New routines insert/revoke session facts using the existing persisted representation. Test logins are new roles; rollback fault is a genuine unique-PK collision, not a trigger added to existing session schema.

No backfill. Existing email-code compatibility retained. Upgrade/idempotency/catalog and fresh-install suites authored. Forward fix: disable SSO, expire/revoke SSO sessions through authorized operations, preserve immutable history and correct with an additive follow-up migration; do not drop audit/identity history. `MIGRATIONS.md` documents this. New diagnostics are typed refusal codes and identity audit events; no live alert channel enabled. No new environment secret required. Data-flow file records synthetic processing and outstanding regions/backups/retention/real-data approval. No AI prompt/model/parser/gateway change; eval inapplicable.

## Commands actually run

Required attempts:

| Command | Exit / observed result |
| --- | --- |
| `pnpm typecheck` | 1; launcher refused, no task ran. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; launcher refused, no task ran. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; launcher refused, no task ran. |
| `pnpm --filter @jobguard/api exec vitest run src/auth` | 1; launcher refused, zero tests ran through this command. |
| `pnpm build` | 1; launcher refused, no build task ran. |
| `pnpm openapi:check` | 1; launcher refused, no check ran. |
| `node tools/dependency-audit.mjs` | 2; scan NOT RUN successfully: `Dependency scan did not complete. This is not a clean scan.` |

Exact repeated launcher error:

> [ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.

No signature check bypass. Node observed: 24.17.0. Installed-tool diagnostics are separate evidence, not prescribed pnpm/CI passes:

| Diagnostic | Exit / counts |
| --- | --- |
| API installed Vitest SAML tests-first | 1, missing adapter module; subsequent SHA-1 entity case exposed a gap, fixed; adapter-only final run 0, 27/27 passed. |
| API installed Vitest action-path tests-first | 1, missing application module, 0 collected. |
| API installed Vitest `run src/auth`, initial | 1; 170 passed / 2 failed: discarded stamped-context finding (fixed) and existing timeout; five suites lacked dependency dist. |
| Same after foundation emit | 1; 178 passed / 2 existing scanner timeouts; three suites lacked storage dist. Storage built. |
| Same with emitted dependencies | 1; 199 passed / 6 failed (205 total), 4 files passed / 3 failed. All six were `Test timed out in 5000ms`: two unchanged pinned scanner cases, three unchanged identity boundary cases and new metadata key generation. |
| API installed Vitest `run src/auth/sso`, before final setup | 1; 37 passed / 1 untrusted-key-generation timeout (38 total). Generated fixture keys moved to setup; no timeout or validation weakened. |
| API `./node_modules/.bin/vitest run src/auth/sso`, final | **0; 40/40 tests, 4/4 files passed**, no skips: 27 SAML, 2 input, 7 mapping/gate, 4 action/provider. |
| Root installed tsc builds for core, config, db, ai, storage (each separately) | Each 0, no diagnostics; temporary emitted dependencies used for runtime diagnostics. |
| Installed tsc API noEmit | Initial/subsequent 0, no diagnostics; final post-review result in addendum. |
| Installed tsc db noEmit | 0, no diagnostics. |
| Installed tsc web noEmit | Initial 2 (Nest controller export exposed decorators); removed that export. Subsequent 0, no diagnostics. |
| API `./node_modules/.bin/nest build` | 0, no diagnostics. |
| API `./node_modules/.bin/tsx src/generate-openapi.ts` | 1: `listen EPERM: operation not permitted …/T/tsx-501/48546.pipe` (CLI IPC). |
| API `node --import tsx src/generate-openapi.ts` | 0; generated without CLI IPC. |
| API same with `--check` | 0; exact document match. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0: core purity (125 files), lane, money boundary. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 0; complete committed/working/untracked leaf in assigned lane. |
| `node --test tools/*.test.mjs` | 0: 42 passed, 0 failed/skipped. Existing tests create only temporary git fixture repos; project git untouched. |
| Byte comparison of scanner plus seven pinned files with HEAD | 0; all 8 byte-identical. |
| `git diff --check` | 0. |

Final source/build/cleanup results appear in the validation addendum below.

## NOT RUN

- `enterprise-identity.integration.test.ts`: **NOT RUN (sandbox cannot start PostgreSQL)**, 16 authored cases. Written before implementation; no invented failing/passing run.
- Existing contractor/tenancy/UIWIRE-12/demo-bootstrap database integration, `pnpm test:db`, `pnpm test:migrations`: **NOT RUN (sandbox cannot start PostgreSQL)**. Existing assertions byte-identical.
- `ENT-10a.spec.ts`: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Three tests, intended for `mobile-360` and `desktop` (six executions). Written before screen/routes; no mocked successful server behavior.
- Other DB/browser/native suites: **NOT RUN (sandbox cannot start PostgreSQL / a browser; native M3 absent)**.
- Clean install: NOT RUN; dependencies supplied, downloads prohibited. No frozen-install pass claimed.
- Registry vulnerability scan: NOT RUN successfully, exit 2 / error above.
- Live IdP / real data / D04/G5 founder checks: NOT RUN / HELD.

## Changed files

Builder edits/new files:

- `config/agent-lane-assignments.json`.
- `apps/api/openapi.json`, `apps/api/src/app.module.ts`, `apps/api/src/auth/index.ts`, `apps/api/src/workspace/application.ts`, `apps/api/src/workspace/index.ts`.
- Under `apps/api/src/auth/sso/`: `saml.ts`, `sso.application.ts`, `sso.contracts.ts`, `sso.controller.ts`, `test-identity-provider.ts`, `saml.test.ts`, `linking.test.ts`, `role-mapping.test.ts`, `action-paths.test.ts`.
- `apps/web/app/api/auth/sso/[connectionId]/start/route.ts`, `apps/web/app/api/auth/sso/[connectionId]/callback/route.ts`, `apps/web/app/admin/contractor/identity/page.tsx`, `apps/web/e2e/ENT-10a.spec.ts`.
- `packages/db/migrations/0114_enterprise_identity.sql`, `packages/db/src/enterprise-identity-repository.ts`, `packages/db/src/index.ts`, `packages/db/src/migrate.ts`, `packages/db/MIGRATIONS.md`, `packages/db/test/enterprise-identity.integration.test.ts`.
- `docs/contracts/enterprise-identity-v1.md`, `docs/operations/sso-data-flow.md`, this receipt.

Already committed Step 0 files: `apps/api/package.json`, `pnpm-lock.yaml`, `docs/verdicts/ENT-10a/STEP0_DEPENDENCY_RECEIPT.md`; not edited by builder.

## Self-review

Re-read the issued header, full working diff/new files, `git diff origin/main` and ancestry differences. Checked every in-scope DW/M and security-rule test, library settings/five extra refusals, SP/tenant/browser binding, explicit linking, scoped mapping, configured-mode gate, persisted expiry/revocation, worker checks, transaction/replay/audit, new keys/RLS/grants, additive DDL, metadata register, OpenAPI, UI stale/failure behavior, lane and held/later scope. Scanner/pinned files, existing migrations/tests, package/lock files, configuration gates, AGENTS and BUILD_PLAN remain untouched by builder.

Corrections: retained/checked stamped linking context; removed Nest controller re-export; denied entity-obscured SHA-1; renamed ambiguous PL/pgSQL domain variable; bound admin audit to membership and exact command hash; wired real configured mode with deny defaults and composition regression; guarded malformed worker input; removed redundant identity factory/pool creation; added required browser fixture track-assignment audit; replaced existing-table test trigger with real PK collision; used new test login roles; generated key fixtures in setup without changing timeouts/checks. Builder subagents assisted construction/source inspection; this is not an independent RED-lane verdict.

Outstanding: prescribed pnpm/CI command replay (installed full auth/scanner now green), PostgreSQL migration/isolation/conformance suites, both browser projects, clean install and registry audit on integrator host/CI; fresh Claude Opus review and separate Sol check bound to exact dispatcher commit; separate acceptance. D04/G5, native, OIDC/emergency holds and ENT-10a2/b/c remain outstanding. M5-9 long-term verification/key rotation, M5-12 assurance and ENT-14 not claimed complete.

## Final validation addendum

- API `./node_modules/.bin/vitest run src/auth` after final security/self-review changes: **exit 0; 207/207 tests, 7/7 files passed, zero skips**, including the unchanged 145-case boundary scanner. This final source regression replaces no historical result above. Test timeouts/checks remained unchanged.
- Root `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` after final changes: **exit 0**, no diagnostics.
- Root `node node_modules/typescript/bin/tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --skipLibCheck --esModuleInterop --experimentalDecorators --emitDecoratorMetadata packages/db/test/enterprise-identity.integration.test.ts`: **exit 0**, no diagnostics, zero PostgreSQL tests executed.
- API `node --import tsx src/generate-openapi.ts --check` after final changes: **exit 0**.
- Web `../../node_modules/.bin/next build`: **exit 0**; compiled, checked types, generated 25/25 static pages and traced both SSO routes/admin page. Existing CSS `end`/autoprefixer and parent workspace-lockfile warnings were observed; no unrelated configuration/CSS changed. This is a build, not a browser test.
- Generated `dist`, `.next`, `.turbo`, `.pnpm-store`, TypeScript build cache and test-results artifacts removed before handoff. Installed dependencies remain; no build/test output is submitted.
- Final fixture review uses `testTenantContext(tenantId)` for every directly constructed test context; production contexts still come only from the authenticated principal bridge. No context is built by hand or retained in a service field.
- After artifact removal, `LANE_BASE_REF=origin/main node tools/lint.mjs` and `git diff --check` both exited 0. Final ignored-file inspection contains installed `node_modules` directories only.

Builder receipt only — not independently verified, not accepted.
