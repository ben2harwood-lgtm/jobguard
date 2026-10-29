# CH-9 part 2 — main catch-up (RED), 29 October 2026

Ready for the router to stage the resolved merge and commit this catch-up on
`codex/sandbox/ch9-p2`. Git's index remains unmerged because this sandbox cannot
write `.git`. Required GitHub CI and independent RED review precede merge.
This section supersedes the historical readiness statements below.

- Retained main's SV-6/#400 migration 0340 and #383 migration 0335, notes,
  repositories and tests; the duplicate old migration paths are absent.
  Unioned all three export lists and both sides of this receipt. Kept main's
  existing recovery-attribution routine entry once in the privilege inventory.
- Renumbered this piece's migration 0326 to the explicitly issued **0342**,
  including its note, lane and upgrade-test references/bound. Used the exported
  `planRenumber` from `tools/migration-renumber.mjs`, respecting the issued 0342
  reservation. The helper's CLI write mode requires a clean tree and stages
  files, so filesystem changes were applied without Git writes.
  SQL SHA-256 before/after:
  `42fd422e39b4fca39531142dd1a35234f5ea3b863ec1359cd735736e67cc68a3`.
- Parenthesised the two CASE expressions inside PL/pgSQL IF subqueries in 0335.
  No predicate, action, allocation rule or other reviewed behavior changed.
- The piece's lane lists exactly 34 changed paths against current main,
  including the new migration/note and the syntax-only 0335 fix.

Actual local checks, Node 24.17.0 / installed Vitest 4.1.12; no downloads:

- `node --check tools/migration-renumber.mjs`: PASS.
- Installed TypeScript compiler: core and DB builds, API and web `--noEmit`: PASS.
- Core: `src/value-source-receipt.test.ts src/cumulative-fee.test.ts`: **113 passed**.
- DB: `src/value-business-reader.test.ts src/stored-receipt-migration.test.ts
  test/lp-0-catalog.test.ts`: **33 passed** (no PostgreSQL execution).
- API: `src/value/value-v3.application.test.ts
  src/value/company-value.application.test.ts src/value/value-composition.test.ts`:
  **41 passed**.
- Web: `app/api/jobs/[id]/value/v3/route.test.ts app/api/value/route.test.ts
  app/ui/mapped-value-receipt.test.tsx`: **28 passed**.
- All four Vitest runs used `node node_modules/vitest/vitest.mjs run
  --maxWorkers=2` in their package directories, at most three named files per run,
  with no overlapping Vitest runs: **215 tests passed** in total.
- `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`,
  `node tools/commercial-boundary-lint.mjs`: PASS.
- API `node --import tsx src/generate-openapi.ts --check`: PASS. The initial
  tsx CLI attempt could not bind its IPC pipe (sandbox EPERM); the Node loader
  completed the same check without that CLI pipe.
- `git diff --check origin/main`: PASS. No conflict markers remain in the four
  resolved files. Direct current-main path/migration-order assertions using the
  lane checker's exported predicates: PASS, 34 exact paths.
- Official `node tools/agent-lane-boundary-lint.mjs`: FAIL while the merge is
  uncommitted, because it unions pre-merge HEAD ancestry and the incoming staged
  main files. No gate was weakened or inherited paths added to the lane. The
  router must rerun it after staging and committing the merge.

PostgreSQL installation, migration upgrade/replay, isolation and browser suites
remain GitHub CI checks: this sandbox cannot start PostgreSQL or bind localhost.
No database/browser execution, independent review, live provider, real customer
data, live money or release is claimed. No Git write command was run.

Commit message: `/tmp/ch9-p2-20261029T063615Z-commit-msg.txt`.

---

## Historical handoff before this catch-up

# CH-9 part 2 — current builder handoff (RED)

28 October 2026. Branch `codex/sandbox/ch9-p2`. Source implemented locally;
PostgreSQL/browser CI and the independent RED review remain to run.
**Not commit-ready on this combined parent tree:** the inherited lane footprint
and the protected practice-session source-pin gate still fail. No commit,
push, PR, merge, provider, real data, live money or release action was performed.
The historical part-1 record below is preserved as history.

## Change and scope

- Resolved both supplied conflicts by retaining both sides' exports. The Git index
  remains unmerged/read-only until the router stages these resolved files.
- Added migration **0342**, two controlled read functions, source DTO/projection,
  mapped job and company receipt views, source-reproduced business totals and
  separate MON-1/MON-2A subscription periods/statements. Existing candidate
  illustrative DTOs, fixtures and v1 recorded-money views remain separate.
- Original-bill captures join their actual variation **revision** source IDs and
  belong to the locked revision and original invoice. The existing receipt-line
  binding helper checks the completed check, invoice and exact line identity.
- Found figures reuse SV-6's persisted assessments and current source resolver,
  including #346, #356 and corrected #368. Revisions replace balances; explicit
  signed movements retain reversals. Stale sources, unassessed cases and fractional
  pence refuse current figures. No second allocator, writer or qualification
  policy was introduced. Fees reuse SV-6's cumulative v3 kernel and remain proposed
  policy illustrations, with “yours before VAT and tax”.
- Company access uses the existing MON-1/MON-2A identity bridge. A shared practice
  cookie never grants company billing access, including alongside a revoked company
  cookie. Private/no-store reads authenticate before selection or source details.
  Company job links use that same bridge on the exact read endpoint. Per-job practice ownership is rechecked. No hidden query occurs before lock.
- Optional half-open windows use exact server-recorded instants (including
  PostgreSQL microseconds). Original invoice creation, completed check availability
  and attribution recording supply the clocks. Subscription selection is by saved
  period ID; job windows never prorate a subscription or place it on a job.
- The public phrase is “mapped, inspectable”. Supplier and withheld-payment
  sections stay explicitly unavailable because this branch has no accepted
  producer for their figures. No capture or catch amount is relabelled into them.

The additional company read boundary is necessary because the old practice-session
boundary cannot authorize MON-1/MON-2A's company ledger. It reuses that producer's
existing authentication; it does not relax shared-practice isolation. The source
contract is distinct because the old illustrative contract is deliberately unbound.
This is the substantial complexity added by this piece; no new orchestration,
provider layer, framework or reporting system was introduced.

## Local evidence (actual execution)

Node 24.17.0; installed TypeScript 5.8.3 and Vitest 4.1.12. No packages downloaded.
The pnpm wrapper stalled before running checks and was interrupted; checks below
use the installed compiler/test-runner entrypoints directly.

- `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json` — PASS.
- Same compiler for `packages/db/tsconfig.json` and `apps/api/tsconfig.json` — PASS;
  `apps/web/tsconfig.json --noEmit` — PASS (rerun after final view edits).
- Core Vitest: `src/value-source-receipt.test.ts src/cumulative-fee.test.ts`,
  `--maxWorkers=2` — **111 passed**. Includes the reused attribution fixture's
  registered tests; this is not 111 newly added tests.
- API Vitest: job/business application + composition — **52 passed** before the
  additional positive-source regression; job/business/company application
  run — **60 passed**; final job/company/composition run — **41 passed**. Company/subscription-access/controller run — **20 passed**.
- DB scripted adapter + catalogue comparator: `src/value-business-reader.test.ts
  test/lp-0-catalog.test.ts`, `--maxWorkers=2` — **30 passed**. These are deterministic
  adapter/comparator tests, not PostgreSQL permission or settlement proof.
- Web value routes + static receipt rendering, three named files,
  `--maxWorkers=2` — **24 passed** after repeated-window-selector and company job-link regressions.
- OpenAPI generation ran without sockets. Its checked-in diff changes only the
  two value-read summaries. OpenAPI consistency is checked again on the final tree.
- Core-purity, money-arithmetic and commercial-boundary scripts — PASS. Lane
  checking is reported separately below because this is a build-ahead branch.
- An optional standalone typecheck of the new integration files reached the
  existing `packages/db/test/job-work-state-fixtures.ts:45` error: the default
  proof-evidence option is typed `string | undefined`. That unrelated fixture was
  preserved; Vitest's real PostgreSQL suite remains the required execution proof.

## Lane gate on this build-ahead tree

`node tools/agent-lane-boundary-lint.mjs` selects the new `ch9-p2` lane, then
**FAILS** against local `origin/main`: it also sees inherited CH9-B and SV6-hookup
parent changes (including their lane files and enterprise/allocator work). The
new lane lists only the 32 exact paths edited by this piece; it does not absorb
parent ownership, grant other lane files or weaken the checker. The router must
integrate the parent branches into the comparison base before this piece can
have green PR CI. This is not a local lane PASS or permission to merge.

Initial builder source inspection (not an independent review): **LATER / SIMPLICITY**
— `packages/core/src/recovery-attribution-persistence.test.ts`, exported `fixture`:
move that factory to a shared test helper later. Both suites can reuse it without
registering the persistence suite as an import side effect, keeping focused test
counts and failures easier to maintain. Non-blocking; no adjacent refactor here.

Additional security-boundary execution: `src/auth/context-boundary.test.ts`
finishes **143 passed, 2 failed**. After correcting the new wrapper's type shape,
its diagnostic names only inherited `packages/db/src/practice-session.ts:24` and
that file's protected source identity. There is no unstaged change to that file;
the supplied staged parent delta adds the optional serializable-transaction path
to `practiceMaterialPool`. The protected checker/fingerprint and parent behavior
were preserved. The parent's owner/reviewer must reconcile this gate before this
combined tree is ready. `src/auth/identity.test.ts` separately passed 6 tests;
final legacy value-controller/subscription-access regression passed 16 tests.
The reviewed catalogue JSON parses with 1,375 entries and no path-completeness
problems. None of this substitutes for live PostgreSQL grant inspection.

## CI and review evidence still required

`value-source.integration.test.ts` uses real synthetic writers for the catch,
supplementary invoice, matched settled receipt, allocator and assessment chain.
It tests replay/no read-side audit append, immediate stale-money refusal after a
refund, explicit negative reassessment, original-bill fee-free capture, cross-
session/job/tenant refusal, real subscription statement reproduction and session
revocation. Disposable corruption tests attack allocation caps and wrong locked
revisions through the read boundary. Grants are checked as real catalogue facts.
`value-source-upgrade.integration.test.ts` populates the actual predecessor,
preserves existing rows/types/keys through 0342, applies successors and repeats
migration. These PostgreSQL tests were **not run locally**: this sandbox cannot
start PostgreSQL or bind localhost.

`CH-9-mapped.spec.ts` tests responsive source/period rendering and removal of stale
figures on refresh with an explicitly mocked transport fixture. It is browser UI
coverage, not database truth; PostgreSQL coverage is separate. Browser suites,
full required CI, current-main comparison and one independent Claude RED review
are still required before merge. No live-model evaluation applies: prompts,
models, extraction schemas and provider routes did not change.

---

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


## CH-9 combined-base repair — 28 October 2026

**RED; incomplete; do not commit as completed CH-9.** This run uses the router's
already-merged `codex/sandbox/ch9-b` base. The current SIMPLE_LOOP.md is the build
rulebook; earlier coordinator/checker-count instructions in this historical receipt
are superseded. One independent RED review remains required before merge.

Installed the previously unapplied composition in actual code: both Nest GETs,
request-scoped workspace job/business services, the database reader export, and
Next `/api/jobs/[id]/value/v3`. Next `/api/value` now uses the shared business
application instead of a separate copy of authentication/selection behavior.
Repeated query selectors remain invalid after authentication. Business service
code moved out of the decorated controller so the Next TypeScript build can consume
it without Nest decorator compilation. Existing controller exports remain compatible.
Both transports keep private, no-store responses with Vary: Cookie. Corrected the
job controller's synthetic-only refusal from 503 to 403 and shared its sanitized
error mapping with Next. OpenAPI was regenerated from the registered application.

No migration, money computation, financial posting, producer authorization,
external action, prompt/model change, provider call or real-data execution was added.
Migration 0308 is unused. Existing integration patches are historical handoff
artifacts; the actual composition above is installed, so do not apply them again.

### Self-attack and remaining completion blockers

- Duplicates/replays: existing strict source/event DTO tests pass; new producer
  injection tests reject duplicate claimed sources. Repeated actual reads authenticate
  again. Next business tests preserve rejection of duplicate selectors.
- Reversals: existing receipt tests retain the explicit original/reversal and reject
  broken references; the live availability envelope rejects a supplied unsupported
  reversal rather than displaying it as a financial fact.
- Cross-customer access: current application authorization precedes queries and source
  reads. Existing real-PostgreSQL suites remain for CI. Added a CI browser regression
  for unauthenticated and other-session access to the composed job endpoint.
- Allocation limits and locked bill: supplied over-allocation and unlocked-revision
  claims are rejected at the strict unavailable envelope. These tests prove refusal,
  not a complete positive allocation/locked-bill producer pipeline.
- Found during attack: synthetic-only job denial had the wrong HTTP status; a new
  controller case and Next refusal test now cover 403 and private error responses.

**CH-9's positive acceptance is not met.** Current
`apps/api/src/recovery-attribution.application.ts` still refuses assessment commands
with RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND and labels history qualification
`dependency_bound`. `packages/db/src/recovery-attribution-repository.ts` is storage
access with runtime assessment closed pending its source adapter. It cannot supply
current fee entitlement merely because SV-6 merged. The illustrative core v3 DTOs
are still explicitly `illustrative_unbound`; relabelling them would not reproduce
figures from authoritative sources. The newly merged MON-1 counted-today read
provides a date and place count, not a practice subscription-period computation.
The existing MeterRepository period read explicitly holds shared practice scope.
Thus source-backed job/business recovery receipts, accepted event-window semantics,
locked-bill attribution, and practice subscription-period figures remain unfinished.
No upstream gate/policy was weakened to manufacture them.

The default root lane gate also fails: this combined branch includes inherited
CH9-J/R and MON-1 paths and other lanes' own registration files. The updated
`config/lanes/ch9-b.json` lists exactly this run's edited paths (its own registration
is implicitly permitted by the checker). It does not grant inherited unrelated
paths or change the gate. Router must reconcile the combined PR's ancestry/lane
scope before claiming green CI. An attempted LANE_BASE_REF=HEAD check was refused
by the tool as a self-comparison; it is not a pass.

LATER / SIMPLICITY (initial review):
`apps/web/app/ui/business-value-v3.tsx:4` repeats the strict unavailable response
schema. A future pure contract export shared with the server would reduce schema
and error-code drift. This is nonblocking and was left outside this repair.

### Local validation

Node 24.17.0, installed pnpm 10.28.1 and Vitest 4.1.12. Used the existing
`/private/tmp/jg-ch9-b-bin/pnpm` wrapper for the pinned cached pnpm; no install or
download. Turbo concurrency at most 2; each Vitest run at most 2 workers and at
most 3 named files. No helper agents and no git write commands.

- `pnpm typecheck --concurrency=2`: PASS, 7 tasks after the application/controller split.
- `pnpm build --concurrency=2`: PASS, 7 tasks, including production Next routes.
  Existing CSS, dependency-bundling, workspace-root and sandbox cache warnings.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/value-v3.test.ts src/value-v3-receipt.test.ts src/value-v3-copy.test.ts`: PASS, 85 tests.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/value/value-v3.application.test.ts src/value/value-v3.controller.test.ts src/value/value-business.controller.test.ts`: PASS, 40 tests.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/value/value-composition.test.ts src/value/value-v3-business.application.test.ts src/value/value.application.test.ts`: PASS, 28 tests. The composition test initializes Nest and invokes its registered handlers without binding sockets; financial services are doubled there.
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/api/value/route.test.ts 'app/api/jobs/[id]/value/v3/route.test.ts'`: PASS, 20 tests.
- `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 src/meter-day-ledger.test.ts src/meter-today-repository.test.ts`: PASS, 5 unit tests; no PostgreSQL started.
- `node --import tsx src/generate-openapi.ts --check` in apps/api: PASS, using installed loader without tsx CLI IPC binding.
- Money arithmetic and commercial boundary lints: PASS.
- `pnpm lint`: FAIL at inherited lane paths, as described above. Core purity passes.

178 distinct targeted assertions passed in the final listed batches. The first API
attempt used stale dist artifacts from before main's Zod update and failed during
module loading. Rebuilding the installed dependency packages resolved that without
source changes. The first composition typecheck exposed Nest decorators through
the workspace export; separating application/controller fixed that. These failed
attempts are not represented as passing checks.

Database/migration/catalogue/RLS and browser suites were NOT RUN in this sandbox,
as instructed. Full root tests, clean install, independent RED review, CI and release
were NOT performed. CI should run the existing value-v3-reader and value-v3-business
PostgreSQL suites, MON-1 ledger/read regressions and the updated CH-9-business.spec.ts
in mobile-360 and desktop. No completed positive CH-9 journey is claimed.


## Router scope decision: CH-9 part 1 — 28 October 2026

The router explicitly accepts the composed value-read boundaries, v3 job GET,
refusals and tests as **CH-9 part 1 (RED)**. Real source-backed recovery receipts
and billing-period subscription figures are a later piece after the SV-6 hookup
and a MON-1 billing-period amount. They still refuse; this is an intentional
part-1 boundary, not a source-completion claim. Earlier full-CH-9 readiness
statements above do not reject this narrower approved scope.

Archived the inherited CH9-J/R registration files byte-for-byte at
`docs/verdicts/CH9-J/LANE_ARCHIVE.json` and
`docs/verdicts/CH9-R/LANE_ARCHIVE.json`, removing those leaf registrations from
config/lanes. Consolidated the CH-9 paths into the sole ch9-b lane. The MON-1
ledger/read registrations are byte-for-byte unchanged and retain their own branches;
MON-1-only paths are not claimed by this CH-9 lane. No lane gate/test code changed.

Actual checkout observation at this repair: HEAD `743b0761`, origin/main `eaa63703`
(main still reports #363). No unmerged index entries exist. The stated new-main
merge is not present in these local refs; #376/#377's paths are still in the
committed branch/main comparison. The local gate also includes committed changes
before considering working-tree deletions: archived leaf registration files are
still selected from origin/main...HEAD until the router commits their removal.
Therefore default `pnpm lint` was run and still FAILS on the inherited MON-1 paths
and committed CH9-J/R registration paths. No alternative base, shim, integration
lane or weakened gate was used to create a pass.

Required router action: refresh/merge current main (including the MON-1 parents
when landed), resolve shared expectation-list rows by union if any conflict exists,
and checkpoint this reconciliation using the router's git permissions. Resume this
session for the real default lint run and exact final main-relative lane inventory.
This session cannot perform that git mutation. Part-1 source behavior is ready
for the narrower review, but the requested lint-ready handoff is not yet proven.

Checks: `node --test --test-concurrency=2 tools/agent-lane-boundary.test.mjs tools/agent-lane-boundary-train.test.mjs`
PASS (66 tests); archive/unchanged-MON-1 byte comparisons PASS; `git diff --check`
PASS. No code behavior changed in this metadata repair; the earlier production
build, typecheck and 178 focused assertions remain the last code validation.
No PostgreSQL/browser suites run here. The git-based lane tests use disposable
fixture repositories; no git-writing command was issued against this worktree.


## CH-9 part 2 cumulative job-fee rounding follow-up — 28 October 2026

RED. Job totals now pass cumulative principal once through the existing v3
`calculateCumulativeFee` kernel, matching MON-4A/M4-9-S rounding. Catch movement
fee and remainder fields retain exact rational pence shares; the UI labels fee
shares as unrounded and preserves a third decimal in pounds when needed. This
changes those two movement fields from integer Money to exact rational pence in
the still-unmerged mapped receipt contract; job totals remain integer Money.
Window fees are differences between rounded cumulative job balances, preserving
adjacent-window reconciliation and explicit negative reversals. No migration,
financial posting, policy, eligibility, authorization or real provider change.

Regression: three catches of 101p, 105p and 105p produce a 31p job fee, rather
than the 30p sum of individually rounded fees. Their exact fee shares remain
10.1p, 10.5p and 10.5p. Separate windows give 10p, 11p and 10p, and reversing
the first catch gives -10p. Existing replay, foreign scope, lock, stale-source
and fractional-principal refusals remain covered.

Local checks (installed Node 24.17.0, cached pnpm 10.28.1; no downloads):

- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/value-source-receipt.test.ts src/cumulative-fee.test.ts src/fee-statement.test.ts`: PASS, 122 tests (includes imported attribution fixture tests).
- `pnpm --filter @jobguard/core build`: PASS (TypeScript compilation).
- `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2 app/ui/mapped-value-receipt.test.tsx`: PASS, 5 tests.
- `pnpm --filter @jobguard/web typecheck`: PASS.
- `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/value/value-v3.application.test.ts src/value/company-value.application.test.ts`: PASS, 40 tests.
- Core purity, money arithmetic and commercial boundary lints: PASS. Core purity reports existing computed-import notices.
- `git diff --check`: PASS.
- Default lane boundary lint: FAIL on inherited committed branch paths outside ch9-p2, including MON-1 and SV-6 hookup paths and their lane files. None of the repair's changed paths is in its refusal list. The gate was not weakened; the router must reconcile ancestry/current main before CI can be green.

Database/browser suites and full root checks were not run, per sandbox/task
constraints. Existing database reversal assertion was updated to the exact share
shape for CI. Migration 0342 is unchanged. This is ready for the router's repair
commit; it is not a CI pass, review of the changed head, merge or release claim.
One independent RED review of the new head remains required. No git writes.
Commit message: `/tmp/ch9-p2-20261028T215114Z-commit-msg.txt`.
## Catch-up resolution — 28 October 2026, 21:28 UTC

This section supersedes the earlier catch-up observations above. Scope remains
CH-9 part 1, RED; no new product behaviour or migrations. Resolved the two
working-file conflicts in `apps/api/src/workspace/index.ts` and
`packages/db/src/index.ts` by retaining both the CH-9 value exports and main's
enterprise exports. The ch9-b lane lists exactly the 35 changed paths relative
to incoming main, with its own lane file implicitly allowed (36 paths total).
The five shared LP-0/SERIOUS-B5/entitlement/tenancy/origin expectation files and
all 178 migration/note files are byte-identical to incoming main. No SQL changed.

Incoming main in the pending merge is `8e80dabd` (#381), including #376/#377.
`origin/main` now points to `9a298d4d` (#385, MON-2A); that later change is not
part of the merge already in progress. Router must stage the resolved files,
finish this merge, then incorporate newer main before the current-main CI gate.
No Git-writing command was run; the index still records two unmerged entries.

Actual local checks (Node 24.17.0, installed Vitest 4.1.12):

- `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` — PASS.
- `./node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — PASS.
- From apps/api: `./node_modules/.bin/vitest run --maxWorkers=2 src/value/value-composition.test.ts src/value/value-v3.application.test.ts src/value/value-v3-business.application.test.ts` — PASS, 52 tests.
- From packages/core: `./node_modules/.bin/vitest run --maxWorkers=2 src/value-v3-receipt.test.ts src/value-v3-copy.test.ts` — PASS, 28 tests.
- From apps/api: `./node_modules/.bin/vitest run --maxWorkers=2 src/value/value-v3.controller.test.ts src/value/value-business.controller.test.ts` — PASS, 12 tests.
- From apps/api: `node --import tsx src/generate-openapi.ts --check` — PASS.
  The tsx CLI attempt failed on sandbox IPC binding; the Node import invocation
  executes the same generator without the CLI IPC server.
- Read-only deterministic main-relative lane inventory, shared-file/migration
  byte comparisons and conflict-marker assertions — PASS. This is not the
  Git-based lane gate or independent review.
- `node tools/lint.mjs` — FAIL at the lane gate: it counts staged incoming-main
  changes against pre-merge HEAD while the merge is unfinished. Core purity
  passed; subsequent lint stages did not run. Router must rerun default lint
  after committing the merge; no gate was weakened or alternate base supplied.
- `git diff --check` — PASS for this catch-up. Main-relative checking additionally
  reports pre-existing space-only context lines in the two archived integration
  patch files; those patch bytes were preserved.

The pnpm version probe stalled and was interrupted; no dependency install or
package download was requested. Checks used installed repository binaries.
PostgreSQL, browser, full CI and independent RED review were not run here and
remain with CI/the loop owner. The working-file reconciliation is ready for the
router's merge commit; green current-main CI is not claimed.


## PR #393 catch-up — 29 October 2026

Ready for the router to stage the resolved files and finish the pending merge
from incoming main `bf1052a0`. Scope is unchanged CH-9 part 1 (RED, prior
RED pass supplied by the router); no new behaviour or migration. This is a
catch-up validation, not a new independent review or a claim of green CI.

Resolved four working-file conflicts: `apps/api/src/app.module.ts`,
`apps/api/src/workspace/application.ts`, `apps/api/src/workspace/index.ts` and
`apps/api/openapi.json`. Retained the CH-9 job/business reads, provider factory
and exports together with main's success-fee registration/service/export,
job-source intake and evidence-pack-v3 composition. Regenerated OpenAPI from
that composition: every incoming-main path and operation is unchanged; all
HEAD paths remain, with only main's already-approved diary/customer-message
changes superseding HEAD's older definitions.

LP-0, SERIOUS-B5, contractor entitlement, effective privileges and tenancy shared
expectation files already matched incoming main exactly; no edits were needed.
All 185 incoming-main migration/note files match byte-for-byte. No SQL changed.
The lane allow list exactly matches the 35 changed paths against incoming main,
with its own lane file implicitly permitted (36 total); only its descriptive
note was refreshed. No new simplification is recorded for this catch-up.

Local checks actually run, installed Node 24.17.0/Vitest 4.1.12, no downloads:

- `./node_modules/.bin/tsc -p packages/core/tsconfig.json` and
  `./node_modules/.bin/tsc -p packages/db/tsconfig.json`: PASS (dependency builds).
- `./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit`: PASS.
- `./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit`: PASS.
- In apps/api, `./node_modules/.bin/vitest run --maxWorkers=2 src/value/value-composition.test.ts src/value/value-v3.application.test.ts src/value/value-v3-business.application.test.ts`: PASS, 52 tests.
- In apps/api, `./node_modules/.bin/vitest run --maxWorkers=2 src/value/value-v3.controller.test.ts src/value/value-business.controller.test.ts`: PASS, 12 tests.
- In apps/web, `./node_modules/.bin/vitest run --maxWorkers=2 app/api/value/route.test.ts 'app/api/jobs/[id]/value/v3/route.test.ts'`: PASS, 20 tests.
- In apps/api, `node --import tsx src/generate-openapi.ts` then the same command
  with `--check`: PASS. Initial generation encountered stale core dist exports;
  rebuilding installed dependencies resolved this without source changes.
- `node tools/money-arithmetic-lint.mjs` and
  `node tools/commercial-boundary-lint.mjs`: PASS.
- `node tools/lint.mjs`: FAIL at lane boundary because the unfinished merge
  counts staged incoming-main changes against pre-merge HEAD; core purity PASS.
  Router must rerun default lint after committing the merge. No gate changes or
  alternate-base lint pass are claimed.
- Read-only incoming-main lane inventory, five shared expectation comparisons,
  185 migration/note byte comparisons and OpenAPI path preservation: PASS.
- `git diff --check`: PASS.

The initial Turbo dependency build stalled in the local pnpm launcher and was
interrupted; direct installed tsc binaries completed both dependency builds.
No database or browser suite, full build/root tests, clean install, live provider,
real customer data or release was run. Database/browser and required checks run
in GitHub CI after the router pushes. At most two Vitest workers and three named
files per run; no helper agents. No Git-writing command was issued; unmerged
index entries remain for router staging. The historical part-1 source holds
remain unchanged and do not widen this catch-up's scope.

Commit message: `/tmp/ch9-b-20261029T002305Z-commit-msg.txt`.
