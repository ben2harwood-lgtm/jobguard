# Q62 · V2-SQ4: compare the checked demo's journeys with V2's routes, and prove the ones V2 already has

**Tier:** T1 (a report and tests; no product change). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** `v2/main`, its head when you start (9f43bcdc1 at planning); record the sha. If SQ3 (Q61) has merged by then, include its spoken journey. **Branch:** the builder thread's own branch, in `config/lanes/v2-sq4.json`. **PR:** draft into `v2/main`. **Migration:** none. **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: 26 Nov 19:05 UK. Priority: after Q59 to Q61 (JG-PLATFORM-SPOKEN-QUOTE-20261126).

## What Ben asked
After the spoken quote works, the checked demo's journeys move onto V2 routes. This piece is the first half: a plain list of what each demo journey does, where V2 already does it, and what's missing, plus browser proof for the parts V2 has. Moving the missing parts is planned from that list, piece by piece.

## Planner reading (Astra please confirm or correct)
1. **"The checked demo" is Tommy's demo**, the build Ben showed on 25 Nov: commit `32decb2c1` on `claude/project-thread-qytlkj` (#918), with its 28 walkthroughs. It is **read only** here. Don't push to it, merge it, or copy its hardening fixes. #918 stays alone.
2. **A journey is one demo spec.** The list covers `TOMMY-DEMO.spec.ts`, the `DUI-*` specs, the `DEMO-*` specs and the `real-*` specs on that commit. Each step is matched to the V2 screen and route that does the same job, using only what is on `v2/main` (or a named open V2 PR).
3. **Three verdicts per step:** "On V2" (same outcome through a V2 or shared route on `v2/main`), "On a V2 PR" (name the PR), "Missing". "Differs" is a note on an "On V2" step whose wording or order changed, not a fourth verdict.
4. **Prove only "On V2".** One Playwright spec per journey that is wholly "On V2", in both projects. A journey with any "Missing" step gets no spec yet; the report says what it needs.
5. **No product code moves here.** If a demo screen is better than V2's, the report says so in one line, with the file on #918, for a later packet.

## Dry-check (rule 23)
- `claude/project-thread-qytlkj` @ b8adc5b52 (demo build 32decb2c1 is its ancestor; use 32decb2c1 for the list): `apps/web/e2e/TOMMY-DEMO.spec.ts`; `DUI-1a`, `1b`, `2`, `3`, `4-company-money`, `4-found-extra-to-paid`, `4-own-job-to-paid`, `5-northside`, `6-northside`, `6-northside-presenter`; `DEMO-A1-rest`, `A1-scenarios`, `J1-core-1000`, `J2`, `J3-integrity`, `J3-shadow`, `J4-meter`, `J5-trial`, `J5-trial-final-check`, `S-chooser`, `VOICE-PHONE`; the `real-*` specs (for example `real-customer-link-own-quote`, `real-found-extra-to-paid`, `real-journey-money-status`).
- Its readiness receipts: `docs/receipts/tommy-tour-readiness-20261119.md`, `tommy-money-gap-checks-20261119.md`, `docs/verdicts/DEMO-VOICE-PHONE/READY.md`.
- `v2/main` @ 9f43bcdc1: the V2 designed screens under `apps/web/app/(designed)/`, the V2 routes under `apps/web/app/api/jobs/[id]/…` and `apps/web/app/api/v2-backend/…`, the watchdog list `packages/core/src/watchdog.ts`, and SX's route inventory (`tools/v2/test/refusals.mjs` and `tools/v2-refusals.test.mjs`, from #965).
- The `DEMO-*` specs are already on `v2/main` too (11 files, the same names); the `TOMMY-DEMO`, `DUI-*` and most `real-*` specs are not. Reuse their helpers (`helpers/capture-journey.ts`) where the step is the same.
- Open V2 PRs to cite when a step is there but not merged: the walk stack (#920 B1A, #957 B1B, #973 B1C, #993 B1E), SYNC-1 #980, and the current overnight PRs (#991 to #999). #913's walk mock-ups are merged.

## Build
1. **Report** `reviews/v2/demo-journeys-vs-v2.md`:
   - one table per journey: step, what the builder sees in the demo, the demo file, verdict, the V2 screen and route, note;
   - a top summary: N journeys, how many wholly On V2, and the five most useful Missing steps, in usefulness order (what a builder needs first);
   - a copy to `/mnt/project-files/jobguard-v2/demo-journeys-vs-v2.md` for the planner.
2. **Specs** `apps/web/e2e/V2-DEMO-<journey>.spec.ts` for each journey wholly On V2. Desktop and 360 px; no horizontal scroll at 360 px; a screenshot at the journey's last screen.
3. **No change** to any demo spec, product file or helper on `v2/main`. New files only.
4. **Lane** `config/lanes/v2-sq4.json`, new files only.

## Tests
- The new specs pass on CI1 in both projects.
- A unit check that every journey named in the report's summary has a table, and every "On V2" journey has a spec file.
- **Rule 29/30:** no route or table added.

## Known limits (to write in the PR)
- The list is from the demo's tests, not from watching Ben's call. If Ben showed a step no test covers, add it when he names it.
- The demo used main's v1 backend. "On V2" means V2 reaches the same outcome, not the same tables.

## Done when
- The planner has one list of every demo journey step with On V2, On a V2 PR or Missing, and the top five missing steps in order.
- Every journey that V2 already covers has a passing browser spec at desktop and 360 px.
- CI1 is green, and the Codex check is clean or answered.
