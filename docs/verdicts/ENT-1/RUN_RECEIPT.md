# ENT-1 builder run receipt — 3 October 2026

Builder handoff only. **Technical acceptance remains HOLD:** PostgreSQL/browser execution, a Claude verdict bound to the dispatcher-created commit, and separate acceptance are outstanding. This document is not an independent verdict.

Base: `3e0764b639e5a0cdeb1ada1d17dadb90cc2ba24a`; branch `codex/sandbox/ent-1`. The working tree is uncommitted because `.git` is read-only and the dispatcher owns the commit. Intended message: `/private/tmp/jg-msg-ent-1.txt`. No add/commit/checkout/push/merge/PR command was run.

## Result and changed contracts

ENT-1 adds operations-only, append-only commercial-track assignments; a tenant/region/branch tree; teams; membership/team events; scoped contractor grants and revocations; restricted client approvers; client organisations and immutable client contract/approval-rule versions. The existing M0-6 membership identity, revocation and expiry fields are reused. Contractor access derives from current persisted grants, not the old small-builder role permission matrix. Owners bootstrap administration but need explicit supervisor/surveyor/commercial-manager grants for approval permissions. Restricted client memberships cannot acquire ordinary grants or another client binding.

`packages/core/src/contractor.ts` defines `contractor-command.v1`, `contractor-query.v1`, `contractor-workspace.v1`, `approval-rules.v1`, `client-contract.v1`, the permission × role × scope matrix, exact GBP integer pence and exact adjustment ratios. ENT-5 owns rule evaluation and approval execution; no approval, commercial Decision, outbox work, invoice or ledger posting is created here. ENT-2 owns actual SoR versions and work-order/job assignments; this task stores declared SoR version references without inventing those tables or jobs. CH-3b owns the later customer-registry link.

Nest and Next use `ContractorApplication` and the same repository:

| Next contract | Nest contract | Behaviour |
| --- | --- | --- |
| `POST /api/contractor?action=start` | `POST /contractor/practice` | Generate minimal isolated fictional organisation; no provider action |
| `GET /api/contractor` | `GET /contractor` | Resume persisted organisation from bearer session |
| `GET /api/contractor?tenantId=…&resource=contracts&id=…` | `GET /contractor` with the same query | Scoped immutable contract reads; unknown/out-of-scope IDs return NOT_FOUND |
| `POST /api/contractor` | `POST /contractor/commands` | Versioned administration command; current grants, idempotency and expected organisation revision |

Nest POST uses its existing default 201 status; Next uses 200. Both return the same receipt/view schema. Nest's synthetic standalone POST origin is `http://localhost:3000`; the deployed Next adapter checks the request's own origin. Both authenticate generated session handles against persisted membership and independently require server `JOBGUARD_ENV=synthetic_demo`. The database routines additionally require `jobguard_synthetic_demo`. A tenant requested by the client never establishes authority. The bootstrap handle is the existing HttpOnly/SameSite synthetic cookie; the new control-plane mapping exposes only its generated principal. Live entered-code delivery/SSO is not claimed or enabled.

Admin UI: `/admin/contractor`, reachable from Jobs → Account → Contractor organisation practice. Regions, branches, teams, fictional memberships/grants, moves/revocations, clients, immutable contract/rule revisions and source identities are server-backed. Unsaved drafts are labelled; errors get focus; primary actions have visible keyboard focus and 44px minimum targets; the existing sandbox banner remains. This task introduces no job workflow or job fixture: C7's authoritative reload/deep-link/second-context and Jobs-navigation assertions bind to the organisation and contract/version source IDs. No localStorage supplies business state.

## Migration and invariants

Only `0054_contractor_organisation.sql` is added, after the current supported 0000–0041 schema. No other migration number is used; the dispatcher's 0042–0053 reservations are untouched. New business tables have non-null tenant IDs, qualified relationships, FORCE RLS, migration ownership and SELECT-only runtime grants. Control-plane exception: `contractor_practice_session`, inaccessible directly to runtime/infrastructure, with a bounded session lookup and generated-fixture routine. Operations track assignment has no runtime/infrastructure EXECUTE grant. It requires an immutable synthetic agreement reference, expected revision and same-transaction audit event. Real assignments remain disabled pending policy approvals.

One bounded admin routine verifies membership, track and current scopes, serializes the tenant's organisation revision, uses existing command receipts, and requires a same-transaction actor/hash-bound audit event through a deferred constraint. A changed replay conflicts; racing revisions produce one effect or STALE_REVISION. A scoped administrator cannot use an outside membership ID to grant access or move it into their scope. Team moves append events and revoke/replace the old team grants; unrelated team memberships remain. No business lock follows the audit-head lock. Contract and rule documents are validated both at the Zod boundary and with database checks; versions and events reject updates/deletes, including with migration credentials. Existing demo/catalog expectations are expanded, not removed.

Affected invariants: AGENTS §§5.1, 5.3–5.5, 5.7, 5.10–5.11, 5.13 and 5.16; BUILD_PLAN §2.4 C1–C8 and §9.1 organisation/role/client contracts. RLS protects tenant isolation under a correctly authenticated context; the scoped repository protects access within that tenant. Neither is presented as protection from a compromised privileged connection or a server selecting a false principal.

Expand-only migration; no backfill rewrites existing tenants/jobs. Forward fix: disable the new application paths, retain immutable history, then issue a reviewed corrective migration. Details are in `packages/db/MIGRATIONS.md`. No new provider, credential, external destination, production gate approval or alert channel is introduced. Typed failures use existing API error handling; synthetic-only operations remain disabled outside the sandbox.

## Commands actually run

Dependencies were already installed; no install/download command was run. Node is **24.17.0**. The installed default pnpm launcher stalled and was cancelled (exit **130**, including the initial typecheck attempt and launcher/version diagnostics). Subsequent pnpm commands use the already-cached **10.28.1** through a temporary PATH wrapper in `/private/tmp/jg-ent-tools`; no repository toolchain files were changed. Turborepo reported cache IO warnings from restricted shared cache writes, while successful commands still exited 0.

| Validation command | Exit | Result |
| --- | ---: | --- |
| `pnpm typecheck` (cached pinned launcher, repeated after source changes) | 0 | All seven packages; final run passed |
| Direct `node …/typescript/bin/tsc -p … --noEmit` for core, db, api and web | 0 | Passed during launcher diagnosis |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Purity passed; commit-range lane check refuses HEAD=origin/main self-comparison before package lint |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same fail-closed self-comparison condition; no git write used to manufacture a range |
| `pnpm turbo run lint` | 0 | All seven package lint/type checks |
| `node tools/core-purity-lint.mjs` | 0 | Passed |
| `node tools/money-arithmetic-lint.mjs` | 0 | Passed |
| `node tools/commercial-boundary-lint.mjs` | 0 | Passed |
| Read-only working-tree path check using existing `selectLane`/`matches`, `git diff HEAD`, untracked paths, and base registry comparison | 0 | Every changed/new file allowed; all earlier lanes unchanged; this is **not** the commit-range lane check |
| `node --test tools/*.test.mjs` | 0 | 39 tests |
| `pnpm --filter @jobguard/core test` | 0 | 70 files, 1,648 tests; includes role/permission/scope and schema conformance |
| `pnpm --filter @jobguard/web test` | 0 | 7 files, 56 tests |
| `pnpm --filter @jobguard/api exec vitest run src` | 1 | 76 passed; existing health test fails EPERM attempting a localhost listener |
| `pnpm --filter @jobguard/api exec vitest run src --exclude src/health.test.ts` | 0 | All 76 non-listening API tests; exclusion is command-local, not a CI/test-file change |
| `pnpm --filter @jobguard/db exec vitest run src` | 0 | 3 pure seed tests; **not** database verification |
| `pnpm --filter @jobguard/config test` | 0 | 2 tests |
| `pnpm --filter @jobguard/storage test` | 0 | 4 tests |
| `pnpm eval` | 0 | 72 synthetic fixture tests; no live model call |
| `pnpm build` (repeated after source changes) | 0 | All seven packages, production Next build including new routes |
| `pnpm --filter @jobguard/api openapi:generate` | 1 | tsx CLI cannot create its local IPC socket (EPERM) |
| From apps/api: `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts` | 0 | Same repo generator; generated additive OpenAPI paths, no hand edit |
| `pnpm openapi:check` | 1 | Same tsx IPC restriction |
| From apps/api: `node --import ./node_modules/tsx/dist/loader.mjs src/generate-openapi.ts --check` | 0 | Same generator's exact committed-file comparison passed |
| `pnpm --filter @jobguard/db exec vitest list test/contractor.integration.test.ts` | 0 | PostgreSQL tests collected; not executed |
| `pnpm --filter @jobguard/web exec playwright test --list --project=mobile-360 --project=desktop ENT-1.spec.ts` | 0 | Four browser cases collected; not executed |
| `git diff --check` | 0 | No whitespace errors |

The distinct local non-database/non-browser suites above contain **1,900 passing assertions**; the one API listener assertion remains sandbox-blocked. Full root `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, and Playwright execution were **not run** because this dispatcher sandbox cannot start PostgreSQL or bind localhost. No clean reinstall, live integration, deployment, security approval, independent model verdict, acceptance or screenshot/trace is claimed. Existing fail-closed CI/security checks remain unchanged.

## Required CI/checker evidence

Run the existing root checks, PostgreSQL suites and `pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop ENT-1.spec.ts` against the production build. Existing CI already runs the complete DB/unit and browser suites, including this new spec. Capture Playwright traces/screenshots from execution; collection is not a pass.

New real-PG assertions cover fresh/upgrade compatibility, table grants/owners/FORCE RLS, missing and cross-tenant contexts, qualified hierarchy/client/member/team links, all roles/permissions and actual admin commands/queries across team/branch/region scopes, wrong-track and non-member principals, membership expiry/revocation, grant revocation and moves, restricted clients/optional named contracts, concurrent creation/commands, immutable documents, invalid rules and missing-audit rollback. No ORM or SQLite substitute is used.

Independent Claude must inspect the exact dispatcher commit and run the listed negative cases, then record PASS/HOLD/FAIL; a separate actor records technical acceptance. D02/D12/D16 and G1/G4-C/G5 remain separate founder/professional release evidence, not inferred from local checks. No real contractor data or charging is enabled.

Declared shared overlap requiring serialized review: lane registry, AppModule, generated OpenAPI, core/db/workspace exports, migration registry/documentation, web Account navigation and DB catalog/bootstrap expectations. **Undeclared overlap: none.** No adjacent ENT-2/ENT-5/CH-3b implementation is bundled.
