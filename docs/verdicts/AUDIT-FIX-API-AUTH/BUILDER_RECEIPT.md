# AUDIT-FIX-API-AUTH — builder receipt

Issued 13 October 2026 by dispatcher 4. Branch `codex/sandbox/audit-fix-api-auth`; HEAD and `origin/main` both `e4cb8437d044746300c377647f6061d06cd960cc`. Check lane **RED** (sign-in, roles, tenancy). No independent verdict or acceptance is claimed.

**STOP: the finding requires a migration.** The task explicitly says “No migration unless the finding cannot be fixed without one (then STOP and say so).” No migration, product code or existing test was changed.

## Findings

- **BLOCKING 1 — DROPPED from this attempt:** cannot reproduce the required persisted-session/contractor-command failure with an executed failing test in this sandbox, where PostgreSQL and localhost binding are prohibited.
- **LATER 2:** Nest's SSO success test substitutes `/auth/sso/.../callback`, while real metadata advertises `/api/auth/sso/.../callback`; the state-cookie path and callback composition need the report's real-application regression test. Listed only; no change.

The report's five test-improvement suggestions are also deferred: real SSO callback composition in `sso/action-paths.test.ts`; real rollback/refusal auditing in `sso/sso-required.test.ts`; concurrent persisted emergency-proof replay in `sso/sso-emergency.test.ts`; individually isolated invalid linking inputs in `sso/linking.test.ts`; and two persisted invitations proving exact selected-UUID consumption in `auth.test.ts`.

Source-inspected evidence explains the migration stop, without claiming a reproduced failure: `IdentityRepository.memberships` calls `identity.sso_session_memberships`, which delegates to `identity.current_memberships`. The latter checks `membership.revoked_at` and expiry, but not `app.contractor_membership_revocation`. `identity.sso_invite_member` delegates to `identity.invite_member`, whose owner authorization has the same omission. `membership.revoke` inserts the separate contractor revocation fact in migration 0138. Ordinary sessions have no SSO binding, so `identity.sso_session_scope` returns null. These definitions are installed database routines; editing historical migration SQL would not repair an already migrated database. The restricted identity credential has no `app` schema access. Any future correction must preserve the invitation transaction's authority check and revocation serialization; an application precheck alone cannot fix that database boundary.

## Changes and invariant preservation

- Added one compact lane row with exactly two allowed paths: the lane catalogue and this receipt. Catalogue before: no `audit-fix-api-auth` row; after: the new row shown in the diff. Existing catalogue entries unchanged.
- No existing expected value, refusal, count, pinned name or fingerprint changed. `apps/api/src/auth/context-boundary.test.ts` and its pinned lists untouched. No premise-establishing setup edits.
- No grants, migrations, external actions, real data, spending or Git writes to this repository. Standard F is unaffected because no grant or controlled writer was added. The general tool-test invocation was interrupted after identifying that its lane fixtures invoke Git writes in temporary repositories; that interrupted run is not claimed as a pass.

## Verification

Node `v24.17.0`. Dependencies were already installed; no install was run and no clean-install claim is made. The default `pnpm --version` and `pnpm --manage-package-manager-versions=false --version` launcher attempts stalled on package-manager setup and were interrupted. An already installed pnpm 9.0.0 executable could report its version, but is not the pinned pnpm 10.28.1, so verification below uses installed local executables directly. These are equivalents/subsets, not claims that the root pinned `pnpm` scripts passed. Logs are in `/private/tmp/jg-audit-fix-api-auth-*.log`.

| Command actually run | Result |
| --- | --- |
| `./node_modules/.bin/tsc -p tsconfig.json --noEmit` in `packages/{config,core,storage,ai,db}` and `apps/{api,web}` | PASS, all seven packages; these are each package's typecheck/lint commands. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | FAIL at lane check: HEAD equals origin/main, so the unchanged checker refuses a self-comparison. Core purity passed before that refusal. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Same refusal; dispatcher must rerun after committing. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | PASS. |
| Working-tree path check using unchanged `selectLane`/`matches` exports and read-only Git diff/untracked inventory | PASS for exactly the two allowed files; deterministic substitute, not a lane-lint pass. |
| `node --test tools/*.test.mjs` | INTERRUPTED; lane fixtures contain temporary-repository Git writes. |
| `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | PASS, 19 tests. |
| Local `vitest run` in config and storage | PASS, respectively 1 and 2 tests. |
| Local `vitest run --maxWorkers=2 src` in core | PASS, 80 files / 2,415 tests. Initial unrestricted run timed out on two receipt-allocation cases; a later unrestricted retry discovered emitted `dist` test duplicates and failed two source-inspection cases. The final source-only run preserved every assertion. |
| Local `vitest run --maxWorkers=2` in AI | PASS, 5 files / 80 tests after dependency builds. |
| Local `vitest run --maxWorkers=2` in web | PASS, 33 files / 784 tests after dependency builds. |
| API local `vitest run --maxWorkers=2` with 63 explicitly selected source files | 62 files passed / 1,542 assertions passed; 1 suite failed and 1 test skipped in `final-account-lock.isolation.test.ts`, whose dynamic PostgreSQL fixture cannot find a permitted port. PostgreSQL did not start. Seven known HTTP/database suites were excluded: `auth/sso/action-paths.test.ts`, the four `contractor/*.http.test.ts` files, `health.test.ts`, and `shadow-isolation.application.test.ts`. |
| DB local `vitest run --maxWorkers=2 src`, then `--maxWorkers=1 src` | Both FAIL on existing `[C-OPS-1]` source-scan timeout in `src/audit-checkpoint-handoff.test.ts`; final run 3 files passed / 84 assertions passed, 1 failed. No expectation or timeout edited. |
| Local `tsc -p tsconfig.json` in the five packages; local `nest build` in API | PASS, all six builds. |
| Local `next build` in web | PASS; existing workspace-root and CSS autoprefixer warnings. |
| API local `tsx src/generate-openapi.ts --check` | BLOCKED: CLI's IPC socket returns `EPERM`. |
| API `node --import tsx src/generate-openapi.ts --check` | PASS after dependency builds, without the CLI IPC server. |
| `git diff --check` | PASS. |

Initial AI/DB/API/web unit attempts and the first `node --import tsx` OpenAPI attempt failed resolving absent dependency `dist` entrypoints. The required dependency builds fixed that setup; final outcomes are listed above. No tests were changed to resolve those failures. AI evaluation was fixture-only, not a live-provider check.

## Dispatcher checks and remaining hold

On the Mac or GitHub CI, after the dispatcher commits, run the pinned `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm test`, `pnpm build`, `pnpm openapi:check`, `pnpm test:db`, `pnpm test:migrations`, and `pnpm test:e2e`. The API HTTP suites and `final-account-lock.isolation.test.ts` need the permitted localhost/database harness. This sandbox must not start PostgreSQL or a browser. A reissued migration-capable task must first add and execute `ordinary identity rejects contractor-command revocation` using the existing enterprise identity fixture and a persisted ordinary owner session with SSO off: revoke through `ContractorRepository.command`; assert no tenant membership in `IdentityApplication.session`, `TENANT_FORBIDDEN` from `context`, and refusal from `invite` with unchanged invitation rows. No behavioral failing/passing evidence exists in this attempt. The finding remains unresolved and technical acceptance is held; an independent exact-commit verdict and separate acceptance are still required.

Intended conventional commit message: `/private/tmp/jg-msg-audit-fix-api-auth.txt`. The dispatcher owns commit/push; this receipt is bound to the inspected base and working-tree diff, not an invented builder commit.
