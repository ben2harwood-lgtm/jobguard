# CH-1 builder receipt — round 4 ("two more one-rule specs"), 9 Oct 2026

Builder: Claude Sonnet 5.5 (local worktree `.worktrees/ch-1`, branch `codex/sandbox/ch-1`). Start head `24bc0ed` (= origin, PR #123). Fix commit `a1cc5ae`; this receipt is the commit after it.
Authority: attempt-2 order (still binding); Ben, 9 Oct, card `jobguard-ch-1-old-pricing-blanket-2026-10-08`, "Yes, one rule": any older browser test that starts a fresh job and expects the old £79/v1 pricing may start from the saved old-pricing (v1) sample job instead, every check unchanged (fixture path only).

Builder receipt only — not independently verified, not accepted.

## 1. The CI failures (run 37934019683 on 24bc0ed: 5 failed, 269 passed, 12.3 min) and their classification

| # | Test | Project(s) | Failure | Classification |
|---|---|---|---|---|
| 1, 4 | `apps/web/e2e/M1-16-S.spec.ts:3` "makes demo-only D11 advisory integrity signals inspectable" | mobile-360, desktop | `expect.poll … toBe` timeout 45 s at column 562: `V(page,"integrity-frozen-accepted-cap","£12.00")` | (a) needs old v1 pricing on a fresh job. The frozen accepted-value cap signal exists only for jobs with v1 data; a fresh job is now v3 and creates no cap snapshot (CH-1 B2). One-rule fix applied. |
| 3, 5 | `apps/web/e2e/MON-7.spec.ts:65` "MON-7a leaves VALUE-1 and saved fee illustration figures unchanged" | mobile-360, desktop | `{"code":"V1_ACTIVATION_REQUIRED"}` from `POST /api/jobs/:id/fee-illustration` (line 86; the route refuses a job with no v1 activation: `apps/api/src/workspace/fee-illustration.application.ts`), and the test then checks the £203.00 illustration | (a) needs old v1 pricing on a fresh job (v1 activation, £203 illustration). MON-7a merged on main after CH-1 attempt 2 and starts this test with `openReview`. One-rule fix applied to this test only. |
| 2 | `apps/web/e2e/M4-1-S.spec.ts:11` "opens and manages evidence-linked recovery cases…" | mobile-360 only | `toBeFocused` "Expected: focused / Received: inactive" | (b) not a pricing test and not a CH-1 change. Not edited (per the brief). See section 4. |

Before editing, the two (a) tests were re-run locally on mobile-360 on the unmodified head: both failed exactly as in CI (M1-16-S poll timeout; MON-7:65 `V1_ACTIVATION_REQUIRED`) — log `prefix-confirm-mobile.log`. After the fix both pass on both projects (section 3).

## 2. The changed lines (exact before/after)

`apps/web/e2e/M1-16-S.spec.ts:1`
- Before: `import{expect,test}from"@playwright/test";import{openReview}from"./helpers/capture-journey";`
- After:  `import{expect,test}from"@playwright/test";import{openReview}from"./helpers/v1-sample-job";`

`apps/web/e2e/MON-7.spec.ts:2` (kept on one line so line 65 stays line 65; the first MON-7a test and its `quote()` helper still use `openQuote` on a fresh v3 job, unchanged, and still pass)
- Before: `import { openQuote, openReview } from "./helpers/capture-journey";`
- After:  `import { openQuote } from "./helpers/capture-journey"; import { openReview } from "./helpers/v1-sample-job";`

Mechanically checked: `M1-16-S.spec.ts` at the fix commit equals the old file after swapping the import path back (3 lines each, byte-identical apart from the path). `MON-7.spec.ts` is 108 lines before and after and only line 2 differs. `apps/web/e2e/helpers/capture-journey.ts` is byte-identical to `origin/main`. `apps/web/e2e/helpers/v1-sample-job.ts` was not edited (its existing `openReview` already suits both tests). No assertion, wording, poll, timeout, skip, retry or step was added, removed or changed; `M4-1-S.spec.ts` was not touched; `BUILD_PLAN.md` not touched.

Lane (`config/agent-lane-assignments.json`, the `"ch-1"` line only; 1 line changed): `allow` gained `apps/web/e2e/M1-16-S.spec.ts` and `apps/web/e2e/MON-7.spec.ts` (after `m1-15-complete-journey.spec.ts`), and `note` gained: "M1-16-S, MON-7 (the VALUE-1/fee-illustration test only): fixture-path change only (Ben, 9 Oct, 'Yes, one rule')." The same two spec paths also appear in the `m1-16` and `mon-7a` lane lines; those lines were not touched.

## 3. Full browser suite, run locally (production build, `CI=1`, workers 1, the 137 tests of each project)

Run on the branch with the two fixes, one project at a time inside `heavy-slot ch-1`, using the uncommitted `apps/web/playwright.local.config.ts` (installed `chromium_headless_shell-1234`; the pinned 1193 is not installed here).

| Project | Passed | Failed | Notes |
|---|---|---|---|
| mobile-360 | 136 | 1 | M1-16-S pass, MON-7:65 pass, M4-1-S:11 pass. Failure: `UIWIRE-9.spec.ts:1:2712` (below) |
| desktop | 136 | 1 | M1-16-S pass, MON-7:65 pass, M4-1-S:11 pass. Failure: the same `UIWIRE-9.spec.ts:1:2712` |

An earlier mobile-360 attempt was discarded, not counted: the Next server on port 3000 died about two minutes in (31 passed, then `ECONNREFUSED` for the rest, 106 failed); the machine was out of memory (swap almost full) and `pnpm` reported SIGTERM. It was re-run unchanged; log kept as `full-mobile-attempt1-server-died.log`.

The only additional failure, `UIWIRE-9.spec.ts:1:2712` "assembles immutable accepted history, approved changes and exact proof manifest": classified (b), not a pricing test, so not edited. It fails the assertion `getByText('Finish the required proof before issuing this bill') toHaveCount(0)` after "Complete this stage" then "Rebuild from approved sources" (the proof panel shows "File integrity checked" but the final-account alert stays up). It passed in CI on the same head. It is intermittent locally and also fails on current `origin/main`:
- branch, mobile-360, repeats: 1 pass / 4 fail (`--repeat-each=4`), then 1 pass / 2 fail (`--repeat-each=3`), plus the one failure in each full run;
- `origin/main` 85aed29 (detached temporary worktree, built there), mobile-360, `--repeat-each=4`: 2 pass / 2 fail, same assertion and message.
So it is a pre-existing environment-sensitive race in the final-account proof flow on this loaded machine, not caused by CH-1. Recommendation: leave it for its owner; CI (the real gate) passed it.

## 4. M4-1-S (CI mobile-360 failure at `M4-1-S.spec.ts:11`, `toBeFocused`)

Cause in the code: `M4-1-S.spec.ts:18` calls `button(page,"Open materials-320 overcharge").focus()` right after "Confirm scope"; in `apps/web/app/ui/recovery-cases.tsx` those "Open …" buttons are `disabled={!idle}` where `idle=!busy&&status!=="loading"&&!unsure`, so `.focus()` on a still-loading (disabled) button does nothing and the following Tab lands elsewhere. A timing race in the test, independent of pricing. CH-1's diff against its merge base touches no recovery file (0 files match).
Local results, mobile-360 (`M4-1-S.spec.ts:11` only unless stated):
- branch `a1cc5ae`: 24/24 pass (`--repeat-each=24`); an earlier `--repeat-each=6` gave 5 pass / 1 fail (that failure was the `:focus-visible`/outline check at line 19 after Tab, the same focus family, not the `toBeFocused` line); passed in both full-suite runs. Totals: 1 failure in 31 local runs.
- `origin/main` 85aed29 (temporary worktree): 8/8 and then 24/24 pass: 0 failures in 32.
Not enough local failures to say whether main would also fail under the CI's slower timing; the code path (focus before the button is enabled) is on main unchanged and was not edited. Recommendation: the owner of M4-1-S should wait for the button to be enabled before `.focus()`; I did not touch the spec.

## 5. Commands (all observed here)

| Command | Exit | Result |
|---|---|---|
| `heavy-slot ch-1 env CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 -c playwright.local.config.ts M1-16-S MON-7.spec.ts:65` (before the fix) | 1 | 2 failed, same as CI |
| same, `--project=mobile-360 --reporter=list` (whole suite, after the fix) | 1 | 136 passed, 1 failed (UIWIRE-9), 7.6 min |
| same, `--project=desktop --reporter=list` (whole suite) | 1 | 136 passed, 1 failed (UIWIRE-9), 9.2 min |
| `… --project=mobile-360 --repeat-each=4 UIWIRE-9` (branch) / `--repeat-each=3` (branch) / `--repeat-each=4` (main) | 1 / 1 / 1 | 1 pass 3 fail / 1 pass 2 fail / 2 pass 2 fail |
| `… --project=mobile-360 --repeat-each=6 M4-1-S.spec.ts:11` (branch) | 1 | 5 pass, 1 fail |
| `… --project=mobile-360 --repeat-each=24 M4-1-S.spec.ts:11` (branch / main) | 0 / 0 | 24 pass / 24 pass |
| `… --project=mobile-360 --repeat-each=8 M4-1-S.spec.ts:11` (main) | 0 | 8 pass |
| `pnpm typecheck` | 0 | 7/7 packages |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 packages |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `ch-1`, merge-base 3a06a02, includes both new allow entries |
| `pnpm --filter @jobguard/web test` | 0 | 20 files / 361 tests |

Not rerun this round (no code changed since attempt 3; only two spec import lines and one lane line): core, api and PostgreSQL integration suites, build, openapi check. Their attempt-3 results stand as recorded in `BUILDER_RECEIPT_attempt3.md`.

## 6. Environment and hygiene

- The browser results come from a newer Chromium headless shell (1234) than the pinned one (1193); the machine was memory-starved (swap about 90 % full), which is the likely reason for the intermittent local failures and for the lost server in the discarded run. CI is the authoritative browser gate.
- A detached temporary worktree `/private/tmp/jg-check-ch-1-r4-main` (origin/main 85aed29, installed and built for the comparison runs, with a copy of the local Playwright config) was created and left in place, not removed (never-delete rule). The local Playwright config in `.worktrees/ch-1/apps/web` is untracked and excluded via `.git/info/exclude`; it is not in any commit.
- Staged/committed: only the two specs, the lane line and this receipt. No `.pnpm-store`, build output, `test-results` or local config. Logs for this round are kept outside the repository.
- Observation for the integrator: `origin/main` is now 85aed29, ahead of the 3a06a02 this branch last merged (for example the recovery-messages work); the branch was not rebased or merged this round.
