# Q55 · V2-F3: change draft. One new quantity drafts the price, extra time and materials together

**Tier:** RED money (it drafts a priced variation). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** F6 #923 `codex/sandbox/v2-f6` @ 9f9c6e088 (Ben approved #923 to merge once CI is green, coordinator 26 Nov 16:58 UK). **Branch:** the builder thread's own branch, listed in `config/lanes/v2-f3.json`. **PR:** draft into `codex/sandbox/v2-f6`; retarget to `v2/main` when #923 merges. **Migration: 2031** (reserved for F3; final number set at merge). **Plan check:** Astra, frm-management-layer#3. Rules 1 to 30 apply. Planner: 26 Nov 18:10 UK.

**E9 #948 is not needed.** E9 drafts its own extras through the variation path already on the base (Q17 line 7), and F5 joins the two later. F3 is the general change draft that E9 and F5 will call.

## What it is (rev 1.3 line 155)
"If the customer extends the splashback, draft the new quantity, materials, duration and price together through the existing variation process. Pending work is shown separately. Customer approval is tied to the exact variation version and amount." F6 already gives the last sentence (one link per exact revision and amount).

## Planner reading (Astra please confirm or correct)
1. **The money goes through main's variation path, unchanged.** F3 adds no new money record. The draft becomes an ordinary **existing-scope** variation: `scopeItemId = existingScopeItemId` = the quote line's scope item (`variationProposalV1` refine, `packages/core/src/variation.ts`). Its priced revision has `quantity = |new − accepted|`, the line's `unit`, `direction` addition or omission, and a unit rate the **builder confirms**. The rate is prefilled from the accepted quote line's `unit_rate_pence`, and the builder can change it. Nothing is priced until the builder presses Confirm, as `priceVariation` already requires (`HUMAN_CONFIRMED_PRICE_REQUIRED`).
2. **Time and materials are proposals stored beside the variation, never money.** A new V2 record binds the variation revision to:
   - the accepted line and the new total quantity;
   - the **proposed extra minutes** for each plan task on that scope item: the task's `durationMinutes × delta ÷ accepted quantity`, rounded up to 15 minutes, which the builder can edit;
   - the **material needs** named by those tasks (the template's `materialNeeds`).

   Pack counts aren't drafted: the V2 materials list (D3/D5) isn't on this base. F4 handles orders.
3. **Pending stays separate.** Until the variation is approved, the draft shows only in a "Pending changes" card, never in agreed scope, the plan or a brief. After approval, C3B (#922, merged) already joins the approved extra to the plan as its own scope item. F3 then offers "Add the extra time to the plan", which posts C3B's own plan edit (`variationRevisionId` set) with the drafted minutes. That is one press, made by the builder.
4. **A revised quantity is a new revision of the same variation.** It goes through the existing "revise" action, gets a new F3 record for the new revision, and needs a fresh F6 link. An F6 link for the old revision is refused by F6 already.

## Dry-check against `codex/sandbox/v2-f6` @ 9f9c6e088 (rule 23)
- `packages/core/src/variation.ts`:
  - `variationProposalV1` and its refine (an existing-scope variation keeps its scope identity);
  - `confirmedVariationPriceV1` (`quantity` decimal, `unit`, `unitRatePence`, `direction`, `confirmedByMembershipId`, `rateProvenance`);
  - `priceVariation` (line 21, `calculateNetLine`, signed by direction) and `approveVariation`.
- `apps/api/src/variation/variation.application.ts`: `command()` with actions `propose` (calls `logBuilderExtra` with `price`), `revise`, `approve` and `reject`; contracts in `apps/api/src/variation/contracts.ts` line 3.
- `packages/db/src/variation-repository.ts` line 146: `logBuilderExtra` (owner membership only; command gate before the job lock).
- `packages/db/migrations/0014_variations.sql`: `variation` (state draft, priced, approved or rejected; `current_revision_id`); `variation_revision` (line 15: `quantity_decimal`, `unit`, `unit_rate_pence`, `signed_delta_pence`).
- `packages/db/migrations/0009_quote_pricing.sql` line 5: `quote_line` (`scope_item_id`, `quantity_decimal`, `unit`, `unit_rate_pence`, `included`).
- `packages/db/src/v2-work-plan-repository.ts`:
  - tasks carry `durationMinutes` (line 17);
  - approved extras join the plan (lines 307 to 308);
  - plan edits on an extra name its `variationRevisionId` (lines 124 to 129).
- `packages/db/src/v2-splashback-decorating-template.ts`: task `materialNeeds` and `durationMinutes`.
- F6: `packages/db/src/v2-customer-extra-link-repository.ts` (`create` binds `variation_id` + `revision_id`, owner or admin membership, lines 59 to 101); `apps/api/src/v2-customer-extra-link.application.ts`; builder page `apps/web/app/v2/jobs/[id]/extra-links/view.tsx` (68 lines); `tools/v2/migrations/2018_customer_extra_links.sql`.
- `tools/v2/bootstrap.mjs`: the last V2 line on this base is 2027 (line 75); 2018 is at line 71.

## Build
1. **Migration 2031** `packages/db/migrations/2031_v2_change_draft.sql`, note and proof file. The V2 fence as 2027 has it, plus `to_regclass('app.variation_revision') IS NULL` → RETURN.
   - `app.v2_change_draft`: `tenant_id`, `job_id`, `variation_id`, `revision_id`, `quote_line_id`, `accepted_quantity varchar(40)`, `new_quantity varchar(40)`, `direction` (`addition` or `omission`), `command_id`, `actor_membership_id`, `recorded_at`. PK `(tenant_id, job_id, revision_id)` (one draft per revision); UNIQUE `(tenant_id, command_id)`. FKs: `(tenant_id, job_id, variation_id)` → `variation`, `(tenant_id, job_id, revision_id)` → `variation_revision`, and `(tenant_id, quote_line_id)` → `quote_line`. A trigger checks that the revision's `quantity_decimal` equals `|new − accepted|`, that its unit is the line's unit, and that the variation's scope item is the line's scope item. A mismatch is `V2_CHANGE_DRAFT_MISMATCH`.
   - `app.v2_change_draft_task`: `tenant_id`, `job_id`, `revision_id`, `task_key`, `proposed_minutes integer CHECK (proposed_minutes BETWEEN 0 AND 10080)`, `material_needs text[]`. PK `(tenant_id, job_id, revision_id, task_key)`; FK to `v2_change_draft`.
   - Both: RLS enabled and forced; runtime policy `lp11_policy_tenant()` plus job EXISTS (as 2015); `REVOKE ALL … FROM PUBLIC`; `GRANT SELECT, INSERT` to `jobguard_runtime`; `app.reject_immutable_authorization_record()` BEFORE UPDATE OR DELETE. No SECURITY DEFINER function. Run it twice; the second run changes nothing.
2. **Bootstrap.** Add the 2031 line after the last V2 line on the base (rule 30: above FL-6's 2054 line if that is on the base when this merges).
3. **Pure helper** `packages/core/src/v2-change-draft.ts`, with unit tests:
   - `draftChange({ line, newQuantity, tasks })` returns `{ delta, direction, priceProposal: { quantity, unit, unitRatePence }, previewPence, tasks: [{ taskKey, proposedMinutes, materialNeeds }] }`. Quantities use exact decimals (`parseQuantity`), and the preview uses `calculateNetLine` exactly as `priceVariation` does. A new quantity equal to the accepted one is `CHANGE_DRAFT_NO_CHANGE`. A line with no quantity, unit or rate is `CHANGE_DRAFT_LINE_UNPRICED`, and the builder must enter them. Minutes are `ceil(duration × delta ÷ accepted ÷ 15) × 15`, and 0 for an omission (time saved is not drafted).
   - Unit tests: the splashback 2.4 to 3.2 m² case; an omission; a six-decimal quantity; an unpriced line; the rounding of minutes.
4. **Repository** `packages/db/src/v2-change-draft-repository.ts`:
   - `preview(context, jobId, { quoteLineId, newQuantity })`: reads the **accepted** quote revision's line and the plan tasks on its scope item, and returns `draftChange(...)`. It writes nothing.
   - `confirm(context, jobId, sessionId, { version: "v2-change-draft-command.v1", commandId, quoteLineId, newQuantity, unitRatePence, description, tasks: [{ taskKey, proposedMinutes }] })`:
     - The actor must be the owner membership `logBuilderExtra` requires.
     - **One transaction.** It writes the variation and its priced revision through the **existing** repository path (`logBuilderExtra` with `price`, the same shape `VariationApplication.command("propose")` builds, `rateProvenance.kind: "human_entered"`), then the two F3 rows. If the F3 insert refuses, the variation rolls back with it. If `logBuilderExtra` can't join an outer transaction, add a `transact`-style overload in the variation repository that takes an open `TenantTransaction`, as `insertPricedVariation` already does (state the mount).
     - A replay with the same body returns the stored draft; a different body is `CHANGE_DRAFT_COMMAND_CONFLICT`.
     - One audit event `v2.change_draft.confirmed`, with references only (variation, revision, line) and the quantities.
   - `revise(...)`: the same, through the existing `revise` action, for the variation's current revision. The new revision gets its own F3 rows.
   - `list(context, jobId)`: each draft with its variation state (draft, priced, approved or rejected), whether an F6 link exists for that revision, and whether its time is on the plan yet (a C3B plan edit names the revision).
5. **Application and route.** `ChangeDraftApplication` (same access as `V2CustomerExtraLinkApplication`); route `apps/web/app/api/jobs/[id]/change-drafts/route.ts` (GET list, POST preview, confirm or revise), with F6's gates; watchdog line `"/api/jobs/[id]/change-drafts": "pre_live_allowed"` (a draft isn't site work, as F6's route isn't).
6. **Screen** `apps/web/app/v2/jobs/[id]/changes/page.tsx` plus `view.tsx`, linked from F6's extra-links page:
   - **Change a quantity:** pick a quote line, enter the new total. The draft shows "Extra 0.8 m² at £X per m² = £Y (you confirm the rate)", "Extra time: Fit and grout the splashback +60 min", "Will need more: Tiles, Adhesive, Grout". Confirm saves it as a priced variation.
   - **Pending changes:** each draft with its state. "Send for approval" opens F6's create-link for that exact revision. After approval, "Add the extra time to the plan" posts C3B's plan edit with the drafted minutes.
   - The agreed scope and the plan never show a pending draft.
   - Text comes from pure helpers tested with `renderToStaticMarkup` (no jsdom).
7. **Lane** `config/lanes/v2-f3.json`. Mounts are each noted: `variation-repository.ts` (only if the transaction overload is needed; owned by main), F6's `extra-links/view.tsx` (one link), `index.ts` exports, `bootstrap.mjs` (one line), `seed.integration.test.mjs` (tests appended), `purchase-order-audit.integration.test.ts` (the `_v2_change_draft.sql` stem and one "table absent" check), and `watchdog.ts` (one line, owned by main).

## Tests
- **Seed tests** (appended):
  1. **Done-when case.** On the practice job, the splashback line goes from 2.4 to 3.2 m². The preview shows 0.8 m² at the line's rate, +60 min on "Fit and grout the splashback", and "Tiles, Adhesive, Grout". The builder confirms. There's now one priced existing-scope variation with `signed_delta_pence` = 0.8 × the rate, half-even, and one F3 draft bound to its revision. Agreed scope, the plan and the tiler's brief are unchanged. An F6 link for that revision shows that exact amount. After the customer agrees, one press adds +60 min to the plan through C3B, and the brief then shows it as outdated.
  2. Revise to 3.0 m²: a new revision and a new draft. The old F6 link is refused (F6's rule), and a fresh link shows the new amount.
  3. An omission (2.4 to 2.0) drafts a negative delta and 0 minutes.
  4. Refusals: an unpriced line without a builder rate; the same quantity; a line from a superseded quote revision; another job's line; a non-owner membership. Each writes nothing, and no variation exists after a refused confirm.
  5. Replay and conflict; UPDATE and DELETE refused; the mismatch trigger refuses a draft whose revision quantity or unit doesn't match.
  6. **Rule 30, firm A/B read check:** the second firm's runtime sees no rows of either table.
  7. Main's variation tables and the `logBuilderExtra` path behave as before (the existing variation tests stay green, unchanged).
- **Rule 29:** the route is under `/api/jobs`, not `/api/v2-backend`. Still prove GET refuses no session, an invalid session and the second firm. If SX #965 isn't on the base, write "Rule 29: pending V2-SX" in "Rules met".
- **Browser:** extend `tools/v2/customer-extra-links.browser.test.mjs` by one case at 360 px: draft the splashback change, confirm, send for approval, agree as the customer, and add the time to the plan.
- Unit tests: the helper (step 3), the zod command, the labels, and the route's failure mapping. Migration proof `2031_v2_change_draft.proof.json`.

## Known limits (to write in the PR)
- Material quantities aren't drafted, only which materials are needed. Pack counts and order differences come with D3/D5 and F4.
- Only a quantity change on one quote line is drafted. A new kind of work is still an ordinary "Log an extra".

## Done when
- On the practice job, changing the splashback from 2.4 to 3.2 m² drafts the price, the extra time and the materials together. Confirm makes one priced variation through the existing path. It stays out of agreed scope and the plan until approved. The F6 link shows that exact version and amount. After approval, one press puts the extra time on the plan.
- CI1 is green, and the Codex check is clean or answered.
