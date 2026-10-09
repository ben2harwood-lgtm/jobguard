# TENANT-STAMP-1 — builder receipt

Issued 7 October 2026 by the JobGuard integrator on Ben's decision card `jobguard-m0-6l-structural-tenant-lock-2026-10-07`, answer **Build the stamp**. Built in the dispatcher-supplied worktree for `codex/sandbox/tenant-stamp-1`. Builder evidence only: independent model verdict and separate technical acceptance are pending against the dispatcher's eventual exact commit. The dispatcher owns committing.

## Changes and scope

The first working-tree change appended only the `tenant-stamp-1` lane. Its final allow list has **44 entries**: the 42 changed/new source files, the lane file, and the requested `docs/verdicts/TENANT-STAMP-1/**` receipt scope. It remains compact one-line JSON with one trailing newline; other lanes are structurally unchanged.

`tenant-context.ts` now keeps a module-private `WeakSet<object>`. The membership constructor freezes and stamps the object it creates. `withTenant` refuses unstamped identities before reading `tenantId` or calling `pool.connect()`, retaining the existing UUID check and parameterized transaction-local configuration. No export registers arbitrary objects.

The sole non-membership constructor is **`verifiedTenantContextForQueuedJob(tenantId)`**, publicly re-exported by the package index. It validates a UUID, creates, freezes and stamps a new object, and documents its purpose: the worker's already-queued system jobs. The worker now calls it for its existing outbox task. Payload validation, job discovery, adapter selection, executor SQL and retries are unchanged. Executor SQL still joins authorization, an approved decision resolution and active membership and checks exact action bindings; this grants no extra worker authority.

Fee-illustration and recovery-demo repositories use the membership constructor with the existing demo identity, membership and tenant constants. Fixtures use stamped synthetic contexts through a package-private test helper; outbox's source unit test has a local equivalent so its TypeScript `rootDir: src` does not import an outside helper.

Evidence-pack authorization returns only the recorded actor reference. Each database/repository call receives a stamped context directly from the existing context function. Membership checks, response data, status handling and command parsing are unchanged.

**Capture remains unchanged under the explicit item 5 stop condition**, explained below. No auth implementation/scanner file was touched; the only auth edit adds tests.

Affected invariants: AGENTS §§5.1, 5.3–5.4; BUILD_PLAN §2.4 C4/C5/C8. No migration, schema, grant, RLS, SQL, provider, prompt, money policy or UI change. No new operational alert is needed; the existing `InvalidTenantContextError` remains the failure type. Copies/serialized contexts are intentionally incompatible. The stamp establishes object provenance within one module instance; it does not independently verify membership rows or defend against a compromised authorized bridge/privileged connection.

## Tests first: red then green

The boundary tests were written and executed while API/db production source remained unchanged from the dispatcher-supplied baseline; only the lane and boundary test had been added. The global pnpm 11 launcher stalled attempting to verify/switch to the project pin and eventually failed registry-fetch/signature verification before running tests. No install/download command was issued. The actual red run used installed Vitest directly:

`cd packages/db && ./node_modules/.bin/vitest run --maxWorkers=1 src/tenant-context.test.ts`

Exit **1**: **15 failed, 6 passed, 21 total**, one failed file. These names failed before implementation and pass afterward:

- `refuses object literal cast before connecting`
- `refuses spread copy before connecting`
- `refuses spread with another tenant before connecting`
- `refuses structured clone before connecting`
- `refuses Object.assign copy before connecting`
- `refuses Object.assign changed clone before connecting`
- `refuses prototype inheritance before connecting`
- `refuses proxy before connecting`
- `refuses tenantId getter before connecting`
- `refuses JSON round trip before connecting`
- `exports only two stamped constructors and no arbitrary-object registrar`
- `rejects invalid queued-job tenant` (empty string)
- `rejects invalid queued-job tenant not-a-uuid`
- `rejects invalid queued-job tenant 10000000-0000-4000-0000-000000000001`
- `stamps and freezes a UUID-validated queued-job context`

The original six passes were null/undefined refusal and direct, Promise, array and closure acceptance. **All 21 boundary tests now pass.** Forgery tests assert the typed error and zero connection/work calls; the getter throws if inspected, proving early refusal avoids it. Acceptance tests verify freezing, exactly the stamped tenant in `set_config`, transaction calls and release. The comment explicitly states that Promise/array/closure paths preserve identity and are accepted for that object's own tenant.

## Every converted hand-made context

Production conversions (original/final line numbers unchanged):

| File | Line | Replacement |
| --- | --- | --- |
| `apps/api/src/worker.ts` | 14 | `verifiedTenantContextForQueuedJob(parsed.tenantId)` |
| `packages/db/src/fee-illustration-repository.ts` | 2 | Membership constructor with all three existing demo constants |
| `packages/db/src/recovery-demo-repository.ts` | 8 | Membership constructor with all three existing demo constants |

All **44 fixture conversions** follow. Every replacement uses `testTenantContext` and preserves its original tenant expression, including foreign tenant constants, signalled tenant IDs and `randomUUID()`. `×2` means two distinct contexts on that line.

| File | Original line(s) | Final line(s) |
| --- | --- | --- |
| `packages/db/src/outbox.test.ts` | 14, 69 | 19, 74 |
| `packages/db/test/UIWIRE-10.integration.test.ts` | 2 | 3 |
| `packages/db/test/UIWIRE-11.integration.test.ts` | 2 | 3 |
| `packages/db/test/UIWIRE-12.integration.test.ts` | 12, 120 | 13, 121 |
| `packages/db/test/activation.integration.test.ts` | 2 | 3 |
| `packages/db/test/audit.integration.test.ts` | 14 | 14 |
| `packages/db/test/capture.integration.test.ts` | 3 | 4 |
| `packages/db/test/commands.integration.test.ts` | 13 | 14 |
| `packages/db/test/commercial-integrity.integration.test.ts` | 12 | 13 |
| `packages/db/test/decision-inbox.integration.test.ts` | 2 | 3 |
| `packages/db/test/evidence-pack-sources.integration.test.ts` | 29 | 30 |
| `packages/db/test/evidence-packs.integration.test.ts` | 27, 85 | 28, 86 |
| `packages/db/test/evidence.integration.test.ts` | 16 ×2 | 17 ×2 |
| `packages/db/test/final-account.integration.test.ts` | 2, 11 | 3, 12 |
| `packages/db/test/inbox-relevance.integration.test.ts` | 1 | 2 |
| `packages/db/test/job-import.integration.test.ts` | 12, 20 | 13, 21 |
| `packages/db/test/job.integration.test.ts` | 2 | 3 |
| `packages/db/test/ledger.integration.test.ts` | 2 | 3 |
| `packages/db/test/materials.integration.test.ts` | 2 | 3 |
| `packages/db/test/outbox.integration.test.ts` | 27, 141 | 26, 140 |
| `packages/db/test/practice-finding-scope.integration.test.ts` | 15, 37 | 16, 38 |
| `packages/db/test/practice-scope.integration.test.ts` | 17 ×2 | 18 ×2 |
| `packages/db/test/quote.integration.test.ts` | 2, 5 | 3, 6 |
| `packages/db/test/readiness.integration.test.ts` | 1 | 2 |
| `packages/db/test/recovery-cases.integration.test.ts` | 3, 44 | 4, 45 |
| `packages/db/test/recovery.integration.test.ts` | 12 | 13 |
| `packages/db/test/review.integration.test.ts` | 20 | 19 |
| `packages/db/test/shared-money-origin.integration.test.ts` | 14 | 15 |
| `packages/db/test/supplier-documents.integration.test.ts` | 2 | 3 |
| `packages/db/test/supplier-matching.integration.test.ts` | 2 | 3 |
| `packages/db/test/tenancy.integration.test.ts` | 19 | 20 |
| `packages/db/test/variation.integration.test.ts` | 2 | 3 |
| `packages/db/test/workspace-read.integration.test.ts` | 81 | 81 |

`packages/db/test/tenant-context-test-utils.ts` is outside public package exports and calls the source membership constructor with synthetic identity/membership UUIDs. The local helper in `src/outbox.test.ts` uses the same source module as its executor.

Deliberately malformed contexts remain unstamped: evidence-packs still passes `{}` to assert denial; tenancy now passes a malformed UUID literal directly to `withTenant`, keeping its existing asynchronous typed-error assertion instead of throwing synchronously in the fixture constructor. UIWIRE-12's random foreign tenant is genuinely stamped, preserving its `INVOICE_NOT_FOUND` assertion. Inbox's extra `membershipId` was not part of the context contract and remains independently supplied to its repository calls.

An initial regex replacement consumed a call parenthesis in UIWIRE-12. Syntax checking caught it; integration conversions were regenerated using TypeScript AST expression ranges. The corrected files passed syntax checks and Vitest collection. All 32 changed integration files retain **157 test declarations and 609 `expect` assertions**. No assertion was deleted, weakened or skipped, and no timeout was added or lengthened.

## Worker callers and module instances

The new source test **`allows only the worker to call the queued-system-job context constructor`** recursively inspects apps/packages/tools source, excluding tests/generated files and only the constructor definition/public re-export. It requires the exact caller list `apps/api/src/worker.ts`; it passes. The existing auth membership-constructor caller assertion is unchanged.

- The db package exposes `src/index.ts` for TypeScript types and `dist/index.js` for runtime imports. API and web workspace links resolve to this worktree's same `packages/db` directory.
- API and its tests use runtime imports from `@jobguard/db`. The added test **`passes the principal bridge's stamped context to the same package module's database boundary`** resolves a synthetic authenticated membership through the unchanged sole bridge, then successfully invokes public `withTenant` with a recording fake pool.
- Db tests consistently use source-relative imports. The shared helper imports `../src/tenant-context.js`, the same module reached by source repositories and `../src/index.js`. No db test mixes a source constructor with a package/dist repository.
- Next server routes compose API package entrypoints and the db package. The workspace seam passes a pool, not a context. E2E setup's direct dist import bootstraps synthetic data and transfers no stamped context into the server process. M4-3-S's `db/src` mention is only a comment.
- Built Next server output contains the boundary once, in shared webpack module **4458**, `apps/web/.next/server/chunks/2228.js`. Its membership constructor and `withTenant` close over the same `WeakSet`; `INVALID_TENANT_CONTEXT` occurs only in that server chunk. Next does not use the worker constructor, which is tree-shaken there.
- A built-public-exports check used both constructors from `dist/index.js` successfully and rejected a spread copy without a third connection.

No mixed-instance path was found; no import fix or global/shared stamp registry was introduced. Stamps do not survive serialization/process crossing. Queued execution reconstructs its context in the worker's own loaded instance.

## Capture stop; §14.3 receipt-only record

**Item 5 stopped; `capture.controller.ts` unchanged.** It currently reads a context-typed request member and returns 401 `UNAUTHENTICATED` when absent. `app.module.ts` has no `AuthProvider` binding, `TenantAuthGuard` provider or route wiring. The only provider implementation is `MemoryAuthProvider`, used in auth tests; no runtime principal/session provider, allowed-origin injection or request-credential composition exists for this endpoint. Safely invoking `resolveVerifiedTenantContext` at use requires that auth composition and credential path. Adding a memory provider or casting/wrapping the request member would introduce authentication behavior or evade the requested change. This exceeds controller/test/minimum Nest wiring, and auth implementation is owned by PR #104/M0-6L.

**Discovered later style (BUILD_PLAN §14.3), receipt only:** 2026-10-07 — TENANT-STAMP-1 structural tenant provenance, issued on Ben's decision card, not a §12.3 card. Runtime stamp and evidence-pack repair built. Re-pointing real-tenant capture remains with M0-6L; it needs a composed runtime provider, allowed origin, existing session/CSRF/tenant credentials and route tests preserving the identical unauthenticated 401 and authorized/stale/foreign behavior. `BUILD_PLAN.md` was not edited. This receipt issues no additional work or approval.

## Executed checks

Runtime **Node 24.17.0**, pinned/installed **pnpm 10.28.1**, Vitest **4.1.11**. After the global launcher failure, pnpm commands used `PATH=/private/tmp/tenant-stamp-bin:$PATH`, pointing at the already-cached 10.28.1 executable. Dependencies were already installed; no clean reinstall was performed. Turbo replayed unaffected package cache hits and printed sandbox IO warnings; changed package checks executed.

| Command/check | Exit | Result/count |
| --- | --- | --- |
| Initial global `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/tenant-context.test.ts` | 1 | Launcher registry-verification failure; no tests ran |
| Initial `PNPM_MANAGE_PACKAGE_MANAGER_VERSIONS=false pnpm --version` | 1 | Same launcher failure; variable did not prevent attempted switch |
| Direct installed Vitest red command above | 1 | 15 failed, 6 passed / 21; baseline runtime unchanged |
| Cached pinned `pnpm --version` | 0 | 10.28.1 |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 src/tenant-context.test.ts src/outbox.test.ts` | 0 | 26 passed, 2 files |
| `pnpm typecheck` | 0 | 7/7 tasks successful, 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed (75 files); lane check refused self-comparison before remaining root checks |
| `pnpm lint:lanes` | 1 | Refused uncommitted self-comparison range; dispatcher commit/CI required |
| `pnpm turbo run build --filter=@jobguard/db...` | 0 | 3/3 successful, 2 cached; rebuilt db before API tests |
| `pnpm --filter @jobguard/db test src` | 0 | All db source units: 29 passed, 3 files |
| `pnpm --filter @jobguard/api test` | 1 | 109 passed, 1 failed / 110; 14 passed files, 1 failed; health test hit sandbox `listen EPERM`, with one unhandled socket error; chained OpenAPI not reached |
| `pnpm --filter @jobguard/api exec vitest run src/auth/auth.test.ts src/evidence-pack.application.test.ts --reporter=verbose` | 0 | 20 passed, 2 files, including both new auth tests |
| `pnpm turbo run lint` | 0 | 7/7 successful, 4 cached |
| `node tools/money-arithmetic-lint.mjs` | 0 | Boundary check passed |
| `node tools/commercial-boundary-lint.mjs` | 0 | Check passed |
| `node --test tools/*.test.mjs` | 0 | 42 passed, zero failed/skipped |
| `pnpm openapi:check` | 1 | tsx CLI IPC pipe bind forbidden (`listen EPERM`) |
| First root `node --import tsx apps/api/src/generate-openapi.ts --check` | 1 | `ERR_MODULE_NOT_FOUND`: tsx is an API dependency, not a root dependency |
| `cd apps/api && node --import tsx src/generate-openapi.ts --check` | 0 | Same generator/check via loader without CLI IPC; contract unchanged |
| Initial changed-fixture TS syntax check | 1 | Found UIWIRE-12 conversion error; repaired using AST ranges |
| Corrected TS syntax check | 0 | 33 integration/helper files; no PostgreSQL started |
| AST declaration/assertion count comparison | 0 | 32 integration files preserve 157 declarations and 609 assertions |
| `pnpm --filter @jobguard/db exec vitest list --json` | 0 | Collected 248 cases in 43 files; no hooks/tests executed, no PostgreSQL started |
| Built `dist/index.js` public-exports check, fake pool | 0 | Both constructors accepted; copied context refused; exactly 2 connections |
| Python exact lane/scope verification | 0 | 44 exact entries; compact JSON; only new lane changed; capture/auth implementation unchanged |
| `pnpm build` | 0 | 7/7 successful, 4 cached; Next generated 14 static pages; 6m43s |

Build emitted existing workspace-root/CSS autoprefixer warnings and sandbox IO warnings, but completed successfully. Diagnostic logs/source snapshots are under `/private/tmp/tenant-stamp-*` and are ephemeral, not committed evidence. Inspection used `rg` instead of the git-grep example, file reads, and Python/TypeScript AST checks. No direct git command or commit/push/merge/PR operation was run; mandated lane tools internally perform read-only git comparisons.

## CI and independent acceptance holds

This sandbox cannot bind localhost or start PostgreSQL. Real PostgreSQL integration/migration/regression and browser suites remain mandatory in GitHub CI after dispatcher commit/push. Collection/syntax checks are not PostgreSQL execution. Unqualified db `test` includes integration tests; `test src` ran all its units without starting forbidden PostgreSQL. No web source/workflow changed, so separate web units/new browser workflow were inapplicable; existing browser regressions still require CI. No AI/eval/native changes were made.

These **32 changed integration files** require CI coverage:

- `packages/db/test/UIWIRE-10.integration.test.ts`
- `packages/db/test/UIWIRE-11.integration.test.ts`
- `packages/db/test/UIWIRE-12.integration.test.ts`
- `packages/db/test/activation.integration.test.ts`
- `packages/db/test/audit.integration.test.ts`
- `packages/db/test/capture.integration.test.ts`
- `packages/db/test/commands.integration.test.ts`
- `packages/db/test/commercial-integrity.integration.test.ts`
- `packages/db/test/decision-inbox.integration.test.ts`
- `packages/db/test/evidence-pack-sources.integration.test.ts`
- `packages/db/test/evidence-packs.integration.test.ts`
- `packages/db/test/evidence.integration.test.ts`
- `packages/db/test/final-account.integration.test.ts`
- `packages/db/test/inbox-relevance.integration.test.ts`
- `packages/db/test/job-import.integration.test.ts`
- `packages/db/test/job.integration.test.ts`
- `packages/db/test/ledger.integration.test.ts`
- `packages/db/test/materials.integration.test.ts`
- `packages/db/test/outbox.integration.test.ts`
- `packages/db/test/practice-finding-scope.integration.test.ts`
- `packages/db/test/practice-scope.integration.test.ts`
- `packages/db/test/quote.integration.test.ts`
- `packages/db/test/readiness.integration.test.ts`
- `packages/db/test/recovery-cases.integration.test.ts`
- `packages/db/test/recovery.integration.test.ts`
- `packages/db/test/review.integration.test.ts`
- `packages/db/test/shared-money-origin.integration.test.ts`
- `packages/db/test/supplier-documents.integration.test.ts`
- `packages/db/test/supplier-matching.integration.test.ts`
- `packages/db/test/tenancy.integration.test.ts`
- `packages/db/test/variation.integration.test.ts`
- `packages/db/test/workspace-read.integration.test.ts`

CI must also execute full API health, root lint/lane checks over the committed range, normal OpenAPI and existing browser regressions. Independent different-model verdict bound to the dispatcher's exact commit and separate technical acceptance are pending. No self-acceptance or release approval is claimed; existing security/commercial/release gates remain unchanged.

No real data, live provider, spending, real send, production runtime, decision approval, deployment or release was used. No migration or timeout change. Intended conventional commit subject/body is written to `/private/tmp/jg-msg-tenant-stamp-1.txt`; the dispatcher commits after handoff.
