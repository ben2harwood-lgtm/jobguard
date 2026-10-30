# SV6-PERSIST-A builder receipt

Status: INCOMPLETE — storage foundation built ahead; no independent verdict or acceptance.

## Session

- Date: 24 October 2026; builder: Codex; worktree: `.worktrees/sv6-persist-a`.
- Branch: `codex/sandbox/sv6-persist-a`; ordered base: accepted SV6-05 `68c87b84` (includes SV6-01).
- Order: SV6-PERSIST-A, reserved migration 0213 / C253.
- Synthetic only. No UI/HTTP, provider, model/prompt or money-policy changes. No git write, commit, push, install or PostgreSQL startup authorized in this sandbox.
- Stack observed: Node v24.17.0; pinned pnpm 10.28.1 used via cached executable (details below).

## Built

Migration 0213 adds migration-owned FORCE-RLS attribution revisions, first-command results and reassessment causes, composite subject foreign keys, sequential revision/predecessor checks, case/command serialization and owner-level UPDATE/DELETE/TRUNCATE rejection. Runtime tables are SELECT-only; private append has no runtime/PUBLIC/infrastructure EXECUTE. A narrow runtime entry point fails closed with `RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND`. The repository parses commands/results and reads history through tenant-scoped transactions and authenticated post-lock RLS.

The private append primitive is an internal synthetic storage seam, not an accepted source adapter. Private tests parse fixtures before persistence. Neither these fixtures nor stored source UUIDs prove actual upstream sources. No review/current-qualification authority, audit-backed business command, allocation or illustration is manufactured. This is a deliberate dependency boundary, **not completion of the ordered persisted command acceptance**.

Tenancy and LP-0 inventory additions are exact. SERIOUS-B5 adds only the three new table names, five index names, three exact function signatures and six policies, preserving every prior comparison. Fingerprinted row guards unchanged. No data backfill; forward-fix note in migration note.

## Acceptance and holds

- SV6-01/02–04/06–07/08–09/12–16/13–15: actual persisted source-backed acceptance DEPENDENCY-BOUND. Private storage tests cover facts, exact rationals, first-result replay and appended history only. Earlier pure tests remain unchanged; their source-adapter holds are not falsely removed.
- SV6-10: INCOMPLETE — HELD. Authority-table C/F/G/H/M/N and F1–F8/F4b source-backed commands not built; exact F4 fraction storage is separately tested. No saved-allocation, fee or illustrated-history result claimed.
- SV6-16 and SV6-29: INCOMPLETE — HELD. Stored £800 principal is only a synthetic round-trip; no full value receipt or illustrated output is claimed.
- SV6-BEN-Q4/Q5: existing boundary contracts retained; no complete persisted billed-vs-paid/illustration acceptance claimed. No “found” meaning, fractional display rounding, comparison target or policy activation chosen.
- SV6-21: catalogue/DML/TRUNCATE/escalation/forged-call tests written, NOT RUN — PostgreSQL reviewer/CI owed. Public boundary closed; private JSON does not grant source authority.
- SV6-27/28: upgrade tests written, NOT RUN — PostgreSQL reviewer/CI owed. Own-step full predecessor facts compare before later migrations; later stage compares named job/quote values; new-table immutability, later-column tolerance and old-value corruption controls included.
- Literal card browser assertions: **NOT BUILT / NOT RUN — UI parked**.
- SV-5, CH-7, M4-8 accepted source-owner bridge, reassessment execution contract, review authorization/audit, independent exact-commit verdict and separate acceptance remain release/acceptance gates. No aggregate SV-6 completion claimed.

## Guard / mutation evidence

All real-PostgreSQL mutation evidence remains NOT RUN (reviewer/CI). Tests assert owner UPDATE/DELETE/TRUNCATE rejection for each new table and roll back disabling each immutability trigger to demonstrate removal admits the forbidden statement. Replay payload collision, stale predecessor, non-synthetic envelope, missing-context and same-tenant wrong-job subject checks are adversarial tests. Rollback probes widen INSERT and private EXECUTE and remove FORCE RLS, asserting the catalogue changes are detected. Catalog/DML denial tests fail if runtime rights widen. Upgrade controls mutate an old account name (must differ), add a later column while projecting named original columns (must match), and roll back to the exact full snapshot. Full per-guard mutations for tenant/source/authorization and positive runtime behavior remain DEPENDENCY-BOUND / NOT BUILT; this receipt does not claim the order's every-guard mutation requirement satisfied.

## Checks actually run

Actual commands and results are recorded below. Database/browser suites intentionally not run: dispatcher environment cannot bind localhost/start PostgreSQL. Reviewer must run DB suites, including LP-0 freeze, tenancy, fingerprinted-row and SERIOUS-B5 upgrade suites. No mock results substitute for them.

### Executed command record

All checks ran serially. Each explicitly invoked Vitest command used `--maxWorkers=2` and at most three files. Check starts waited while load exceeded 20. No PostgreSQL or browser suite was executed.

Pinned executable: `node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`, exposed as `pnpm` through `/private/tmp/jg-sv6-bin/pnpm` for child scripts. The initial PATH `pnpm --version` attempted its own version resolution and failed registry verification/fetch; no installation command was run and no package download succeeded. The cached executable reports 10.28.1.

| Command | Actual result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | Exit 0; 7 successful tasks, 2 cache hits. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1 at lane boundary; core-purity check passed (234 files). Root lint is **not green**. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1; origin/main comparison includes accepted parent SV6-01/SV6-05 lane files, contracts, receipts and pure files outside this lane. No parent lane/register was changed or allowance broadened. |
| `node tools/money-arithmetic-lint.mjs` | Exit 0. |
| `node tools/commercial-boundary-lint.mjs` | Exit 0. |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0; all 7 package lint tasks successful, 2 cache hits. This is separate from the failed root lane check. |
| `node --test tools/*.test.mjs` | Exit 0; 122 passed, zero failed/skipped. |
| Serial `pnpm --filter @jobguard/<package> exec vitest run --maxWorkers=2 <at-most-three-files>` batches | Final: 170 unit files / 3,412 tests passed: core 126/3,009; config 4/41; storage 1/2; ai 15/147; db/src 24/213. 58 initial batches: 45 passed, 13 failed package resolution before dist existed. After build, all 13 affected batches passed (39 files). No unrelated passing batches repeated. No runtime/database integration proof inferred. |
| `pnpm build --concurrency=1` | Exit 0; 7 successful tasks, 2 cache hits; Next generated 41 pages. Existing multiple-lockfile/workspace-root warning. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/migrate-discovery.test.ts` | Exit 0; 1 file, 3 tests passed without PostgreSQL. |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC `listen EPERM` in sandbox. |
| `node apps/api/dist/generate-openapi.js --check` | Exit 1: compiled-script probe reported stale OpenAPI. No OpenAPI artifact regenerated. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0: actual source OpenAPI check through loader, with no CLI IPC. The compiled-script probe is not represented as passing. |
| Explicit `tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --esModuleInterop` on the four new DB test/helper files | Final exit 0. Initial explicit `--types node` could not resolve the workspace's transitive Node type location; retry using normal type resolution exposed a fixture parameter inferred too narrowly from `randomUUID()`. Annotated that fixture tenant parameter as string; final run passed. |
| `pnpm --filter @jobguard/db exec vitest list test/recovery-attribution.integration.test.ts test/recovery-attribution-figures.integration.test.ts test/recovery-attribution-upgrade.integration.test.ts --maxWorkers=2` | Exit 0; 20 tests collected, **zero tests executed**; no PostgreSQL started. |
| `git diff --check` | Exit 0. |

Logs and batch manifests are `/private/tmp/jg-sv6-{typecheck,lint,lanes,money-lint,commercial-lint,package-lint,tools-test,unit-tests,unit-retry,build,migration-order,openapi,openapi-built,openapi-loader,db-test-typecheck-final,db-test-collection}.log` and `/private/tmp/jg-sv6-unit-{summary,retry-summary}.json`. They are local run artifacts, not independent verdicts. Typecheck/build/package lint reused two package cache results; direct Vitest batches did not claim Turbo cache execution.

The ordered base is verified as current HEAD `68c87b84ec5ede05434d16034079e507aa9f1635`. No commit was created. Intended conventional commit message: `/private/tmp/jg-msg-sv6-persist-a.txt`.

### Remaining acceptance work

The dispatcher/reviewer must execute the real PostgreSQL tests and paired mutations, the actual catalog/grant freeze, tenancy and fingerprint guards, and both own-step and SERIOUS-B5 upgrade proofs. Source-backed persisted commands, audit atomicity, current source revalidation, approved review authority, saved-allocation integration and the every-guard mutation requirement remain incomplete. Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations` and mandatory existing browser regressions remain CI/reviewer gates; the selected unit batches above are not a full-root-suite claim.

Existing pure `recovery-attribution-persistence.test.ts` and `recovery-fee-illustration.test.ts` passed unchanged. The new storage tests reuse the schema fixture's ten facts and exact principal representation (without importing/registering the pure test suite) and persist every false conjunct individually. These cover storage subclaims only; they do not discharge those tests' upstream persisted/source holds. The earlier pure S6-05-F Q4/Q5/Q9 label/display/projection protection passed as an existing pure regression. SV6-BEN-Q4/Q5 persisted source separation/no-bill acceptance remains independently outstanding; no numeric policy, illustration history or complete value-receipt acceptance is asserted.

Final working-tree-only inspection found 14 changed/new files, all within this lane's exact allowlist (including its own lane file); whitespace inspection including untracked files and `git diff --check` passed. This is a leaf working-tree inspection, **not** a pass of the official origin/main stacked lane check, which remains failed as recorded above.

## R1 — C250 repair round 1, 24 October 2026

Ordered/repaired head: `56499079d5e39f164255b913bb0a7741f558794b`. Working-tree changes only; no git writes, installs, commits or pushes. The repair is limited to the three ordered items and this receipt; product code and migration 0213 are unchanged.

- LP0-17: added exactly the three 0213 routine records to `recorded.routines` (359 → 362). Migration-owned private append and trigger routines are unreachable with no runtime/PUBLIC/other EXECUTE; only the dependency-bound assess entry is runtime-executable/reachable. Owner, invoker/definer and search paths follow 0213. Definition digests remain explicitly unrecorded (`null`), as in adjacent additive records; no database-derived digest or live catalogue verification is claimed. No privilege entries, comparisons or grants were loosened.
- Contractor upgrade: the repeat-migrate snapshot permits exactly `app.recovery_attribution_revision`, `app.recovery_attribution_command`, and `app.recovery_attribution_reassessment`, each empty and absent from the prior snapshot. Both first and repeated full migration results compare every predecessor row in full. Added only this test file to this piece's own lane.
- Tenant isolation: added three real-PostgreSQL cases for cross-tenant, missing-session and pre-lock raw reads, each against populated revision/command/reassessment tables. Reads execute with `SET LOCAL ROLE jobguard_runtime`, never as the fixture owner. Each first proves authenticated owner visibility after lock. Pre-lock setup removes the lock with test-admin trigger bypass inside a rolled-back transaction, leaving populated rows so an empty fixture cannot mask a policy leak. Each case then requires empty reads; each of the three tables also has a transactional `ALTER POLICY attribution_read ... USING(true)` control requiring that identical assertion to fail, followed by an unmutated pass after rollback. This changes no shipped policy.

### R1 actual checks (serial; all Vitest commands use `--maxWorkers=2`)

Pinned cached pnpm 10.28.1 was used through `/private/tmp/jg-sv6-bin/pnpm`; no downloads. Log prefix below is `/private/tmp/jg-sv6-r1-`.

| Command | Actual result / log suffix |
| --- | --- |
| `pnpm typecheck --concurrency=1` | Exit 0; 7 tasks successful, 2 cached. `typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1; core purity passed, lane check rejects accepted parent SV6-01/SV6-05 files outside this lane. `lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1; same 12 parent-file exclusions; no broader allowance added. `lanes.log` |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0; 7 package tasks successful, 2 cached. `package-lint.log` |
| `node tools/money-arithmetic-lint.mjs` and then `node tools/commercial-boundary-lint.mjs` | Each exit 0; ran serially to cover guards skipped by the root lane failure. `money-lint.log`, `commercial-lint.log` |
| Serial `pnpm --filter @jobguard/<package> exec vitest run --maxWorkers=2 <up-to-three-source-files>` | Exit 0 across 59 batches: 171 source unit files / 3,415 tests passed (core/config/storage/ai/db, including migration discovery). `unit-tests.log`, `unit-summary.json` |
| `node --test tools/*.test.mjs` | Exit 0; 122 passed. `tools-test.log` |
| `pnpm --filter @jobguard/api exec vitest run src --exclude '**/shadow-isolation.application.test.ts' --maxWorkers=2` | Exit 1; 119 files passed / 8 failed; 2,073 tests passed / 129 failed / 1 skipped. HTTP cases fail with socket `listen EPERM` and consequent null-port errors; the final-account isolation fixture also fails its free-port search before starting PostgreSQL. This broad source run is not a passing unit-suite claim. `api-unit.log` |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | Exit 0; 40 files / 867 tests passed. `web-unit.log` |
| `pnpm build --concurrency=1` | Exit 0; 7 tasks successful, 3 cached. `build.log` |
| `pnpm openapi:check` | Exit 1; tsx CLI IPC socket `listen EPERM`. `openapi.log` |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; same source check without CLI IPC. `openapi-loader.log` |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --esModuleInterop test/recovery-attribution.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts` | Final exit 0. Initial run detected readonly fixture assignments; changed these to construct and parse a new revision, then reran successfully. `db-test-typecheck.log`, `db-test-typecheck-final.log` |
| `pnpm --filter @jobguard/db exec vitest run test/lp-0-catalog.test.ts --maxWorkers=2` | Exit 0; 26 pure catalogue tests passed, no PostgreSQL. `lp0-unit.log` |
| `git diff --check` | Exit 0. |

### R1 database and mutation evidence — CI REQUIRED

**NOT RUN locally:** the edited DB integration suites, LP0-17 live catalogue comparison, full database/migration suites, browser suites, and paired mutation-Y execution. The sandbox cannot bind localhost/start PostgreSQL. The new tests encode **unmutated pass → mutation-Y failure → rollback/unmutated pass**, separately for all three tables and all three denial cases; this is source-inspected and typechecked, not an executed mutation result. CI must execute `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/recovery-attribution.integration.test.ts test/contractor-entitlement-upgrade.integration.test.ts test/lp-0-authority-paths.integration.test.ts` and record the actual paired result. A full external mutation of 0213's runtime policy to `USING(true)` must make the normal negative read assertions fail. No claim that this mutation has been killed in a real DB run is made here.

No schema migration, backwards-incompatible product change, operational alert or policy activation is introduced by R1. Existing source-adapter/release holds, exact-commit independent verdict and separate acceptance remain required. Intended dispatcher commit message: `/private/tmp/jg-msg-sv6-persist-a.txt`.

## R2 — final repair round 2 (run 3 of 3), 24 October 2026

Ordered head: `1d7c8201223a6f121aa78a6450eae822859af414`. The sole code change moves `app.issue_practice_session` below the identity-user and practice-membership inserts in `packages/db/test/recovery-attribution.integration.test.ts`. The session now has its required membership before issuance, allowing the cross-tenant, no-session and pre-lock tests to reach their isolation assertions. No other test logic, product code, migration or policy changed.

### R2 reviewer evidence supplied in the dispatch

The dispatch reports the jg-checks delta re-check confirmed **all 18 tests pass** after this reorder, and **mutation Y (`attribution_read USING(true)`) fails exactly the three new isolation tests** (cross-tenant, no-session, pre-lock). These are reviewer-reported results supplied with the order, not PostgreSQL or mutation executions by this builder. No new exact-commit verdict or acceptance is inferred from that report.

### R2 local validation

Local command results are recorded below after execution. PostgreSQL, migration integration, mutation-Y and browser suites are not run here: the dispatcher states this sandbox cannot bind localhost or start PostgreSQL. GitHub CI must run those suites after the dispatcher pushes. No git write, commit, push, dependency install or package download is part of this repair. Intended conventional commit subject and body are in `/private/tmp/jg-msg-sv6-persist-a.txt`.

All checks below used cached pnpm 10.28.1 through `/private/tmp/jg-sv6-bin/pnpm`, ran serially, and used `--maxWorkers=2` for every Vitest execution. Node: v24.17.0. The initial default-PATH `pnpm --version` probe attempted registry/version resolution and failed with fetch/signature-verification errors; no download succeeded and no installation command was run. Subsequent checks used the cached executable directly through the wrapper.

| Command | Actual result |
| --- | --- |
| `pnpm typecheck --concurrency=1` | Exit 0; 7 tasks successful, 2 cached. |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=1` | Exit 1; core purity passed; lane boundary rejects the same 12 inherited SV6-01/SV6-05 parent paths. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1; same inherited parent-path exclusions. No allowlist changed. |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0; 7 package tasks successful, 2 cached. Does not supersede root lint failure. |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` (separate serial commands) | Both exit 0. |
| `node --test tools/*.test.mjs` | Exit 0; 122 passed, none failed/skipped. |
| Serial `pnpm --filter @jobguard/<package> exec vitest run --maxWorkers=2 <up-to-three-source-files>` | All 59 batches exit 0: 171 files / 3,415 tests passed (core 126/3,009; config 4/41; storage 1/2; ai 15/147; db/src 25/216). |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/lp-0-catalog.test.ts` | Exit 0; 26 pure catalogue tests passed, no PostgreSQL. |
| `pnpm --filter @jobguard/api exec vitest run src --exclude '**/shadow-isolation.application.test.ts' --maxWorkers=2` | Exit 1; 119 files passed / 8 failed; 2,073 tests passed / 129 failed / 1 skipped. Socket `listen EPERM`, consequent null-port errors and the final-account fixture's free-port search prevent the HTTP/database-backed source cases. This is not a passing API suite. |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | Exit 0; 40 files / 867 tests passed. |
| `pnpm build --concurrency=1` | Exit 0; 7 tasks successful, 3 cached; existing Next multiple-lockfile warning. |
| `pnpm openapi:check` | Exit 1; tsx CLI IPC socket `listen EPERM`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | Exit 0; actual source OpenAPI check via loader, without CLI IPC. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --target ES2023 --module NodeNext --moduleResolution NodeNext --skipLibCheck --esModuleInterop test/recovery-attribution.integration.test.ts` | Exit 0; edited integration test typechecks. |
| `git diff --check` | Exit 0. |

Local logs: `/private/tmp/jg-sv6-r2-*.log`; exact command/exit manifest: `/private/tmp/jg-sv6-r2-summary.json`. These are local builder artifacts, not independent verdicts. No clean-install claim is made: dependencies were already installed. Full `pnpm test`, DB/migration and browser runs remain for CI because they require capabilities unavailable here. No new migration, backwards-compatibility impact, operational alert or release-policy change. Existing dependency, independent-verdict, acceptance and release holds remain.
