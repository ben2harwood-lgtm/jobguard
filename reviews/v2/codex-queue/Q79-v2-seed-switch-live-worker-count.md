# Q79 · V2-SEED-1: find why "Switch live … only approved revisions regenerate" fails on the G and K5 stacks, and fix the cause

**Tier:** T2 (test or product fix, decided by the cause). **Builder:** Opus 5.5 thread. **Checker:** desktop Codex. **Base:** G9 `claude/project-thread-trp08u-g9` @ 531fecb35, where it fails. Compare with v2/main @ 77ed320e7 plus #1057, where #1057's local run passed 53 of 53. **Branch:** the builder thread's own branch, in a new lane `config/lanes/v2-seed-1.json`. Land the fix on the branch that causes the failure. **Migration:** none expected. **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 12:55 UK.

## Why now
#1058 makes `v2-seed` run on every V2 PR. Two seed tests fail on G9 and on the K5 line, so once #1058 lands, every stacked V2 PR goes red:
- "existing Switch live activates a plan once and only approved variation revisions regenerate money scope" (`tools/v2/seed.integration.test.mjs` line 769 on v2/main);
- the case that depends on it.

So far this has been called "worker timing". Nobody has checked that.

## What the test asserts
`effectCounts()` (line 658) counts rows in `graphile_worker._private_jobs` and the schedule, exposure, send, booking, order and charge tables. The test then asserts:
- the counts after Switch live are unchanged by a replay (line 787);
- "approval schedules, sends, books, orders and charges nothing" (line 802).

## Steps
1. Run the test alone on G9 five times, and on v2/main (+#1057) five times. Record pass and fail counts.
2. When it fails, print which table differs and by how much. For `_private_jobs`, also print the `task_identifier` of each added or removed row: snapshot `(id, task_identifier)` before and after. Put the output in the PR.
3. Decide from what you find:
   - **A G or K5 feature enqueues a job on approval or Switch live** (for example a G8 review request, G9 aftercare or a K5 stage schedule). That breaks a promise the test pins: approval schedules nothing. Fix the feature so it enqueues at the point its own packet says, not at approval. Don't touch the test.
   - **The count drops because the worker finished and deleted a job** that existed before the window. The assertion is about jobs *created*, so measure that directly: count rows with `id` above the snapshot's max id instead of the total. That has the same meaning, and no added job is allowed. Record the reason in the test comment. This is the only change to the assertion this packet allows.
   - **Something else.** Tell the planner with the output before changing anything.
4. Never skip, retry-until-green or loosen the test.

## Done when
- The two tests pass 5 of 5 on G9, on the K5 line top and on v2/main.
- The cause and its proof are in the PR.
- CI1 and v2-seed are green, and desktop Codex is clean.

## Planner decision (28 Nov 13:20 UK, from the builder's findings)
The cause is graphile crontab ticks, not app code. G9 passed 5 of 5 alone and 4 of 4 in the full suite. The one failure went from 0 to 5 `_private_jobs` rows, and the five rows were exactly the five per-minute crontab tasks in `apps/api/src/worker.ts:155`.

Fix, test only: `effectCounts` leaves out a row only when its payload has `_cron` **and** its `task_identifier` is in that crontab list. The list comes from one shared constant, or is asserted against `_private_known_crontabs`.

A guard test enqueues one non-cron app job and checks that the count goes up by 1. The comment records the cause.

This counts the same thing the test promises to count ("approval schedules nothing"), so it does not loosen the test.
