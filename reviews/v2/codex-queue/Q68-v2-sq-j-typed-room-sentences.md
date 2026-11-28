# Q68 · V2-SQ-J: typed or punctuated quote text gets the same rooms as spoken text, and a per-unit price never loses its count

**Tier:** T2 money-adjacent (number safety in the capture parser; no route, table or schema change). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** #1037 `claude/project-thread-trp08u-sqra` at its head when you start (it carries SQ3, SQ-C's Reader A and #1033's follow-up). Record the sha. If #1033 (`claude/project-thread-trp08u-sqnum` @ ddc02dd71) isn't in it, merge it in first and record that. **Branch:** the builder thread's own branch, in `config/lanes/v2-sq-j.json`. **Migration:** none. **Plan:** gaps found by the SQ-H builder on 28 Nov (Q65 Run A). **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 06:30 UK.

## What the SQ-H builder found
On SQ-E merged with v2/main, the capture parser plus Reader A's labels gave these results:
1. **Punctuated text puts work in the wrong room.** SQ-C's `smith-three-rooms` text, typed as written ("Smith house refurb. In the kitchen rip out … Upstairs bathroom strip out, …") gives 9 rows across 4 areas. "In the kitchen" becomes its own row under Whole job, and "Upstairs bathroom" becomes a row under Kitchen. The recogniser form of the same job (lower case, no punctuation, prices in words) gives the right three rooms.
2. **A per-unit price loses its count.** In recogniser form, "tile the floor twelve square metres at sixty pounds a metre upstairs bathroom" gives 1 item at £60, a £60 line where 12 m² at £60 is £720. With nothing after "a metre", the price is rightly left open.

The typed path is the one Q66 makes the default look, so (1) is the first thing a builder sees.

## Planner reading (please confirm or correct)
1. **A sentence that only names a room opens that room; it is never a work row.** The parser must not make a row from "In the kitchen", "Upstairs bathroom" or "Out the back" (Reader A's `roomOnly` at `context-reader.ts` line 60). The rows after it get that room from `understoodLabels`. Reuse Reader A's pattern rather than writing a second one. If the parser can't import it without a cycle, move the pattern to one shared module both import.
2. **A room named at the start of a clause, followed by work, is a room, not part of the previous row.** "…at 60 a metre. Upstairs bathroom strip out, …" gives a bathroom row "strip out", not a kitchen row.
3. **Per-unit words followed by other words.** Re-run fault 2 on the base. If #1033 already leaves the price open, or reads 12 m² at £60, add the test and change nothing. If it still gives a £60 whole line:
   - when a per-unit word ("a metre", "a door", "each") is followed by words other than VAT words, either keep the count as the quantity with the unit price, or leave the price open with a "Confirm price: …" question;
   - never a whole-line price equal to the unit price.
   Pick the smallest fix and say which in the PR.
4. **No number gets worse.** SQ-C's merge floors stay: no wrong or invented number, no invented work, room right on at least 85% and trade on at least 80% of `cases.v1.json` lines. The held-out sets' hard floor stays gated. Never edit a fixture or an expected label to get green.

## Dry-check (rule 23; re-check on your base)
- `packages/ai/src/context-reader.ts` on SQ-E's chain:
  - `ROOM` (line 49), `roomPart` (54), `roomLead` (57), `leadingRoom` (58), `roomOnly` (60), `trailingRoomWords` (64);
  - `readSpokenJob` (316);
  - `understoodLabels` (472), which labels the parser's rows by where each row's words start.
- `packages/ai/src/capture-fixture-parser.ts`: `workClause` (line 40), `total` (41), `amounts` (70). The rows come from here, and `understoodLabels` only labels them.
- `apps/api/src/capture/capture.application.ts` line 26, `view()`, calls `understoodLabels` over `captured.lines`. Its fallback is one "Whole job" area when Reader A throws.
- `docs/fixtures/ai/spoken-quote-understanding/cases.v1.json`, case `smith-three-rooms`.

## Build
1. Fix 1 and 2 in the smallest place: the parser's sentence or clause split, or `understoodLabels`. Say which in the PR.
2. Fix 3 only if the re-run still shows the fault.
3. A new fixture `capture-typed-rooms.v1.json` beside `cases.v1.json`:
   - the Smith text as typed;
   - the same in recogniser form (the SQ-H builder's version; pin it with sha256 in the README so Q65 Run A can use it);
   - three more typed examples with full stops between rooms, written by the builder and marked "builder-written" in the README.
4. Lane `config/lanes/v2-sq-j.json`. Record each mount on `capture-fixture-parser.ts` and `context-reader.ts`.

## Tests
- **Unit:**
  - typed Smith gives three rooms (Kitchen; Upstairs bathroom; Hallway and landing) and no room-only row;
  - recogniser-form Smith gives the same rooms, trades and prices;
  - the tile phrase with trailing room words is never a priced £60 whole line;
  - the same phrase with nothing after it still leaves the price open.
- `pnpm eval` floors pass, and the before and after room and trade scores go in the PR.
- The existing parser, Reader A, spoken-quote and capture specs pass unchanged.
- **Rule 29/30:** no route or table added.

## Done when
- Typed or punctuated text gets the same rooms as spoken text, a room-only sentence is never a row, and no per-unit price becomes a whole-line price.
- CI1 is green, and the Codex check is clean or answered.

## Claude plan check, 28 Nov (stands in for Astra, no reply after 2 hours): PASS WITH CONDITIONS
1. The dry-check line numbers are from the SQ-E chain. On SQ-RA they are: `readSpokenJob` 358, `understoodLabels` 514, and `capture.application.ts` `view()` 18.
2. The `implementationSha256` pin for `capture-fixture-parser.ts` in `docs/fixtures/ai/golden-run.v1.json` is expected to change. It's an implementation hash, not a fixture label, so the "never edit a fixture" rule doesn't apply. Say so in the PR.
