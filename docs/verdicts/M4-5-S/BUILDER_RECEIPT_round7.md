# M4-5-S — builder receipt, round 7

8 October 2026. PR #106, branch `codex/sandbox/m4-5-s-r2`, worktree `m4-5-s-fresh`.
Starting HEAD: `ee765c5` (the integrator's merge of main `17523d9`: CH-3a #98, SEC-DEPS-2026-10-08 #122, CH-2 #97), clean tree. The builder did not review or accept anything; no push, merge or PR change. The dispatcher binds CI and the independent verdict to the commit this round creates.

**Re-application and fixture repair only.** M4-5-S had a fresh Opus PASS at `0cc5c8c`. No product behaviour, migration, or assertion was weakened, skipped or removed. Synthetic data only. Migration `0099_recovery_messages.sql` is byte-identical to `0cc5c8c` (blob `0d8a34bd…`) and applies after 0095 and 0096 without change.

## 1. The four files the merge took from main's side, re-applied

| File | Both sides kept |
|---|---|
| `apps/api/src/app.module.ts` | Main's `WatchdogExceptionFilter` and `PracticeErrorsFilter` APP_FILTERs and every main controller (including `JobPartiesController`, `JobPartiesListController`) plus `RecoveryMessageController`. |
| `apps/api/src/workspace/application.ts` | Main's `parties` member (CH-3a) plus `recoveryMessages` (`read`, `preview`, `command`, `failure`). |
| `packages/db/src/supplier-document-repository.ts` | All of CH-2's `requireLiveJob` / `runStoredCommand` changes, plus M4-5-S's only change: `d.document_number` in `view()`'s select. The `view` line is identical to the one at `0cc5c8c`. |
| `apps/api/openapi.json` | Regenerated with the repo generator after `pnpm build`; the regenerated file adds the same 43 lines M4-5-S added before. `pnpm openapi:check` passes. |

The other files M4-5-S touches were merged cleanly; every line this PR added to them is still present. `UIWIRE-12` and `demo-bootstrap` take main's count-agnostic versions (they compare against `MIGRATION_URLS.length`), which replaces M4-5-S's fixed 46/47 edits and needs nothing further.

## 2. Findings against CH-2 and CH-3a, and the fixes

1. **CH-2 route registry (`apps/api/src/watchdog-registry.test.ts`, 2 failures).** The registry refuses unclassified job mutations. It named both new web routes, the two Nest routes and the `recovery.message.approve` command. `packages/core/src/watchdog.ts` now classifies all five as `post_live_billing`, the same phase as the sibling evidence-pack and recovery-case routes (a recovery message belongs to a recovery case on an invoiced job; it writes no watchdog-guarded table and calls neither `requireLiveJob` nor `runStoredCommand`). No registry test was changed.
   - **Lane:** `packages/core/src/watchdog.ts` is not in the `m4-5-s` allow list, so its exact path was added to the lane entry in `config/agent-lane-assignments.json`. It is the only way to classify the routes; nothing else was added.
2. **Filter interaction.** Each global filter has to catch only its own error type. `RecoveryMessageController.invoke` already let `PracticeAccessError` through to `PracticeErrorsFilter` but turned every other error into a fixed 500, so a `WatchdogError` could never reach `WatchdogExceptionFilter`. It now also lets `WatchdogError` through (one condition). The Next adapters have no filter, so `recoveryMessageFailure` maps `WatchdogError` to the status and code the filter gives (404 for `JOB_NOT_FOUND`, 409 for `JOB_NOT_LIVE` and `IDEMPOTENCY_CONFLICT`). The recovery flow cannot throw one today; this keeps the two transports identical if a guarded dependency ever does. Recovery-message conflicts keep their own typed codes and are claimed by neither global filter.
   - Tests added (additions only): `recovery-message.errors.test.ts` (the three watchdog mappings) and `recovery-message.controller.test.ts` (new `describe`, 12 cases). They use the real `AppModule` and Nest's own `RouterExceptionFilters`, for every read, preview, approve, advance, reconcile and revoke path: a `WatchdogError` is rethrown unchanged and answered 409/409/404 by `WatchdogExceptionFilter`; `PracticeAccessError` is answered 404/401 by `PracticeErrorsFilter`; a recovery-message conflict is answered once, by the controller (409 `RECOVERY_MESSAGE_CHANGED`); an ordinary error with a look-alike message `JOB_NOT_LIVE` stays a fixed 500. Red before: with the controller's pass-through temporarily removed (then restored), the six watchdog cases failed.
3. **CH-3a (migration 0095): jobs need parties.** The two M4-5-S PostgreSQL suites seed through the shared `seedEvidencePackFixture`, which inserts a quote document and moves the job live; 0095 refuses both without parties (`JOB_PARTIES_REQUIRED`). Both suites now call the existing `installLegacySyntheticPartyFixtures(admin)` (the recipe `evidence-packs.integration.test.ts` uses) before seeding. `recovery-message-upgrade.integration.test.ts` previously stopped at 0094; "the previous supported schema" is now 0096, so it applies every migration before 0099 as the runner does (0095 with the runner's `app.deployment_mode` line, which backfills nothing on an empty database). Its wording changes from "through 0094" to "through 0096"; no assertion changed.
4. **CH-2 (migration 0096): UTF8.** Both suites create site revisions through the fixture, which needs a UTF8 cluster; `initdbFlags` is now `['--lc-messages=C', '--encoding=UTF8']` in both.
5. **CH-2 live-job writes.** The shared fixture already moves jobs through `app.transition_job` (live, then invoiced) with `app.tenant_id` set; no change needed. The browser spec's only direct database statements are tenant-scoped reads and one `action_outbox` update, none on a guarded table. Customer-invoice issue does not change the job's status in this repository, so the supplier steps run on a live job.

## 3. Files changed

`apps/api/openapi.json`, `apps/api/src/app.module.ts`, `apps/api/src/workspace/application.ts`, `apps/api/src/recovery-message.controller.ts`, `apps/api/src/recovery-message.errors.ts` (+ their two tests), `config/agent-lane-assignments.json` (one exact path), `packages/core/src/watchdog.ts`, `packages/db/src/supplier-document-repository.ts`, `packages/db/test/recovery-messages.integration.test.ts`, `packages/db/test/recovery-message-upgrade.integration.test.ts`, and this receipt.

## 4. Commands and exits

Dependencies: the merge bumped the lockfile (next 15.5.27), so `pnpm install --frozen-lockfile --ignore-scripts` was run (disk 72 GB free, exit 0). The embedded PostgreSQL started without any symlink repair. Node 24.17.0, pnpm 10.28.1.

| Command | Exit | Evidence |
|---|---:|---|
| `pnpm typecheck` | 0 | 7/7 tasks |
| `pnpm build` | 0 | 7/7 tasks |
| `pnpm openapi:check` | 0 | generator `--check` |
| `pnpm exec vitest run src` in `apps/api` | 0 | 24 files, 582 passed (before the fix: 2 failed in `watchdog-registry.test.ts`) |
| `pnpm exec vitest run` in `packages/core` | 0 | 110 files, 2918 passed |
| `pnpm exec vitest run` in `apps/web` | 0 | 14 files, 124 passed |
| `pnpm test` in `packages/db` (all PostgreSQL suites, including recovery-messages 80, recovery-message-upgrade 3, supplier-documents, UIWIRE-12, demo-bootstrap, practice-session, tenancy, watchdog) | 0 | 57 files, 595 passed |
| `node tools/lint.mjs` | 0 | Lane boundary passed |
| `node --test tools/*.test.mjs` | 0 | 42 passed |
| `pnpm exec playwright test --list e2e/M4-5-S.spec.ts` | 0 | 12 tests collected |
| Lane lint with simulated pull-request metadata | see hand-off message | A commit cannot contain its own SHA, so it is run against the committed head after this receipt is committed |

## 5. Not run

Browser execution of `M4-5-S.spec.ts`: ports 3000 and 55432, which the Playwright config hard-codes, are held by other processes on this Mac (not this session's). They were not stopped and no existing server was reused; CI must run the spec in both projects. No new independent verdict or acceptance is claimed. `packages/db/MIGRATIONS.md`'s 0099 note still says "0054–0098 remain allocated elsewhere"; it was left as the integrator's union and is not a behaviour claim.
