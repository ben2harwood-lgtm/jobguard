# Q65 · V2-SQ-H: one end-to-end proof of the spoken quote, from one press of the mic to a plan per room and a Sent entry

**Tier:** T1 (tests, a short report, and a preview run; product fixes only as noted mounts). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** SQ-E's PR (Q64), at its head when you start. Record the sha. It needs SQ-A #1015 and SQ-F #1020, which are on `v2/main`, plus SQ-D #1019. **Branch:** the builder thread's own branch, in `config/lanes/v2-sq-h.json`. **Migration:** none. **Plan:** `/mnt/project-files/jobguard-v2/spoken-quote-ultimate-plan.md`, section 3 (target journey, steps 1 to 7) and row SQ-H. **Plan check:** a Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 05:50 UK.

## What it proves
Every step of the target journey in one browser run at 1280 and 360 px, through the real V2 routes:
1. One press of "Talk through a quote" (SQ1).
2. The three-room fixture appears as three rooms with trade lines. Anything unclear becomes a question, never a guess (SQ-C, plus SQ-G when it is on; Reader A otherwise).
3. Move a line, rename a room, and set the bathroom to one price (SQ-D).
4. Room subtotals are shown, and the total says "incomplete" until every line has a price (SQ2 and SQ-D).
5. The quote is laid out by room, with the bathroom as one figure (SQ-E). Save, reload and reopen from Jobs: everything is unchanged.
6. Record practice acceptance. The work plan opens with ordered tasks per room and trade (SQ-F trades.v1).
7. The send appears in the Sent list, marked "Practice, not really sent" (SQ-A).

## Planner reading (please confirm or correct)
1. **Two runs, one honest about the recogniser.**
   - Run A uses the injected adapter with the SQ-C three-room fixture, pinned by sha256. It is deterministic and covers every assertion above.
   - Run B uses the real built-in recogniser on a synthetic WAV, as Q61's `SPOKEN-QUOTE-REAL` does, under Q61's plan-check rule. The money checks are strict: every spoken price, the row count, the row prices and the totals. Description words may differ only within a named list of variants seen in CI. Run B stops at step 5 (saved and reopened). Run A covers steps 6 and 7.
2. **No step is skipped through an API call**, except the fixture sign-in (rule 22) and the practice acceptance button, which is already a practice-only UI action.
3. **Reader B (SQ-G) stays off** unless Ben's live-reader card is on and the key is set. The run records which reader produced the rows.
4. **The preview run is separate from CI.** After CI1 is green and the Codex check is clean, the builder starts a fresh preview from this head, on the free route Ben chose: Mac plus Cloudflare Tunnel, `jobguard_v2_local`. It then runs Run A against that address once, and records the address and head sha in the PR. Changing the public demo link is a deploy, which is Ben's card, not this piece.

## Dry-check (rule 23; on your base)
- Q61 #1004: `apps/web/e2e/SPOKEN-QUOTE-1.spec.ts` (injected), `SPOKEN-QUOTE-REAL.spec.ts` (recording), fixtures README and sha256 pins. Reuse its helpers, copied or imported.
- SQ-C #1016: the three-room fixture in `docs/fixtures/ai/spoken-quote-understanding/` (the "Smith house refurb" example in plan section 4.5).
- SQ-D #1019: room headings, Move, rename, "One price for the room", and the `review-pricing.ts` helpers.
- SQ-E (Q64): room-grouped quote editor, preview and customer page.
- SQ-F #1020: work plan by trade and stage (`trades.v1` templates). The plan page and its task titles include the room.
- SQ-A #1015: the Sent list in Messages, and the "Practice, not really sent" label.
- `apps/web/playwright.config.ts` projects `mobile-360` and `desktop`.

## Build
1. `apps/web/e2e/SPOKEN-QUOTE-JOURNEY.spec.ts`: Run A, steps 1 to 7, in both projects.
   - Full-page screenshots at review, quote, plan and Sent.
   - No horizontal scroll at 360 px, and buttons at least 44 px.
   - No speech, transcript or audio request leaves the page.
2. `apps/web/e2e/SPOKEN-QUOTE-JOURNEY-REAL.spec.ts`: Run B, steps 1 to 5, in both projects, using Q61's rule on description variants. The WAV is synthetic. Its text-to-speech tool, voice, script and sha256 go in the fixtures README.
3. A short report `reviews/v2/spoken-quote-journey-proof.md`. For each step it gives pass or fail, which PR delivered it, the screenshot name, and any gap found. Copy it to `/mnt/project-files/jobguard-v2/`.
4. If a test finds a real fault, fix the smallest thing in the owning file and record it as "SQ-H mount: <what>". Never relax an assertion, skip a test or edit a fixture to get green.
5. Lane `config/lanes/v2-sq-h.json`: new files, plus any recorded fix mounts.

## Done when
- Run A passes all seven steps at 1280 and 360. Run B passes steps 1 to 5 at both widths with strict money checks.
- The report lists each step with its evidence.
- A fresh Mac-tunnel preview from this head passes Run A once, and its address is in the PR for Ben to open.
- CI1 is green, and the Codex check is clean or answered.

## Claude plan check, 28 Nov (stands in for Astra, no reply after 2 hours): PASS WITH CONDITIONS
1. The base must include #1044 (Q68), as well as the SQ chain and v2/main, before any typed or recogniser-form step. Run A uses Q68's sha-pinned recogniser-form Smith fixture.
