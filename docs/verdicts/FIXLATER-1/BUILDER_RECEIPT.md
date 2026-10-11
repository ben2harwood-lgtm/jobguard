# FIXLATER-1 builder receipt

11 October 2026. First routine fix-later batch; AMBER check lane.

**Builder receipt only — not independently verified, not accepted.**

## Base and scope

- Repository: `ben2harwood-lgtm/jobguard`; branch: `codex/sandbox/fixlater-1`.
- `HEAD` and `origin/main`: `ff072c70d577c47847de56c8b30e708bee4267dd` before and after the work. The dispatcher owns the commit; no Git-writing command was run.
- Read `AGENTS.md`, BUILD_PLAN §§2.1–2.4, the M4-5-S/M4-6-S cards, and the source fix-later list. This work implements the issued five-item order only.
- The first edit added exactly one compact `fixlater-1` lane line, in name order, with the issued branch, note and ten allowed paths. All other lane lines are byte-identical to the base.
- No migration, backfill, API/schema/prompt/dependency change, new external action, operational alert or change to money, authorization, tenancy, sign-in or stored data. Existing fee, proof, audit and approval contracts remain unchanged. The two application changes affect only display/picker reads.
- Shared-file scope: the lane registry addition, the two specified migration-note sections and the recovery UI files are serialized in this batch. No other lane or plan entry was edited.

## Five items

### 1 — DONE: enabled-button wait

`apps/web/e2e/M4-1-S.spec.ts:18` now waits immediately before focus:

```ts
// Before:
await button(page,"Open materials-320 overcharge").focus();
// After:
await expect(button(page,"Open materials-320 overcharge")).toBeEnabled();
await button(page,"Open materials-320 overcharge").focus();
```

Nothing else in this spec changed. Existing test: `opens and manages evidence-linked recovery cases without inventing recovered money`. Browser execution is NOT RUN below.

### 2 — DONE: wait for saved proof completion

Source inspection found the cause plainly: `ProofStage.command` awaits the proof POST and its JSON response before adopting the saved view; `stage-status` becomes `Complete` only from that response's completion record. The spec previously clicked the independent final-account rebuild immediately after starting completion. `JobFinalAccount.build` can therefore read before proof is committed.

`apps/web/e2e/UIWIRE-9.spec.ts:1` has only this insertion:

```ts
// Before:
await click(page,"Complete this stage");
await click(page,"Rebuild from approved sources");
// After:
await click(page,"Complete this stage");
await expect(page.getByTestId("stage-status")).toHaveText("Complete");
await click(page,"Rebuild from approved sources");
```

Existing test: `assembles immutable accepted history, approved changes and exact proof manifest`. The original blocked-proof, zero-warning-count and changed-source-hash assertions remain intact. No application proof/final-account code, timeout or retry changed. Browser execution is NOT RUN below.

### 3 — DONE: merged migration numbers, documentation only

Only the `0107_recovery_messages.sql` and `0110_work_orders.sql (ENT-2)` sections of `packages/db/MIGRATIONS.md` changed.

- M4-5-S before: `0099 is registered after 0097`, `Migration 0099 adds`, and upgrade `through 0097 ... 0099 applied`. After: `0107 is registered after 0106`, `Migration 0107 adds`, and `through 0106 ... 0107 applied`.
- The historical sentence retaining the reserved 0045 → assigned 0099 → renumbered 0107 history remains. The stale CH-1/ENT-2 allocations 0104/0105 now give their merged numbers 0109/0110.
- 0110 before: `Registered last, after 0106_practice_feed.sql` and `held 0107-0109`. After: registered after `0109_job_activation_terms.sql`, with the merged sequence `0106_practice_feed.sql`, `0107_recovery_messages.sql`, `0109_job_activation_terms.sql`, `0110_work_orders.sql`, `0111_persisted_identity.sql`, `0112_recovery_follow_up.sql`. 0108 is not registered and has no migration file.
- Source verification against `packages/db/src/migrate.ts` and `packages/db/migrations/` found all 57 registered files present and the exact six-entry tail above. `recovery-message-upgrade.integration.test.ts` also explicitly stops before 0107, through 0106. This is source inspection, not a database execution result.

Relevant DB tests: `recovery-message-upgrade.integration.test.ts` and `recovery-messages.integration.test.ts`; NOT RUN below. No SQL/runner/test file changed; no rollback is needed for these records-only edits.

### 4 — DONE: count actual replaced previews

`apps/web/app/ui/recovery-messages.tsx:97,222`:

```ts
// Before:
state!.messages.length > 1
state!.messages.length - 1
// After:
const replacedPreviews = state?.messages.filter(message =>
  message.superseded && message.status === "previewed"
).length ?? 0;
replacedPreviews > 0
```

The existing view carries both `superseded` and `status`; repository projection retains `simulated_delivery` for delivered messages even when they are superseded by a later preview. Only superseded messages still at `previewed` count. Zero renders no line; the sentence and singular/plural wording are unchanged.

New tests in `recovery-messages.test.tsx`:

- `does not count a delivered message as a replaced preview when a reminder is previewed`: a superseded delivered message plus a later preview renders no replacement line.
- `counts an earlier superseded preview as replaced by the current preview`: two previews render `1 earlier preview replaced by this one.`; an additional earlier delivered message leaves that count at one. The mixed-history assertion makes this positive test fail against the original length-based count as well.

Both new tests failed with the original component and passed after the fix.

### 5 — DONE: bind picker lookup to its render's world

`apps/web/app/ui/recovery-cases.tsx:55,66–69`:

```ts
// Before:
useEffect(()=>{if(status==="ready")void refreshDeliveries(world.current)},[status,refreshDeliveries]);
// After:
const lookupWorld=world.current;
useEffect(()=>{if(status==="ready")void refreshDeliveries(lookupWorld)},[status,refreshDeliveries,lookupWorld]);
// refreshDeliveries now also checks BEFORE fetch:
if(lookupWorld!==world.current)return;
```

On a job switch the register effect's cleanup increments `world` before the picker effect executes. Passing the render's captured world makes its old `ready` state stale, so it cannot launch a delivery read during the new job's first register read. The existing after-response world guard still prevents an older lookup from writing either picker state. No register status, money, selection or command behavior changed.

New test in `recovery-cases.behaviour.test.ts`: `waits for the new job's register and ignores an earlier job's late picker answer`. The existing deterministic hook runtime and held fetch responses prove no B delivery request starts before B's register responds; B's delivery appears after that response; releasing A's older lookup cannot replace it; no POST is sent. This test failed against the original component and passed after the fix. No new timeout or test runtime helper was added.

## Commands and results

The supplied dependencies were reused; no install/download command was run. Runtime: Node `v24.17.0` (the supplied runtime; `.nvmrc` records `24.15.0`, unchanged), pnpm `10.28.1`, Vitest `4.1.11`, Turbo `2.10.12`, Next `15.5.27`.

The default PATH pnpm launcher stalled selecting a version on two diagnostic `pnpm --version` attempts (second with `npm_config_manage_package_manager_versions=false`); each was interrupted, exit 130, no tests executed. All checks below used `PATH=/private/tmp/jg-fixlater-1-bin:$PATH`, whose temporary `pnpm` shim invokes the already-cached `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. That version check exited 0 and returned `10.28.1`. No repository configuration was changed for this.

| Command | Exit | Actual result/count |
| --- | --- | --- |
| `pnpm --filter @jobguard/web exec vitest run app/ui/recovery-messages.test.tsx app/ui/recovery-cases.behaviour.test.ts app/ui/recovery-cases.test.ts` — first attempt | 1 | 3 suites failed to load; 0 tests executed; core distribution absent. |
| `pnpm turbo run build --filter=@jobguard/core` | 0 | 1/1 task successful, 1 cache hit; restores the required core distribution. |
| Same targeted Vitest command — second attempt | 1 | 3 suites failed to load; 0 tests executed; API distribution absent. |
| `pnpm turbo run build --filter=@jobguard/api...` | 0 | 6/6 tasks successful, 4 cache hits; dependency/API distributions built. |
| Same targeted Vitest command — initial regression check before fixes | 1 | 212 passed, 2 failed, 214 total; 1 file passed, 2 failed. The two bug regressions failed. |
| Same targeted Vitest command — final new tests with both original components | 1 | 211 passed, 3 failed, 214 total; 1 file passed, 2 failed. All three new tests failed for the expected bugs. |
| Same targeted Vitest command — fixed components | 0 | 214/214 passed, 3/3 files passed: recovery-messages 89, recovery-cases.behaviour 123, recovery-cases first-paint 2. |
| `pnpm typecheck` | 0 | 7/7 tasks successful, 4 cache hits. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed (125 TypeScript files); lane checker refused the self-comparison range, so the remainder of the root lint script did not execute. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | `Missing branch or self-comparison range; refusing a misleading pass.` No lane pass claimed. |
| `pnpm turbo run lint` — supplementary package lint | 0 | 7/7 tasks successful, 4 cache hits. This does not include the root lane gate. |
| `node tools/core-purity-lint.mjs && node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs` — supplementary boundary checks | 0 | Core purity passed (125 TypeScript files); money boundary passed; commercial boundary exited successfully without output. |
| `pnpm build` | 0 | 7/7 tasks successful, 4 cache hits; Next generated 24/24 static pages. |
| `pnpm openapi:check` | 1 | tsx CLI IPC `listen EPERM`; generator did not run. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | The same generator and exact committed-OpenAPI comparison ran successfully without the CLI's IPC socket. No schema edit. |
| `git diff --check` | 0 | No whitespace errors. |
| Read-only Python source/diff inspections | 0 | All 57 registered migration files exist; exact tail sequence verified; only the two allowed migration-note sections differ; only the new lane entry added in name order; working-tree files match its allowlist. |

The required root lint commands cannot pass before a commit here: `HEAD == origin/main`, and the existing checker rejects that before inspecting working-tree edits. Git is read-only, so the dispatcher must commit and rerun them. Supplementary checks and manual scope inspection are not presented as a root lint/lane pass. Turbo reported cache IO permission warnings; cache hits above are reported as cache hits, not freshly executed tasks. The successful build also reported workspace-root/multiple-lockfile and autoprefixer `end`/`flex-end` warnings in unchanged styles; these were left outside this lane.

## NOT RUN

- `apps/web/e2e/M4-1-S.spec.ts` — both `mobile-360` and `desktop`: **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-9.spec.ts` — both `mobile-360` and `desktop`: **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- Every other Playwright spec under `apps/web/e2e/`, including the unchanged M4-5-S and M4-6-S journeys and the complete regression/browser suite: **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `pnpm test:db` and every database test under `packages/db/test/`, including `recovery-message-upgrade.integration.test.ts` and `recovery-messages.integration.test.ts`: **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `pnpm test:migrations` (`tenancy.integration.test.ts`, `demo-bootstrap.integration.test.ts`): **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `pnpm test`, `pnpm test:regression`, `pnpm test:deploy`, `pnpm test:e2e`: **NOT RUN (sandbox cannot run a browser / PostgreSQL)**; these include database and/or browser work. Only the specified unit files were executed.

No PostgreSQL startup or browser execution was attempted. The unmodified `tsx` CLI attempted its IPC socket and was denied with EPERM, as recorded above; the successful direct generator invocation did not use that CLI. No screenshot or browser/DB result is claimed. The integrator runs browser specs on the Mac and GitHub CI after the dispatcher commits/pushes.

### Per-file NOT RUN inventory

All browser entries cover both existing projects (`mobile-360`, `desktop`); none was executed.

- `apps/web/e2e/CH-1.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/CH-2.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/CH-3a.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/ENT-1.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/ENT-2.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M0-6L.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M1-16-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M2-1A-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M2-1B-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M2-2-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M2-3-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M2-4-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M2-5-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M2-6-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M2-7-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M4-1-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M4-2-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M4-3-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M4-5-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M4-6-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/M4-7-S.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/MON-7.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/SBOX-1.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/SBOX-2.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/SBOX-SESSION-1.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/SBOX-resume.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-1.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-10.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-11.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-12.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-13.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-14.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-15.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-2.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-3.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-4.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-5.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-6.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-7.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-8.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/UIWIRE-9.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/VALUE-1.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/VOICE-1.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/capture.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/customer-invoice.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/decision-inbox.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/deploy-smoke.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/fee-statement.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/final-account.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/m1-15-complete-journey.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/proof-capture.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/quote-acceptance.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/quote-editor.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/quote-send.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/review-confirm.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/shell.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/switch-live.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `apps/web/e2e/variations.spec.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.

- `packages/db/test/UIWIRE-10.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/UIWIRE-11.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/UIWIRE-12.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/activation.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/audit.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/capture.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/command-replay-contract.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/commands.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/commercial-integrity.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/contractor-parties.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/contractor.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/decision-inbox.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/demo-bootstrap.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/evidence-pack-sources.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/evidence-pack-upgrade.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/evidence-packs.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/evidence.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/final-account.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/free-port.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/identity.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/inbox-relevance.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/job-activation-terms.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/job-import.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/job-parties.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/job-scheduling.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/job.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/ledger.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/match-inbox-replay.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/materials.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/outbox.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/practice-feed.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/practice-finding-scope.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/practice-scope.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/practice-session.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/prevention-checks.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/proof-application-records.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/proof-replay.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/quote.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/readiness.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/recovery-case-outcome.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/recovery-cases.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/recovery-cases.workbench.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/recovery-follow-up.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/recovery-message-repository.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/recovery-message-upgrade.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/recovery-messages.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/recovery.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/restore-rehearsal.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/review.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/sandbox.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/shared-money-origin.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/sor-pricing.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/supplier-documents.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/supplier-matching.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/tenancy.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/things-replay.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/variation.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/verify-evidence-pack-cli.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/watchdog-legacy-identities.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/watchdog-lock-order.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/watchdog-migration-owner.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/watchdog.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/work-order-concurrency.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/work-order-import.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.
- `packages/db/test/workspace-read.integration.test.ts` — **NOT RUN (sandbox cannot run a browser / PostgreSQL)**.

## Self-review

Re-read the whole `git diff origin/main` as a strict reviewer against the order, including the one-line UIWIRE-9 spec, and inspected this receipt separately. Each edit is confined to its issued item: item 1 adds only the enabled wait; item 2 adds only a persisted-status wait; item 3 changes only its two sections; item 4 only changes replacement counting; item 5 only binds the optional picker lookup to the existing world guard. No existing assertion was deleted, weakened, skipped or retry-wrapped, and no timeout increased or was added. All three new tests were executed against the unfixed components and failed; the fixed suite passes 214/214. The unchanged first-paint tests also passed. Existing lane lines, SQL, API, shared policy and other restricted files are unchanged. This is a builder self-review, not an independent model verdict.

Final cleanup removed the generated `.pnpm-store`, all package/API `dist`, Next `.next`, package `.turbo` logs and generated web tsbuildinfo. No build output or `test-results` remains in this worktree. A final read-only inspection found exactly nine changed/new files, all permitted by the issued lane; the unchanged first-paint test file remains unedited. Both spec changes and the lane-line insertion were checked byte-for-byte against the base after subtracting their exact additions. `git diff --check` passed. The intended commit message is present at the dispatcher’s requested temporary path.

## Outstanding evidence and handoff

All five repairs are implemented. Root lint/lane checks require a dispatcher commit, and browser/DB regressions remain unexecuted here. A fresh Claude Opus verdict bound to that exact commit, with findings labelled BLOCKING/LATER, and separate technical acceptance remain outstanding. No production/release gate is changed or approved. Intended conventional commit message: `/private/tmp/jg-msg-fixlater-1.txt`.

**Builder receipt only — not independently verified, not accepted.**
