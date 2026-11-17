# AUDIT-FIX-API-DECISIONS — builder receipt

Issued 13 October 2026 by dispatcher 4. Builder: Codex. Branch `codex/sandbox/audit-fix-api-decisions`; inspected HEAD and origin/main both `e4cb8437d044746300c377647f6061d06cd960cc`. Working-tree changes only; no commit, staging, checkout, push, PR, merge or release. Intended commit message: `/private/tmp/jg-msg-audit-fix-api-decisions.txt`.

Status: implementation and deterministic regression supplied; **HOLD** for real-PostgreSQL/browser CI, exact-commit independent RED verdict and separate technical acceptance. No independent review is claimed.

## Scope and reproduction

Read AGENTS.md rev 3.0, BUILD_PLAN.md §§2.3–2.4, §7 M1-8/UIWIRE-6/UIWIRE-7 and retained proof-scope acceptance, the ownership/adoption repositories and the issued source-inspection report at `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/api-decisions.md`.

**BLOCKING 1 — adopted jobs’ findings are invisible: fixed in the inbox repository.** Job authorization already follows the immutable adoption audit event recursively, but the inbox SQL matched only the imported job’s NULL direct digest. Both list variants now use that same existing ownership closure. The authenticated digest remains parameterized; the helper’s tenant placeholder is adapted to withTenant’s server-installed transaction-local tenant setting. The existing job filter, optional digest behavior for tenant-internal repository callers, suppression, resolution, ordering and view contract are preserved.

Test first, before product changes: new `packages/db/src/decision-adoption.test.ts`, then `./node_modules/.bin/vitest run src/decision-adoption.test.ts` from packages/db. Exit **1**, **2 failed**: expected SQL to contain `WITH RECURSIVE practice_owned_job`; received direct `j.practice_session_digest=$2` SQL. Both overall and job-specific variants exercised. This is an executed query-contract regression with a recording client, **not** PostgreSQL execution or an executed adoption journey. After the fix the unchanged regression passes, exit **0**, **2 passed**.

Also authored before the fix: `packages/db/test/decision-adoption.integration.test.ts`, test **lists adopted-job findings for the source owner**. It uses real runtime privileges, JobPartiesApplication.adopt, a persisted mandatory finding via persistFindings, both DecisionsApplication.list variants with mandatory count 1, another valid session’s NOT_FOUND job-specific refusal and empty overall inbox. It checks the adopted job’s direct digest remains NULL. Collection succeeds; execution deferred as required by the sandbox instructions.

No blocking finding dropped.

## Protected sources, lane and grants

One compact, additive lane entry with exact paths, added before tests/fixes. No existing lane changed. Ownership behavior requires **RED** review regardless of the path floor. The dispatcher must run lane-floor.py on the actual committed diff; base and HEAD still match here, so that script cannot classify these uncommitted edits.

No existing test, expected value, refusal, count, pinned name, catalogue or fingerprint is edited. No new catalogue rows or premise-establishing insertions into old tests. `apps/api/src/auth/context-boundary.test.ts` is untouched.

During validation, an initial attempt to parameterize the shared ownership helper failed its existing source fingerprint. That approach was stopped and `packages/db/src/practice-session.ts` restored byte for byte to origin/main. Protected line encountered: `apps/api/src/auth/context-boundary.test.ts:89`, before `"packages/db/src/practice-session.ts": "9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14"`, after **identical; no edit**. The final fix adapts the helper output locally without changing any authenticated constructor or reviewed helper source.

**Migration/schema/data backfill: none. Standard F: no new GRANT, runtime write privilege, role membership, financial/authorization/receipt/audit write path, RLS policy or controlled routine.** The new isolated PostgreSQL test configures only a synthetic login password on the existing runtime role, retaining its migrated privileges. Synthetic fixture tenant/account/membership setup is confined to this new test. No real data, external action, provider, spending, policy approval, model/prompt/evaluation-policy change or operational alert change. Rollback is a code rollback; stored facts are unchanged. Affected invariants: AGENTS §§5.1–5.3 and BUILD_PLAN C1/C4/C6/C8.

## LATER findings — receipt only

- LATER 2: evaluation hardcodes proof and can create a missing-certificate finding after proof completion. Deferred, no fix/test change.
- LATER 3: retired draft scope retains an active proof finding. Deferred, no fix/test change.
- LATER 4: evaluation ignores command identity, allowing changed-job reuse. Deferred, no fix/test change.
- Audit’s five weak-test suggestions (purity graph, exact finding subjects, independent thresholds, application DB cases, durable browser dismissal) are recorded as follow-up only; existing tests stay unchanged.

## Local validation

Dependencies were already installed; no install or package download was run. The global pnpm launcher stalled; it was interrupted (exit 130). All subsequent pnpm commands use the existing cached **10.28.1** via a temporary `/private/tmp/jg-audit-bin/pnpm` wrapper. Node is **24.17.0**, whereas .nvmrc/CI pin **24.15.0**; clean pinned CI remains required. Logs are under `/private/tmp/jg-audit-decisions-logs/` and are local evidence, not committed artifacts.

Commands actually run (pnpm uses the temporary pinned wrapper described above):

| Command | Exit / evidence |
|---|---|
| `pnpm typecheck` | **0**, 7 successful tasks, 2 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | **1**, core purity passed, lane checker refused identical base/HEAD before package lint |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | **1**, same self-comparison refusal; must rerun after dispatcher commit |
| `pnpm exec turbo run lint` | **0**, all 7 package lint tasks passed, 2 cached |
| `node tools/money-arithmetic-lint.mjs` | **0** |
| `node tools/commercial-boundary-lint.mjs` | **0** |
| `node --test $(rg --files tools -g '*.test.mjs' \| rg -v 'agent-lane-boundary(-train)?\.test\.mjs$')` | **0**, 19 tests passed; the two Git-writing fixture suites deliberately reserved for CI |
| `pnpm build` | **0**, all 7 tasks passed, 2 cached; Next compiled and generated all 31 pages |
| `pnpm openapi:check` | **1**, tsx CLI cannot bind its IPC pipe (`listen EPERM`), no stale-schema error |
| `node --import tsx src/generate-openapi.ts --check` (apps/api) | **0**, same generator/check through a loader without the blocked CLI IPC server |
| `pnpm --filter @jobguard/db exec vitest list test/decision-adoption.integration.test.ts` | **0**, proposed real-PostgreSQL regression collected; hooks not executed |
| `./node_modules/.bin/tsc --noEmit --rootDir ../.. --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --experimentalDecorators --emitDecoratorMetadata test/decision-adoption.integration.test.ts` (packages/db) | **0**, new integration test and its transitive imports typechecked |
| `pnpm --filter @jobguard/db exec vitest run src --maxWorkers=1` | Final **0**, 5 files / **87 passed**, including the new unchanged query regression |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | **0**, 80 files / **2415 passed** |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=1` | **0**, 33 files / **784 passed** |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1 --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/final-account-lock.isolation.test.ts' --exclude 'src/health.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/contractor/*.http.test.ts'` | **0**, 62 files / **1540 passed**, including all 145 unchanged protected context-boundary tests; excluded database/HTTP suites require CI |
| `pnpm --filter @jobguard/core --filter @jobguard/ai --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/web --parallel test` | **1** on the initial stale-export web run; AI **80 passed**, config **2 passed**, storage **4 passed** with each package exiting 0. Core did not finish before this group failed. Web rerun above passes after build |
| Supplemental read-only Git diff/untracked + exported selectLane/exact allowlist validation | **0**, all **5** changed files belong to the new exact lane; distinct from the refused formal lane check |
| `git diff --check` | **0** |

Earlier runs are not hidden: the first broad API run exited 1 (12 failed files, 222 failed / 1320 passed / 1 skipped) while imported built exports were stale and the temporary helper edit broke its source pin. Restoring the pinned file and completing compilation resolved those assertions. The next API run had 62 passed files, **1542 passed**, and only the dynamically imported database harness failed: `final-account-lock.isolation.test.ts` → `createApplicationIsolationFixture` → **no free port in 58400..58650**. This was an accidentally included database test, not a PostgreSQL execution; port allocation failed before cluster initialization. The final sandbox run explicitly excludes this file, without changing any test or repository configuration.

The first DB-source run (default workers) and first one-worker rerun each exited 1 with **86 passed / 1 failed**: `[C-OPS-1]` exceeded the existing 5000 ms timeout under concurrent load (46.2 seconds and 5.28 seconds). The subsequent run passed all 87; no timeout, retry or expected value was changed.

Core `vitest run --maxWorkers=1` accidentally included generated dist tests and was interrupted (130). The canonical `pnpm --filter @jobguard/core test` then exited **1**, **4827 passed / 3 failed** because it also discovers generated copies: source-inspection tests try to read missing `dist/*.ts` files (including site-extra-pricing and recovery-allocation). No build artifact or test was deleted to conceal this. The explicit source-only run passes all 2415 source tests. **Canonical core/root test-after-build remains a dispatcher/CI hold**; the issue is recorded, not repaired in this audit leaf.

Turbo printed shared-cache `IO error: Operation not permitted` warnings but typecheck, package lint and build returned 0. This was not a clean reinstallation and cached successes are labelled above. Root test, DB/migration/browser execution and formal lane verification are not claimed passing. All earlier assertions, fingerprints and security gates remain enforced in repository/CI configuration.

## Required dispatcher / CI execution

This sandbox cannot start PostgreSQL, bind localhost or run a browser. Do not replace these checks with mocks:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/decision-adoption.integration.test.ts test/decision-inbox.integration.test.ts test/practice-session.integration.test.ts test/job-parties.integration.test.ts test/tenancy.integration.test.ts
pnpm test:db
pnpm test:migrations
pnpm test
pnpm --filter @jobguard/api exec vitest run src/final-account-lock.isolation.test.ts
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop decision-inbox.spec.ts UIWIRE-6.spec.ts CH-3a.spec.ts SBOX-SESSION-1.spec.ts UIWIRE-7.spec.ts
pnpm test:e2e
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm typecheck
pnpm build
pnpm openapi:check
```

Run on the dispatcher’s Mac if its local PostgreSQL/browser environment works; otherwise use the existing GitHub CI after dispatcher commit/push. Root pnpm test is not invoked here because it starts mandatory PostgreSQL and HTTP suites; the independent tooling suites that create/write temporary Git repositories are also reserved for CI under the no-Git-write instruction. No suite was made optional in repository configuration.
