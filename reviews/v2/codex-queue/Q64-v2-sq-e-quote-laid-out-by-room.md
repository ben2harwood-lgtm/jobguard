# Q64 · V2-SQ-E: the quote the customer sees is laid out by room, each room itemised or as one figure

**Tier:** RED money (customer quote document and its frozen hash; new table). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** SQ-D #1019 `claude/project-thread-trp08u-sqd` @ 5f040a8a3. Record the head you start from, and retarget when #1019 merges. **Branch:** the builder thread's own branch, in `config/lanes/v2-sq-e.json`. **Migration: 2087** (2068 to 2086 are taken across open branches; the final number is set at merge). **Plan:** `/mnt/project-files/jobguard-v2/spoken-quote-ultimate-plan.md` section 5, row SQ-E, and target journey step 5. **Plan check:** Claude stand-in if Astra hasn't answered on frm-management-layer#3 within 2 hours (Ben, 27 Nov 13:27 UK). Rules 1 to 30 apply. Planner: 28 Nov 05:50 UK. Priority: spoken quote first (Ben, 27 Nov 15:06 UK).

## What it is
Target journey step 5: "The quote the customer sees is laid out by room, each room itemised or as a single figure as he chose." SQ-D already groups the review by room and turns a "one price for the room" choice into a single combined row. This piece carries the rooms through to the saved quote, the preview PDF and the customer's quote page.

## Planner reading (please confirm or correct)
1. **Totals never change.** Totals still come from `quote_line` exactly as today. A room's figure is always the sum of that room's included line nets, computed by the same function that computes the document's subtotal. Nothing stores a room total. If a room figure ever differs from the sum of its lines, the document is refused.
2. **Two display modes per room.**
   - `itemised`: each line shows with its net, as today.
   - `room_total`: the room's lines are listed as descriptions with their quantity and unit but no price, followed by one figure "Room total £X".

   The builder picks the mode per room in the quote editor, and it defaults to what SQ-D set (a one-price room is already one row, so it shows as one priced line either way). This is a display choice only. It is not a second price.
3. **The layout is part of the frozen document.** `quoteDocumentV1` gains one **optional** field, `sections`: an array of `{ name, mode, scopeItemIds[] }` in display order. When `sections` is absent, the PDF and the page are **byte-identical** to today, so main's v1 quotes and their hashes don't change. When it's present, the PDF groups by room, and its sha256 (`content_hash`) covers the layout. A layout change is therefore a new document version, under the existing version conflict rule.
4. **The V2 record of the layout** is `app.v2_quote_section`, one row per (quote revision, scope item). It is written in the same transaction as the quote revision save, so the quote editor can reopen a saved quote with its rooms and modes. The document's `sections` are built from these rows, never from client text alone. `QuoteDocumentRepository.create` re-derives them and refuses a mismatch.
5. **Exclusions and the money rule are untouched.** Excluded lines stay in "Exclusions", never in a room. VAT, discount and total lines stay at the end, as today.

## Dry-check against `v2/main` @ 77ed320e7 and SQ-D @ 5f040a8a3 (rule 23; re-check on your base)
- `packages/core/src/quote-document.ts`:
  - `quoteDocumentV1` (line 6) is `.strict()`, with `lines[]` of `{scopeItemId, description, quantity, unit, netPence}` and a `superRefine` that checks the sums;
  - `quotePdfText` (line 25) prints "INCLUDED WORK" and then one row per line;
  - `renderQuotePdf` (line 27);
  - `snapshotQuote`.
- `packages/db/src/quote-document-repository.ts` line 3, `create()`:
  - it parses the supplied document;
  - it checks the revision's five totals against `quote_revision`;
  - it checks the included `quote_line` rows by ordinal against `document.lines` (`QUOTE_LINES_OMITTED_OR_CHANGED`);
  - `content_hash` is the sha256 of the rendered PDF, with `QUOTE_DOCUMENT_VERSION_CONFLICT` on a same-version hash change.
- `packages/db/src/quote-repository.ts`: `saveDraft(context, {jobId, draftId, expectedRevision, …, lines})`, `readWorkspace`, `insertLine`.
- `packages/db/migrations/0009_quote_pricing.sql` line 5: `app.quote_line`, with `category varchar(100)` (the trade) and `region varchar(100)` (rate-book region, **not** the room; don't reuse it).
- `apps/web/app/ui/quote-editor.tsx`: `Source` type (line 14), `makeDocument(version)` (line 195), line cards and totals (the `quoteFields` block).
- SQ-D's `review-proposal.tsx` passes `source={lines.map(line => ({… category: line.category}))}` to `QuoteEditor`. Add `room: line.room`.
- `apps/web/app/customer/quote/quote.tsx` line 30: one `<li>` per line; line 33: totals.
- `apps/web/app/api/quotes/preview/route.ts`: parses `quoteDocumentV1` and renders the PDF.

## Build
1. **Migration 2087** `packages/db/migrations/2087_v2_quote_section.sql`, with its note and proof file. Use the V2 fence, plus `to_regclass('app.quote_line') IS NULL` → RETURN.
   - `app.v2_quote_section` has `tenant_id`, `job_id`, `quote_revision_id`, `scope_item_id`, `room_name varchar(100)` (trimmed, 1 to 100 characters), `room_order integer >= 1`, `display_mode` (`itemised` | `room_total`), `recorded_at`.
   - PK `(tenant_id, quote_revision_id, scope_item_id)`, and a FK to `quote_line (tenant_id, quote_revision_id, scope_item_id)`. A trigger refuses a row for an excluded line, and refuses two rows of one room in the same revision with different `room_order` or `display_mode`.
   - RLS enabled and forced; runtime policy `lp11_policy_tenant()` plus job EXISTS; plus the V2 firm lock (restrictive `v2_practice_firm` policy, as 2066 or 2067 does it). `GRANT SELECT, INSERT` to `jobguard_runtime`; immutable trigger. No SECURITY DEFINER.
   - Run it twice; the second run changes nothing.
2. **Bootstrap** line after the highest V2 line on your base (rule 30: above FL-6's 2054 if present).
3. **Core.** In `quote-document.ts`, add optional `sections: [{name, mode, scopeItemIds}]`. `superRefine` checks that every included line's `scopeItemId` is in exactly one section, that no section is empty, and that names are trimmed and unique.
   - `quotePdfText`: with no `sections`, the output is unchanged. With `sections`, it prints "INCLUDED WORK" and then, per room, a room heading. An itemised room lists each line with its net. A `room_total` room lists each line without a price, then "Room total £X", where X is the sum of its lines' `netPence`. Subtotal, discount, net, VAT and total follow as today.
   - A pure helper `roomTotals(document)` is used by both the PDF and the page.
4. **Repository.**
   - `saveDraft` accepts an optional `sections` input and writes `v2_quote_section` rows in the same transaction, local V2 only.
   - `readWorkspace` returns them.
   - `QuoteDocumentRepository.create` re-derives `sections` from `v2_quote_section` for the revision and refuses with `QUOTE_LAYOUT_MISMATCH` if the supplied document's `sections` differ. With no rows, `sections` must be absent.
5. **Screens.**
   - Quote editor: lines grouped by room, with a per-room "Show as: Itemised / One room total" switch that saves with the draft revision.
   - Preview and the customer page (`customer/quote/quote.tsx`): grouped by room, using `roomTotals`.
   - Text comes from pure helpers tested with `renderToStaticMarkup`.
6. **Lane** `config/lanes/v2-sq-e.json`. Note each mount on main-owned files (`quote-document.ts`, `quote-document-repository.ts`, `quote-repository.ts`, `quote-editor.tsx`, `customer/quote/quote.tsx`) and on SQ-D's `review-proposal.tsx` (one prop).

## Tests
- **Unit (core):**
  1. A document without `sections` renders a PDF byte-identical to v2/main for the existing quote fixtures. Pin the sha256 of at least two existing fixtures, including the cancellation-kit one.
  2. With `sections`: every line is in exactly one room; an excluded line in a room is refused; an empty room is refused; duplicate names are refused.
  3. For random line sets, `roomTotals` summed over rooms equals `subtotalPence`.
  4. A `room_total` room prints no per-line price.
- **Seed (appended):**
  1. **Done-when.** The three-room fixture from SQ-C goes through review (SQ-D) into a quote with the bathroom set to one room total. Save, then preview. The PDF shows three room headings, and the bathroom has one figure equal to the sum of its lines. Reopen, and the rooms and modes are the same. The customer page shows the same layout.
  2. Changing a room's mode on the same document version gives `QUOTE_DOCUMENT_VERSION_CONFLICT`. A new version is accepted, with a new hash.
  3. A supplied document whose `sections` differ from the stored rows gives `QUOTE_LAYOUT_MISMATCH`.
  4. A quote saved with no rooms (main's path) still creates a document with no `sections` and the same hash as before.
  5. Rule 30: the firm A/B read check on `v2_quote_section`. UPDATE and DELETE are refused. Running 2087 twice changes nothing.
- **Rule 29:** no new route; the existing quote routes' refusals are unchanged. Write "Rule 29: no route added".
- **Browser:** 1280 and 360. Three rooms, bathroom as one total, save, preview, open as the customer (practice link), and the layout matches. Screenshots go in the PR.

## Stop
- If `sections` can't be added without changing the PDF bytes of a document that has no `sections`, stop and report. Main's quotes must not change.
- If a room figure ever differs from the sum of its lines, that is a defect. Stop.

## Done when
- On the practice job, the customer's quote and PDF are laid out by room, with the bathroom as one figure, and the total is unchanged. Reopening shows the same layout. A main-path quote is byte-identical to today.
- CI1 is green, and the Codex check is clean or answered.
