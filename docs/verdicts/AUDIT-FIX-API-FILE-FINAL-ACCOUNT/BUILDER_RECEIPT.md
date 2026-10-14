# AUDIT-FIX-API-FILE-FINAL-ACCOUNT — builder receipt

Task issued 13 October 2026 by dispatcher 4; built locally 14 October 2026. Branch: `codex/sandbox/audit-fix-api-file-final-account`. Issued base and unchanged HEAD: `c08a53784c05b54b18f7bfff87f4c7597032ca7e`. Working-tree changes only; the dispatcher commits and pushes. No git-writing command was run.

**Check lane: RED**, because these changes affect authoritative final-account money and issue authorization. The coordinator's path rules classify these paths AMBER; the semantic money/authorization floor raises the review to RED. This receipt is builder evidence, not an independent verdict or acceptance. A different model's exact-commit verdict and separate acceptance remain required under AGENTS §5.13.

Read: `AGENTS.md` rev 3.0, `BUILD_PLAN.md` §§2, 5.1–5.4, 7's M1-10/M1-11 entries, the archived M1-11 acceptance card referenced by §7, existing final-account/lock contracts and SQL, and `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-file-final-account.md`.

## Blocking findings

1. **FIXED in source and scripted regression: stale concurrent assembly can replace newer approved money.** Before the fix, `stale concurrent assembly cannot replace newer approved totals` failed at the expected stale-refusal assertion: A resolved successfully with B's revision rather than refusing its stale `expectedRevision:1`. This smallest reproducer pauses A after the old application precheck but before source reads, lets B publish revision 2 at 130000 pence net, then resumes A. It reproduces the discarded expected-revision defect; it does not claim to have executed the report's physical two-connection race. The application now forwards the existing expected revision to the versioned repository command. After active-owner validation, a tenant/job-scoped transaction advisory lock serializes assemblers before reading the head or sources. The repository checks the expected revision while holding that lock, including revision 0/first creation. A stale attempt writes no draft revision. The lock precedes insertion-trigger job locking and the final audit lock. A third scripted test pauses A after its variation snapshot, exercises a modeled waiting assembler, verifies stale refusal after A commits, and verifies retry totals of 130000/26000/156000 pence. This serializes assemblers; it does not claim that every other source writer uses this advisory lock.

2. **FIXED in source and scripted regression: proof invalidation retains invalid proof and an open issue gate.** Before the fix, `proof invalidation restores the persisted final-account gate` returned revision 2, the invalidated evidence and `issueBlocked:false` instead of the expected blocked revision 3 with no proof. The supported `ProofApplication.command` invalidation path runs the real proof command service in this test; finalized proof completion is infrastructure fixture setup and its returned proof view is doubled. The assembler now includes ordered immutable evidence-invalidation identities for that tenant/job in its source digest, and excludes their evidence IDs from the proof set. Returning to the previously empty proof set therefore creates a new immutable revision, advances the current pointer, invokes existing stale-authorization invalidation and appends the existing audit event in one transaction. Repeat builds reuse revision 3. Historical revision 2 and its proof remain unchanged. Jobs without invalidations retain their existing source-hash calculation. This avoids rewinding the revision counter or changing the existing unique source-hash constraint.

**DROPPED: none.** Both blocking findings had failing tests before the production edits.

Failing command before fixes: `node_modules/.bin/vitest run test/audit-api-file-final-account.test.ts --maxWorkers=1` in `packages/db`: exit 1, 2/2 failed for the reasons above. Captured before log: `/private/tmp/jg-final-account-before.log`. Final same command: exit 0, 3/3 passed; `/private/tmp/jg-final-account-after.log`. A separate temporary source-alias run also passed 2/2 before the third test was added; it is not a distinct database validation.

Two new PostgreSQL tests in `packages/db/test/audit-api-file-final-account.integration.test.ts` cover the stale admission race with two physical connections and persisted proof restoration using real evidence finalization, proof completion and invalidation services. They were typechecked but **not executed** here. They use the existing `jobguard_runtime` as the effective SQL role, without creating a role or granting anything. The underlying fixture session is a disposable PostgreSQL superuser and can assume roles; these tests do not prove a least-privilege login boundary. Existing tenancy/catalog suites remain mandatory.

## Scope and preserved guarantees

- No migration, schema change, role/grant change, new provider, external action, real data or spending. Standard F adds no grant obligations because this diff introduces no grants.
- No existing test file was changed, including `apps/api/src/auth/context-boundary.test.ts`. No existing expected value, refusal, count, pinned name or fingerprint was changed. No existing catalogue row was changed or added. No premise-establishing setup was inserted before an existing test call. Before/after under the standing setup/catalogue exception: **none**.
- One compact additive lane row registers `audit-fix-api-file-final-account` with seven exact allowed files. All previous lane rows remain byte-equivalent in content. Shared lane registration serializes with the coordinator; the API/repository/core files must serialize with any other task editing them.
- Affected invariants: exact frozen-baseline plus approved-variation totals (§5.2/§5.5); transaction-scoped expected revision and serialized assembly (§5.4); invalid proof cannot satisfy the rebuilt issue gate (§5.8); stale exact issue authorization is revoked (§5.3); append-only commercial history and transactional audit (§5.7). No fee, invoice, charge or outbox work is created by rebuilding.
- C1: existing rebuild/GET workflow only; no route, UI or provider behavior added. Browser regression suites remain required for the affected final-account workflow.
- Backwards compatibility: existing API `expectedRevision` remains optional; the internal strict v1 command now accepts it. Uninvalidated source hashes are preserved. First rebuild after an invalidation creates a new source hash/revision; previous rows are retained. No operational alert added. Rollback is code reversion, retaining immutable revisions; reverting also restores the defects and requires withholding affected use until a forward fix is applied.

## Later findings — receipt only

- **LATER 3:** assembly command IDs have no durable replay/payload-conflict receipt. Identical retries can fail stale or assemble later state; changed-payload reuse is not rejected. Not changed in this task.
- **LATER 4:** Nest does not map the current Zod/plain-Error failures to stable 400/409 responses. Stale repository errors remain plain `Error`; HTTP mapping is deferred as instructed.
- The report's five existing-test improvement suggestions remain deferred: schema-only API rebuild test; authority/money boundary coverage; manual final-account insertion test; directly invoked authorization invalidation test; core ordering and VAT rounding test. All existing assertions remain unchanged.

## Local verification

Dependencies were already installed; no install/download or clean pinned install was performed. Observed Node 24.17.0 and pnpm 11.8.0; repository pins Node 24.15.0 and pnpm 10.28.1. Pins and lockfile are unchanged.

Requested pnpm wrappers (`typecheck`, `lint`, `lint:lanes`, `build`, `openapi:check`) were each attempted with `LANE_BASE_REF=origin/main` and local launcher flags `pnpm_config_pm_on_fail=ignore pnpm_config_verify_deps_before_run=false` to prevent automatic package-manager downloads/dependency verification. Each exited 1 with `ERR_PNPM_UNSUPPORTED_ENGINE` (installed 11.8.0 versus pinned 10.28.1). No package installation completed. The initial bare `pnpm --version` stalled during automatic version switching and was interrupted (130); it is not a check pass.

Direct installed-binary results:

| Check actually run | Result |
| --- | --- |
| `node_modules/.bin/tsc -p packages/{core,config,ai,storage,db}/tsconfig.json` (each separate build) | All exit 0. Core/config/storage/AI/database outputs refreshed. |
| `node_modules/.bin/tsc -p packages/{config,ai,storage,db}/tsconfig.json --noEmit` and API/web equivalents | All exit 0; core full compilation above also typechecks. |
| `node_modules/.bin/tsc -p /private/tmp/jg-final-account-test-tsconfig.json` | Exit 0, both new regression files. Initial own-fixture optional-field errors were corrected without changing assertions. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | Final exit 0: core purity, lane, money arithmetic and commercial boundary checks. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Final exit 0, exact task lane. Initially refused `HEAD == origin/main`. During this session the external remote ref advanced to `bd959b01e857de0ba7cbd3588bab84add7d0f493`; no git-writing command here moved it. Final comparison used its merge base and included this working tree. |
| Deterministic working-tree allowlist/previous-lane/protected-test/migration check against issued base; `git diff --check` | Exit 0. Working-tree path classification using coordinator lane-floor rules was AMBER; semantic review raised to RED. Not a model verdict. |
| Selected safe `node --test` tool suites: commercial boundary, core purity, decision-check purity, decision records, dependency audit, policy gate sites, shared money origin | Exit 0, 17 tests. Git-writing lane fixture tests deliberately not launched. |
| Core `vitest run src --maxWorkers=1` | Exit 1, 2443 passed / 2 failed, 79 passed / 2 failed files. Unchanged 5000ms timeouts in receipt-allocation's denominator bound and enterprise-domain boundary scan; isolated retry recorded below. |
| AI/config/storage `vitest run src --maxWorkers=1` (each separately) | All exit 0: AI 5 files / 80 synthetic fixture tests, config 1 file / 1 test, storage 1 file / 2 tests. No live AI call. |
| DB `vitest run --maxWorkers=1 --exclude 'test/**/*.integration.test.ts' --exclude 'test/free-port.test.ts' --exclude 'dist/**'` | Exit 1, 157 passed / 14 failed: unchanged audit-checkpoint source scan timeout and 13 audit CLI failures against stale supplied dist before its rebuild. No PostgreSQL suite launched. Retry recorded below. |
| New scripted regression `vitest run test/audit-api-file-final-account.test.ts --maxWorkers=1` | Exit 0, 3 tests. |
| OpenAPI `node --import tsx src/generate-openapi.ts --check` in API | Final exit 0 after refreshed DB output; earlier run found a missing stale dist export. |
| API `vitest run src --maxWorkers=1 --exclude 'src/**/*.http.test.ts' --exclude 'src/health.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/final-account-lock.isolation.test.ts'` | Exit 0, 63 files / 1551 tests. Excluded suites bind HTTP or start PostgreSQL and remain dispatcher checks. |
| API `node_modules/.bin/nest build` | Exit 0. |
| Web `node_modules/.bin/next build` after the completed API build | Exit 0: compile, type validation, 31 static pages and build traces. Earlier pre-completion attempt exited 1 with missing API modules; dependency-order correction required no source/test change. Existing workspace-root/CSS warnings are unchanged. |
| Core isolated retry `vitest run src/receipt-allocation.test.ts src/enterprise-domain/boundaries.test.ts --maxWorkers=1` | Exit 1, 37 passed / 2 failed; the boundary file passed, two unchanged allocation tests timed out. Subsequent single-file receipt-allocation retry: exit 0, all 34 tests passed, unchanged timeouts/assertions. |
| DB failed-file retry `vitest run src/audit-checkpoint-handoff.test.ts test/verify-audit-export-cli.test.ts --maxWorkers=1` after DB build | Exit 1, 69 passed / 1 failed. All 13 audit CLI tests now pass; the unchanged audit-checkpoint source reachability test still times out at 5000ms. Dispatcher must rerun it. |
| Web `vitest run --maxWorkers=1` after completed API build | Exit 0, 33 files / 784 tests. Earlier run started before the API build completed and exited 1 (462 passed / 322 failed due to stale/mixed compiled exports); the completed-dependency rerun passed without test changes. |
| Final new scripted regression rerun after fixture typing correction | Exit 0, 3 tests; `/private/tmp/jg-final-account-after-final.log`. |

The first new-test post-fix run used stale core dist and correctly rejected the newly forwarded field; rebuilding core resolved it. No stale-dist failure was treated as a regression pass. All local logs use `/private/tmp/jg-final-account-*.log`. These logs are local scratch evidence; the source, failing reasons, commands and outcomes above are the durable receipt.

## Dispatcher / Mac / GitHub CI checks

Run with the committed dispatcher head, pinned Node/pnpm, `LANE_BASE_REF=origin/main`, and full CI history. No PostgreSQL or browser was started here. The root `pnpm test` was not launched because it includes forbidden database suites and git-writing tool fixtures; safe unit suites were selected explicitly above.

```sh
LANE_BASE_REF=origin/main pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm test
pnpm build
pnpm openapi:check
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-api-file-final-account.integration.test.ts test/final-account.integration.test.ts test/job-activation-terms.integration.test.ts test/proof-application-records.integration.test.ts
pnpm test:db
pnpm test:migrations
pnpm eval
pnpm test:e2e
```

`pnpm eval` here means the synthetic golden fixture gate for the changed internal schema; no model/prompt changed and no live model evaluation was requested or performed. `pnpm test:e2e` must include the existing final-account, proof, invoice, lock and complete-journey workflows in both browser projects. The new PostgreSQL regressions must pass before technical acceptance; their effective-role fixture is separate from least-privilege login/catalog coverage. Also rerun the unchanged audit-checkpoint source-scan test that remains red locally, and run the coordinator's `lane-floor.py jobguard <repo> <base> <committed-head>` against the committed diff, retaining RED for its money/authorization effects.

No migration rollback is needed. Production/pilot/commercial gates are unchanged. New PostgreSQL execution, browser evidence, clean pinned checks, an independent exact-commit RED verdict and separate acceptance remain outstanding. The dispatcher owns committing/pushing; intended conventional commit text is `/private/tmp/jg-msg-audit-fix-api-file-final-account.txt`.
