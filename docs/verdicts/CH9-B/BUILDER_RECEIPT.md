# CH9-B builder receipt — build-ahead, held

Date: 24 October 2026. Builder: Codex. One initial build; no independent repair round, review, acceptance, commit, push or merge. C250's at-most-two review repair rounds remain with the dispatcher. RED money-display lane.

## Scope and provenance

- Branch `codex/sandbox/ch9-b`; initial clean working tree; HEAD/base `5dbb5060f7abdbb85214d38085b2f6b0690404f6`. Local `origin/main` is `6993a0cb59b9c26c25ae316b02c747cacc15e7e7`.
- Read complete repository AGENTS.md, applicable BUILD_PLAN CH-9/MON-1/MON-2 requirements, the complete Astra CH9-B card (lines 6688–6730), its inherited common contract (6170–6278), CH9-J ownership/holds, accepted `docs/contracts/value-v3.md`, and CH9-S/R source/schema/renderer. Also inspected existing practice authority, guard, v1 value and subscription contracts/implementation.
- Accepted parent evidence read: `/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch9-r-acceptance-5dbb5060-20261023.md`. Parent acceptance covers illustrative rendering only, not authoritative sources.
- Ben's issued order overrides the draft's readiness gate for **building** only. It also replaces the proposed lane/branch names and excludes both shared CH9-J implementation files from edits. Neither shared file was created or modified, and their paths are excluded from this lane's functional grants.
- No migration, note, table, grant, provider, credential, environment setting, package/lockfile, shared barrel, routing registration or existing test was changed. 0216 remains unused.

## Result and safest choices

This is a refusal-only business boundary, **not the completed source-backed CH9-B money vertical**. `/api/value` authenticates a persisted current synthetic session, rejects forged/repeated/invalid selection terms, and returns typed private/no-store 400/401/403/503 responses. It never returns an empty successful business, a count, price, period, source list, settlement, fee or receipt. `/value` is an actual new page with separate job-source, subscription-period and as-of receipt sections, all explicitly unavailable; refresh and return-to-jobs controls remain accessible. No download, snapshot write, receipt replacement, or trial-dependent suppression was introduced.

An unregistered Nest controller and testable application boundary are provided in the CH9-B-owned controller file, because the CH9-J shared application is absent and expressly excluded. **STOP: Next and Nest do not yet use the same composed service.** Next currently performs its own authentication and held selection validation. The coordinator must compose the service after the shared owner handoff, update adapter tests and run registered HTTP checks; this limitation is not disguised through a guessed package export or runtime property cast.

Applied Ben's “Use safest choice” answer from `jg-orders/next-wave/BEN-ANSWERS-20261023.md`:

1. Refuse every business aggregate until company/session binding and complete producer sources are accepted; session ownership alone is not meter/company authority.
2. Hold every selected period/window, including syntactically valid and omitted-current-period requests; infer no dates, event boundary, correction period or current-period identity.
3. Do not count, sum, round, qualify, settle or display illustrative fixtures as authoritative money. No £0 or supplied MON cache substitutes for unavailable inputs.
4. Keep subscription visibly separate from job amounts and success fees. Introduce no offset, charge, credit, refund, annual activation, trial grant or standing authority.
5. Do not query hidden state, including for counts or to choose a refusal. Product reads are authentication-only. No producer adapter or fake implementation was added to the held proposed core ports.
6. Preserve existing job routes/receipts/exports and SV-6 code. A held new business page cannot delete, replace, relabel or hide their records. Positive trial/SV-6 integration remains a hold.
7. Do not fabricate immutable receipt storage or DEMO trace compatibility from the illustrative CH9-R DTO. No write-on-GET.

## Baseline symbol verification and STOPs

Executed read-only `git grep -n -F <symbol> HEAD -- apps packages docs/contracts`; path checks used `git grep -l -e . HEAD -- <path>`. Searches are of the accepted baseline, not untracked new implementations. A found proposed signature is not accepted producer binding.

| Symbol/path | Baseline result | First match/path |
| --- | --- | --- |
| `ValueV3Application` | **STOP — absent** | No baseline match |
| `readBusiness` | **STOP — absent** | No baseline match |
| `ProposedValueSourcesPortV3` | FOUND | docs/contracts/value-v3.md |
| `readAuthorisedSnapshot` | FOUND | docs/contracts/value-v3.md |
| `ProposedValueDerivationPortV3` | FOUND | docs/contracts/value-v3.md |
| `readImmutableDerivation` | FOUND | docs/contracts/value-v3.md |
| `valueReceiptV3` | FOUND | packages/core/src/value-v3-receipt.ts |
| `renderValueReceipt` | FOUND | packages/core/src/value-v3-copy.test.ts |
| `small-builder-demo-trace.v1` | **STOP — absent** | No baseline match |
| `SubscriptionApplication` | FOUND | apps/api/src/subscription.application.test.ts |
| `PracticeAccess` | FOUND | apps/api/src/capture/capture-state.test.ts |
| `SYNTHETIC_WORKFLOW_ONLY` | FOUND | apps/api/src/auth/application-auth.guard.ts |
| `packages/db/src/value-v3-reader.ts` | **STOP — absent** | No baseline match |
| `apps/api/src/value/value-v3.application.ts` | **STOP — absent** | No baseline match |
| `apps/api/src/value/value-v3.application.test.ts` | **STOP — absent** | No baseline match |
| `packages/db/test/meter-persistence.integration.test.ts` | FOUND | packages/db/test/meter-persistence.integration.test.ts |
| `packages/db/test/subscription-statements.integration.test.ts` | FOUND | packages/db/test/subscription-statements.integration.test.ts |
| `apps/web/e2e/CH-9-job.spec.ts` | **STOP — absent** | No baseline match |
| `apps/web/e2e/VALUE-1.spec.ts` | FOUND | apps/web/e2e/VALUE-1.spec.ts |

All card paths marked NEW were absent from the initial clean tree. This is expected for CH9-B-owned new files, not evidence of an installed predecessor. The following predecessor/contract STOPs remain:

- CH9-J reader/application/application test/job-browser spec absent; no shared-file edits or substitute authoritative reader.
- H-VALUE-SOURCES is explicitly held in accepted `docs/contracts/value-v3.md`. Core ports exist with `binding: held_H-VALUE-SOURCES`, `unknown` outputs and no implementations. Canonical identity, complete authoritative sources, coherent cutoff/revision vector and accepted event/window semantics remain missing.
- MON-1 existing persistence is supplied-input fixture persistence, not real command-created lifecycle authority. MON-2A existing company application and selected-period/session read composition do not establish this demo business bridge. No guard or shared-practice refusal was weakened.
- DEMO-P2 `small-builder-demo-trace.v1` is absent on this base. Compatibility and exact snapshot handoff cannot be certified. No invented replacement schema.
- Actual SV-6/M4-8 source binding and applicable M4-9/10/12/17 money status, MON-3/MON-8 trial/entitlement sources, and their accepted integration remain held. No production/pilot capability or signed policy is inferred.

## Tests and acceptance accounting

Tests were authored before the corresponding new implementation files. The first `pnpm` attempts stalled before Vitest and were interrupted (exit 130). Initial direct Vitest attempts subsequently failed resolving unbuilt `@jobguard/db` (exit 1, no assertions executed). After the prerequisite build, boundary assertions executed. This is **not** a claim of a clean behavioral red run before implementation.

Seven deliberate rule-removal mutations were executed sequentially, restored in `finally`, and each produced assertion failures (exit 1): remove authentication (22 failures); fabricate zero aggregate (2); permit forged selectors (10); permit one-sided windows (2); guess default period (3); cache privately scoped response publicly (2); conceal authentication refusal (1). Every result was inspected for actual assertion failures, not import failures. Logs and commands: `/private/tmp/jg-ch9-b-mutations.json` and `/private/tmp/jg-ch9-b-mutation-*.log`. These are deterministic local checks, not independent review.

| Acceptance ID | Tests present / rule-removal sensitivity | Remaining full acceptance |
| --- | --- | --- |
| CH9-B01 | Application auth-before-selection and no aggregate; DB real-auth unchanged-row test | HOLD: actual authorised-job and imported-descendant aggregate |
| CH9-B02 | Repeated reads reauthenticate only; zero-aggregate mutation fails | HOLD: actual canonical producer events, runtime joins, periods and S02/S07 traces |
| CH9-B03 | Valid/reversed windows and selected periods stay held; one-sided-window and guessed-period mutations fail | HOLD: exact accepted event boundaries and cross-period compensation values |
| CH9-B04 | Period selections never produce guessed money; guessed-period mutation fails | HOLD: all nine actual MON command-output profiles (£348/£828 yearly and monthly examples) |
| CH9-B05 | Response permits no amounts; separate subscription UI/browser assertions; fabricated-zero mutation fails | HOLD: positive authoritative subscription/fee separation reconciliation |
| CH9-B06 | No successful empty source vector; fabrication mutation fails; CI unchanged-row observer | HOLD: complete API vector reconciled to actual command-created records |
| CH9-B07 | Forged/repeated/invalid inputs, session failures, mode/errors and no-store statuses; five applicable mutations fail | HOLD: stale source revisions/tampered authoritative meter cache against accepted producers |
| CH9-B08 | Existing guard refuses verified company principal; app/Next refuse real mode before DB; auth-removal mutation fails | HOLD: coordinator-registered direct Nest HTTP plus independently accepted security bridge |
| CH9-B09 | Exactly authentication-only query calls; no business connection; auth removal/fabrication mutations fail | HOLD: full prelock zero/many-signal integrated noninterference |
| CH9-B10 | Actual new `/value` and `/api/value` browser refusal/reload/focus/overflow/foreign-session spec written | NOT RUN; full fresh multi-job/meter/trial paths held, no knowingly red tests for absent routes |
| CH9-B11 | No trial-based input/path; existing job link/receipt-preservation copy; CI full app-row byte comparison | HOLD: positive trial-ending SV-6 illustration and historical export access |
| CH9-B12 | No invented vector/download/snapshot; zero-aggregate mutation fails; CI app-row comparison | HOLD: actual coherent current/download vector, immutable stored receipt and accepted DEMO-P2 |

**The full requirement “every acceptance ID has a rule-removal-sensitive positive acceptance test” is NOT satisfied.** Related refusal tests are present, but cannot prove unavailable producer rules. No placeholder/skipped/todo tests or self-authored successful DTO aggregate was used to disguise these STOPs. No full CH9-B, S02/S07, DEMO-P1 executable map, DEMO runtime or stored report PASS is claimed.

## Check receipt

Runtime: Node `v24.17.0`; cached pinned pnpm `10.28.1`; Vitest `4.1.11`. No install/download attempted. The default shell pnpm points at a v11 executable that stalled before commands. A temporary wrapper at `/private/tmp/jg-ch9-b-bin/pnpm` executes the existing cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. All successful `pnpm` commands below used `PATH="/private/tmp/jg-ch9-b-bin:$PATH"`.

Resource inspection: disk 131 GiB free (above 45 GiB floor). `vm_stat` supplied memory counters; `sysctl hw.memsize` and `ps` were sandbox-denied, so free-memory percentage/host process count could not be established. Turbo tasks were serialized with concurrency 1; Vitest batches ran sequentially with at most 2 workers; no helper agents. The initial stalled launcher invocations overlapped before interruption but did not reach Vitest. Package lint briefly overlapped the OpenAPI CLI attempt, which failed at its IPC startup; no DB/browser process ran. No DB/browser server was started.

| Command actually run | Result |
| --- | --- |
| `pnpm exec turbo run build --filter=@jobguard/db... --concurrency=1` | PASS, exit 0; 3 tasks, 1 shared-cache hit; resolved missing built DB entry |
| `pnpm --filter @jobguard/api typecheck` | PASS, exit 0 |
| `pnpm --filter @jobguard/web typecheck` | PASS, exit 0 |
| `pnpm --filter @jobguard/db typecheck` | PASS, exit 0 |
| `pnpm typecheck --concurrency=1` | PASS, exit 0; all 7 tasks, 2 shared-cache hits |
| `pnpm build --concurrency=1` | PASS, exit 0; all 7 tasks, 2 shared-cache hits; production Next output includes `/api/value` and `/value` |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/value/value-v3-business.application.test.ts src/value/value-business.controller.test.ts src/value/value.application.test.ts` | PASS, exit 0; 31 tests, 3 files (includes 4 existing v1 regressions) |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/api/value/route.test.ts` | PASS, exit 0; 13 tests |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/value-v3.test.ts src/value-v3-receipt.test.ts src/value-v3-copy.test.ts` | PASS, exit 0; 85 accepted-parent regression tests |
| `pnpm --filter @jobguard/api lint`; `pnpm --filter @jobguard/web lint`; `pnpm --filter @jobguard/db lint` (sequential loop) | PASS, each exit 0 |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, exit 1: comparison includes 12 accepted-parent CH9-S/R paths outside CH9-B's lane; no CH9-B-owned path refused |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL, exit 1: core purity passes (234 files), then the same parent-ancestry lane failure blocks the remainder |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | PASS, each exit 0; ran directly because root lint stops at ancestry hold |
| `pnpm openapi:check` | BLOCKED/FAIL, exit 1: tsx CLI tries to bind a local IPC pipe and sandbox returns `listen EPERM` |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | PASS, exit 0: same generator/check through installed loader without CLI IPC. Does not certify unregistered new Nest route |
| `git apply --check docs/integration-patches/ch9-b-composition.patch` | PASS, exit 0; patch not applied |
| `git diff --check`; explicit untracked-file/allowlist and untouched-shared-file assertions | PASS, exit 0; 12 new allowed files; zero tracked-file modifications; CH9-J shared files still absent |

Final unit logs/commands: `/private/tmp/jg-ch9-b-final-units.json`, `/private/tmp/jg-ch9-b-final-unit-0.log` through `-2.log`. Total final targeted unit/regression assertions: **129 passed**, including **40 new boundary tests**. Earlier successful API-only run: 26 tests before adding the status/metadata assertion; it was rerun with the additional assertion and v1 regressions above. No full root test run, clean install or independent verification is claimed.

Turbo emitted nonfatal shared-cache IO permission warnings. Next emitted workspace-root/multiple-lockfile, existing CSS/autoprefixer and dependency bundling warnings; the production build completed. Shared files were not changed to suppress them.

**NOT RUN locally, per issued environment/resource constraints:** PostgreSQL, migrations, catalogue/RLS runtime checks, browser, restore, full root test suite, required lane Node regression suites. New CI commands are:

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/value-v3-business.integration.test.ts test/meter-persistence.integration.test.ts test/subscription-statements.integration.test.ts
pnpm --filter @jobguard/web test:e2e --workers=1 --project=mobile-360 --project=desktop CH-9-business.spec.ts
```

The draft's `src/value/value-v3.application.test.ts` and `CH-9-job.spec.ts` companion commands remain STOP: those CH9-J files are absent on the accepted base. No command with a nonexistent spec is represented as a required passing local check. Coordinator must add the real companion regressions after CH9-J integration.

Inherited EVD-C1/C2 remain HOLD (positive complete vertical and same composed Nest/Next service absent); C3 is tested only at the synthetic refusal boundary (no measured provider-sentinel receipt claimed); C4 introduces no money or persistence and retains actual DB verification holds; C5 tests current read authority, with no new commercial action/retry boundary; C6/C7 retain required real PostgreSQL and both-project browser/accessibility evidence; C8 remains HOLD for ancestry lint, required CI, exact-head independent verdicts and separate acceptance. No common requirement was waived.

## Required coordinator integration

`docs/integration-patches/ch9-b-composition.patch` is an unapplied additive patch, checked with `git apply --check`. It lists the current held controller registration, workspace request-scoped property and workspace exports. It changes no source by itself and cannot clear authority/source holds. Its target shared rows are:

- `apps/api/src/app.module.ts`: import/register `BusinessValueController` under the existing global auth guard; regenerate/check `apps/api/openapi.json` after registration.
- `apps/api/src/workspace/application.ts`: request-scoped `businessValue` refusal service using current pool/session.
- `apps/api/src/workspace/index.ts`: `BusinessValueApplication`, `businessValueResultV1`, `businessValueFailure`, `businessValueStatus`. Existing `@jobguard/api/workspace` export map can expose these; no guessed package subpath added.
- After shared CH9-J integration: serialize `ValueV3Application.readBusiness` and explicitly scoped DB `readBusiness` into the two owner files; only accepted producer/authority APIs may supply their implementation. No shared DB/core barrel export is proposed before those exact symbols exist.
- Replace the temporary Next held adapter with the same composed request-scoped service and shared failure mapping, then update route tests. Do not register a guessed producer or return fixture DTOs.
- Navigation, generated OpenAPI, actual source/period/public exports and CI catalogue registration belong to the coordinator. No shared test or routing file was edited here.

## Remaining gates and operational impact

No data migration/backfill or financial backwards-compatibility change. No new operational alert producer: held selections and unavailable state are explicit, and raw DB errors are redacted; no money source/cache is trusted. No alert or model/prompt behavior was changed. No external action/worker/idempotency path was added. Existing v1 routes/tests are unchanged.

Required CI: new `value-v3-business.integration.test.ts` plus existing meter/subscription integration regressions; actual route browser spec in both `mobile-360` and `desktop`, worker 1; full inherited checks on the composed exact head. Full positive producer DB/browser tests must be added after accepted contracts exist. Required independent RED verdicts A/B and separate acceptance are missing; builder does not accept this work. Ben/dispatcher own commit, push and merge.

Intended commit message: `/private/tmp/jg-msg-ch9-b.txt`.

## r1

24 October 2026. Repair of reviewer B1 on candidate `276f6a2972bf8cfd7352613d7ee1cd2186be7e39`, accepted parent `5dbb5060`. Read the independent Claude verdict at `/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch9-b-claude-A-276f6a29-20261024.md` (the issued relative `jg-runs/` path is outside this worktree).

Removed only the duplicate sandbox-notice paragraph from `apps/web/app/ui/business-value-v3.tsx`. The root layout continues to render the notice. The exact, strict assertion in `apps/web/e2e/CH-9-business.spec.ts:15` is unchanged; no other test depended on the removed paragraph. No policy, money, authorization, data, API, migration, dependency or shared-file change. All earlier source/composition/production and acceptance holds remain.

Runtime: Node `v24.17.0`, cached pinned pnpm `10.28.1`, Vitest `4.1.11`. No install or download. The default pnpm launcher stalled during version inspection and was interrupted (exit 130); all commands below used the existing wrapper with `PATH="/private/tmp/jg-ch9-b-bin:$PATH"`. Unit tests used at most two workers; Turbo used concurrency 1. No helper agents.

| Command actually run | Result |
| --- | --- |
| `pnpm --filter @jobguard/web typecheck` | PASS, exit 0 |
| `pnpm --filter @jobguard/web lint` | PASS, exit 0 |
| `pnpm --filter @jobguard/web test --maxWorkers=2` | PASS, exit 0; 880 tests in 41 files |
| `pnpm typecheck --concurrency=1` | PASS, exit 0; 7 tasks, 4 cached |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL, exit 1; core purity passed, then lane check refused the same 12 accepted-parent CH9-S/R paths recorded above |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, exit 1; same accepted-parent ancestry failure, no repair path refused |
| `pnpm exec turbo run lint --concurrency=1` | PASS, exit 0; all 7 package lint tasks, 2 cached |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0 |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0 |
| `pnpm build --concurrency=1` | PASS, exit 0; 7 tasks, 5 cached; Next web build executed |
| `pnpm openapi:check` | BLOCKED/FAIL, exit 1; tsx CLI IPC socket bind denied with `listen EPERM` |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`) | PASS, exit 0; installed loader runs the same generator check without CLI IPC |
| `git diff --check` | PASS, exit 0 |

Check logs: `/private/tmp/ch9-b-r1-{web-typecheck,web-lint,web-unit,typecheck,lint,lanes,package-lint,build,openapi,openapi-loader}.log`. Turbo emitted sandbox cache IO warnings; Next emitted existing workspace-root, CSS and dependency-bundling warnings. No shared configuration was changed to suppress them.

**Browser NOT RUN here**, as issued. PostgreSQL and migration suites NOT RUN: sandbox cannot start PostgreSQL or bind localhost; dispatcher-owned GitHub CI must run database and both browser projects. Full root test and clean install NOT RUN. The duplicate is source-inspected as removed; this receipt does not claim a browser pass or independent verification of the repair. Exact repair-commit review and separate acceptance remain with the dispatcher/reviewer. No commit, push, staging or other git write was performed.

Intended commit subject/body written to `/private/tmp/jg-msg-ch9-b.txt` for the dispatcher.
