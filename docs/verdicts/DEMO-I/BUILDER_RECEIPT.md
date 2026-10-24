# DEMO-I builder receipt — HOLD

24 October 2026. Builder: Codex. This is a builder record, not an independent verdict or acceptance. No commit/push/merge performed. One initial build attempt; no checker repair round used.

## Outcome

**DI1 NOT COMPLETE; DI2 HELD; DI3 NOT COMPLETE.** Only strict, unregistered request-boundary preparation was safe to implement. No application, repository, migration, runtime endpoint, page, stored report, successful journey or scenario figure is supplied. Do not accept this receipt as completion of the issued order.

Branch `codex/sandbox/demo-i`; HEAD/base `0d390b89` (accepted bounded DEMO-P2, on P1 `167ea3a0`). Local `origin/main` resolves to `6993a0cb59b9c26c25ae316b02c747cacc15e7e7`. The order explicitly permits build-ahead and makes parent acceptance a merge gate; that does not supply absent producer APIs or allow inventing a security contract.

Read AGENTS.md in full; BUILD_PLAN §§2.4, DEMO-S and relevant simulation/security contracts; planning pack common contract §§2, 7.2 and full DEMO-I section lines 6931–6994; existing P1/P2 catalogue, fixtures and contracts; PracticeAccess, practice-session and capture producer code; Ben's `BEN-ANSWERS-20261023.md`.

## STOPs and safest choices

1. **STOP AUTHORITY/STORAGE:** `VerifiedDemoAuthority` is absent. The draft requires checked DB routine signatures against an accepted security contract and explicitly calls absence a build hold. No generic SECURITY DEFINER routine, caller-selected tenant/digest, exported structural authority token or broadened grant was invented. Safest choice: refuse creating a world until the owning authority binding exists.
2. **STOP RESET/COMPANY:** no accepted isolated-company/run bootstrap exists here. Existing `issuePracticeSession` creates legacy prebuilt jobs. Using it as a fresh-world bootstrap would violate this order. Reset cannot hide old live jobs from a company meter, erase liabilities/keys, imply pending action cancellation, or reuse an entitlement. Safest choice: no reset implementation that claims those guarantees.
3. **STOP EXECUTABLE MAP:** P1 is accepted as bounded documentation, but source still says `documentation-only` / `BLOCKED_NOT_COMPLETE`, all producer bindings HELD. `DemoMeterCommands`, `DemoSubscriptionCommands`, `DemoTrialCommands` occur as proposals only. No accepted recipe/operation/recovery map exists to generate strict executable intent/checkpoint schemas. Safest choice: do not create stringly typed/generic operation or result proxies. These two schemas remain HELD.
4. **STOP REPORT SOURCES:** P2 is pure structural validation with unverified sources. CH-9 runtime reader/immutable source-vector/time and receipt contracts are absent. Safest choice: no fabricated fact vector, mixed-time snapshot, hidden-state query or constant external-actions zero. No report is stored or returned.
5. **STOP/HELD DI2:** all seven proposed routes and pages are absent at base. DI2 depends on stopped DI1 and unmerged source/authority producers. No Next/page/chooser/report/registry implementation or Playwright spec was added. The explicit order forbids knowingly red browser tests for nonexistent pages.
6. **0214 reserved, NOT CREATED:** neither SQL nor migration note nor discovery entry is supplied. The approved authority/routine contract is needed first. Nothing was placed in the migrations directory. No data migration, rollback or forward-fix is currently applicable; N-alone/upgrade/successor proof remains owed.

These are missing-contract STOPs, not claims that parent dependencies must merge before any build can start. No request for policy approval is made; Ben's safest-choice answer is applied within synthetic scope. No policy, release, D/G gate, review or acceptance is marked approved.

## Actual changes

- `config/lanes/demo-i.json`: exact branch, exact four-file functional allowlist, no shared lane/register grant; C1 reason for no browser workflow.
- `apps/api/src/small-builder-demo.contracts.ts`: strict create/reset/snapshot request shapes and read locators. Five catalogue families are selectable shapes only. All three commands require their own exact version and UUID command identity; reset/snapshot require positive safe expected revision. No runtime dispatch is connected.
- `apps/api/src/small-builder-demo.application.test.ts`: 104 pure boundary cases. Filename follows the authorised allowlist; these are not service, DB or browser tests. Existing tests unchanged.
- `docs/contracts/small-builder-demo-run-v1.md`: contract scope, missing producer/security requirements, storage hold and exact shared integration surfaces still owed.
- This receipt.

No business/domain table is touched; no external adapter is called; no secret/provider/env configuration changes; no shared barrel, routing registration, catalogue test, foreign leaf or generated OpenAPI changes. Existing v1 behavior is untouched. No successful state is seeded.

## Tests first and mutation sensitivity

The new test file was written before the schema module. Initial direct Vitest run exited 1 on missing `small-builder-demo.contracts.js`; after implementation 104/104 passed. This collection failure is a red-first receipt, not proof of business-rule failure coverage.

Four temporary mutations were executed sequentially and reverted in a `finally` block. Removing strict object checks caused 74 failures; replacing scenario enum with strings caused 5; removing positive/safe revision guards caused 2; allowing arbitrary versions caused 3. Each exited 1. These check the implemented boundary rules only. **The requirement that every full acceptance ID have a rule-removal-sensitive runtime test is NOT SATISFIED.** Missing runtime/storage/UI tests are held below, not represented by schema tests or skipped/placeholder successes.

## Acceptance ledger

All full IDs remain HELD. “Preparation” below means only a subordinate input-boundary assertion was tested.

| ID | Actual evidence / missing test |
| --- | --- |
| DI1-01 | HELD: no run authority/storage; tenant/session input injection rejected in boundary tests only |
| DI1-02 | HELD: exact reset replay/single successor requires bootstrap/storage |
| DI1-03 | HELD: reset/late-result race; positive expected revision shape tested only |
| DI1-04 | HELD: no persisted resume stage or cleared-memory journey |
| DI1-05 | HELD: no domain checkpoint; client completion/step/fact fields rejected in preparation |
| DI1-06 | HELD: actual liabilities/meter/key preservation; reset injection preparation only |
| DI1-07 | HELD: no 0214/security contract; N-alone/source/successor-twice/mutation DB proof owed |
| DI2-01 | HELD: five selector values tested, no chooser/reload journey |
| DI2-02 | HELD: no reset/archive UI or subject-owned persisted state |
| DI2-03 | HELD: no HTTP adapters; strict subject locator shapes only |
| DI2-04 | HELD: no page; viewport/focus/keyboard browser proof not written or run |
| DI2-05 | HELD: no evidence/policy/gate report UI |
| DI2-06 | HELD: no report read or posting/collection sentinel test |
| DI2-07 | HELD: no HTTP/cache/browser response; no-store proof owed |
| DI3-01 | HELD: no producer checkpoint rehydration; client facts rejected by prepared commands |
| DI3-02 | HELD: no durable operation/read/replay binding or lost checkpoint test |
| DI3-03 | HELD: no coherent source snapshot/race implementation or test |
| DI3-04 | HELD: strict read locator rejects write flags; no actual GET side-effect test |
| DI3-05 | HELD: no frozen CH-9/source bytes or subsequent-correction test |
| DI3-06 | HELD: prepared commands reject PASS/CI/model/human fields; full public-surface test owed |
| DI3-07 | HELD: no report/snapshot/resume path or paired hidden-state invariance test |
| DI3-08 | HELD: current-authority report/archive/replay tests require authority contract |
| DI3-09 | HELD: input authority/result injection rejected; no SQL/worker/cross-mode proof |
| DI3-10 | HELD: old-job/reused operation/changed recipe/ambiguous recovery tests need producer bindings |
| DI3-11 | HELD: reset cancel/delete/key fields rejected; pending intent/archive/snapshot race proof owed |

PostgreSQL tests (`small-builder-demo-run`, `small-builder-demo-run-upgrade`, `small-builder-demo-report`) are **NOT WRITTEN / NOT RUN**, because writing truthful runtime tests requires the missing schema/routine/source contract. Browser shell is **NOT WRITTEN / NOT RUN**, per explicit no-nonexistent-page instruction. No fake, skipped, intercepted-success or intentionally red CI placeholders were introduced. Their absence is a remaining acceptance failure, not a waiver. CI cannot close DI1 against this preparation alone.

## Commands and results

Environment: Node v24.17.0; installed Vitest 4.1.11; dependencies preinstalled. Disk available 131 GiB. `memory_pressure` later reported 55% system memory free. At most two heavy processes; only one own-file unit invocation at a time, each with `--maxWorkers=2`. No package installation or git-writing command was invoked.

The host `pnpm` launcher emits a v11 overrides warning and stalls even on version lookup in this pinned-v10 workspace. The initial requested pnpm unit command, `pnpm --version`, and `pnpm --manage-package-manager-versions=false --version` were interrupted (130); no successful install/download is claimed. Checks use the existing package-local binaries, without changing pins or package scripts.

| Actual command | Result |
| --- | --- |
| API `./node_modules/.bin/vitest run --maxWorkers=2 src/small-builder-demo.application.test.ts` before module | 1; collection failed as expected (missing module) |
| Same after implementation | 0; 104 passed |
| Same under each of four temporary mutations | 1 each; 74 / 5 / 2 / 3 test failures; restored source |
| API `./node_modules/.bin/tsc -p tsconfig.json --noEmit` (package typecheck) | 0 |
| API `./node_modules/.bin/nest build` | 0 |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 1; core purity passed, then lane rejected the 12 inherited P1/P2 paths versus main |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1; same inherited P1/P2 paths; allowlist was not widened |
| `LANE_BASE_REF=HEAD node tools/agent-lane-boundary-lint.mjs` (diagnostic) | 1; self-comparison refused, no misleading pass |
| `node tools/money-arithmetic-lint.mjs` | 0 |
| `node tools/commercial-boundary-lint.mjs` | 0 |
| `git diff --check` | 0; note new files are untracked because git writes prohibited |
| API `./node_modules/.bin/tsx src/generate-openapi.ts --check` | 1; sandbox denies tsx IPC pipe listen (EPERM) |
| API `node --import tsx src/generate-openapi.ts --check` initial fallback | 1; missing unbuilt DB dist dependency; retry after dependency build recorded below |
| Web `./node_modules/.bin/next build` before dependency build | 1; missing unbuilt core dist exports; retry recorded below |

Final package lint, dependency builds, OpenAPI and production build follow-up results are recorded below. Root pnpm wrappers/full CI are not claimed green. Real DB/browser suites NOT RUN locally, as instructed.

## Shared integration still owed

See `docs/contracts/small-builder-demo-run-v1.md` for exact shared paths. No shared row/export was added here. Coordinator must supply accepted authority and isolated bootstrap, source/recipe/operation recovery maps, CH-9 reader/receipt contracts, reviewed 0214 writer, actual PostgreSQL/upgrade tests, then compose the same service in Nest and in-process Next, public exports, route/OpenAPI registration, actual migration catalogues, navigation and J1–J5 registry rows. Root lint must be rechecked after accepted parent integration; green CI, two exact-head independent Claude verdicts and separate technical acceptance remain missing. There is no final commit under this no-commit order.

## Symbol/path audit at base (git grep)

`git grep` was run against tracked HEAD for draft-named symbols; 0 means text found, **not** proof of an implementation or accepted producer. Proposed owned-file absence is expected but explicitly recorded as STOP per the order. New files do not retroactively satisfy a missing upstream contract. Public core barrel does not export P1/P2 modules. All seven proposed application methods are absent as DEMO runtime implementations even when prose or unrelated uses match.

| Symbol/path | git grep / existence exit | Evidence |
| --- | --- | --- |
| `VerifiedDemoAuthority` | 1 | **STOP: absent at base** |
| `SmallBuilderDemoApplication` | 0 | HEAD:docs/contracts/small-builder-demo-v1.md:49:\| DEMO-I run/report/resume (B31) \| **PROPOSED upstream** DEMO-I `SmallBuilderDemoApplication.readRun/readReport` via `GET /api/practice/small-builder-demo/runs/; HEAD:packages/core/src/small-builder-demo-scenarios.ts:492:      "commandSchemaAndRoute": "**PROPOSED upstream** DEMO-I `SmallBuilderDemoApplication.readRun/readReport` via `GET /api/practice/small-builder-demo |
| `SmallBuilderDemoRunRepository` | 1 | **STOP: absent at base** |
| `PracticeAccess` | 0 | HEAD:apps/api/src/capture/capture-state.test.ts:1:import { PracticeAccess } from "../practice-access.js";; HEAD:apps/api/src/capture/capture-state.test.ts:12:beforeEach(()=>vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue({context:{tenantId:"11111111-1111-4111-8111-111111111111"}} as never)); |
| `captureRequestV1` | 0 | HEAD:apps/api/src/capture/capture.application.ts:4:import { CAPTURE_PROMPT_VERSION, CAPTURE_SCHEMA_VERSION, captureRequestV1 } from "@jobguard/core";; HEAD:apps/api/src/capture/capture.application.ts:13: async capture(raw:unknown){const practice = await this.access.session();const parsed=captureRequestV1.safeParse(raw);if(!parsed.success)throw new CaptureAppl |
| `CaptureRepository` | 0 | HEAD:apps/api/src/app.module.ts:24:import { CaptureRepository } from "@jobguard/db";; HEAD:apps/api/src/app.module.ts:71:@Module({ controllers: [EnterpriseLivePromptController,JobSourceController,PracticeWorkerSwitchController,ScimController,SiteExtraController,SiteExtraPricingController,SiteVis |
| `demoCatalogue` | 0 | HEAD:docs/contracts/small-builder-demo-trace-v1.md:13:A report binds one synthetic tenant, job, session and run, one catalogue family and one viewport project, plus a prelock/postlock phase. Separate jobs, comp; HEAD:docs/contracts/small-builder-demo-trace-v1.md:44:Source preflight used `git grep`: `demoCatalogue` exists at the P1 base; `MAX_MONEY_PENCE` exists in money.ts. The four P2 functional paths named by the dra |
| `demoProductReportV1` | 0 | HEAD:docs/contracts/small-builder-demo-trace-v1.md:7:`packages/core/src/small-builder-demo-trace.ts` exports `demoTraceScopeV1`, `demoTraceValueV1`, `demoTraceSourceV1`, `demoProductReportV1`, `acceptanceTraceV; HEAD:packages/core/src/small-builder-demo-trace.test.ts:3:import { acceptanceTraceV1, demoProductReportV1, validateDemoProductReport } from "./small-builder-demo-trace.js"; |
| `DemoMeterCommands` | 0 | HEAD:docs/contracts/small-builder-demo-v1.md:42:\| MON-1 meter lifecycle (B24) \| **PROPOSED upstream** `DemoMeterCommands`: MON-1 lifecycle source, admission, day-ledger and read operations; exact accepted rou; HEAD:docs/contracts/small-builder-demo-v1.md:230:\| `DemoMeterCommands` \| STOP: absent at base; concrete upstream binding required; no substitute \| |
| `DemoSubscriptionCommands` | 0 | HEAD:docs/contracts/small-builder-demo-v1.md:43:\| MON-2A subscription (B25) \| **PROPOSED upstream** `DemoSubscriptionCommands`: MON-2A plan, period, statement, simulated settlement and conversion operations; ; HEAD:docs/contracts/small-builder-demo-v1.md:231:\| `DemoSubscriptionCommands` \| STOP: absent at base; concrete upstream binding required; no substitute \| |
| `DemoTrialCommands` | 0 | HEAD:docs/contracts/small-builder-demo-v1.md:44:\| MON-3 trial (B26) \| **PROPOSED upstream** `DemoTrialCommands`: MON-3 eligibility, card setup, entitlement claim, lifecycle end and expiry operations; exact ac; HEAD:docs/contracts/small-builder-demo-v1.md:232:\| `DemoTrialCommands` \| STOP: absent at base; concrete upstream binding required; no substitute \| |
| `authenticatePracticeSession` | 0 | HEAD:apps/api/src/auth/identity.test.ts:44:  const adapters:Record<string,unknown>={"server-only":{},"next/headers":{cookies:cookie},"next/server":{NextResponse:{json:Response.json}},"@jobguard/db":{authenticat; HEAD:apps/api/src/practice-access.ts:2:import { DEMO_EMPTY_TENANT_ID, authenticatePracticeSession, authorizePracticeJob, PracticeAccessError, withTenant } from "@jobguard/db"; |
| `ApplicationAuthGuard` | 0 | HEAD:apps/api/src/app.module.ts:64:import { ApplicationAuthGuard } from "./auth/application-auth.guard.js";; HEAD:apps/api/src/app.module.ts:71:@Module({ controllers: [EnterpriseLivePromptController,JobSourceController,PracticeWorkerSwitchController,ScimController,SiteExtraController,SiteExtraPricingController,SiteVis |
| `ValueV3Reader` | 1 | **STOP: absent at base** |
| `createRun` | 1 | **STOP: absent at base** |
| `readRun` | 0 | HEAD:docs/contracts/small-builder-demo-v1.md:49:\| DEMO-I run/report/resume (B31) \| **PROPOSED upstream** DEMO-I `SmallBuilderDemoApplication.readRun/readReport` via `GET /api/practice/small-builder-demo/runs/; HEAD:packages/core/src/small-builder-demo-scenarios.ts:492:      "commandSchemaAndRoute": "**PROPOSED upstream** DEMO-I `SmallBuilderDemoApplication.readRun/readReport` via `GET /api/practice/small-builder-demo |
| `reserveOperation` | 1 | **STOP: absent at base** |
| `checkpoint` | 0 | HEAD:apps/api/openapi.json:1719:        "summary": "Create audit-export-request.v1 in synthetic_demo with restricted checkpoint handoff. The signature proves export integrity only",; HEAD:apps/api/src/audit-export/audit-export.application.test.ts:21:  it("rejects client supplied tenant, checkpoint, key and mode fields", () => { |
| `createReportSnapshot` | 1 | **STOP: absent at base** |
| `readReport` | 0 | HEAD:docs/contracts/small-builder-demo-v1.md:49:\| DEMO-I run/report/resume (B31) \| **PROPOSED upstream** DEMO-I `SmallBuilderDemoApplication.readRun/readReport` via `GET /api/practice/small-builder-demo/runs/; HEAD:packages/core/src/small-builder-demo-scenarios.ts:492:      "commandSchemaAndRoute": "**PROPOSED upstream** DEMO-I `SmallBuilderDemoApplication.readRun/readReport` via `GET /api/practice/small-builder-demo |
| `resetRun` | 1 | **STOP: absent at base** |
| `apps/api/src/small-builder-demo.application.test.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/api/src/small-builder-demo.application.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/api/src/small-builder-demo.contracts.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/api/src/small-builder-demo.controller.test.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/api/src/small-builder-demo.controller.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/api/practice/small-builder-demo/routes.test.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/api/practice/small-builder-demo/runs/[runId]/checkpoints/route.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/api/practice/small-builder-demo/runs/[runId]/operation-intents/route.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/api/practice/small-builder-demo/runs/[runId]/report-snapshots/route.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/api/practice/small-builder-demo/runs/[runId]/report/route.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/api/practice/small-builder-demo/runs/[runId]/reset/route.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/api/practice/small-builder-demo/runs/[runId]/route.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/api/practice/small-builder-demo/runs/route.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/lib/small-builder-demo-registry.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/practice/small-builder/[runId]/page.tsx` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/practice/small-builder/page.tsx` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/ui/small-builder-demo-chooser.tsx` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/ui/small-builder-demo-report.test.tsx` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/app/ui/small-builder-demo-report.tsx` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `apps/web/e2e/DEMO-S-shell.spec.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `docs/contracts/small-builder-demo-run-v1.md` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `packages/db/src/small-builder-demo-run-repository.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `packages/db/test/small-builder-demo-report.integration.test.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `packages/db/test/small-builder-demo-run-upgrade.integration.test.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |
| `packages/db/test/small-builder-demo-run.integration.test.ts` | 128 | STOP: proposed owned file absent at base; not an upstream producer |

## Final follow-up validation

| Actual command | Result |
| --- | --- |
| API `./node_modules/.bin/tsc -p tsconfig.json --noEmit` (second invocation; package lint script equivalent) | 0 |
| Each of config, core, ai, storage, db: package-local `./node_modules/.bin/tsc -p tsconfig.json`, sequentially in dependency order | 0 for all five |
| API `node --import tsx src/generate-openapi.ts --check` after dependency builds | 0; existing OpenAPI unchanged; no new route registration claimed |
| Web `./node_modules/.bin/next build` after dependency builds | 1; existing API dist imports fail: auditExportRequestV1, finalAccountLockCommandV1, finalAccountDispositionCommandV1, finalCheckTermsAcceptanceCommandV1, jobSourceReadQueryV1 reported not exported by their existing contract modules. These source/dist modules are outside this lane and unchanged. Build is NOT GREEN. |
| API direct own-file Vitest command after restoring every mutation | 0; 104 passed |
| Read-only source audit of actual classes/interfaces and public barrels via `git grep` | 1 (no matches): runtime classes, VerifiedDemoAuthority and DemoMeter/Subscription/TrialCommands interfaces absent; no P1/P2 public barrel exports |

No generated/dist file is committed or included in the handoff. Final worktree contains only the five authorised new files (including the lane itself). Whitespace and exact own-path scope were checked directly because `git diff --check` does not inspect untracked files. The lane-vs-main inherited diff remains a genuine failing gate and the web build remains failing; neither is relabelled a pass.

The receipt and intended conventional commit text are ready for the dispatcher at `/private/tmp/jg-msg-demo-i.txt`. No approval-review rejection occurred. Missing upstream implementation contracts, rather than sandbox approval, stop the runtime. PostgreSQL/browser restrictions are recorded separately above.
