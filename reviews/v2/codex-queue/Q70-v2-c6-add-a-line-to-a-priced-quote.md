# Q70 · V2-C6: add a line to a priced quote before it is sent, including from a "jobs like this usually carry" prompt

**Tier:** RED money (it changes what a quote contains). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** `v2/main` at its head when you start (77ed320e7 at planning); record the sha. **Branch:** the builder thread's own branch, in `config/lanes/v2-c6.json`. **PR:** draft into `v2/main`. **Migration:** none expected. If you find you need one, stop and ask for a number; the next free is 2088. **Plan:** roadmap row E9 "C6 add a line to a priced quote (makes c5 prompts actionable)". **Ben, 25 Nov 17:39 UK: in V2, practice first.** **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 07:05 UK.

## What it is
Today a builder can add a line only on the review screen, before the scope is confirmed ("Add omitted line", and the prompts' `onAdd` in `review-proposal.tsx` line 74). Once they're pricing in the quote editor, the "Jobs like this usually carry these costs. Add a line here…" panel (`v2-quote-prompts-panel.tsx` line 48) has no `onAdd`, because `quote-editor.tsx` mounts `<V2QuotePrompts jobId lines/>` without one (line 332). A builder who remembers skip hire while pricing has to go back. This piece lets them add a line in the quote editor, on the V2 practice path, before the quote is sent.

## Planner reading (please confirm or correct)
1. **A new line is a new confirmed scope item**, made the same way review confirmation makes one:
   - an `app.scope_identity` row in state `confirmed`;
   - its first `app.scope_revision` (revision 1, the builder's description, quantity "1", unit "item", price 0);
   - an `app.proposal_line` row only if review confirmation always makes one. Check `review-repository.ts` lines 56 and 77, and copy what it does.
   No new table. The quote line it gets has `origin='human'` and no price (`unitRatePence: null`, `rateProvenance: null`). The existing `missing_scope` blocker and "Price: not confirmed yet" then make the builder price it or exclude it with a reason before the quote can be previewed.
2. **Only before the quote leaves.** Adding is allowed only while delivery is `not_issued` or `previewed`, and there is no acceptance. That's the same condition `quote-editor.tsx` uses to show the prompts. The server checks it too, under the quote draft's `FOR UPDATE` row lock (`quote-repository.ts` line 25). Once a quote is issued, a new line is a change (F3 / variations), never an edit. The server refuses with `QUOTE_NOT_EDITABLE`.
3. **Totals come from the same place.** Adding a line never writes a `quote_revision` by itself. It adds the scope item; the builder's next "Save draft revision" includes it through the existing `saveDraft`, so totals, hashes and `QUOTE_LINES_OMITTED_OR_CHANGED` work unchanged. A previewed document made before the add is out of date by the existing signature rule. Prove it.
4. **V2 local only.** The route answers only under `JOBGUARD_LOCAL_V2=1` on the practice tenant, like the other V2 quote routes. Main's path doesn't change.
5. **Idempotent.** The body is `{ version: "v2-quote-add-line.v1", commandId, description (1 to 500 characters, trimmed), promptId? }`. A replay with the same body returns the same scope item; a different body with the same `commandId` gives `QUOTE_COMMAND_CONFLICT`. Store the command so replay works, using whatever command record V2 quote routes already use. If none exists and you'd need a table, stop and ask.
6. **One audit event**, `v2.quote.line_added`, with references only (job, scope item, prompt id). No description text.

## Dry-check against `v2/main` @ 77ed320e7 (rule 23; re-check on your base)
- `packages/db/migrations/0003_job_spine.sql`: `scope_identity` (line 14, state `reserved | confirmed | retired`), `proposal_line` (line 27), `scope_revision` (line 36, `quantity_decimal`, `unit`, `unit_price_pence`, `total_pence` all NOT NULL).
- `packages/db/migrations/0009_quote_pricing.sql` line 5: `quote_line`, with FKs to `scope_identity` and `scope_revision`, `origin IN ('captured','human')`, and `UNIQUE (tenant_id, quote_revision_id, scope_item_id)`.
- `packages/db/src/review-repository.ts`: line 56 (insert `scope_identity`), line 77 (set it to `confirmed`), line 83 (retire).
- `packages/db/src/quote-repository.ts`:
  - `saveDraft` validates every line's `scopeRevisionId` against `scope_revision` (`QuoteScopeRevisionError`) and adds a `missing_scope` blocker for each confirmed item without a line (lines 20 to 23);
  - it locks `quote_draft FOR UPDATE` (line 25);
  - `readWorkspace` lists confirmed scope with its latest revision.
- `apps/web/app/ui/quote-editor.tsx` line 332: `{!readOnly&&["not_issued","previewed"].includes(delivery)&&<V2QuotePrompts jobId={jobId} lines={lines}/>}`.
- `apps/web/app/ui/v2-quote-prompts-panel.tsx` lines 48 and 56: the `onAdd` button "Add a line for <label>".
- `apps/web/app/ui/review-proposal.tsx` lines 67 and 74, for how a human line looks before confirmation.

## Build
1. **Repository.** `QuoteRepository.addLine(context, jobId, sessionId, command)`, in one transaction:
   - lock the draft;
   - check the delivery state and that there is no acceptance;
   - insert the scope item and its first revision;
   - write the command record and the audit event.
   Return `{ scopeItemId, scopeRevisionId }`.
2. **Route.** POST `/api/jobs/[id]/quote/lines` (or the existing V2 quote route family's naming), with the usual job, firm and session gates. Rule 29: prove it with `assertCapabilityConfined` and the three refusals if SX is on the base. Otherwise write "Rule 29: pending V2-SX".
3. **Screen.**
   - In the quote editor, an "Add a line" button with a description box, shown only where the prompts are shown.
   - Pass `onAdd` to `V2QuotePrompts`.
   - On success, reload the workspace so the new line appears unpriced with "Added by you".
   - Text comes from pure helpers tested with `renderToStaticMarkup`.
4. **Lane** `config/lanes/v2-c6.json`. Record each mount on main-owned files (`quote-repository.ts`, `quote-editor.tsx`, `v2-quote-prompts-panel.tsx` if touched).

## Tests
- **Seed (appended):**
  1. **Done-when.** Price a practice quote and save revision 1. Add "Skip hire" from the prompt. The editor shows it unpriced, and preview is blocked by `missing_scope` until it is priced. Price it at £240 and save revision 2: net, VAT and total go up by exactly £240, £48 and £288, and every other line is unchanged.
  2. A preview made before the add is out of date after it, by the existing signature rule.
  3. After simulate-send (`queued` or later) or acceptance, add gives `QUOTE_NOT_EDITABLE` and writes nothing.
  4. Replay returns the same scope item; a different body with the same `commandId` gives `QUOTE_COMMAND_CONFLICT`.
  5. Excluding the added line with a reason makes the quote issuable without pricing it, and the excluded line goes to "Exclusions".
  6. Another firm gets 404 on the route, and the rule 30 firm A/B read check finds nothing.
  7. Off local V2, the route refuses, and main's quote specs pass unchanged.
- **Unit:** the zod command, the refusal mapping, the labels.
- **Browser:** 1280 and 360. Price, add from a prompt, price the new line, save, preview. Check no horizontal scroll and buttons at least 44 px. Screenshots go in the PR.

## Known limits (to write in the PR)
- Lines can't be added after the quote leaves; that's a change (F3 / variations).
- The new line's room is "Whole job" until SQ-E's room editing reaches the quote editor.

## Done when
- On the practice job, a builder adds a line while pricing, from a prompt or by typing, prices or excludes it, and the totals change by exactly that line. An issued quote can't be edited this way.
- CI1 is green, and the Codex check is clean or answered. Merge only on Ben's own card (RED money).
