# Q71 · V2-SQ-K: bathroom suite work gets the plumbing trade, so the work plan sends it to the right trade

**Tier:** T2 (labels only; no number, price, row, route or table change). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** Q68 #1044 at its head when you start; record the sha. **Branch:** the builder thread's own branch, in `config/lanes/v2-sq-k.json`. **Migration:** none. **Plan:** a gap logged on #1044 on 28 Nov. **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 08:00 UK.

## What it is
In the recogniser-form Smith text, "upstairs bathroom strip out new suite supply and fit three thousand two hundred pounds" stays one row, with the trade **Other**. The typed text gives Plumbing. SQ-F's work plan (`trades.v1`) orders tasks by trade, so an Other row lands outside the plumber's stage. A builder says "suite" in nearly every bathroom quote.

## Planner reading (please confirm or correct)
1. **Labels only.** Change only the trade `tradeOf` returns. Rows, descriptions, quantities and prices don't change, and the row stays one row. Splitting "strip out" from "new suite" would change money rows, so it isn't done here.
2. **Two rules, in `tradeOf` (`context-reader.ts` line 121 on SQ-RA):**
   - "suite", "bath", "basin", "shower tray", "toilet" and "WC pan" map to **Plumbing**, unless an earlier, more specific trade word in the same row matches first. The existing order of `TRADE_WORDS` wins.
   - Like the kitchen rule at line 127: in a bathroom, en-suite, WC or cloakroom, a row that starts with "fit", "install", "supply" or "strip out" and has no trade word is Plumbing.
3. **No score gets worse.** SQ-C's merge floors stay. Trade-right on `cases.v1.json` must not fall, and the before and after scores go in the PR. Never edit an expected label to get green. If a planner-written held-out label disagrees, report it; don't change it.

## Dry-check (on SQ-RA @ f27ad8a0a; re-check on #1044's head)
- `packages/ai/src/context-reader.ts`:
  - `tradeOf` is lines 121 to 129: `TRADE_WORDS` first, then the kitchen rule at 127, then `Other`;
  - `understoodLabels` (line 514) calls `tradeOf(line.description, room)` for rows Reader A didn't build itself.
- `apps/api/src/capture/capture.application.ts` `view()` passes the label through `planSafeCategory`.
- Q68's fixture `capture-typed-rooms.v1.json`, with the recogniser-form Smith text sha-pinned in its README.

## Build
1. The two rules in `tradeOf`, plus unit tests for each word and for the bathroom-lead rule. Include a negative case: "supply and fit kitchen units" in a bathroom stays Kitchen fitting.
2. Add a check to Q68's fixture tests that the recogniser-form Smith bathroom row is Plumbing.
3. Lane `config/lanes/v2-sq-k.json`, recording the mount on `context-reader.ts`.
4. Expect the `golden-run.v1.json` implementation hash for `context-reader.ts` to change, if it is pinned. Say so in the PR.

## Tests
- Unit tests as above. `pnpm eval` floors pass, with before and after room and trade scores in the PR.
- The existing Reader A, parser, capture and spoken-quote specs pass unchanged.
- **Rule 29/30:** no route or table added.

## Done when
- Bathroom suite work is Plumbing in typed and spoken text, and nothing about rows or money changes.
- CI1 is green, and the Codex check is clean or answered.
