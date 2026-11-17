# CH-3a round 5 — builder receipt

- **Task / PR:** CH-3a (structured customer, paying party and site), PR #98, branch `codex/sandbox/ch-3a`.
- **Repair builder:** Claude Sonnet 5.5 (Claude Code), 4 October 2026.
- **Input:** GPT-6.1 Sol high `VERDICT: REPAIR` on `d812f99d2607ee641b4b5a2d44c4d9e4e5c64718` (`/Users/benharwood/.local/share/full-steam/jg-runs/ch-3a-solcheck-20261004T195737.md`): three P2 findings, no P1 or P3.
- **Status:** **not independently verified, not accepted.** This is a builder receipt, not a checker verdict, not technical acceptance and not a merge recommendation. GitHub CI on the pushed head is the pinned-browser proof.

## Scope, as settled by the integrator against the card's Done-when (recorded verbatim)

- IN SCOPE, fix now (all three): P2-1 (a NULL correction flag bypasses the post-live guard in 0051; Done-when "a post-live correction requires a reason"), P2-2 (reopening and repeated saving replace saved party identities; commands/UI binding, C1/C7), P2-3 (editing a site silently drops additional address lines; site address lines are part of `site.v1`).
- Nothing is out of scope. Migration 0051 has not been applied anywhere, so it may still be edited.
- Founder decisions (Ben, 4 Oct 2026), not defects: the C7 "open the job from Jobs" step is met by reopening the saved job fresh plus a second browser context, for every JobGuard task; fictional sample-source labels are acceptable for now. Coordinator ruling (4 Oct): migration numbers follow merge order. This task keeps its allocated migration number (0051).

**OPEN FOR BEN:** none. Every item is a technical repair inside the existing contract. No live provider, production mode, real data, spending, decision approval, deploy, release or CI weakening is touched.

## Finding status

| # | Priority | Finding | Status | Failing-first test | Fix |
|---|---|---|---|---|---|
| 1 | P2 | A null correction flag skipped the live-job refusal in `bind_job_parties` (`NOT p_correct` is null for a null flag), the reason was discarded, and the deferred record check accepted a plain `job.parties.bind` event | **Fixed** | `job-parties.integration.test.ts:337` "refuses a live job's binding change unless the correction flag is true, and rolls everything back" (runtime role, completes receipt and audit, so only the routine's own refusal can stop it) | `0051_job_parties.sql:86` `p_correct IS DISTINCT FROM TRUE`; `:92` `CASE WHEN p_correct IS TRUE` |
| 2 | P2 | The panel never filled its draft from saved parties (first load or after save), so a second save created another customer and site, and a reopened job showed the sample "Practice Customer" | **Fixed** | `CH-3a.spec.ts:237` "reopening shows the saved details, and saving them unchanged creates no new customer or site"; `CH-3a.spec.ts:266` "a changed customer revises the same customer and a changed site is a new site; nothing else is created" | `job-parties.tsx:46` (hydrate on first load), `:107` (hydrate after save), `:103` (an unchanged site keeps its saved identity and revision; a site is created only when the user changed it or chose another place) |
| 3 | P2 | Editing a site reloaded only `addressLines[0]` and rebuilt a one-line address | **Fixed** | `CH-3a.spec.ts:285` three tests, "keeps all 2, 3 and 4 address lines when another detail changes, and edits them only deliberately"; `CH-3a.spec.ts:307` "refuses a fifth address line in words before anything is written"; unit test `job-parties-draft.test.ts` | `job-parties.tsx:60`, `:80`, `:95`, `:137` and the new pure helper `job-parties-draft.ts` (first line in its own input plus a "More address lines (optional, one per line)" box; every saved line is shown and carried through an edit of any other field; a fifth line is refused before anything is written); `job-parties.module.css` (44 px touch target for the new box) |

## Tests first (red at `d812f99`/`8731d72`, green after)

Written and run before any fix (logs kept under the scratchpad `ch3a-r5/red-*.log`).

| Test | Red result | Green result |
|---|---|---|
| `job-parties.integration.test.ts` (19 tests at red) | 18 passed, 1 failed: "promise resolved … instead of rejecting" on the null-flag case, i.e. the change committed | 19 of 19 (the file now has 19 tests) |
| `CH-3a.spec.ts` new tests, both projects (6 tests × 2 = 12) | 12 of 12 failed for the intended reasons: the "Choose a customer" select held `""` instead of the saved customer; the command list was `create_customer, create_site, bind` where `revise_customer, bind` was required; the further-lines box did not exist | 28 of 28 in the CH-3a spec (14 tests × 2 projects) |
| `job-parties-draft.test.ts` (5 unit tests) | file failed to load: "Cannot find module './job-parties-draft'" | 5 of 5 |

The new browser tests: reopening a job with non-default details shows every saved field (type, name, phone, empty email, address, town, postcode, unit, selected customer, payer) and saving unchanged twice (once in the same session, once after a reload) sends exactly `bind, bind` with no `create_customer` or `create_site`, leaving customer and site counts, ids and revision ids unchanged; a name-only change sends `revise_customer, bind` (same customer id, revision 2, no new site); a town-only change sends `create_site, bind` (a new site, same customer); a two-, three- and four-line address survives reopen, a town change (all lines carried into the new site) and a deliberate edit of the last line; a fifth line shows an alert (focused) containing "at most four lines" and sends no command, with the 44 px target and no horizontal overflow asserted.

One test of mine was wrong at first and is corrected, not weakened: the reopen test expected an empty email although the sample email had been saved. It now clears the email before saving, which proves hydration does not re-inject the sample email. A first unit case passed `unit: ""`, which is not a valid site, so it was removed (the panel omits blank optional fields).

## Merge with main

`origin/main` had moved by one commit, `ebfeaae` (TEST-STAB-2, #105: `apps/web/e2e/UIWIRE-1.spec.ts` plus the lane registry and its own verdict docs). Merge commit `8731d72` (not a rebase, no force). One conflict, `config/agent-lane-assignments.json`, resolved with `~/.local/share/full-steam/lane-union.py` (main's entries plus this branch's `ch-3a` lane, 80 lanes; no other lane edited). No migration landed on main, so the migration-count assertions are unchanged (`UIWIRE-12`, `demo-bootstrap` count 44 for this branch on top of main, range ending at `0051_job_parties.sql`). No code conflict. `apps/api/openapi.json` did not conflict and `pnpm openapi:check` passes. The ch-3a lane gained exactly two paths for this round: `apps/web/app/ui/job-parties-draft.ts` and `apps/web/app/ui/job-parties-draft.test.ts`.

## Commits (on top of `d812f99`)

| SHA | Subject |
|---|---|
| `8731d72` | merge: bring origin/main (TEST-STAB-2, #105) into CH-3a |
| `6946d22` | test(ch-3a): failing-first regressions for the round-5 findings |
| `0091170` | fix(db): refuse a live job's binding change unless the correction flag is exactly true (finding 1) |
| `108520d` | fix(web): reopening and saving keep saved party identities and every address line (findings 2 and 3) |
| `550b448` | test(web): clear the sample email before the reopen test so it proves saved details are not replaced |

## Commands (worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch-3a`, Node 24.17.0, pnpm 10.28.1; every database or browser command inside one `heavy-slot ch-3a` acquisition)

Run at `108520d` (the later `550b448` changes only the CH-3a spec; its spec was re-run, see the last row).

| Command | Exit | Result |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 0 | lockfile up to date |
| `pnpm typecheck --force` | 0 | 7 of 7, 0 cached |
| `LANE_BASE_REF=origin/main pnpm lint --force` | 0 | 7 of 7, 0 cached; core purity, money boundary and lane boundary passed |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | "Lane boundary passed", lane `ch-3a` |
| `pnpm build` | 0 | 7 of 7 (4 cached: not touched by this round; the web build ran) |
| `pnpm openapi:check` | 0 | generated contract matches `apps/api/openapi.json` |
| `pnpm test --force` | 0 | tools 39; core 440 (70 files); storage 4; config 2; ai 72; api 109 (16 files); web 68 (9 files, +5 new); db 208 (40 files) |
| `pnpm test:db` | 0 | 40 files, 208 tests |
| `pnpm test:migrations` | 0 | 2 files, 11 tests |
| `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop` (whole suite, local browser) | 1 | 192 passed, 2 failed: only my new reopen test in both projects (wrong expectation, see above); every other test passed |
| same command, `CH-3a.spec.ts` only, after `550b448` | 0 | 28 passed in 37 s (14 tests × 2 projects) |

## What was not run, and why

- The pinned Playwright browser (`chromium_headless_shell-1193` is not installed on this Mac). Browser runs used an **uncommitted** config kept outside the repository that imports `apps/web/playwright.config.ts` unchanged and only sets `launchOptions.executablePath` to the installed `chromium_headless_shell-1234`; paths are absolute and the web server `cwd` is `apps/web`. No test, timeout, retry or project setting differs. GitHub CI is the pinned-browser proof.
- The whole browser suite was not repeated after `550b448` (a test-only change to the CH-3a spec, which was re-run in full). CI runs the whole suite on the pushed head.
- No dependency or secret scanners, no `pnpm eval` (no AI change), no `pnpm test:restore` as a separate command (its rehearsal test runs inside `test:db`), no deploy or Vercel build.
- The checker verdict and technical acceptance are separate steps and have not happened.

## Environment notes

- The shared scratchpad directory is used by several builder sessions of the same coordinator, and log names such as `red-run.log` were written by another session's job as well; my first read of that file showed another worktree's output. I kept my evidence in a private subdirectory and used the DB and browser logs I wrote there. No test or code was affected.
- Leaked SysV shared-memory segments had again used all 32 macOS ids; before each heavy run I removed only segments with nothing attached and a dead creator pid. The shared heavy-slot queue held this task for about half an hour before its first run.
- No flake occurred in these runs: no re-run of a failed job was needed (the one failing e2e test was a defect in my own test, fixed).

## Notes for the checker

1. A save of unchanged details still appends a binding (same customer, paying party and site revisions): the user's explicit Save is recorded, and the existing reuse test relies on it. It creates no customer, site or revision.
2. A site has no revise command in the contract (card: create and revise a customer; create a site), so editing any part of a site creates a new site identity unless the user explicitly chooses an existing place and confirms it is the same.
3. If a save fails part-way (for example an invalid postcode after the customer was revised), a retry meets the existing stale-draft conflict and reloads the saved details; this is the earlier round's behaviour, now reachable for bound jobs because the saved customer stays selected.
4. Finding 1 was fixed in the routine only. The deferred record check is unchanged: it still accepts a plain bind event for a binding with no reason, which can no longer be produced for a live, invoiced or paid job.

## GitHub CI

- Run **37231179471** on code head `4cde49d` (the receipt commit on top of `550b448`): **success**, jobs `checks`, `secrets` and `dependency-review` all success (browser suite 194 passed in 8.0 min, both projects, pinned browser).
- CI counts (source tests only): tools 39; core 220 (35 files); storage 4; config 2; ai 72; api 109 (16 files); web 68 (9 files); db 205 (39 files, including `free-port.test.ts`). My local counts above are higher for two reasons that are not test differences: `packages/core` and `packages/db` contain compiled copies of their tests under `dist/` on this Mac, which local vitest also runs (core exactly doubles, 440 of 70 files against CI's 220 of 35; db has one extra file, `dist/demo-seed.test.js`, with 3 tests, 208 of 40 files against CI's 205 of 39). Same offsets as in the earlier rounds' receipts.
- No re-run of any failed job was needed on this round's heads.

Not independently verified, not accepted.
