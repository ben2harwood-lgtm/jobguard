# Q77 · V2-SQ-M: "up to £200" and "minus £50" never become fixed prices; the builder is asked

**Tier:** T2 (reader only; no route, table or migration). This packet stops wrong money reaching a draft quote, so it goes **before Q75**. **Builder:** Opus 5.5 thread. **Checker:** Codex, through the desktop-review route. **Base:** SQ-K #1049 (`claude/project-thread-trp08u-sqk` @ eb52456ac) at its head when you start; record the sha. Q75 then stacks on this branch. **Branch:** the builder thread's own branch, in a new lane `config/lanes/v2-sq-m.json`. **Migration:** none. **Plan:** Codex finding on frm-management-layer#3, comment 7238163638 (28 Nov 10:51 UK). **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 11:25 UK.

## What it is
Codex tested SQ-K and the preview head #1061 (`6e6e29fa7` and `894638f7a`). All existing reader tests passed, but 18 of 19 price-limit tests failed:
- "Paint the lounge ceiling for up to two hundred pounds" gives a fixed £200.
- "… for minus fifty pounds" gives **+£50**.
- In "Hang six doors at up to fifty pounds each … hang two doors at forty pounds per door", the lounge gets a fixed £50 per door.

A ceiling, a floor or a credit must never be put in a quote as a fixed price. A credit read as a charge is the worst case, because it bills the customer.

## Planner-written tests (copy as they are; never edit to get green)
Copy `capture-qualified-price.test.ts` into `packages/ai/src/` unchanged from the Codex handoff: frm-management-layer @ `940e9129c39eae0d274c6e39e0ee1305c49200f5`, `docs/reviews/2026-11-28-codex-handoff/builder/capture-qualified-price.test.ts`. That folder's `PRICE_REVIEW.md` and `Price_Qualification_Followup.json` list each case and what it does now. It covers:
- 16 limit and credit phrasings: up to, at most, no more than, a maximum of, at least, £200 minimum, or less, starting at, tops, minus, -£50, −£50, a credit of, … credit, … off the bill. Each one leaves the line unpriced on both paths (`extractCaptureFixture` and `readSpokenJob`) and asks "Confirm price: <words>".
- The control: "Paint the lounge ceiling - £200" stays £200, because that dash is punctuation.
- Two rooms: the capped lounge rate stays open, and the exact kitchen £40 per door keeps its quantity, its VAT question and its source words.
- `checkSpokenNumbers`: a qualifier outside the cited digits still opens the line, the room total and the whole-job total.

If a case looks wrong to you, report it to the planner. Don't change it. `HISTORICAL_reference_against_47ecb8f44.patch` in the same folder is a reference only, and it won't apply to the current parser.

## Planner reading (please confirm or correct)
1. **One place.** Add the limit and credit words to `saidAmountOpen` (`capture-fixture-parser.ts` line 123 on SQ-K), as one more guard next to `hedge`. Line prices, room totals and the whole-job total then all get it, because they all call that function. `checkSpokenNumbers` must use the same function on the words around each cited amount, not only on the cited digits.
2. **Credits are never positive.** A minus sign or credit word in front of an amount leaves it open. It never becomes a negative price either: whether a credit is a discount, an omission or a refund is the builder's call.
3. **The punctuation dash stays exact.** `-` or `–` with spaces on both sides, after a work description and before the amount, is not a minus. "-£50" and "−£50" with nothing between the sign and the amount are a minus.
4. **No score gets worse.** SQ-C's floors stay, and the before and after scores go in the PR. The golden-run hash will change; say so in the PR.

## Tests
- The copied file passes: 16 + 1 + 1 + 1 cases.
- `capture-plain-words.test.ts`, `context-reader.test.ts`, the typed-rooms fixtures and `pnpm eval` pass unchanged.
- apps/api capture specs pass.
- **Rule 29/30:** no route or table added.

## Done when
- No limit, floor or credit becomes a fixed price on any path, and each one is asked about with its own words.
- Exact prices, including after a punctuation dash, are unchanged.
- CI1 is green, and the desktop Codex verdict names the head and is clean or answered.
- Then the builder adds it to the preview head #1061, with a note on #1061 naming Codex's finding as closed.

## Plan check (Claude stand-in, 28 Nov 13:45 UK)
Astra did not reply to #3 7238728305. This check passed with no new conditions. It was built as #1064 (Q77, ac7945f) and #1063 (Q75, 6d7c0b7), desktop Codex was clean on both, and both landed on preview #1061 at b25b5ee. Codex's price-limit tests were copied in unchanged, and packages/ai passes 497 of 497. Any further findings come from the Codex red-team (#1072, #1074) and are fixed by Codex under the hardening plan (#1065), not here.
