# AUDIT-FIX-DBSRC-17 builder receipt

> **Repair r1, 14 October 2026 (dispatcher 5):** variation-only repair completed in the working tree from `0b1afd4f33c84ae72e89759c783feb744b8d830c`. Findings 2 and 3 remain HELD for Ben’s re-pin. The original receipt below is historical; the appended r1 evidence supersedes its STOP only for the newly authorized repair and checks.

Issued 13 October 2026 by dispatcher 4. Branch `codex/sandbox/audit-fix-dbsrc-17`; initial HEAD `bd959b01e857de0ba7cbd3588bab84add7d0f493` equals `origin/main`. Working-tree changes only. Dispatcher owns commit/push. Intended commit message: `/private/tmp/jg-msg-audit-fix-dbsrc-17.txt`.

Read repository `AGENTS.md`, `BUILD_PLAN.md` C5, §§5.1–5.3, CH-3b and ENT-2, and the issued report `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/dbsrc-17.md`. No real data, network provider call, spending or external send. Dependencies were supplied; no clean install or package download performed.

**Check lane RED:** approved money, scope identity and persisted import authorization. Path-only floor is supplementary; the dispatcher's money/roles/tenancy rule raises the review to RED. This builder records no independent verdict or technical acceptance. HOLD until CI/Mac checks and a different model's recorded RED verdict bound to the dispatcher-created commit, followed by separate acceptance. Shared variation repository and additive lane registry must serialize with other leaves through the coordinator.

## Test-first blocking findings

Created `packages/db/test/audit-dbsrc-17.test.ts` before changing either product file. Once its own setup used the existing schema versions and a partial audit mock, ran:

```sh
packages/db/node_modules/.bin/vitest run --config packages/db/vitest.config.ts packages/db/test/audit-dbsrc-17.test.ts
```

Before: **exit 1, four failed tests**, `/private/tmp/jg-dbsrc-17-before.log`. These tests call the real repository methods and WorkOrderApplication with scripted SQL responses; the finance fixture models the existing organisation-read refusal, and its CSV import adapter is mocked. This is application reproduction, **not live PostgreSQL, RLS or adapter assurance**.

| Blocking finding | Observed failure before product edits | Fix |
| --- | --- | --- |
| 1: approved £250 disappears on rejection | `reject cannot revoke an approved variation`: promise resolved instead of refusing. | Lock/read current state and revision before rejection writes; refuse approved, draft and stale revisions with existing `EXACT_CURRENT_PRICED_REVISION_REQUIRED`. Exact current priced rejection and rejected-revision replay remain available. |
| 2: generated sites move between calls | `generated samples preserve sites across preparation`: descending creation IDs differed from sorted stored IDs. | Use ascending UUID order on first and subsequent preparations. Starter bytes and site bindings now repeat. |
| 3: finance cannot use generated import | `finance can import generated orders`: WorkOrderApplication returned `NOT_FOUND` before CSV import. | Reuse prepared fixtures through existing import gate, authorized contract view and client import predicate. Only fictional fixture metadata is selected; initial fixture creation still requires the existing organisation view and commands. Team identity follows the demo operative's non-revoked team grant. |
| 4: approved new extra cannot complete proof | `approved new extra supports proof completion`: real ProofCommandService raised `scope_progress_missing`. | First approval promotes the new identity and inserts one `not_started` progress row before audit-head locking, in the existing approval transaction. Existing-scope approvals and replays preserve progress. |

All four original regression assertions remain unchanged. Additional own cases cover draft/approved/stale rejection refusal, current-priced rejection, approval replay preserving completed progress, existing-scope progress preservation, denied import permission and finance refusal to create an unprepared organisation. Final targeted result: **exit 0, 12 passed**, `/private/tmp/jg-dbsrc-17-after.log`.

Added `packages/db/test/audit-dbsrc-17.integration.test.ts` for real PostgreSQL: frozen baseline plus 25,000p approved variation with unchanged 125,000p final-account net after rejected rejection; descending site UUIDs/equal timestamps, exact starter CSV replay and three revised/one unchanged/zero rejected rows; authenticated finance import and revocation denial; new extra capture/approval, server-finalized versioned evidence, successful proof completion, exactly one progress row and replay preserving completed revision 2. **Not run here:** sandbox prohibits PostgreSQL and localhost listeners. Object bytes use a self-contained deterministic synthetic PNG and versioned in-memory storage adapter; this does not exercise MinIO.

No blocking finding dropped: all four reproduced with an expected failing test.

## Invariants and changes

Only product files changed: `packages/db/src/variation-repository.ts` and `packages/db/src/work-order-fixtures.ts`. Other files: two new test files, this receipt and one compact additive lane entry with six exact file paths. No existing test or pinned expected value, refusal, count, name or fingerprint changed. `apps/api/src/auth/context-boundary.test.ts` and its pinned lists are byte-identical to the base. No existing catalogue edited. Premise-establishing setup exception before/after in an existing test: **none**. Before: the new regression files did not exist. After: they establish their own entirely synthetic proposal, price, approval, membership/session, order and evidence prerequisites before calling unchanged repository/application APIs.

Affected invariants: AGENTS §§5.1–5.4 and 5.8; plan C5, scope identity/progress, variation transition and ENT-2 idempotent import. Tenant context still comes from authenticated membership and RLS. Import permission is checked before fixture reads and again before stored metadata is selected; the existing importer checks authority at mutation. No organisation-read grant is added. Operational scope initialization precedes the existing atomic approval audit append; no new business lock follows it. Rejection audit and approval-provenance replay defects are LATER and unchanged.

**Zero migrations and zero production grants. Standard F:** existing runtime scope-state UPDATE and progress INSERT privileges are used. The new disposable test-cluster login inherits only `jobguard_runtime`; it adds no deployed membership, financial, authorization, receipt or audit privilege. Schema, RLS, role/routine ownership, tax/fee/retention policy and boundary schemas are unchanged. No backfill or migration rollback/forward-fix required. Existing approvals missing progress are not retroactively repaired by approval replay. Existing generated orders that were imported with inconsistent first-call site assignments are not rewritten. Rollback is code-only and restores the audited defects; no new data shape is introduced. No new operational alert or AI/model/prompt change; eval/live-provider checks are inapplicable.


## STOP — protected auth fingerprint and count

The broader API unit run reached the user-mandated STOP condition. No protected expectation was changed, and no further product implementation or check suites were launched after identifying it. Working-tree fixes are **not technically accepted**.

- Protected file `apps/api/src/auth/context-boundary.test.ts:95`, reviewed source entry for `packages/db/src/work-order-fixtures.ts`. Before/pinned SHA-256: `cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386`. After/actual working-source SHA-256: `fb53f5431f07cb80b9e1b5d11bf25100e50c9f1184e0a658c36e8c0549cf62c3`. Updating the pin to that actual value is **prohibited and not performed**.
- Protected file `apps/api/src/auth/context-boundary.test.ts:658`, `EXPECTED_PRACTICE_CALLS` entry for the same file. Before/pinned count **3**; after/actual source count **4**. Updating that expectation to 4 is **prohibited and not performed**.
- The protected file remains byte-identical to `origin/main`. Its exact-source review at line 1287 fails for the modified fixture; the real-repository scan at line 744 also reported a failure. The source pins cannot be refreshed by this builder. Findings 2 and 3 touch that reviewed source and cannot be accepted while the unchanged pin rejects it. The dispatcher must resolve this hold under the issued rules; no renewed caller approval is inferred.

## Checks actually run

Runtime Node 24.17.0 (repository pin 24.15.0); installed pnpm 11.8.0 (repository pin 10.28.1). Pins and lockfile untouched. Every standard wrapper was attempted with `LANE_BASE_REF=origin/main`, `pnpm_config_pm_on_fail=ignore` and `pnpm_config_verify_deps_before_run=false` (local-only flags preventing implicit version downloads or installs): `pnpm typecheck`, `pnpm lint`, `pnpm lint:lanes`, `pnpm build`, `pnpm openapi:check`. All fail before checks with `ERR_PNPM_UNSUPPORTED_ENGINE`. Logs: `/private/tmp/jg-dbsrc-17-pnpm-{typecheck,lint,lanes,build,openapi}.log`.

Direct results available at the STOP are recorded below. Three outstanding check sessions were interrupted (exit 130) to honor the STOP; no additional suites were launched. Root `pnpm test` is not run because it starts forbidden database tests and git-writing lane-tool fixture tests. Browser/listener-dependent checks are deferred explicitly, not silently made optional. No writing git commands run, including within the omitted tool fixtures.

## Direct check evidence at STOP

| Command / scope | Result |
| --- | --- |
| `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` | Exit 0. |
| `node_modules/.bin/tsc -p /private/tmp/jg-dbsrc-17-test-tsconfig.json` | Final exit 0, strict checking of both new files. Initial own integration export-name error and inherited harness type error were removed by correcting the new import and making the new fixture self-contained; no existing file changed. Log `/private/tmp/jg-dbsrc-17-tests-typecheck.log`. |
| Sequential direct `tsc --noEmit` chain for core/config/ai/storage/db/API/web and new tests | Interrupted at STOP, exit 130; no claim that the entire chain passed. |
| Direct `tsc -p packages/{core,config,ai,storage,db}/tsconfig.json` (sequential dependency builds) | Whole chain exit 0, supplied stale dist outputs refreshed. |
| API `node_modules/.bin/nest build`, then node-loader OpenAPI check | Interrupted at STOP, exit 130. OpenAPI was not reached; not claimed passed. Log `/private/tmp/jg-dbsrc-17-api-build.log`. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | Exit 1: core purity passed (158 files), lane checker refuses HEAD equal to base. Log `/private/tmp/jg-dbsrc-17-lint.log`. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 1: `Missing branch or self-comparison range; refusing a misleading pass.` Log `/private/tmp/jg-dbsrc-17-lanes.log`. |
| `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | Both exit 0. |
| Working-tree path check using canonical lane-floor.py `rx` and the coordinator's map, plus read-only git/registry/protected-file comparison | Exit 0: floor AMBER (five amber paths, one green receipt), raised to RED; six exact allow paths, only this lane added, every previous lane and protected file unchanged, zero migrations. Supplementary deterministic result, not standard lint or independent review. |
| Selected non-git-writing tool tests (`node --test` commercial-boundary/core-purity/decision-check-purity/decision-records/dependency-audit/policy-gate-sites/shared-money-origin) | Exit 0, 19 tests. An earlier filename-selection attempt selected no tests and is not counted as coverage. |
| Core `vitest run src --maxWorkers=1` | Exit 1: 2440 passed / 5 failed, 78 passed / 3 failed files. Unchanged 5000ms timeouts: three receipt-allocation load cases, enterprise-domain source scan and exhaustive extra-origin offset test. No timeout or assertion modified. Log `/private/tmp/jg-dbsrc-17-core-tests.log`. No retry after STOP. |
| DB `vitest run --maxWorkers=1 --exclude 'test/**/*.integration.test.ts' --exclude 'test/free-port.test.ts' --exclude 'dist/**'` | Exit 1: 179 passed / 2 failed. Existing operator-reachability scan timeout and stale built-core capture failure. Log `/private/tmp/jg-dbsrc-17-db-tests.log`. |
| DB unchanged-file retry after refreshed dependency builds: `vitest run --maxWorkers=1 src/audit-checkpoint-handoff.test.ts test/audit-api-capture.test.ts` | Exit 1: 69 passed / 1 failed; capture file now passes, operator-reachability scan still exceeds its unchanged timeout. Log `/private/tmp/jg-dbsrc-17-db-retry.log`. Dispatcher must rerun. |
| API source unit suite with listener/DB files excluded | Interrupted at STOP, exit 130, after protected context-boundary tests reported two failures. No full-suite pass or total count claimed. Excluded `src/**/*.http.test.ts`, `src/health.test.ts`, `src/auth/sso/action-paths.test.ts`, `src/shadow-isolation.application.test.ts`, `src/final-account-lock.isolation.test.ts`. Log `/private/tmp/jg-dbsrc-17-api-tests.log`. |
| AI `vitest run src --maxWorkers=1` | Exit 0, 5 files / 80 synthetic tests, no live model call. Log `/private/tmp/jg-dbsrc-17-ai-tests.log`. |
| Config/storage `vitest run src --maxWorkers=1` | Exit 0 each: one config test and two storage tests. Logs `/private/tmp/jg-dbsrc-17-{config,storage}-tests.log`. |
| New targeted regression suite | Exit 0, 12 tests. Original four expected failures were recorded before product edits. |
| `git diff --check` and exact registry/base/protected-file comparisons | Exit 0. All git invocations were read-only. |

Web unit/build, direct OpenAPI completion, full standard wrappers with pinned pnpm, database/migration/browser suites and independent review remain **not complete**. The STOP overrides further suite launches. No completion or readiness claim is made.

## LATER findings — receipt only

- #5: identical-file replay does not claim the new command ID, allowing later reuse for different CSV.
- #6: current-priced rejection commits without its atomic audit event.
- #7: approval replay with changed actor/method can return invented provenance rather than conflict.
- #8: existing variation isolation test uses missing context instead of a different populated valid tenant.

The report's five weakest-test recommendations remain unmodified: variation isolation, variation approval/rejection races and proof, authenticated finance generated imports, second preparation before CSV replay, and actual lock-wait observation in watchdog races.

## Dispatcher / Mac / GitHub CI checks

After committing the tree with the pinned install:

```sh
LANE_BASE_REF=origin/main pnpm typecheck
LANE_BASE_REF=origin/main pnpm lint
LANE_BASE_REF=origin/main pnpm lint:lanes
pnpm test
pnpm build
pnpm openapi:check
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/audit-dbsrc-17.test.ts test/audit-dbsrc-17.integration.test.ts test/variation.integration.test.ts test/work-order-import.integration.test.ts test/work-order-concurrency.integration.test.ts test/proof-replay.integration.test.ts test/proof-application-records.integration.test.ts test/final-account.integration.test.ts
pnpm test:db
pnpm test:migrations
pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop ENT-2.spec.ts UIWIRE-4.spec.ts UIWIRE-7.spec.ts UIWIRE-8.spec.ts
python3 /Users/benharwood/.local/share/full-steam/lane-floor.py jobguard "$PWD" bd959b01e857de0ba7cbd3588bab84add7d0f493 <dispatcher-commit>
```

Database, migrations, MinIO/browser and listener-dependent HTTP/security journeys require the Mac outside this sandbox or GitHub CI after the dispatcher pushes. Obtain the independent recorded RED verdict on the exact resulting commit, then separate technical acceptance. No merge/push/release, founder acceptance or security/commercial approval is inferred here.


## Repair round r1 — 14 October 2026, dispatcher 5

Read `/Users/benharwood/.local/share/full-steam/jg-runs/audit-fix-dbsrc-17-opus-0b1afd4.md`: independent **HOLD**, source inspection only, bound to the incoming head. This repair responds only to its variation-parent side effect. It is not a new independent verdict or acceptance. No writing git command, package installation/download, push or commit was performed. The dispatcher owns the new commit, whose intended message is overwritten at `/private/tmp/jg-msg-audit-fix-dbsrc-17.txt`.

**Variation parent repair:** `VariationRepository.read` excludes identities belonging to a variation with `existing_scope_item_id IS NULL`, correlated on tenant, job and scope identity. Remaining confirmed baseline identities are ordered by `created_at,id`. Variations changing an existing scope identity do not exclude that baseline identity. Thus approval can confirm a new extra for proof without allowing its arbitrary UUID (or earlier timestamp) to select it as the existing-scope parent. Scope state, approval, rejection, money and progress writes from the original fix are unchanged. No migrations, grants, backfills, provider actions, boundary-schema changes or new operational alerts.

Added one NEW case to each task-owned regression file; no earlier test assertion, expected value, refusal, count, pinned name, fingerprint or hash was edited. The scripted-SQL unit case performs the existing new-extra approval first, then checks tenant/job correlation, new-identity exclusion, stable ordering and the returned workspace parent. **Before the repair:** exit 1, the new case failed and all 12 original cases passed (`/private/tmp/jg-dbsrc-17-r1-before.log`). **After:** exit 0, all 13 cases passed (`/private/tmp/jg-dbsrc-17-r1-after.log`). This is SQL contract coverage, not PostgreSQL execution proof.

The NEW PostgreSQL case uses real capture/approval and a runtime repository read. Descending generated UUIDs force the approved extra below the baseline; test-only admin setup gives the extra an earlier timestamp than every baseline identity. A second baseline with a smaller UUID but later timestamp verifies chronological selection; an existing-scope variation verifies that the original baseline remains eligible; equal baseline timestamps verify the UUID tie-breaker. This case was typechecked but **not run** in the listener/PostgreSQL-prohibited sandbox. It must run in GitHub CI after the dispatcher pushes. No timeout or expectation in any existing case was changed.

**Held fixture piece remains exactly as received:** `packages/db/src/work-order-fixtures.ts` is byte-identical to incoming HEAD, still SHA-256 `fb53f5431f07cb80b9e1b5d11bf25100e50c9f1184e0a658c36e8c0549cf62c3`. Findings 2 and 3 remain HELD for Ben's reviewed-source re-pin; this builder neither edits nor re-pins that file. `apps/api/src/auth/context-boundary.test.ts` is byte-identical to HEAD and `origin/main`, SHA-256 `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35`. Its pinned fixture hash and count remain untouched. The complete available API unit run below still fails exactly those two protected tests. The original LATER findings remain unchanged.

### r1 commands and actual results

Runtime Node 24.17.0, installed pnpm 11.8.0; repository pins Node 24.15.0 and pnpm 10.28.1. No clean pinned install was performed. All standard wrappers were attempted with `pnpm_config_pm_on_fail=ignore` and `pnpm_config_verify_deps_before_run=false` to prevent implicit downloads/installation: `pnpm typecheck`, `LANE_BASE_REF=origin/main pnpm lint`, `LANE_BASE_REF=origin/main pnpm lint:lanes`, `pnpm test`, `pnpm build`, `pnpm openapi:check`. Each exits 1 before its checks with `ERR_PNPM_UNSUPPORTED_ENGINE` (pnpm 11.8.0 versus 10.28.1). Logs: `/private/tmp/jg-dbsrc-17-r1-pnpm-{typecheck,lint,lint-lanes,test,build,openapi-check}.log`. The lane base was also set on the typecheck/build/OpenAPI attempts.

Direct installed-tool results (not a claim of passing the pinned wrappers):

| Command / scope | Result |
| --- | --- |
| `node_modules/.bin/tsc -p <package>/tsconfig.json --noEmit` for core/config/storage/db/ai/web, plus API from its own directory | Exit 0 for all seven packages. API log `/private/tmp/jg-dbsrc-17-r1-api-typecheck.log`. |
| `node_modules/.bin/tsc -p /private/tmp/jg-dbsrc-17-r1-test-tsconfig.json` | Exit 0 for both task regression files and imports; `/private/tmp/jg-dbsrc-17-r1-tests-typecheck.log`. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | Exit 0: purity, lane, money and commercial boundary checks; `/private/tmp/jg-dbsrc-17-r1-direct-lint-corrected.log`. Package TypeScript lint checks use the passing no-emit commands above. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 0; `/private/tmp/jg-dbsrc-17-r1-direct-lanes-corrected.log`. No lane-registry edit needed. |
| Selected non-git-writing tool tests: `node --test tools/commercial-boundary.test.mjs tools/core-purity.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/dependency-audit.test.mjs tools/policy-gate-sites.test.mjs tools/shared-money-origin.test.mjs` | Exit 0, 19 passed; `/private/tmp/jg-dbsrc-17-r1-tools-tests.log`. Git-writing lane-tool fixtures omitted under the explicit no-writing-git instruction. |
| Core `vitest run src --maxWorkers=1` | Exit 0, 81 files / 2445 tests; `/private/tmp/jg-dbsrc-17-r1-core-tests.log`. |
| DB `vitest run --maxWorkers=1 --exclude 'test/**/*.integration.test.ts' --exclude 'test/free-port.test.ts' --exclude 'dist/**'` | Exit 0, 14 files / 182 tests, including the 13 task cases; `/private/tmp/jg-dbsrc-17-r1-db-tests.log`. Database and socket-dependent cases excluded explicitly. |
| API `vitest run src --maxWorkers=1 --exclude 'src/**/*.http.test.ts' --exclude 'src/health.test.ts' --exclude 'src/auth/sso/action-paths.test.ts' --exclude 'src/shadow-isolation.application.test.ts' --exclude 'src/final-account-lock.isolation.test.ts'` | Exit 1, 1553 passed / 2 failed, 63 passed / 1 failed files. Both failures are the held fixture hash/count checks in unchanged `context-boundary.test.ts`; `/private/tmp/jg-dbsrc-17-r1-api-tests.log`. Listener/database journeys excluded. |
| Web `vitest run --maxWorkers=1` | Exit 0, 33 files / 784 tests; `/private/tmp/jg-dbsrc-17-r1-web-tests.log`. |
| AI/config/storage `vitest run src --maxWorkers=1` (each package directory) | Exit 0 each: AI 80, config 1, storage 2 synthetic tests; `/private/tmp/jg-dbsrc-17-r1-{ai,config,storage}-tests.log`. No live model call. |
| `node_modules/.bin/tsc -p <package>/tsconfig.json` for core/config/storage/db/ai; API `node_modules/.bin/nest build` from `apps/api`; web `node_modules/.bin/next build` from `apps/web` | Exit 0 for all packages. API log `/private/tmp/jg-dbsrc-17-r1-api-build-corrected.log`; web `/private/tmp/jg-dbsrc-17-r1-web-build.log`. Existing CSS/autoprefixer warnings remain. |
| API `node --import tsx src/generate-openapi.ts --check` | Exit 0; `/private/tmp/jg-dbsrc-17-r1-direct-openapi-no-ipc.log`. Initial `tsx` CLI attempt exits 1 because its IPC listener is prohibited; the Node import form avoids that listener. OpenAPI file unchanged. |
| Read-only `git diff --check`, protected-file comparisons, SHA-256 checks and untracked-file inspection | Exit 0, protected files unchanged and no generated files left in the review diff. |

One direct API build was mistakenly invoked from the repository root: exit 1, 3809 compiler errors and untracked emitted files (`/private/tmp/jg-dbsrc-17-r1-api-build.log`). Its 2798 untracked compiler outputs were removed using filesystem operations after confirming the initial tree had no untracked files; no tracked file was removed. Concurrent lane checks first failed on those generated paths, then passed after cleanup. The correct API-directory build and all package typechecks subsequently passed. This tooling mistake did not change the repair scope or protected files.

### r1 remaining gates

Run the existing dispatcher/CI commands above with pinned dependencies, including the added PostgreSQL case, full DB/migrations and mobile/desktop browser suites. Local direct checks do not replace those mandatory gates. The fixture piece (findings 2 and 3) remains HELD for Ben's renewed caller review and re-pin; two API test failures are unresolved by design under this repair authorization. Obtain a fresh independent RED verdict bound to the dispatcher-created repair commit and separate acceptance. No technical acceptance, merge or release readiness is asserted.
