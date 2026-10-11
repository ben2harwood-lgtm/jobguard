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

## CI repair 1

11 October 2026. Pre-review repair of PR #131 on the same `codex/sandbox/ent-10a` leaf. Starting HEAD remains **8d208db71cce8e6b5790c0316ed354ff4194c881** (builder a5a396b plus the integrator's record). Working-tree edits only; the dispatcher owns the next commit. The integrator's BUILD_PLAN ledger paragraph and lane addition are byte-identical to HEAD. No git write command, package download, second migration or independent-review claim.

### Cause and before/after

Source diagnosis: `packages/db/migrations/0114_enterprise_identity.sql:241`, the `IF` statement in `identity.sso_audit_append`. Before:

```sql
OR e->'payload'-ARRAY['references','hashes','classifications']<>'{}'::jsonb
```

PostgreSQL 16 gives binary `-` higher precedence than `->` ([official operator-precedence table](https://www.postgresql.org/docs/16/sql-syntax-lexical.html#SQL-PRECEDENCE)). Consequently the parser groups the subtraction as `'payload' - ARRAY[...]`, rather than extracting the payload first. The JSONB/text-array subtraction overload requires that literal to be JSONB, but the bare text `payload` is not valid JSON. Preparing this PL/pgSQL statement therefore fails at execution, before the audit INSERT; migration installation alone does not execute it. This is a source-derived diagnosis, **not an observed PostgreSQL message or a reproduced database run** in this sandbox.

After:

```sql
OR (e->'payload')-ARRAY['references','hashes','classifications']<>'{}'::jsonb
```

Only the extraction is parenthesized. The payload allowlist, tenant check, audit insert/head advancement, all constraints, policies and grants remain intact. Corrected the unmerged 0114 in place, as instructed.

The original fixture's first application call (`enterprise-identity.integration.test.ts:65` at starting HEAD) is `app.admin(connection.create)`. Its path is `SsoApplication.admin` → principal bridge → `EnterpriseIdentityRepository.admin` → audit → view:

1. Persisted authentication SELECTs the active synthetic session by keyed digest. `sso_session_scope` performs its session-bound lookup; the fixture's email-code session has no SSO binding. Membership lookup calls `identity.current_memberships`, resolves the locator, sets its tenant locally, and SELECTs membership/account/email under the existing policies.
2. `withTenant` begins a transaction and sets `app.tenant_id`. `SELECT identity.sso_admin_command($1,$2::jsonb)` locks the tenant, calls `sso_require_admin` (active-session and contractor-permission/membership SELECTs), validates metadata/tenant binding and INSERTs the new `identity.sso_connection`.
3. Repository audit calls `SELECT * FROM identity.sso_audit_head($1)`. `sso_load_connection` binds the connection lookup selector, SELECTs this exact connection and binds its persisted tenant. Existing `app.lock_audit_head()` inserts the missing head with `ON CONFLICT DO NOTHING` against its tenant PK, then SELECTs/locks it. Repository canonical hashing produces the existing audit arguments.
4. `SELECT identity.sso_audit_append($1,$2::jsonb)` reaches the faulty expression above. With the fix, the wrapper INSERTs the audit row and calls existing `app.advance_audit_head(bigint,char(64))`; repository commits. Without it, the transaction rolls back and the original error was discarded by repository translation, then by `typed`.
5. After commit, admin view begins another tenant transaction, checks the admin, SELECTs connections/domains/latest mappings and calls `sso_admin_events` for the permitted audit projection. The guarded failure path records the bootstrap refusal with INSERT into `sso_refusal_event`; `connection.create` uses route `admin`, so it does not attempt a second tenant audit.

Runtime credentials are distinguished: fixtures use `ent10a_runtime` for contractor setup and `ent10a_identity` for SSO. Business runtime has no new identity access; the identity credential has schema USAGE and narrow EXECUTE inherited from the merged/new grants. New wrappers execute as `jobguard_migration`, without BYPASSRLS. Existing 0111 account/membership policies and 0054 contractor/audit INSERT policies permit only the bound tenant. No new privilege was necessary.

`ssoRepositoryError` now retains an unrecognized error through standard `ErrorOptions.cause`; `typed` preserves that original cause through `SsoError`. Recognized refusals retain their prior codes/statuses without a cause. Null/undefined unknown errors no longer throw during property inspection. HTTP transports still select only code/status; the new controller unit cases assert status 503, exact body `{code:'SSO_UNAVAILABLE'}`, and absence of private diagnostic/detail text for both a raw error and a repository-wrapped error. No transport/OpenAPI contract changed.

### Remaining statement review and coverage

Re-read every original integration case and its application/repository/routine path: catalogs/RLS, malformed and cross-tenant contexts/FKs, input/worker refusals, browser state, assertion races, signature/issuer/audience/expiry attacks, callback connection binding, domain takeover/explicit linking, mappings/revisions/downgrades, membership/session expiry and revocation, worker permissions, actual executor revocation, no-group committed revocation, session-PK rollback and audit verification.

Checked schema-qualified references, parameter counts/casts, row/return types, PL/pgSQL variable/column collisions, all new and referenced NOT NULL/default/check values, tenant-qualified FKs, global identity exceptions, request/assertion uniqueness, grants/schema/routine access, FORCE RLS SELECT/INSERT/UPDATE behavior, `app.tenant_id` and scoped bootstrap selectors, and both existing audit helpers against 0000/0001/0005/0054/0111 and the merged migration sequence. The positional contractor-member, locator and role-grant INSERTs match their current column order. No further same-class defect was found or unrelated statement changed. No existing test expectation was wrong or corrected.

Added one real-PostgreSQL regression case: the audit wrapper accepts allowed keys, rejects an extra payload key with `22023 / INVALID_SSO_INPUT`, and inserts no event on that refusal. It fails on the old precedence expression. **Authored only; NOT RUN (sandbox cannot start PostgreSQL).** Existing 16 integration cases and all their assertions remain unchanged; now 17 cases are authored. Added three executable unit cases (one translation case plus two raw/wrapped HTTP cases). Existing test bodies, timeouts and assertions are preserved; no skips, retry wrappers or timeout changes.

Repair files: `apps/api/src/auth/sso/action-paths.test.ts`, `sso.application.ts`, `sso.contracts.ts`; `packages/db/migrations/0114_enterprise_identity.sql`; `packages/db/src/enterprise-identity-repository.ts`; `packages/db/test/enterprise-identity.integration.test.ts`; this receipt.

### Commands actually run for this repair

Node observed: 24.17.0. Supplied dependencies used; no install or signature-check bypass.

| Required command | Exit / observed result |
| --- | --- |
| `pnpm typecheck` | 1; launcher refused, no task ran. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; launcher refused, no task ran. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; launcher refused, no task ran. |
| `pnpm --filter @jobguard/api exec vitest run src/auth` | 1; launcher refused, zero tests executed through this command. |
| `pnpm build` | 1; launcher refused, no build task ran. |
| `pnpm openapi:check` | 1; launcher refused, no check ran. |
| `node tools/dependency-audit.mjs` | 2; `Dependency scan did not complete. This is not a clean scan.` Registry scan NOT RUN successfully. |

Exact common launcher error:

> [ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.

Installed-tool diagnostics are separate evidence, not prescribed pnpm/CI passes. Paths below are relative to root except commands marked API/web:

| Diagnostic command | Exit / observed result |
| --- | --- |
| `./node_modules/.bin/tsc -p packages/core/tsconfig.json`, likewise `packages/config/tsconfig.json`, `packages/db/tsconfig.json`, `packages/ai/tsconfig.json`, `packages/storage/tsconfig.json` | Each 0; emitted dependencies for diagnostics. |
| `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` | 0; no diagnostics. |
| `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` | 0; no diagnostics. |
| `node node_modules/typescript/bin/tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --skipLibCheck --esModuleInterop --experimentalDecorators --emitDecoratorMetadata packages/db/test/enterprise-identity.integration.test.ts` | 0; no diagnostics, zero PostgreSQL cases executed. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0; purity (125 files), lane, money and commercial-boundary checks passed. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 0; assigned leaf passed. |
| API `./node_modules/.bin/vitest run src/auth`, initial concurrent build attempt | 1; 209 passed / 1 failed (210), 6 files passed / 1 failed (7). Unchanged `context-boundary.test.ts:742` timed out at its existing 5000ms; all three added cases passed. |
| API same command, final sequential run after builds stopped | 1; 209 passed / 1 failed (210), 6 files passed / 1 failed (7). The same unchanged scanner case timed out; all three added cases passed again. No assertion, scanner or timeout edited and no further full-auth rerun. |
| API `./node_modules/.bin/nest build` | 0; no diagnostics. |
| API `node --import tsx src/generate-openapi.ts --check` | 0; unchanged generated document matches. |
| Web `../../node_modules/.bin/next build`, initial concurrent API-build attempt | 1; API dist exports were not ready when webpack resolved them. This was builder check ordering, not a source change. |
| Web same command, sequential after API build | 0; compiled, typechecked, generated 25/25 static pages and completed build traces, including SSO routes/admin page. Existing CSS/autoprefixer, webpack warning-cache and workspace-root warnings observed. No browser execution. |
| `git diff --check` | 0. |
| Read-only byte/subsequence inspection against HEAD | 0; BUILD_PLAN, lane, scanner, seven pinned files, package/lock files identical; every original test-body line remains in order. |
| Read-only Python subprocess inspection of web-build processes (`ps`) | 1; sandbox denied `ps` with `PermissionError: [Errno 1] Operation not permitted: 'ps'`. No escalation or process mutation. |

Final sequential outcomes are included above. Removed generated `dist`, `.next`, `.pnpm-store` and TypeScript build-cache output before handoff; supplied dependencies remain. Both installed lint commands and `git diff --check` repeated after cleanup exited 0; ignored-file inspection contains installed `node_modules` directories only. Intended conventional commit subject/body written to `/private/tmp/jg-msg-ent-10a.txt`. The dispatcher supplies the next commit hash; the builder has not committed, accepted or independently verified this repair.

### NOT RUN and self-review

- `enterprise-identity.integration.test.ts`, all other PostgreSQL integration suites, `pnpm test:db`, `pnpm test:migrations`: **NOT RUN (sandbox cannot start PostgreSQL)**. Neither the reported CI failure nor this fix has been reproduced locally against PostgreSQL.
- `ENT-10a.spec.ts` in both projects and every browser suite: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. Builds are not browser tests.
- Clean pinned install: NOT RUN; dependencies supplied, downloads prohibited. Full `pnpm test`: NOT RUN; includes unavailable PostgreSQL suites. Live IdP/real-data/D04/G5 founder evidence: NOT RUN / HELD. Native: HELD at M3.
- Registry vulnerability audit: NOT RUN successfully, exit 2 and exact error above; no clean-audit claim.

Self-review: re-read the issued header, all leaf-owned diff/source paths against `origin/main`, repair diff against HEAD, integration paths and applicable contracts. Checked in-scope DW/security coverage and all existing holds: OIDC/emergency/native/founder evidence HELD; SCIM/audit export/assurance pack remain later sub-leaves. No held capability, dependency, live route, extra migration, existing-table DDL, policy/grant change or protected-file edit. The one SQL edit preserves tenant and audit enforcement. Standard causes remain server-side and refusal audits contain only typed codes. Existing assertions/timeouts were preserved and verified by ordered-line inspection; no expectation weakened. Different-model RED-lane verdicts and separate acceptance remain outstanding after dispatcher commit and CI. Source inspection and unit diagnostics are not PostgreSQL verification or independent review.

Builder receipt only — not independently verified, not accepted.


## Round 1

11 October 2026. Same leaf, PR #131, `codex/sandbox/ent-10a`. Starting HEAD **5ddcf561c9f01d3c75766934bca2e7e5aefd2c8a**, the CI repair 1 commit after 8d208db. Re-read the issued header, its dependency receipt, CI repair 1, the Sol verdict/reproductions and applicable AGENTS/build-plan/authentication contracts before editing. The dispatcher supplies the repaired commit: these are working-tree changes only. No git write, package download, founder approval or independent verdict.

### Fix status and tests first

**Fix 1 — DONE in source; PostgreSQL/browser verification remains NOT RUN.** The shared `PersistedAuthProvider` now checks the persisted SSO binding during authentication and membership lookup. A bound session lists only its exact tenant/membership; no membership in B is returned even if the account owns B. The unchanged principal bridge therefore returns its existing `TENANT_FORBIDDEN`, with the existing HTTP 403 mapping, before invitation SQL runs. Bound-session membership refusals use the existing SSO refusal logger (bootstrap event and, for an active persisted connection, the bound tenant's audit chain). No new refusal code or HTTP success path. Session/membership revocation fails closed. Ordinary sessions receive a NULL binding and retain the same ordered membership projection, origin/CSRF rules and command behavior. Code request/verification and invitation acceptance code are unchanged.

Nest `AppModule`'s lazy `IDENTITY_APPLICATION` factory and Next `identity-server.ts` both use `createIdentityApplication` and hence this same provider. Neither needs a composition-specific patch. The new factory regression executes the actual factory and the Next server adapter in a VM, with database facts stubbed. Enforcement works before creating an SSO service. The existing SSO facade still checks scope too; it delegates to the now-restricted shared provider.

Ported independent reproduction cases 1–3 into `sso/action-paths.test.ts`, preserving their real-service/stubbed-database approach. Wrote the real-PostgreSQL multi-tenant regression first, before provider edits, and recorded it **NOT RUN (sandbox cannot start PostgreSQL)**. The DB case seeds a second owner membership for one account, explicitly links that account to A through the real SAML start/callback, checks the persisted binding, A-only listing, B context/invitation refusal, unchanged B invitation count and two committed A refusal audits. It also checks A context/invitation success and the separate ordinary session before/after linking. During source review, gave this NEW fixture a unique verified email domain to avoid colliding with the existing global-domain test; no old fixture/assertion changed. This is the 18th authored PostgreSQL case, including CI repair 1's audit-payload regression.

The targeted diagnostic command, from `apps/api`, was `./node_modules/.bin/vitest run src/auth/sso/action-paths.test.ts -t 'Round 1 / checker reproductions'`:

| Phase | Exit and exact counts |
| --- | --- |
| RED, before provider repair | 1; **3 failed, 0 passed, 7 excluded by the name filter (10 collected)**. B context and invitation resolved, and the listing contained B. |
| GREEN, after provider repair | 0; **3 passed, 0 failed, 11 excluded by the name filter (14 collected at that point)**. |

No test uses `.skip`, retries or an increased timeout. Name filtering above isolates the required three reproductions only; the full auth diagnostic below runs every case. Added eight auth cases in total: the three ports; ordinary two-tenant behavior with exact response objects; normal bound-tenant A behavior; HTTP session-controller/tenant-guard/invitation-controller outcomes with 403 bodies and no write; exact membership-ID binding/revocation and persisted-connection audit routing; and shared Nest/Next factory behavior. HTTP coverage invokes the real controller and guard without a listening socket; it is transport-level unit coverage, not a live HTTP-server/browser run.

**Fix 2 — DONE in source; actual PostgreSQL verification remains NOT RUN.** Confirmed CI repair 1 already corrected `(e->'payload') - ARRAY[...]` and preserved unrecognized database errors through `ErrorOptions.cause` and the SSO translator. Kept both fixes. Reviewed every JSON operator expression in 0114 and all repository SQL. Made both extraction levels explicit in metadata/scope chains, parenthesized extracted values in comparisons/casts/values and the complete subtraction/concatenation expressions. No `#>`, `#>>` or `@>` expression occurs in these files; the repository has no mixed JSON SQL operator expression. Underlying error causes still stay server-side, as the existing raw/wrapped controller tests assert.

Migration **0114 only**, corrected in place. The new `connectionId` property on its session-scope JSON is internal and comes from the immutable binding; it lets ordinary identity refusals audit the actual connection. No new table, column, migration, grant, policy, role or edit to any merged migration. No data backfill. Unmerged migration rollout remains fresh/upgrade testing in CI; do not apply this file over an already-installed 0114 without an explicit forward-fix plan. No assertion about actual catalog/upgrade verification is made here.

### Every session-to-context path traced

- **Shared ordinary bridge:** `IdentityApplication.context` → `resolveVerifiedTenantContext` → shared provider `authenticate/findMembership` → stamped constructor. Its selector/header conflict, origin and CSRF logic are unchanged.
- **Nest ordinary identity:** `GET /auth/session` → `IdentityController.session` → `IdentityApplication.session/principal/memberships`; `POST /auth/invitations` → `IdentityController.invite` → `IdentityApplication.invite/context` before `identity.invite_member`. `ApplicationAuthGuard` resolves ordinary-cookie context on every non-health/non-auth route, using the same application; its commercial synthetic-only refusal remains unchanged. `TenantAuthGuard` is the provider-neutral bridge consumer (no separate production instantiation currently exists).
- **Next ordinary identity:** `GET /api/auth/session` and `POST /api/auth/invitations` call that same factory/application through `identity-server.ts`; session listing and invitation context therefore cannot bypass the binding. The factory regression executes this adapter. No other Next path resolves a `jobguard_session` into tenant context.
- **SSO paths on both transports:** Nest `GET /auth/sso/:connectionId/start` and Next `GET /api/auth/sso/[connectionId]/start` → `SsoApplication.view`; corresponding POST start routes dispatch admin commands → `admin`, or an explicitly requested link → `start(linkExisting)`. All three call `resolveVerifiedTenantContext` through the SSO facade over the same restricted base. SAML callback routes issue a server-bound session and do not construct a tenant context from an existing session; SQL linking rechecks the already-authorized connection/session/membership. Non-link start uses no authenticated session authority.
- **Identity writes inventory:** invitation creation is the only merged identity write that consumes an existing session. Invitation acceptance is `POST /auth/verify` / `/api/auth/verify`, using a verified email-code challenge, its immutable invitation and that invitation's account; it switches to a newly issued ordinary session independently of an existing browser session. Request/verify/signup consume no existing session authority. No invitation revoke or other session-authorized membership/identity command is merged. SSO connection/domain/mapping writes are covered by `admin` above.
- **Workers:** no merged worker resolves tenant context from an identity-session cookie/token. Graphile `discover_outbox` reads infrastructure signals; `execute_outbox` stamps the signal's tenant through `verifiedTenantContextForQueuedJob`, then `ActionExecutor` rechecks immutable exact authorization/current actor membership. This is queued authorization, not session authentication. The exposed `SsoApplication.checkWorkerAction` helper takes an already-stamped context, never mints one, and its existing SQL `sso_action_allowed` checks binding tenant/connection/session/membership/expiry/revocation/permission per execution. No new worker is registered. Its existing PostgreSQL cases remain authored, NOT RUN.
- **Separate practice paths:** `jg_session`/`PracticeAccess`, contractor practice commands, and `authenticatePracticeSession` use their independent synthetic registry/digest and never accept a `jobguard_session` bearer as practice authority. No SAML session can select either practice membership through that cookie path; ordinary-cookie guards remain ahead of synthetic-only actions. No change to these retained/pinned paths.

Repository-wide searches for authentication, `resolveVerifiedTenantContext`, ordinary identity factory/context consumers and session-bound worker routines informed this list. No existing path was silently moved to a new bridge.

### Lane amendment and changed files

ONLY the `ent-10a` line in `config/agent-lane-assignments.json` changes. The sole newly allowed file is **`apps/api/src/auth/persisted-auth-provider.ts`**, because all shared identity consumers already go through it and it must enforce session authority before returning memberships. No other file from the widened set needed an edit; no other lane line changed.

Other round-1 files were already in the issued lane: `sso/action-paths.test.ts` (ports/HTTP/factory/ordinary/A regressions); `enterprise-identity.integration.test.ts` (appended real-DB regression plus import only); `enterprise-identity-repository.ts` (internal scope-result type); `0114_enterprise_identity.sql` (connection reference and explicit JSON grouping); `docs/contracts/enterprise-identity-v1.md` (shared binding behavior); this appended receipt. The integrator's BUILD_PLAN ledger and all dependency/pin files are unchanged.

### Commands and actual results

Node **24.17.0**; supplied dependencies only. Required workspace build attempt was made before the unit reproductions. Its launcher, like all six subsequent prescribed pnpm checks, refused before executing any task:

> [ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.

No `pmOnFail=ignore`, package-manager change or signature-check bypass.

| Prescribed command | Actual exit / result |
| --- | --- |
| `pnpm turbo run build --filter=@jobguard/api...` | 1; launcher refused; zero builds executed. |
| `pnpm typecheck` | 1; launcher refused; zero checks executed. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; launcher refused; zero checks executed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; launcher refused; zero checks executed. |
| `pnpm --filter @jobguard/api exec vitest run src/auth` | 1; launcher refused; zero tests executed. |
| `pnpm build` | 1; launcher refused; zero builds executed. |
| `pnpm openapi:check` | 1; launcher refused; zero checks executed. |
| `node tools/dependency-audit.mjs` | 2; `Dependency scan did not complete. This is not a clean scan.` Registry audit NOT RUN successfully. |

Installed-tool diagnostics are separate evidence:

| Diagnostic command | Exit / observed result |
| --- | --- |
| `./node_modules/.bin/tsc -p packages/core/tsconfig.json`, likewise config/storage/ai/db | Each 0; emitted imported workspace dependencies before tests. DB build repeated after its scope-type edit, exit 0. |
| API `./node_modules/.bin/vitest run src/auth/sso/action-paths.test.ts -t 'Round 1 / checker reproductions'` | RED 1 (0 passed / 3 failed / 7 name-filtered); GREEN 0 (3 passed / 0 failed / 11 name-filtered), as above. |
| Root `./node_modules/.bin/vitest run src/auth/sso/action-paths.test.ts -t 'Round 1 / checker reproductions'` | 127; wrong directory, no root Vitest binary; zero tests. Correct API-directory invocation above supplied GREEN evidence. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0; core purity (125 files), lane, money and commercial-boundary checks. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 0; ENT-10a lane, including its sole new shared-provider allowance. |
| API `./node_modules/.bin/vitest run src/auth`, first full diagnostic | 1; **215 passed / 3 failed (218)**, **5 files passed / 2 failed (7)**. Two unchanged scanner cases (lines 742 and 1210) and the new factory test timed out at 5000ms. No assertion failure. Moved the NEW test's imports out of its timed body; no scanner edit/timeout change. |
| `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` | 0; no diagnostics, including new auth cases. |
| API `./node_modules/.bin/nest build` | 0; no diagnostics. |
| `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit` | 0; no diagnostics. |
| `node node_modules/typescript/bin/tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --skipLibCheck --esModuleInterop --experimentalDecorators --emitDecoratorMetadata packages/db/test/enterprise-identity.integration.test.ts` | First 2; NEW helper inferred UUID-template types from ordinary fixture credentials and refused opaque SAML strings. Changed ONLY that helper to use `IdentityApplication.invite`'s credentials type. Final 0; no diagnostics; zero PostgreSQL tests executed. |
| API `node --import tsx src/generate-openapi.ts --check` | 0; generated contract still matches; no OpenAPI edit. |
| Web `../../node_modules/.bin/next build` | 0; compiled/typechecked, generated 25/25 static pages and completed build traces, including ordinary and SSO identity routes. Existing workspace-root, CSS/autoprefixer and warning-cache warnings; no browser execution. |
| API `./node_modules/.bin/vitest run src/auth --maxWorkers=1`, final diagnostic after builds stopped | **0; 218 passed / 0 failed / 0 skipped (218), 7 files passed (7)**, including all 145 unchanged scanner cases and all 15 action-path cases. Complete auth set, serialized workers, original timeouts. This is installed-tool evidence, not a prescribed pnpm/CI pass. |
| `git diff --check`; read-only byte/test-body/lane inspection | 0; no whitespace error; protected originals unchanged, pre-existing ENT-10a bodies preserved, exactly one lane line changed. |

### NOT RUN and strict self-review

- All 18 cases in `enterprise-identity.integration.test.ts`, M0-6L identity PostgreSQL tests, other database suites, `pnpm test:db` and `pnpm test:migrations`: **NOT RUN (sandbox cannot start PostgreSQL)**. New test authored first; no claimed red/green PostgreSQL execution.
- `ENT-10a.spec.ts` in both projects and all browser suites: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. HTTP controller/guard unit coverage and Next build are not browser journeys.
- Clean pinned install: NOT RUN; supplied dependencies/download prohibition. Full `pnpm test`: NOT RUN; includes unavailable database suites. Registry audit unsuccessful as above. Live IdP/real-user/D04/G5 founder evidence NOT RUN / HELD. Native HELD until M3.
- Finding 3, malformed route handling: **LATER, deliberately unchanged**. OIDC and emergency-access administration HELD; SCIM ENT-10a2, audit export ENT-10b, assurance pack ENT-10c remain LATER SUB-LEAF. Nothing in any held lane built.

Self-review re-read the round-1 diff against HEAD and the leaf diff against origin/main. Traced every session consumer listed above; ordinary sessions' response projections and code/invitation verification paths remain unchanged. No lower-level business/context constructor, commercial permission, Decision, financial or worker scheduling boundary was amended. Bound B writes return before repository SQL, and refused lookups audit the persisted connection without leaking tokens/addresses. The new DB fixture's unique domain fix avoids global-domain interference; fixture account linking is explicit.

Byte comparisons against HEAD and origin/main prove `identity.test.ts`, `auth.test.ts`, `identity.integration.test.ts`, the scanner and its seven pins are unchanged. The required `git diff origin/main -- apps/api/src/auth/identity.test.ts apps/api/src/auth/auth.test.ts packages/db/test/identity.integration.test.ts` is empty. Existing ENT-10a unit/integration bodies remain byte-identical, with only new cases/imports appended. Other lanes, merged 0111, packages/lockfile/workspace settings and BUILD_PLAN are unchanged. No existing assertion was relaxed/deleted/repointed/skipped and no timeout increased. No out-of-lane fix was needed; no founder typed yes was inferred.

Final serialized auth diagnostic passed all 218 cases, including the original scanner, without any scanner/pin/assertion/timeout edit. Initial timeout outcomes remain recorded above. Removed generated dist/.next/.pnpm-store/build-cache artifacts; supplied node_modules retained. Final installed lint/lane and whitespace checks are recorded as exit 0 after cleanup. Intended conventional subject/body written to `/private/tmp/jg-msg-ent-10a.txt`; no git commit/add/checkout/push. Dispatcher owns the repaired head. Source and installed-tool results are not PostgreSQL verification or independent review.

Builder receipt only — not independently verified, not accepted. Fresh Opus/Sol exact-head reviews, CI database/browser results and separate technical acceptance remain outstanding after dispatcher commit.
