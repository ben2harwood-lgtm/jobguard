# CH-1 builder receipt — attempt 3 ("one-rule fix + main-merge"), 9 Oct 2026

Builder: Claude Sonnet 5.5 (local worktree `.worktrees/ch-1`, branch `codex/sandbox/ch-1`). Start head `557ce5e`; `origin/main` at `3a06a02`.
Authority: attempt-2 order (still binding, incl. DW1–DW5 and Q2 `none_recorded_pre_mon2a`); Ben, 9 Oct, card `jobguard-ch-1-old-pricing-blanket-2026-10-08`, "Yes, one rule"; integrator instruction (mid-round): renumber CH-1's migration 0104 -> 0109 and register it last.

Builder receipt only — not independently verified, not accepted.

## 1. Merge of origin/main (merge commit `f51d2f6`)

Conflicts and resolutions (each keeps both sides):
- `apps/web/app/ui/quote-editor.tsx`: CH-1's v3 `download` line and return body kept; MON-7a's `<PreventionChecks jobId={jobId}/>` mount added just before `</section>` (its import merged cleanly).
- `packages/core/src/index.ts`: exports `prevention-checks`, `practice-feed` (main) and `activation-v3` (CH-1).
- `packages/db/src/migrate.ts`: `0103_prevention_checks`, `0106_practice_feed` from main, then CH-1's migration registered last (named 0104 in the merge commit, renumbered below).
- `packages/db/MIGRATIONS.md`: main's 0103 and 0106 sections kept; CH-1's section placed after them. (Main's 0106 narrative still says "0104 to CH-1" — historical text in another lane's section, left as is.)
- `config/agent-lane-assignments.json` merged with no conflict (only the `ch-1` line differs from origin/main); `lane-union.py` was not needed.
Auto-merged without conflict: `packages/db/test/tenancy.integration.test.ts` (main's TENANT-STAMP-1 edits plus CH-1's two catalog rows).

## 2. Renumber 0104 -> 0109 (commit `ab62523`, own commit as instructed)

`git mv packages/db/migrations/0104_job_activation_terms.sql 0109_job_activation_terms.sql`. SQL is byte-identical: sha256 `975255839789f4ae46dffdc4c9251d276872b2a489f7a0bdce82fd30192d171b` before and after. Registered last in `migrate.ts` (after `0106_practice_feed.sql`). References updated: `migrate.ts`, `MIGRATIONS.md` heading, `docs/contracts/job-activation-terms-v1.md`, the `ch-1` lane line, and CH-1's own PostgreSQL test. Not edited: `BUILD_PLAN.md` and earlier receipts in `docs/verdicts/CH-1/` (historical).

Position assertions (CH-1 test "upgrades from the schema just before CH-1's migration..."): were "last migration is 0104" (and a title saying "from 0097"). Now name-based and order-robust: the setup pass marks only `0109_job_activation_terms.sql` as already applied; after two real `migrate` runs it asserts `0106_practice_feed.sql` is found and `0109` has a greater index, `MIGRATION_URLS` names are strictly increasing, and the applied list in `jobguard_schema_migration` equals the `MIGRATION_URLS` names. This fixes a stale fixture; no behavioural assertion was removed or loosened. `UIWIRE-12` and `demo-bootstrap` integration tests are count-agnostic on main and untouched.

## 3. Step 2 object check (0109 now runs after 0102, 0103 and 0106)

Objects 0109 creates or alters: constraints `job_baseline_shape`, `job_activation_check`, `job_practice_scenario_check`, `quote_document_job_identity`; column `app.job.saved_v1_sample`; table `app.job_activation_terms` (+ policy `tenant_isolation`, grants, triggers `activation_terms_controlled`, `activation_terms_immutable`); functions `app.guard_activation_terms_insert`, `app.switch_job_live_v3`, `app.guard_saved_v1_sample`, `app.seed_saved_v1_sample`; triggers `saved_v1_sample_guard` (on `app.job`) and `saved_v1_sample_on_session` (on `control_plane.practice_session`).
Result: NO overlap. A name search of 0102, 0103 and 0106 for every one of those names (plus `practice_scenario`, `saved_v1`) returned nothing; none of the three creates, replaces, drops or alters `app.job`, `app.job_activation`, `app.quote_document_version` or `control_plane.practice_session` (0102's only touch of `app.job` is a data UPDATE inside a function body; 0103/0106 only create their own new tables, functions and triggers and contain no data statements). 0109 references no object from 0103/0106. So no definition needed rebasing and the SQL is unchanged. Proven in practice: the 0103 (prevention-checks), 0106 (practice-feed) and job-parties integration suites pass on the schema with 0109 applied last (section 7).

## 4. TENANT-STAMP-1 conversions (commit `1edcc49`)

CH-1's own PostgreSQL suite built two contexts by hand: `const context={tenantId:T} as VerifiedTenantContext` and `repo.view({tenantId:"2222…"} as VerifiedTenantContext, job)`. Both now use `testTenantContext(...)` from `packages/db/test/tenant-context-test-utils.ts` (imported, not edited); the now-unused `type VerifiedTenantContext` import was dropped. No assertion changed. No CH-1 production code builds a context by hand (it only receives one), so no file outside the lane was needed.

## 5. The four one-rule spec changes (commit `cd2988e`) — exact before/after

Verified mechanically: for UIWIRE-8, UIWIRE-15 and VALUE-1 the new file equals `HEAD~` after swapping the import path back (byte-identical apart from the path). `helpers/capture-journey.ts` is byte-identical to origin/main.

`apps/web/e2e/UIWIRE-8.spec.ts:1`
- Before: `import{expect,test,type Page}from"@playwright/test";import{openReview}from"./helpers/capture-journey";`
- After:  `import{expect,test,type Page}from"@playwright/test";import{openReview}from"./helpers/v1-sample-job";`

`apps/web/e2e/UIWIRE-15.spec.ts:1` (long line; only this segment differs, the rest of the line is byte-identical)
- Before: `…import{openReview}from"./helpers/capture-journey";test.setTimeout(240_000);const tenant=…`
- After:  `…import{openReview}from"./helpers/v1-sample-job";test.setTimeout(240_000);const tenant=…`

`apps/web/e2e/VALUE-1.spec.ts:1` (same shape)
- Before: `…import{openReview}from"./helpers/capture-journey";test.setTimeout(240_000);const tenant=…`
- After:  `…import{openReview}from"./helpers/v1-sample-job";test.setTimeout(240_000);const tenant=…`

`apps/web/e2e/m1-15-complete-journey.spec.ts`
- Added after line 3 (`import { openQuote } from "./helpers/capture-journey";`, kept because the main journey is still a fresh v3 job): `import { openSampleFeeExample } from "./helpers/v1-sample-job";`
- Lines 66–67 Before:
  `  await page.goto("/");`
  `  await click(page, "See the fee example");`
- Replaced by one line: `  await openSampleFeeExample(page);`
- Every following line (`Exact fee illustration` heading, `illustrative.or(preparefee)`, `No collectible platform balance`, screenshot) is unchanged. `test.setTimeout(60_000)` unchanged; no skip/only/todo/retry.

Helper (new, additive, in the ch-1 lane): `apps/web/e2e/helpers/v1-sample-job.ts` gained `openSampleFeeExample(page)`: from an already started demo session it goes home, finds the saved "Earlier proposed pricing (v1)" job through `/api/jobs`, opens it, takes it through the same review, quote, send and acceptance steps as the already-authorised `fee-statement.spec.ts`, selects the existing v1 scenario and clicks "Start this practice job", which leaves the sample's "Exact fee illustration" on screen. The existing `openReview` and `openQuote` exports are untouched. The home shortcut component is untouched.

## 6. Lane line (in commit `cd2988e`)

Only the existing `"ch-1"` line changed. `allow` gained `apps/web/e2e/UIWIRE-8.spec.ts`, `apps/web/e2e/UIWIRE-15.spec.ts`, `apps/web/e2e/VALUE-1.spec.ts`, `apps/web/e2e/m1-15-complete-journey.spec.ts` (after `UIWIRE-13.spec.ts`); `note` gained: "UIWIRE-8, UIWIRE-15, VALUE-1, m1-15 complete journey (fee-example step only): fixture-path change only (Ben, 9 Oct, 'Yes, one rule')." The migration path in the same line became `0109_job_activation_terms.sql` (renumber commit). No other lane line touched; `BUILD_PLAN.md` not edited.

## 7. Commands run (all observed here)

| Command | Exit | Counts |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile up to date |
| `pnpm typecheck` (final head) | 0 | 7/7 packages |
| `LANE_BASE_REF=origin/main pnpm lint` (final head) | 0 | 7/7 packages |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `ch-1`, comparison merge-base 3a06a02 (re-run after the receipt, see section 11) |
| `pnpm build` (final head) | 0 | 7/7 packages |
| `pnpm --filter @jobguard/core test` | 0 | 116 files / 3368 tests |
| `pnpm --filter @jobguard/api test` (runs `vitest run src` then `openapi:check`) | 0 | 28 files / 648 tests |
| `pnpm --filter @jobguard/web test` | 0 | 20 files / 361 tests |
| `pnpm --filter @jobguard/db exec vitest run src --maxWorkers=1` | 0 | 3 files / 29 tests |
| `pnpm openapi:check` | 0 | no diff |
| heavy-slot: `job-activation-terms.integration.test.ts` (CH-1 PostgreSQL suite) | 0 | 11/11 (3 consecutive green runs after the fixes below, plus final) |
| heavy-slot: `tenancy` + `demo-bootstrap` + `UIWIRE-12` integration | 0 | 3 files / 35 tests |
| heavy-slot: `activation` (v1, DW2) + `practice-feed` (0106) + `prevention-checks` (0103) + `job-parties` | 0 | 4 files / 127 tests |
| heavy-slot, final head: CH-1 + tenancy + demo-bootstrap + UIWIRE-12 + activation | 0 | 5 files / 49 tests |
| heavy-slot: `CI=1 pnpm --filter @jobguard/web test:e2e -c playwright.local.config.ts --project=mobile-360 --project=desktop CH-1 UIWIRE-5 UIWIRE-14 UIWIRE-8 UIWIRE-13 UIWIRE-15 VALUE-1 m1-15-complete-journey switch-live fee-statement` (final head) | 0 | 32 passed (16 per project), 2.1 min |

Failures seen on the way (all real, all fixed in CH-1's own code or test setup; none by weakening a check):
1. First PostgreSQL run: embedded PostgreSQL would not start (dylib symlinks missing because pnpm ignored the dependency's postinstall; this repo has no `db:fix-macos`). Environment fix: ran the package's own `scripts/hydrate-symlinks.js` inside `@embedded-postgres/darwin-arm64` (creates 17 symlinks inside `node_modules` only).
2. First real run of the CH-1 PostgreSQL suite (never executed in attempts 1–2): 9 of 11 failed. Root causes: (a) `SwitchJobLiveV3Mutation.lock` used `SELECT … FOR UPDATE` on `app.job`, which the runtime role may not do ("permission denied for table job"); (b) the losing client of a concurrent first activation could throw `ACCEPTED_PRICED_QUOTE_REQUIRED`; (c) test setup defects: `FinalAccountRepository` does not exist (it is `FinalAccountCommandService`), `admin.options` lost the password, and `port` was block-scoped. Fixes in commit `c27c98e` (below); no assertion changed.
3. First browser run: 32/32 failed because Playwright's pinned `chromium_headless_shell-1193` is not installed (`Executable doesn't exist`). Used an UNCOMMITTED local config `apps/web/playwright.local.config.ts` that only sets `launchOptions.executablePath` to the installed `chromium_headless_shell-1234/…/chrome-headless-shell`; it is listed in the main repo's `.git/info/exclude` and is not part of any commit. Note the browser is a newer Chromium than the pinned one.
4. Second browser run: 30 passed / 2 failed, both `CH-1.spec.ts:9` (copy audit, both projects): the quote editor's notice after "Start this practice job" said "…accepted baseline and cap snapshot". Fixed in commit `7f015d2`: v3 jobs now read "…accepted baseline and activation terms"; saved v1 / v1-policy jobs keep the original text.

Code fixes in CH-1 production code (besides the merge/renumber): `packages/db/src/activation-repository.ts` (lock hook no longer takes a row lock the runtime role cannot take — it keeps the job-exists check and the dispatcher's membership recheck, and `app.switch_job_live_v3` still locks the job `FOR UPDATE`; `start()` returns the winner's view if a concurrent first activation committed first; command-id reuse with a different payload still raises `COMMAND_CONFLICT`, tested) and `apps/web/app/ui/quote-editor.tsx` (notice text).

## 8. Old tests outside the four named specs

None failed. The v1 `activation.integration.test.ts` passes unchanged (byte-identical to origin/main, as are `core/src/activation.ts`, `core/src/fee.ts`, `helpers/capture-journey.ts`, `UIWIRE-12.integration.test.ts`, `demo-bootstrap.integration.test.ts`). The ten browser specs in the order's list pass in both projects. The m1-15 journey also stayed inside its unchanged 60 s timeout.

## 9. What was not run, and why

- `pnpm test` as a whole (`node --test tools/*.test.mjs` and the full turbo test set) and the complete `pnpm test:db` / every other `packages/db/test/*.integration.test.ts` suite: only the suites named in the order plus the 0103/0106/job-parties neighbours were run, to keep the heavy-slot footprint small. CI still runs the rest.
- Browser specs outside the ten listed.
- The pinned Playwright browser (1193) was not available, so browser results come from a newer headless shell (see failure 3).
- No independent review, acceptance, push or merge was done by the builder.

## 10. Open items for the integrator

- Ledger: BUILD_PLAN §12.2 still says 0104 is allocated to CH-1; CH-1 is now 0109 (0107 held by M4-5-S, 0108 by M0-6L). Not edited here.
- `.git/info/exclude` (shared git dir of the main repo) gained one local line `apps/web/playwright.local.config.ts`; the file itself lives only in this worktree. Remove both if unwanted.
- Older `docs/verdicts/CH-1/*` receipts and logs still say 0104; they are history.

## 11. Hygiene

`git diff origin/main...HEAD --stat` contains no `.pnpm-store`, `.next`, `dist` or fresh log paths; the only `*.log` files are the attempt-2 evidence logs already committed under `docs/verdicts/CH-1/`. This attempt's logs were kept outside the repository. `LANE_BASE_REF=origin/main pnpm lint:lanes` was re-run after adding this receipt (result in the final report).
