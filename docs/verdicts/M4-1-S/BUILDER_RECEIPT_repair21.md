# M4-1-S-R — builder receipt, repair 21

8 October 2026. PR #103; branch `codex/sandbox/m4-1-s-repair`, lane `m4-1-s-repair`. Starting HEAD: `c0f2f9f` (integrator merge of main `17523d9`: CH-3a #98, SEC-DEPS-2026-10-08 #122, CH-2 #97, not yet pushed). Builder execution evidence only, not an independent verdict or technical acceptance.

## What this repair is

Main has since merged CH-3a (migration 0095: structured parties on every job) and CH-2 (migration 0096: watchdog inputs only on live jobs). The integrator took two files from main's side. This repair re-applies every M4-1-S-R change on top of them and fixes the other M4-1-S-R tests that CH-3a/CH-2 now break. Product code and migration `0097` are untouched.

## Changes

1. **`packages/db/test/recovery-cases.integration.test.ts`** — three-way merge of main's version (`17523d9`) and this PR's (`c2ea055`) over their merge base `3395d34`. Main's side kept: the `installLegacySyntheticPartyFixtures` import and call (CH-3a party binding for the fictional jobs) and `--encoding=UTF8` in `initdbFlags` (CH-3a site revisions call `normalize()`). This PR's side kept: `reviewedRepository()` (reviewer derived from the verified principal), every reworded fictional source reference, and the whole eligibility block. 42 `expect` and 9 `it` before and after.
2. **`packages/db/test/recovery.integration.test.ts`** — same three-way merge. Main's side kept: the `installLegacySyntheticPartyFixtures` import and call, and the first test now moving the job `live -> invoiced` through `app.transition_job` before `configure_recovery_demo` (renamed "...after invoicing"). This PR's side kept: the `RecoveryCaseRepository` and contract imports, the two owners, and all 12 added tests. 89 `expect` and 15 `it`, identical to `c2ea055` (main's edits add none). Both resolved files differ from `c2ea055` only by main's CH-3a/CH-2 lines, and from main only by this PR's lines (checked by diffing the two diffs).
3. **`packages/db/test/recovery-cases.workbench.integration.test.ts`** (new finding) — `--encoding=UTF8` added to `initdbFlags`. The practice test calls `issuePracticeSession`, which now creates CH-3a site revisions and fails on a non-UTF8 cluster (`Unicode normalization can only be performed if server encoding is UTF8`). One flag, no assertion touched. Its other 40 tests, and its fixtures, were not affected: the cluster installs migrations up to `0097` (now including `0095` and `0096`) and its `app.job` rows stay in `draft`, where neither CH-3a nor CH-2 constrains them.
4. **`apps/web/e2e/M4-1-S.spec.ts`** (new finding, two causes; the lane already allows this file):
   - **CH-2 proof stage.** While a job is not live, the proof stage on the same page now shows its own `<p role="alert">This proof record could not load. Try again.</p>`. Every page-wide `p[role=alert]` in the spec then matched two elements (strict-mode failures in 5 tests). All 8 lines now read `#recovery-cases p[role=alert]`, the workbench's own section. The text, focus and count assertions are unchanged; they are simply made about the workbench alert, which is what they always meant. The one `toHaveCount(0)` is now "no alert in the workbench". I did not edit the proof stage, which belongs to CH-2.
   - **CH-2 live-job guard.** Two tests ("approved £2,500 plus overlapping manual £1,000..." and "repair 17: a below-settled retry...") insert `app.evidence_object` with real constraints. That is a watchdog input, which now needs `app.tenant_id` set and a live job (`JOB_NOT_FOUND`/`JOB_NOT_LIVE` otherwise). Each fixture now sets the tenant, checks the job is `quoting`, and moves it `accepted -> live` through `app.transition_job` (never a direct status write), on one fictional `baseline` id now shared by the activation, the cap snapshot and the lifecycle (before: two unrelated random ids). `expect` count 129 -> 131 (the two `quoting` preconditions); 8 tests before and after.
5. **Registry:** only the `m4-1-s-repair` lane's `receipt` value, now `docs/verdicts/M4-1-S/BUILDER_RECEIPT_repair21.md`. Every edited file was already on the lane's `allow` list.

## Build artefacts, not tracked

The worktree's gitignored `dist` folders were stale and made unrelated suites fail with `... is not a constructor` / `Cannot read properties of undefined (reading 'parse')`. Rebuilt in place, no tracked change: `packages/core` (`pnpm run build`), `packages/db` (`pnpm run build`), `apps/api` (`pnpm run build`, which the web app imports as `@jobguard/api/workspace`). CI builds these before tests, so this is local only.

## Commands actually run

Node `24.17.0`, pnpm `10.28.1`, 74 GiB free disk, no install and no download. Logs in the session scratchpad.

| Command | Exit | Result |
|---|---:|---|
| `pnpm typecheck` (final state) | 0 | 7 of 7 tasks (web typechecks `e2e/`). |
| `pnpm --filter @jobguard/api exec vitest run src` | 0 | 22 files, 582 tests. (A first run with stale `packages/db/dist` failed 153; after the rebuild all pass.) |
| `pnpm --filter @jobguard/api run openapi:check` | 0 | OpenAPI document matches. |
| `pnpm --filter @jobguard/web exec vitest run` | 0 | 19 files, 350 tests. |
| `pnpm exec vitest run` in `packages/core` | 0 | 108 files, 3188 tests. |
| `vitest run --maxWorkers=1` on `recovery-cases`, `recovery`, `recovery-cases.workbench`, `UIWIRE-12`, `demo-bootstrap`, `practice-session` integration (real embedded PostgreSQL) | 0 | 6 files, 105 tests pass. Embedded PostgreSQL started with its dylib symlinks present. |
| `vitest run --passWithNoTests --maxWorkers=1` (the whole `packages/db` suite) | 0 | 56 files, 560 tests pass. |
| Playwright, `desktop` and `mobile-360` viewports, `M4-1-S.spec.ts` + `M4-2-S.spec.ts` (real `next dev`, embedded PostgreSQL through `global-setup`) | 0 / 0 | 11 of 11 pass at each viewport (22 runs). Before the two e2e fixes 6 of 11 failed at desktop (5 on the proof-stage alert, 1 on `JOB_NOT_FOUND`). The live-job fixture first assumed the job was `draft`; it is already `quoting` after scope confirmation, so that precondition was corrected and the run repeated. |
| Lane lint with simulated pull-request event | see final message | Run after the commit, on its SHA. |

The pinned Playwright browser (`chromium_headless_shell-1193`) is not installed here and the cached full Chromium 1193 will not start, so I ran the same specs and the same dev server through a scratch config outside the repo (same `webServer`, `global-setup`, viewports) with `channel: "chrome"` (the installed Google Chrome, a temporary profile). The repository's `playwright.config.ts` is unchanged. CI's `next start` build was not run here.

## Scope

Migration `0097_recovery_case_current.sql` untouched (SHA-256 `84aef359c62455818e4eb66d26ca9d21c13c49ddd06af202fd107be3950d9375`, identical to repair 20), and no migration at all was edited; it does not conflict with `0095`/`0096` (neither touches the recovery tables or `approve_synthetic_landing`, and the whole db suite passes with the three applied in order). No product code, `turbo.json`, Vitest or Playwright config, dependency, OpenAPI or schema change. No assertion weakened, skipped or deleted; no timeout added or lengthened. Synthetic data only.

## Remaining gates

Dispatcher push; green mandatory CI (including `pnpm build` and both browser projects, run here only on the dev server); a fresh independent verdict bound to the resulting exact commit; separate technical acceptance; founder-owned merge in the existing migration order. **Not independently verified or accepted.** For the reviewer, the one judgement call to look at is item 4: the `#recovery-cases` scoping of the alert locator.
