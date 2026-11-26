# Q61 · V2-SQ3: prove a spoken quote saves and reopens, on desktop and at 360 px, from untouched transcripts

**Tier:** T1 (tests and a short report; product fixes only if a test finds a real fault, see Build 4). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** SQ2's PR (Q60), its head when you start; record the sha. **Branch:** the builder thread's own branch, in `config/lanes/v2-sq3.json`. **PR:** draft into SQ2's branch. **Migration:** none. **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: 26 Nov 19:05 UK. Priority: top (JG-PLATFORM-SPOKEN-QUOTE-20261126).

## What Ben asked
The quote saves and reopens through the existing flow. This is proved on desktop and phone with untouched transcripts.

## Planner reading (Astra please confirm or correct)
1. **"Untouched" means byte for byte.** Each transcript is a fixture file, stored exactly as spoken words came out (no punctuation added, no capitals fixed, no prices rewritten). The test feeds it through the injected speech adapter as final segments, in the original chunking if known, else as one segment. A sha256 of each fixture is pinned in the test, so an edit to a fixture fails the test.
2. **Which transcripts.** The parser PR's own examples (the builder's four, plus any of Ben's from JG-PLATFORM-SPOKEN-QUOTE-20261126 it holds). If Ben's raw recordings' transcripts aren't in the repo, use the four and write "Ben's own transcripts: add when he sends them" in the PR. Don't make new ones up and call them Ben's.
3. **The whole flow, the real routes.** Talk through a quote (SQ1) → Stop → Use these words → Make my draft (POST `/api/jobs/capture`, `job_capture_v1`) → Check and edit my draft → review (SQ2 prices and total) → Save review → Confirm scope → Price the work → Save draft revision → full page reload → reopen the job from the jobs list → the same rows, prices, total and revision. No step is skipped by calling an API directly.
4. **Phone means the 360 px project plus Ben's own run.** CI covers the `mobile-360` and `desktop` Playwright projects. A short checklist for Ben's own desktop and iPhone run (planned around 4 Dec) goes in the PR, using the real microphone. That run is his, not CI's.

## Dry-check against `v2/main` @ 9f43bcdc1 (rule 23; re-check on SQ2's head)
- `apps/web/playwright.config.ts` lines 17 to 18: projects `mobile-360` (360 × 800) and `desktop` (1280 × 800).
- `apps/web/e2e/helpers/capture-journey.ts`: `openCapture` (line 3), `openReview` (line 23), `confirmCapturedScope` (line 34), `openQuote` (line 42).
- `apps/web/e2e/VOICE-1.spec.ts`: `inject(page, mode)` (line 13) sets `window.__JOBGUARD_SPEECH_ADAPTER__` and counts starts and stops; it also collects any request matching `/speech|transcri|audio/`.
- Saved quote reopen: `Save draft revision`, `quote-revision`, `quote-net` test ids in `apps/web/app/ui/quote-editor.tsx` line 323; specs that already reopen a saved quote: `CH-1.spec.ts`, `DEMO-J2.spec.ts`, `M4-3-S.spec.ts`.
- `apps/web/app/ui/review-proposal.tsx`: `data-testid="proposal-line-count"` and `capture-method` "On-device dictation · checked by you".
- Reuse #890 DUI-1a's `capture-journey-designed.ts` screenshot pattern (desktop and 360 px), copied. Leave #918 alone: its `#quote` reload change (325f0a08c) is not on this base and is not wanted here.

## Build
1. **Fixtures** `apps/web/e2e/fixtures/spoken-quote/*.txt`, one per transcript, with `README.md` naming each source and its sha256.
2. **Spec** `apps/web/e2e/SPOKEN-QUOTE-1.spec.ts`, one test per transcript, each run in both projects:
   - injected adapter feeds the fixture; one press of "Talk through a quote" (SQ1);
   - after "Use these words", Work details equals the fixture exactly;
   - review rows and order match the parser PR's expected rows for that example; prices as expected, blanks blank; the running total and "incomplete" state as SQ2 sets them;
   - fill any blank price, Save review, Confirm scope, Price the work, Save draft revision;
   - reload; reopen from the jobs list; the rows, rates, `quote-net` and `quote-revision` are unchanged;
   - a full-page screenshot at each of: review, quote after reload. Saved under `test-results/SPOKEN-QUOTE-1-<project>-<example>.png`.
   - no horizontal scroll at 360 px (`scrollWidth <= clientWidth`), and every button at least 44 px tall.
   - no speech, transcript or audio request leaves the page.
3. **Ben's run checklist** in the PR body, short: open the walk on the phone, press Talk through a quote once, say one of the four example jobs, check rows and prices, save, close the browser, reopen, see the same quote. Plus one "deny the microphone" try.
4. **If a test finds a real fault** (for example, reopen loses a review price), fix the smallest thing in the owning file and note it as "SQ3 mount: <what>". Never relax an assertion, skip a test or edit a fixture to get green.
5. **Lane** `config/lanes/v2-sq3.json`. New files only, plus any noted fix mount.

## Tests
- The spec above: 4 or more transcripts × 2 projects, all green on CI1.
- A unit test that recomputes each fixture's sha256 against the README.
- **Rule 29/30:** no route or table added.

## Known limits (to write in the PR)
- CI never uses a real microphone. Ben's own run covers that.
- Speech engines differ by phone. A transcript from Ben's iPhone may differ from these fixtures, so his run checks the parser on his own words too.

## Done when
- Each untouched transcript, on desktop and at 360 px, goes from one press of the mic to a saved quote that reopens unchanged after reload, through the existing flow.
- Ben has a five-line checklist for his own phone run.
- CI1 is green, and the Codex check is clean or answered.
