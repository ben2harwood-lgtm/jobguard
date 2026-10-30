# SV6-PERSIST-B builder receipt

Status: INCOMPLETE — independent boundary work only; source-backed runtime acceptance DEPENDENCY-BOUND. No independent verdict or acceptance recorded.

## Session

- Builder: Codex, 24 October 2026; worktree `.worktrees/sv6-persist-b`.
- Branch `codex/sandbox/sv6-persist-b`; inspected HEAD/base `56499079d5e39f164255b913bb0a7741f558794b` (SV6-PERSIST-A, contains SV6-05 `68c87b84`).
- Order SV6-PERSIST-B; lane `config/lanes/sv6-persist-b.json`. No migration added; reserved 0217 unused.
- Node v24.17.0; pnpm 10.28.1 through the existing cached executable, PATH wrapper `/private/tmp/jg-sv6-bin/pnpm`. Dependencies already installed; no download or install performed.
- No git write, commit, push, successful localhost binding or PostgreSQL startup performed. One indirectly invoked existing isolation fixture attempted port allocation and failed in the sandbox before PostgreSQL startup; see checks below. Dispatcher commits/pushes; reviewer/CI owns DB/browser execution and exact-commit verdict.
- Source authority: BUILD_PLAN.md §§10.2.8, 10.4 SV-6, dependency graph/ready rule; issued draft-finish2 SV-6 spec, acceptance table and Q4/Q5/Q6/Q9 holds. Part A deliberately closes the runtime writer pending its accepted source adapter. This lane does not open it.

## Build and scope

Shared application, strict GET query and POST intent validation, Nest controller and Next GET/POST route added. GET returns persisted historical proposals with explicit synthetic/proposed/principal-only identity, production disabled, zero external actions and `qualification: dependency_bound`. The repository reauthenticates the current session/owner and checks actual synthetic database, job ownership and lock before querying attribution. Unlocked jobs return empty history without an attribution or shadow-table query. Historical source UUIDs are not accepted source navigation or current qualification.

POST always refuses execution after mode/auth/schema validation. No source adapter, current qualification, source-resolution API, assessment/review approval, allocator, audit-backed execution or money-change scheduler is manufactured. The accepted upstream source adapter and lock/audit/reassessment contract are absent from this base. Implementing their positive behavior here would falsely replace the separately owned prerequisite.

No database schema/privilege change: exact LP-0 rows, tenancy rows and SERIOUS-B5 own-step additions for 0213 are already present in Part A and retained unchanged. No duplicate rows, freeze relaxation or fingerprint changes. Shared overlaps with Part A: attribution repository and DB fixture; with lifecycle work: the two exact watchdog route-registry rows; with other server work: AppModule, workspace application/barrel and OpenAPI. These edits must serialize on rebase.

> Separate billed and paid; label estimates; create no bill.

Source: BEN-ANSWERS-20261013.md, card jobguard-twenty-product-decisions-2026-10-13; Q4 separation only and Q5 label/no-bill only. No “found” measure, fractional display, illustrated target/change history or fee/tax policy is selected.

## Acceptance disposition

- SV6-18: independent mode, query/body authority rejection and closed direct-routine protection built; source-backed execution remains DEPENDENCY-BOUND.
- SV6-19/20/22: authenticated historical boundary and transaction-local context guards built; real PostgreSQL tests authored, reviewer/CI execution owed. Positive assess/replay remain DEPENDENCY-BOUND. A zero-vs-25 actual held-signal fixture and client SQL trace comparison are authored but NOT RUN; scripted empty-history/query-path tests are not database proof.
- SV6-23/24: private synthetic storage replay/concurrency/rollback tests authored; runtime replay, foreign command identity policy and audited atomicity remain DEPENDENCY-BOUND. No audit is claimed for Part A's private append primitive.
- SV6-25: NOT BUILT — DEPENDENCY-BOUND. Accepted source-change, reversal, invalidation execution and shared business/audit lock order absent. No stale-positive race claim.
- SV6-26: shared Next/Nest adapters built; no-socket/scripted transport tests and actual HTTP/PostgreSQL history test authored. Actual HTTP/PostgreSQL execution NOT RUN locally; source-backed runtime chain remains DEPENDENCY-BOUND.
- SV6-29: INCOMPLETE — HELD. Independent historical identity/no-action boundary built; complete illustration/value/history assertions remain held by Q4/Q5/Q9.
- SV6-30: history document tenant/job validation built; actual source/version/hash navigation NOT BUILT — DEPENDENCY-BOUND. Stored fixture source references do not prove upstream existence.
- SV6-BEN-Q4: source-backed billed/qualifying separation DEPENDENCY-BOUND; no billed or unpaid value inferred from fixtures or history.
- SV6-BEN-Q5: boundary rejects illustration/change/target fields and returns no illustration or bill; positive persisted estimate/change outputs remain NOT BUILT — HELD.
- SV6-10, SV6-16, SV6-29: **INCOMPLETE — HELD**.
- Literal card browser assertions: **NOT BUILT / NOT RUN — UI parked**.
- Under spec :887 all dependency-bound SV6-01–30 remain unaccepted until CH-7 completion or a founder-recorded split. SV-5 #189/#181 are accepted but unmerged; CH-7 and M4-8/source-owner bridges remain prerequisites. Neither this receipt nor a green deterministic check grants acceptance.

## Verification

Execution record and mutation results follow. Real PostgreSQL, full DB/migration/catalogue suites and mandatory browser regressions are reviewer/CI gates. No live integration, source-backed qualification, independent verdict or task completion is claimed.


### Commands actually run

All checks ran one at a time. Each explicit Vitest invocation named at most three files and used `--maxWorkers=2`; Turbo used `--concurrency=1`. The serial batch scripts waited before starting checks while load exceeded 20. No pinned install was repeated, and this is not a clean-install claim.

| Command/check | Actual result |
| --- | --- |
| `pnpm typecheck --concurrency=1` (initial and final) | Both exit 0; 7 successful tasks, 2 cache hits each. Final source checked after mutations were restored. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1 at lane check: includes SV6-01, SV6-05 and Part A files outside this leaf lane. Core purity passed (234 files). Root lint is **not green**. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (initial and final) | Exit 1, same stacked parent paths. Parent lane/register/catalogue files not altered or added to this leaf's allowances. |
| `LANE_BASE_REF=56499079d5e39f164255b913bb0a7741f558794b pnpm lint --concurrency=1` | Exit 1: tool refuses a self-comparison because HEAD remains the ordered base and no commit is permitted. This is not a passing official leaf lint. |
| `pnpm exec turbo run lint --concurrency=1` | Initial and final exit 0; 7 tasks, 2 cache hits each. Distinct from failed root lane check. |
| `node tools/money-arithmetic-lint.mjs`; then `node tools/commercial-boundary-lint.mjs` | Each exit 0, run serially. |
| `node --test tools/*.test.mjs` | Exit 0; 122 passed, no failures/skips. |
| Serial unit batches across core/config/storage/ai/db-src/api-src | 100 initial batches / 294 selected files; 47 batches passed, 53 encountered missing workspace `dist` imports before build. After build, 51 of those 53 batches passed. One existing indirect DB isolation suite failed port allocation; one registry batch found the two newly added POST routes unclassified. Registry fixed with two exact entries, then the unchanged registry tests passed. Final selection: 293 whole files passed, existing `final-account-lock.isolation.test.ts` retains a setup failure and is owed in CI. No full-root-test pass claimed. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/recovery-attribution.application.test.ts src/recovery-attribution.controller.test.ts src/watchdog-registry.test.ts` | Final exit 0, 3 files / 128 tests passed. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/recovery-attribution-repository.test.ts src/migrate-discovery.test.ts` | Final exit 0, 2 files / 8 tests passed; no PostgreSQL. Discovery test also passed independently (3 tests). |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/recovery-attribution.http.test.ts -t 'SV6-26 (Nest\|Next)'` | Final exit 0; 2 tests passed; actual PostgreSQL/socket test deliberately excluded by the name filter (1 skipped). Nest registered-handler dispatch is no-socket boundary evidence; Next uses a scripted application. Neither is actual HTTP/database proof. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --esModuleInterop test/recovery-attribution-access.integration.test.ts test/recovery-attribution-replay.integration.test.ts test/recovery-attribution-fixture.ts` | Initial exit 2 found a test mutating a readonly parsed fact. Rebuilt the new test revision using copied immutable facts; final exit 0. No DB execution. |
| `pnpm --filter @jobguard/db exec vitest list --maxWorkers=2 test/recovery-attribution-access.integration.test.ts test/recovery-attribution-replay.integration.test.ts` | Exit 0; 7 tests collected, zero executed. |
| `pnpm --filter @jobguard/api openapi:generate`; `pnpm openapi:check` | Each exit 1: `tsx` CLI IPC `listen EPERM`. No PostgreSQL/server startup involved. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts`; then same command with `--check` | Each final exit 0. Generated actual source OpenAPI includes only the new GET/POST path, explicitly documents POST 503, and source-loader check passes. |
| `pnpm build --concurrency=1` | Initial and final exit 0; 7 tasks; initial 3 cache hits, final 2. Final build after guard restoration and registry/decorator changes. Existing workspace-root/multiple-lockfile and CSS autoprefixer warnings; Turbo also reports sandbox cache IO warnings. |

The indirectly selected `final-account-lock.isolation.test.ts` attempted binding through `createApplicationIsolationFixture`, which the initial static test selection missed. It failed `no free port in 58400..58650` before PostgreSQL startup. It was not retried again. This failed attempt is recorded rather than hidden as a passing unit or database result. Deliberate new DB/browser suites were not executed locally.

Local logs/manifests: `/private/tmp/jg-sv6b-{typecheck,typecheck-final,lint,lanes,lanes-final,leaf-lint,package-lint,package-lint-final,tools-test,unit-tests,unit-retry,api-final,db-unit-final,http-final,migration-order,db-test-typecheck,db-test-typecheck-final,db-collect,openapi-generate,openapi-check,openapi-loader-generate-final,openapi-loader-check,build,build-final}.log`; `/private/tmp/jg-sv6b-{unit-summary,unit-retry-summary,final-summary}.json`. These are local deterministic run artifacts, not verdicts.

### Guard removal / mutation evidence

28 serial source-mutation probes were executed; each removed guard caused its focused tests to fail, and every source file was restored in `finally` before final typecheck/build/baseline runs. Failed mutant runs are intentional evidence, not clean-suite failures. Output/parser/SQL sensitivity probes are scripted unit evidence, **not PostgreSQL privilege, race or source-authority proof**.

| Removed guard | Result |
| --- | --- |
| `mode` | Mutant exit 1; killed by focused assertion |
| `get-auth` | Mutant exit 1; killed by focused assertion |
| `post-auth` | Mutant exit 1; killed by focused assertion |
| `get-query` | Mutant exit 1; killed by focused assertion |
| `post-query` | Mutant exit 1; killed by focused assertion |
| `command-schema` | Mutant exit 1; killed by focused assertion |
| `dependency-closure` | Mutant exit 1; killed by focused assertion |
| `reauth-result` | Mutant exit 1; killed by focused assertion |
| `prelock-stop` | Mutant exit 1; killed by focused assertion |
| `document-binding` | Mutant exit 1; killed by focused assertion |
| `read-query-strict` | Mutant exit 1; killed by focused assertion |
| `identity-environment` | Mutant exit 1; killed by focused assertion |
| `identity-proposed` | Mutant exit 1; killed by focused assertion |
| `identity-principalOnly` | Mutant exit 1; killed by focused assertion |
| `identity-productionEnabled` | Mutant exit 1; killed by focused assertion |
| `identity-realExternalActions` | Mutant exit 1; killed by focused assertion |
| `identity-qualification` | Mutant exit 1; killed by focused assertion |
| `sql-database` | Mutant exit 1; killed by focused assertion |
| `sql-tenant-job` | Mutant exit 1; killed by focused assertion |
| `sql-session-job` | Mutant exit 1; killed by focused assertion |
| `sql-owner` | Mutant exit 1; killed by focused assertion |
| `sql-revocation` | Mutant exit 1; killed by focused assertion |
| `sql-expiry` | Mutant exit 1; killed by focused assertion |
| `sql-member-binding` | Mutant exit 1; killed by focused assertion |
| `sql-lock-binding` | Mutant exit 1; killed by focused assertion |
| `next-mode` | Mutant exit 1; killed by focused assertion |
| `output-parse` | Mutant exit 1; killed by focused assertion |
| `both-route-registrations` | Mutant exit 1; killed by focused assertion |

The combined route-registration probe removed both new registry entries, rebuilt core, and the unchanged Next/Nest classification tests independently reported each missing route. Core was restored and rebuilt; the full registry suite then passed. SQL-clause probes replace each required clause with `true` and verify the actual query-boundary tests detect its removal; actual PostgreSQL enforcement remains unexecuted.

The whole order's every-guard mutation requirement remains **INCOMPLETE — DEPENDENCY-BOUND** for absent positive source/review/audit/race/navigation paths. No test claims mutation coverage for an unbuilt guard, a mocked provider, or source-owner authority. Earlier private append/grant/RLS/upgrade mutations remain authored in Part A and owed in reviewer/CI.

### Migration, compatibility, operational and acceptance limits

No migration, backfill, grant/policy/function-definition change or new operational alert. Existing database catalogue/freeze expectations and fingerprint guards remain byte-unchanged from the ordered base. No new provider, processing destination, credential, environment variable, prompt, model, matching policy, allocator or tax rule. History access narrows to an actively authenticated owner/session and synthetic database; former internal reads without that authority now fail closed. Routes and the response envelope are additive.

No fee obligation, ledger posting, statement, collection, refund execution, outbox item or external action is implemented. The closed POST path cannot create them. Source-backed current qualification, approved review, immutable runtime replay, transaction/audit atomicity, source-change/reversal/invalidation races and actual source version/hash resolution remain unbuilt prerequisites. Stored private fixtures are not qualifying money or authentic upstream records.

Reviewer/CI owes actual PostgreSQL access/replay/HTTP execution; prior allocation/lock/catalogue/tenancy/fingerprint/upgrade suites; full `pnpm test`, `pnpm test:db`, `pnpm test:migrations`; mandatory existing browser regressions; independent exact-commit verdict and separate acceptance. No new browser/card UI work was issued. Aggregate SV-6 remains unaccepted under the ready rule and Q4/Q5/Q9 holds.


### Final handoff

`git diff --check` exited 0. A separate working-tree-only check used the existing lane policy's `lanePathAllowed` on modified/untracked paths, plus whitespace checks including untracked files; it passed for all 20 changed/new files. This is explicitly **not** a passing official lane comparison; official origin/main and ordered-base self-comparison results remain failed above. The legacy lane register was not touched.

No commit created. Intended conventional commit subject/body: `/private/tmp/jg-msg-sv6-persist-b.txt`. Dispatcher must commit the working tree, then bind any independent verdict to that exact commit. Builder did not review or accept its own work.


## R1 — C250 repair, 24 October 2026

Ordered head: `35b4d9c9fa80194210e245dc74f6669486e4997a`. Addresses only the four issued repairs from the dispatcher’s C250 REPAIR summary (`jg-runs/v5-sv6-persist-b-claude-A-35b4d9c9-20261024.md`, not present in this checkout). This is a builder run receipt, not an independent verdict or acceptance.

- `seedAccount` now casts both uses of `$3` to `text`, avoiding conflicting PostgreSQL parameter inference against the `char(64)` digest column.
- SV6-22 now seeds the practice job’s `job_commercial_track` as a synthetic small-builder fixture before inserting its 25 held signals. The existing actual count, identical history/SQL trace and forbidden-table assertions remain unchanged.
- The Nest controller explicitly injects `Pool` with `@Inject(Pool)`, so the source-loaded Vitest application does not depend on emitted constructor metadata.
- History job IDs now validate with `z.guid({ error: "Invalid uuid" })`. This branch still pins Zod 3 and its embedded core revision schema is Zod 3; directly converting the enclosing schema to Zod 4 failed typecheck (incompatible array element schema). A local Zod 3 `custom<string>` bridge calls the installed `zod/v4` GUID validator, retaining the existing enclosing schemas and error handling without changing dependencies. Main’s C246 conversion is not present on this ordered head. No other product files, pins, migrations, grants, policies, test assertions or lane allowances changed.

### R1 checks actually executed

Checks ran serially using the existing cached pnpm wrapper (`PATH=/private/tmp/jg-sv6-bin:$PATH`), without an install or download. Every Vitest invocation used `--maxWorkers=2`. These are deterministic checks, not model review.

| Command/check | Result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | Initial direct-Zod-4 attempt exited 2 at the mixed-version schema; final bridge version exited 0, all 7 tasks successful. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Initial and final exit 1 at the existing stacked-parent lane violations; root lint is not green. Core purity passed. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1 for the same SV6-01, SV6-05 and Part A parent paths recorded above. No R1 out-of-lane path added; allowances unchanged. |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0; all 7 package checks successful. |
| `node --test tools/*.test.mjs` | Exit 0; 122 tests passed. |
| Serial `pnpm exec vitest run --maxWorkers=2 <selected files>` in core/config/storage/ai/db/api/web | Exit 0 in all 7 packages: 333 files / 6,349 tests passed. Selection/logs in `/private/tmp/jg-sv6b-r1-units.py` and `/private/tmp/jg-sv6b-r1-unit-summary.json`. DB selection covers source unit tests only. API excludes the PostgreSQL application-isolation files; the later dedicated attribution HTTP file run excludes its real PostgreSQL/socket test. No root `pnpm test` pass claimed. |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/recovery-attribution.application.test.ts src/recovery-attribution.controller.test.ts src/recovery-attribution.http.test.ts -t '^(?!.*PostgreSQL actual HTTP)'` | Exit 0 after the GUID bridge: 3 files / 9 tests passed, 1 PostgreSQL/socket test skipped explicitly. Nest registered-handler and scripted Next proof only. |
| `pnpm build --concurrency=1` | Exit 0; all 7 tasks successful (4 cache hits). Existing Next workspace-root/CSS warnings and sandbox cache IO warning only. |
| `pnpm openapi:check` | Exit 1: existing `tsx` CLI IPC `listen EPERM`; no API server or PostgreSQL started. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same source OpenAPI check via the loader, without CLI IPC. No OpenAPI artifact change. |
| `node --import tsx --input-type=module` GUID assertions in API directory | Exit 0; main-compatible non-RFC GUID accepted; malformed GUIDs and non-string values rejected by the bridged field. Log `/private/tmp/jg-sv6b-r1-guid.log`. |

### R1 pre-lock-stop mutation

Removed exactly `if (!gate.locked) return [];` temporarily from the repository and ran `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/recovery-attribution-repository.test.ts -t 'SV6-22 pre lock'`. The mutant exited 1: the forbidden-table assertion detected the added `SELECT document FROM app.recovery_attribution_revision` query. Restored the original repository bytes in `finally`; the same focused baseline exited 0. No repository product change remains. Logs: `/private/tmp/jg-sv6b-r1-prelock-{mutant,restored}.log`; driver `/private/tmp/jg-sv6b-r1-mutation.py`.

This mutation kill is scripted SQL-boundary unit evidence. The repaired real PostgreSQL zero-vs-25 proof and its pre-lock-stop mutation are **NOT RUN locally**, because the dispatcher states this sandbox cannot bind localhost or start PostgreSQL. CI/reviewer must run `test/recovery-attribution-access.integration.test.ts` baseline, remove that guard and rerun SV6-22 expecting failure, then restore it and require a passing baseline. Its query-trace assertion must kill that mutation; no database mutation pass is claimed here. Actual SV6-26 PostgreSQL/HTTP, DB/migration suites and browser suites likewise remain CI gates after dispatcher push.

### R1 final handoff

The explicit DB fixture compilation (`pnpm --filter @jobguard/db exec tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --esModuleInterop test/recovery-attribution-access.integration.test.ts test/recovery-attribution-fixture.ts`) exited 0; it does not execute PostgreSQL. Final whitespace and working-tree path checks passed: the only five modified paths are the four ordered code/test files and this receipt, all within the existing lane allowlist. No git write, commit, push, package installation, localhost binding or PostgreSQL startup was attempted in R1. Dispatcher commit message is `/private/tmp/jg-msg-sv6-persist-b.txt` (conventional subject and body).

R1 logs are `/private/tmp/jg-sv6b-r1-{typecheck,typecheck-final,lint,lint-final,lanes,package-lint,tools-test,unit-core,unit-config,unit-storage,unit-ai,unit-db,unit-api,unit-web,api-final,build,openapi,openapi-loader,guid,fixture-typecheck}.log`. Independent exact-commit verdict, separate acceptance and the CI gates above remain outstanding. No source-backed execution or aggregate SV-6 completion is claimed.
