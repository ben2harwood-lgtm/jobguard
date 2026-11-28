# RT-12 End to end: right room, trade, line, total, then save and reopen

**Attack:** the full journey on the deployed preview, as Tommy will do it. **Invariants:** all.
**Kind:** hosted browser runs against https://sq-preview-jobguard-demo.ben2harwood.workers.dev/jobs/new at
`HEAD_UNDER_TEST`, practice firm only, plus a local run of the same specs.

## Journeys (each at 360 and 1280)
1. Start a practice firm, start a job, type (or inject as transcript) each of 20 scripted quotes drawn from RT-01 to
   RT-11 (the 5 existing `apps/web/e2e/fixtures/spoken-quote/` plus 15 new, covering every lane).
2. On the review screen check each line's description, room, trade, quantity, unit, price, every question, the room
   totals, the whole-job total and the incomplete-total label against the corpus expectation.
3. Edit one price, split one row, combine two, save, reload, reopen: everything persists; transcript unchanged.
4. Confirm; the quote screen shows the same lines, rooms and totals.
5. The real-audio fixture `apps/web/e2e/fixtures/spoken-quote-real.wav` through fake media: same expectations.

## Deliver
`apps/web/e2e/RT-12-right-place.spec.ts` (+ hosted config entry), a results table per journey in `../FINDINGS.md`,
and screenshots. No deploys; if the preview head changes mid-run, stop and record both shas.

## Every lane
- Read `../README.md` first: start gate, invariants, corpus format, rules. Work at `HEAD_UNDER_TEST` only.
- Write at least the case count below. The seed cases are a floor, not the list; invent many more.
- Write each expectation from what the builder said, never from what the code does.
- Deliver: one PR into `claude/project-thread-trp08u-sqpv`, adding only the corpus file, any extra tests, lane file
  `config/lanes/v2-rt-12.json`, and rows in `../FINDINGS.md`. No source changes in the attack PR.
- Done when: the case count is met, CI is green with every failure marked `open-finding`, each finding has a row
  with head sha, transcript, expected, actual and severity, and the PR is linked on the tracking issue.
