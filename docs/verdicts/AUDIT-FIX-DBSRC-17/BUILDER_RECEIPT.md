# AUDIT-FIX-DBSRC-17 builder receipt

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
