# Q75 · V2-SQ-L: "Bedroom two £500 all in" gets its room price, because a room's number is never part of an amount

**Tier:** T2 (reader only; no route, table or migration). **Builder:** Opus 5.5 thread. **Checker:** Codex, through the desktop-review route while GitHub Codex is out of quota. **Base:** Q77 V2-SQ-M's branch (itself on SQ-K #1049 @ eb52456ac), at its head when you start; record the sha. Build Q77 first. **Branch:** the builder thread's own branch, in a new lane `config/lanes/v2-sq-l.json`. **Migration:** none. **Plan:** the known limit logged on the preview head #1061. **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 11:08 UK.

## What it is
On the preview, "Bedroom two £500 all in." gives no room price, and the room shows "Price needed for this room." "The kitchen £500 all in." works. Most house quotes have numbered bedrooms, so builders will hit this on day one of the demo. Spoken quote is Ben's top priority (28 Nov 10:11 UK).

## Cause (planner dry-check, read from the code; confirm with a failing test first)
- `room-words.ts` line 5 reads "bedroom two" as a room through `ORDINAL`, so the room is found.
- `context-reader.ts` `totals()` (about line 297) finds `£500` and then calls `saidAmountOpen(clause.slice(0, priceAt), …)`. The words before the amount are "Bedroom two ".
- `capture-fixture-parser.ts` line 94: `unreadBefore` matches a number word right before an amount ("two £500" could be part of "two thousand five hundred"). So `readInPart` is true, the total stays open, and `pence` is null.
- The same thing can happen to a line price: `plainPrice` (line 204) calls the same guard with the chunk's own words, so "paint bedroom two £300" is likely open too. Check it.
- Related risk: in "bedroom two five hundred pounds all in", `priceNear` can read "two five hundred pounds" as one amount. It must never become £2,500 or £500 silently.

## Planner reading (please confirm or correct)
1. **One rule, in one place.** Before any amount is read in a clause or chunk, the words of a numbered room mention ("bedroom two", "bedroom 2") are hidden from the amount reader and from every guard. Replace them with spaces of the same length, so indexes don't move. Both `totals()` and `plainPrice` use the same helper. The room itself is still read from the original text.
2. **Nothing else loosens.** Only the ordinal inside a matched `roomPart` is hidden. A number word that is not part of a room mention still makes an amount open, exactly as now. `saidAmountOpen` itself does not change.
3. **Ambiguous stays a question.** "Bedroom two five hundred pounds all in" gives £500 for bedroom two only if the reader can tell the room ended at "two". If you can't make that safe, it stays open and is asked about. It is never £2,500. Write a test either way and say which in the PR.
4. **No score gets worse.** SQ-C's floors stay, and the before and after scores go in the PR. Never edit an expected value to get green. If a planner-written held-out label disagrees, report it; don't change it.

## Tests (each fails before the fix, except the guards)
- "In bedroom two paint the walls. Bedroom two £500 all in." gives a bedroom two room price of 50000 pence. The same with "bedroom 2", and with "Bedroom two 500 pounds all in."
- "Paint the walls in bedroom two £300" as a line: £300 on that row, if the line path had the fault.
- The bathroom and kitchen room-total tests in `context-reader.test.ts` (lines 41 to 150 on SQ-K) pass unchanged.
- **Guards that must stay open:** "two £500 all in" with no room; "bedroom two and a half thousand pounds all in"; "bedroom two £500 or £600 all in"; "bedroom two about £500 all in".
- The random sentence test at line 201 already uses "bedroom 2". Keep it, and add "bedroom two".
- `packages/ai` vitest and `pnpm eval` floors pass. The golden-run hash may change, if it pins either file; say so in the PR.
- **Rule 29/30:** no route or table added.

## Done when
- A numbered bedroom's spoken price shows on the review screen, the same as any other room.
- No amount the guards keep open today becomes a number, apart from the hidden room ordinal.
- CI1 is green, and the desktop Codex verdict names the head and is clean or answered.
- Then the builder adds it to the preview head #1061, as SQ-K was.

## Plan check (Claude stand-in, 28 Nov 13:45 UK)
Astra did not reply to #3 7238728305. This check passed with no new conditions. It was built as #1064 (Q77, ac7945f) and #1063 (Q75, 6d7c0b7), desktop Codex was clean on both, and both landed on preview #1061 at b25b5ee. Codex's price-limit tests were copied in unchanged, and packages/ai passes 497 of 497. Any further findings come from the Codex red-team (#1072, #1074) and are fixed by Codex under the hardening plan (#1065), not here.
