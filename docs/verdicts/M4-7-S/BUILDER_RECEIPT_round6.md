# M4-7-S — round 6 builder receipt

Date: 8 October 2026. PR #108, branch `codex/sandbox/m4-7-s-r3`, supplied worktree. Starting HEAD: `3271ae8f1067556cd85dede01af1770571701fce` (the integrator's merge of `origin/main` `17523d9`: CH-3a #98, SEC-DEPS-2026-10-08 #122, CH-2 #97; clean tree). This round re-applies M4-7-S on top of that merge and repairs its tests and fixtures against CH-3a and CH-2. The commit carrying this receipt is reported in the dispatcher message (a file cannot name its own commit). Builder evidence is not independent review or acceptance; the last independent verdict (Opus PASS at `029b624`) is **not** bound to this head.

**Status: re-applied and locally green; technical acceptance remains HOLD for CI and a fresh independent verdict bound to the new head.** No push, merge, PR creation, branch or file deletion, live provider, real send, spend or production activation occurred. Synthetic data only. No assertion was deleted, weakened or skipped; no timeout was added or lengthened.

## What stayed byte-identical (the guarantees the verdict passed)

- `packages/db/migrations/0101_practice_feed.sql` is byte-identical to `029b624` (sha256 `47c469b941a0f8f2f342222ae967e42b8f363cd34f5a99383273c145bf9d44b7`). It applied after 0095 and 0096 with no conflict, so no STOP condition arose.
- Every M4-7-S source file is unchanged from `029b624` (`git diff 029b624 --` over the repository, application, controller, http, contracts, core feed, UI component and state, Next route and browser spec is empty): digest-only storage (`session_digest`, never the 7-day cookie), creator-bound ownership via `practice_session_digest`, `PracticeAccess` in front of both transports, stranger 404 / missing session 401, and all the SQL guards are exactly what was reviewed.

## Re-applied files (both sides' behaviour kept)

- `apps/api/src/app.module.ts`: main's module line with CH-3a's `JobPartiesController, JobPartiesListController` and both `APP_FILTER`s (`WatchdogExceptionFilter`, `PracticeErrorsFilter`) kept; added the `PracticeFeedController` import and controller entry only.
- `apps/api/src/workspace/application.ts`: main's composition (including CH-3a's `parties`) kept; added `PracticeFeedApplication` and `practiceFeed: { view, command }`.
- `apps/web/app/ui/workspace-shell.tsx`: CH-3a's `<JobParties>` and CH-2's `<WatchdogStatusProvider>` wrapper and `<WatchdogPanel>`s kept; added the `PracticeReceipts` import and `<PracticeReceipts jobId={jobId}/>` right after `<RecoveryCases/>`, where this PR placed it (before the conditional `ProofStage`), outside any `WatchdogPanel`: the feed is session-owned practice data, not a watchdog input, and must stay usable on a job that is not live.
- `apps/api/openapi.json`: regenerated with `pnpm --filter @jobguard/api openapi:generate` after `pnpm build` (the first attempt failed only because `packages/db/dist` was stale). The diff to main is +314 lines, 0 deletions, the same size as this PR's own addition; main's party endpoints are intact.

## Repairs against CH-3a and CH-2

1. **CH-2 exhaustive job-mutation registry** (`apps/api/src/watchdog-registry.test.ts`, 2 tests failed: "Unclassified job mutation: /api/jobs/[id]/practice-feed" and `nest:/jobs/:id/practice-feed`). Added exactly two entries to `jobMutationRegistry` in `packages/core/src/watchdog.ts`, both `pre_live_allowed`: `"/api/jobs/[id]/practice-feed"` and `"nest:/jobs/:id/practice-feed"`. **Reviewer decision point:** the registry takes one phase per route. The route is not `watchdog_live_only`: it writes only `practice_feed_*` and audit rows (none of CH-2's guarded tables) and the connect/advance flow is, by design and by the existing stranger-first test, available on a freshly captured draft job. `post_live_billing` would wrongly imply a lifecycle restriction the route does not have (only `match_receipt` needs an already-recorded invoice receipt, and that is enforced by its own preconditions). Both of the test's cross-checks (each classified route exists; the nest list equals the code's list) pass.
2. **UTF8** (`practice-feed.integration.test.ts`): `initdbFlags` now `["--lc-messages=C", "--encoding=UTF8"]`. Without it every session issuance failed with "Unicode normalization can only be performed if server encoding is UTF8" (25 of 27 tests).
3. **CH-3a parties** (same file): the suite now calls `installLegacySyntheticPartyFixtures(admin)` after `migrate`, the same explicit fictional-party recipe the other pre-CH-3a suites use (CH-3a's own missing-details tests never install it). It runs after the upgrade-path assertions' schema build, so the retained "previous schema" job stays unbound, as the old-unbound-job test requires.
4. **CH-2 live transition** (same file, `invoice()` helper): the direct `UPDATE app.job SET status='live'` failed with `JOB_PARTIES_REQUIRED` because the party guard is `SECURITY DEFINER` and reads under row-level security, so it needs `app.tenant_id` in the transaction. The helper now inserts the accepted quote version, then moves the job live through the real `app.transition_job` calls (`start_quote`, `accept_quote`, `switch_live` with net 110000, `reference_fee_policy_v1`, `app.reference_recovery_cap(110000)`) in one admin transaction that sets `app.tenant_id`, as main's fixtures do. The quote, final-account and invoice steps and every assertion after it are unchanged.
5. **Tenancy catalogue order** (`tenancy.integration.test.ts`): the integrator's union put `proof_application_response` before this PR's five `practice_feed_*` rows, but the catalogue is `ORDER BY relname` and `practice_feed_*` sorts before `proof_*`. Moved the single `proof_application_response` line after `practice_feed_receipt_match` in both lists (RLS list and owner list). Same rows, same expectations, only the order.
6. **demo-bootstrap duplicate import** (`demo-bootstrap.integration.test.ts`): the merge left `import { MIGRATION_URLS }` twice (main's already-count-agnostic file plus this PR's). The file is restored to main's exact content, so this PR no longer changes it; main's version already asserts `MIGRATION_URLS.length` and the registry order, which is what the PR's edit did. `UIWIRE-12.integration.test.ts` is likewise identical to main (nothing left to re-apply).
7. **Migration documentation** (`packages/db/MIGRATIONS.md`, 0101 section): the sentence about the number reservation and "47 migrations" is brought up to date (0095 and 0096 have merged; the registry has 49 files).
8. **Lane allow-list** (`config/agent-lane-assignments.json`, `m4-7-s` line only, still one line of compact JSON): added the two justified exact paths `packages/core/src/watchdog.ts` (the registry entries above) and `docs/verdicts/M4-7-S/BUILDER_RECEIPT_round6.md` (this receipt), and one sentence to the `note`. No glob, no other lane touched.

Checked and needing no change: the M4-7-S browser spec (it builds its job through main's updated `openReview`, which now saves the fictional customer and site, and the shared invoice helper), `PracticeFeedController` error mapping (it throws its own `HttpException`s, so `WatchdogExceptionFilter` is not involved), and the practice-feed tables (none of CH-2's insert guards cover them).

## Commands actually run (worktree, Node v24.17.0, pnpm 10.28.1; `df -h /`: 74 GiB free before install)

| Command | Exit | Result |
| --- | --- | --- |
| `git log -1 --format=%h`; `git status --porcelain` (start) | 0 | `3271ae8`; empty |
| `pnpm install --frozen-lockfile --ignore-scripts` | 0 | next 15.5.25 to 15.5.27 |
| embedded-postgres `scripts/hydrate-symlinks.js` | 0 | dylib symlinks hydrated (gitignored) |
| `pnpm --filter @jobguard/api openapi:generate` (before build) | 1 | stale db `dist` lacked `WatchdogError`; fixed by building |
| `pnpm build` (twice, last after all source edits) | 0 / 0 | 7/7 tasks |
| `pnpm --filter @jobguard/api openapi:generate`, then `pnpm openapi:check` | 0 / 0 | +314 lines |
| `pnpm typecheck` (twice) | 0 / 0 | 7/7 tasks |
| `pnpm test` in `apps/api` (vitest `src` + `openapi:check`) | 1, then 0 | first: 2 failed (registry); after fix 23 files, 549 tests |
| `pnpm test` in `packages/core` | 0 | 110 files, 2946 tests |
| `pnpm test` in `apps/web` | 0 | 14 files, 126 tests |
| `vitest run test/practice-feed.integration.test.ts` (real embedded PostgreSQL) | 1, 1, then 0 | 25 failed (UTF8), then 6 failed (`JOB_PARTIES_REQUIRED`), then 27/27 |
| `vitest run test/UIWIRE-12.integration.test.ts` | 0 | 22 tests |
| `vitest run test/demo-bootstrap.integration.test.ts` | 0 | 4 tests |
| `vitest run test/tenancy.integration.test.ts` | 1, then 0 | first: 2 failed (catalogue order); then 9/9 |
| `vitest run test/practice-session.integration.test.ts` | 0 | 11 tests |
| `pnpm test` in `packages/db` (whole suite, `--maxWorkers=1`) | 0 | 55 files, 530 tests |
| `node tools/lint.mjs` | 0 | core purity, lane boundary (local event), money boundary passed |
| `node --test tools/*.test.mjs` | 0 | all pass |
| `playwright test M4-7-S.spec.ts --project=mobile-360 --project=desktop`, repository config | 1 | blocked: 10 failed to launch, `chromium_headless_shell-1193` is not in the local Playwright cache |
| same spec through a local wrapper config (below) | 0 | **10 passed** (5 tests x 2 projects), 29.9 s |
| lane lint with simulated PR metadata | see dispatcher message | needs the commit; run after it |

**Browser-run limits (not the repository's own CI config).** The local cache has no usable Chromium for Playwright 1.55.1 (`chromium_headless_shell-1193` is absent and `chromium-1193` is incomplete: its framework binary is missing). I downloaded nothing. The passing run used a throwaway wrapper in the session scratchpad (not committed) that imports the repository's `playwright.config.ts` unchanged and only (a) launches the installed `chrome-headless-shell` 1234 build, and (b) uses private ports 3109 and 55532 with a copy of `e2e/global-setup.ts` so it could not collide with another agent's run on 3000 and 55432. Same tests, same production Next build, same database bootstrap. CI must still run the spec with the repository config and the pinned browser.

## Things the reviewer should know

- Main's fixtures (`importWatchdogFixtureJob`, `seedSyntheticPartyFixture`) are the alternatives to the party hook used here; the hook was chosen because this suite creates jobs through the real capture and sandbox repositories as well as by raw insert, and the hook covers all of them.
- `packages/db/test/practice-session.integration.test.ts:68` (merged SBOX, outside this lane) still sets the retired setting name `app.practice_feed_session`; unchanged from round 5, assertion unaffected.
- Not run here: GitHub CI, an independent review, and any push.

## TL;DR

The practice-feed work now sits on top of the new parties and live-job rules: the four shared files are re-applied keeping everything main added, the feed's tests were updated for the new rules without weakening anything, and the feed is registered in the new job-mutation checklist as usable at any stage. Migration 0101 and all feed code are byte-for-byte what the last reviewer passed. All local checks pass (including the real-database suites and the browser spec on a local browser); CI and a fresh independent review are still needed.
