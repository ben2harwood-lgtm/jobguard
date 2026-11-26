# Q60 · V2-SQ2: split and combine rows without losing prices, a price on every row, and a total that says when it's incomplete

**Tier:** RED money (draft prices that become quote rates). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** SQ1's PR (Q59), its head when you start; record the sha. **Branch:** the builder thread's own branch, in `config/lanes/v2-sq2.json`. **PR:** draft into SQ1's branch. **Migration:** none. **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: 26 Nov 19:05 UK. Priority: top (JG-PLATFORM-SPOKEN-QUOTE-20261126).

## What Ben asked
Spoken prices attach to the right row, and unknown prices stay blank. A "whole job" figure is kept for review only. Rows can be split and combined, and the total shows when it is incomplete.

## Planner reading (Astra please confirm or correct)
1. **Every row shows its price and can be priced here.** Each review card gets a "Price (£)" box for its unit price, blank when unknown. A row's line total is quantity × unit price, shown as "£X" or "Price needed". A quantity that isn't a plain positive number counts as unknown.
2. **Combine keeps what's known.** If every chosen row has a price and a numeric quantity, the combined row is quantity 1, unit "item", unit price = the sum of their line totals, and the card says "Combined from 3 rows · £260". If any chosen row has no price, the combined row's price is blank and the card says "Combined from 3 rows · 1 had no price, so this needs a price". It never invents a figure.
3. **Split never guesses.** Split children start with a blank price and keep the parent's quantity and unit as editable text. Each child shows "Before the split: £X for the whole row" (or "had no price"). The running total marks the split rows as needing a price until they're filled.
4. **The total tells the truth.** A running total over accepted, unsplit, unmerged-away rows: "Total so far £X · complete" when every counted row has a line total, else "Total so far £X · incomplete: N rows need a price". Dismissed, split-away and merged-away rows don't count. Net only; VAT is the quote editor's.
5. **The whole-job figure is shown, never spread.** If the parser PR carries a "for the whole job" figure (its own field or question), the review shows "You said £800 for the whole job. It isn't added to any row." beside the running total, with the difference "Rows add up to £Y". Nothing writes it into a row.
6. **The quote editor stays the place prices are confirmed.** Review prices go to `QuoteEditor` as `rate`, exactly as today, and still show "Price: not confirmed yet" until the builder enters or confirms them there. No change to totals, VAT, issue or acceptance code.

## Dry-check against `v2/main` @ 9f43bcdc1 (rule 23; re-check on SQ1's head)
- `packages/core/src/review.ts`: `unitPricePence` nullable, max `MAX_MONEY_PENCE` (line 12); `reviewLineV1` (line 15), dispositions `proposed | accepted | dismissed | split | merged` (line 23), `parentScopeItemIds` (line 25), its `superRefine` (line 27); `reconciliationSummary` (line 51); `assertReviewConfirmable` (line 62). **The schema doesn't change.**
- `apps/web/app/ui/review-proposal.tsx`:
  - `fresh()` (line 10) copies the parser's `unitPricePence.value`;
  - `ReviewProposal` (line 11), `update()`;
  - `add`, `split` and `merge` (line 67): split children and the merged child both set `unitPricePence: null`, and merge forces quantity "1", unit "item";
  - the card shows "Price needed" or `£x.xx` (line 74) but has no price box and no total; one page-level "Price needed" line;
  - `QuoteEditor` gets `rate: line.unitPricePence` (line 70).
- `apps/web/app/ui/quote-editor.tsx`: `Source.rate` (line 14); "Unit rate (£)" box and "Price: entered by you / not confirmed yet" (line 323). Not changed.
- Money parsing: `parsePoundsToPence` as `apps/web/app/ui/job-exposure-curve.tsx` line 9 wraps it. Use the same function; don't write a new parser.
- Parser PR: its whole-job output and its four examples (4 rows / 6 units; £200, £600 and one open; £200 + £60 = £260; "supply and fit one door" £300 with £800 for the whole job).

## Build
1. **Pure helpers** in `apps/web/app/ui/review-pricing.ts`, all integer pence:
   - `lineTotalPence(line)` → number or null;
   - `combinedPrice(lines)` → `{ unitPricePence | null, unpriced: number }`;
   - `runningTotal(lines)` → `{ pence, counted, unpriced, complete }`;
   - `totalLabel(t)`, `combineLabel(...)`, `splitBeforeLabel(...)`, `wholeJobLabel(...)`;
   - no float: quantities are parsed as decimal strings to thousandths and rounded half-up to whole pence at the line, once.
2. **Review card.** Add the "Price (£)" box (`aria-label` "Price <description>"), the line total, and the split or combine note. Merge and split use the helpers. Keep every existing label and button so older tests still find them.
3. **Running total** in the review side panel, above "Save review", plus the whole-job line when present.
4. **Save is unchanged.** The edited `unitPricePence` goes through the existing `proposal_review_v1` save and confirm. The server's zod check is the guard.
5. **Lane** `config/lanes/v2-sq2.json`. Mount notes: `review-proposal.tsx` (card, merge, split, side panel; owned by main).

## Tests
- **Unit:**
  1. The builder's four parser examples, run through `fresh()` then the helpers: example 2 shows "£800 so far · incomplete: 1 row needs a price"; example 3 shows £260 complete; example 4 shows the £300 row, "You said £800 for the whole job. It isn't added to any row." and "Rows add up to £300".
  2. Combine all priced (sum kept), combine with one unpriced (blank, note), combine non-numeric quantity (blank).
  3. Split: children blank, "Before the split" shows the parent figure, total turns incomplete, filling both children makes it complete.
  4. Dismissed, split-away and merged-away rows aren't counted.
  5. Rounding: quantity "2.5" × £10.01 = £25.03 (half-up once); `MAX_MONEY_PENCE` overflow is refused by the box.
  6. Labels through `renderToStaticMarkup`.
- **e2e** (desktop and 360 px, typed source, injected nothing): make a draft from example 3's words, combine the two rows (shows £260), split the result (incomplete, "Before the split: £260"), price both parts, total complete, Save review, reload, same prices and total.
- Existing review and quote specs pass unchanged.
- **Rule 29/30:** no route or table added.

## Known limits (to write in the PR)
- The price box is a draft. The quote editor is still where a rate is confirmed for the customer.
- Combining rows with different units keeps the sum as one "item" price. The builder can split again.

## Done when
- On the review, every row shows its price or "Price needed", combining keeps known prices, splitting never guesses, the whole-job figure is shown but not spread, and the total says "incomplete" until every counted row is priced. The quote opens with those prices as today.
- CI1 is green, and the Codex check is clean or answered.
