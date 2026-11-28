# Q58 · V2-K5B-1: draft the deposit or stage invoice when a stage is due (draft only, nothing issued or sent)

**Tier:** RED money. **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** K5A-1 #992 `claude/project-thread-trp08u-k5a1` @ 9fd64c273 (on K5A-2 #961, then K5A #929). **Branch:** the builder thread's own branch, in `config/lanes/v2-k5b1.json`. **PR:** draft into `claude/project-thread-trp08u-k5a1`. **Migration: 2034** (reserved for K5B; final number set at merge). **Plan check:** Astra, frm-management-layer#3, **before** the build is marked ready (Q11 line 15: K5B "goes to Astra before anyone builds it"). The builder may build now on the planner's reading and fold in the verdict. Rules 1 to 30 apply. Planner: 26 Nov 18:45 UK.

## Why split K5B
Q11 line 15: the existing `POST jobs/:id/customer-invoices` only **issues**, and it needs a final-account revision, the Final Check and the full final-account amount. Issuing a deposit or stage invoice needs a new, properly scoped invoice route on the money path. That route, with its invoice number, VAT treatment and the customer send, is **K5B-2**, which needs Ben's decisions on VAT and numbering for stage invoices first (AGENTS §1: "do not invent load-bearing product policy"). **K5B-1** is the safe half: when a stage is due, the builder gets a draft with the exact frozen amount, ready to check. Nothing is issued, numbered, posted or sent.

## The condition carried from the K5A-2 plan check (Q11 line 18, word for word)
"When K5B drafts an invoice for any stage, **including date stages**, it freezes that stage's amount in the **same transaction** as the draft, using K5A-2's `app.v2_payment_stage_due` rules (one approval snapshot for amount and counted ids). It **refuses to draft from an unfrozen projection**. This closes the date-stage midnight race left open by K5A-2."

## Planner reading (Astra please confirm or correct)
1. **Draft means a V2 record only.** One draft per stage, bound to the frozen `v2_payment_stage_due` row (amount and counted approval ids) and its quote revision. It is labelled everywhere "Draft · not an invoice · not sent". It never touches `customer_invoice`, ledger, final-account or fee tables.
2. **Freeze first, then draft, in one transaction.** If the stage is already frozen (a task stage frozen by K5A-2's `recordTaskDone`), the draft uses that row. If it is due by date and not yet frozen, the draft command freezes it through K5A-2's own `freeze()` path in the same transaction. If the stage isn't due yet, it refuses (`STAGE_NOT_DUE`). A draft never reads `projectPaymentSchedule`'s unfrozen amount.
3. **Amounts are net, as K5A holds them.** The draft shows the net stage amount, the counted extras, and "VAT and the invoice number are added when the invoice is issued". It shows no VAT figure, because VAT treatment for stage invoices is K5B-2's decision.
4. **A draft can be withdrawn but never edited.** Withdrawing writes a withdrawal row, and a fresh draft can then be made. The frozen amount doesn't change: K5A-2's rule that due stages are never re-split still holds.

## Dry-check against `claude/project-thread-trp08u-k5a1` @ 9fd64c273 (rule 23)
- `packages/db/migrations/2012_v2_payment_schedule.sql`: `app.v2_payment_schedule` (PK `(tenant_id, job_id, quote_revision_id)`, `stages`).
- `packages/db/migrations/2046_v2_payment_stage_due.sql`: `app.v2_payment_stage_due` (`stage_index` 0 to 19, `due_at`, `amount_pence`, `counted_approval_ids`; PK `(tenant_id, job_id, quote_revision_id, stage_index)`); SELECT and INSERT only.
- `packages/db/src/v2-payment-schedule-repository.ts`:
  - `read()` (line 24) and `projectPaymentSchedule(...)` with `frozen` (line 35);
  - `facts()` (line 179), where date stages become due (line 201);
  - `frozenRows()` (line 246);
  - `freeze(db, total, saved, indexes, …)` (lines 255 to 275), with one audit event `v2.billing_stage.due_frozen` each;
  - the K5A-1 shared approved-extras function (`packages/db/src/v2-approved-extras.ts`, from Q51).
- `apps/web/app/api/jobs/[id]/payment-schedule/route.ts` and `apps/api/src/workspace/payment-schedule.application.ts`: the gates to copy.
- `apps/api/src/customer-invoice.controller.ts` (main): issue only. **Not called or changed.**

## Build
1. **Migration 2034** `packages/db/migrations/2034_v2_stage_invoice_draft.sql`, with its note and proof file. Use the V2 fence, plus `to_regclass('app.v2_payment_stage_due') IS NULL` → RETURN.
   - `app.v2_stage_invoice_draft`:
     - columns `tenant_id`, `job_id`, `quote_revision_id`, `stage_index`, `draft_no integer` (1, 2, … per stage), `command_id`, `amount_pence bigint` and `counted_approval_ids uuid[]`, `actor_membership_id`, `recorded_at`;
     - the two copied columns must equal the frozen row, and a trigger checks that;
     - PK `(tenant_id, job_id, quote_revision_id, stage_index, draft_no)`; UNIQUE `(tenant_id, command_id)`;
     - FK `(tenant_id, job_id, quote_revision_id, stage_index)` → `v2_payment_stage_due`, so a draft can't exist without a frozen stage. The database enforces the "no unfrozen draft" rule.
   - `app.v2_stage_invoice_draft_withdrawal`: `tenant_id`, `job_id`, `quote_revision_id`, `stage_index`, `draft_no`, `command_id`, `actor_membership_id`, `reason varchar(200)`, `recorded_at`. PK on the draft key.
   - A trigger refuses a new draft while an earlier draft of the same stage is not withdrawn.
   - Both tables: RLS enabled and forced; the 2046 runtime policy pattern; `GRANT SELECT, INSERT` to `jobguard_runtime`; immutable trigger. No SECURITY DEFINER function.
   - Run it twice; the second run changes nothing.
2. **Bootstrap.** Add the 2034 line after the 2046 line (rule 30: above FL-6's 2054 if present).
3. **Repository.** Extend `PaymentScheduleRepository`, a K5B-1 mount owned by K5A:
   - `draftStage(context, jobId, sessionId, { version: "v2-stage-draft-command.v1", commandId, stageIndex })`:
     - one `withTenant` transaction;
     - the actor check is the same as `set()`;
     - take the same job lock order K5A-2's `recordTaskDone` uses;
     - if the stage has a frozen row, use it. Otherwise, if `facts()` says it is due now, call `freeze()` for that index in this transaction and use the new row. Otherwise refuse with `STAGE_NOT_DUE`;
     - insert the draft from the frozen row's columns only;
     - a replay with the same body returns the stored draft; a different body is `STAGE_DRAFT_COMMAND_CONFLICT`;
     - write one audit event `v2.billing_stage.draft_made`, with references and the amount.
   - `withdrawDraft(…)` follows the same pattern and writes `v2.billing_stage.draft_withdrawn`.
   - `read()` adds `drafts[]` per stage: draft number, amount, counted extras, made at, and withdrawn.
4. **Route.** Extend `apps/web/app/api/jobs/[id]/payment-schedule/route.ts` with POST bodies `v2-stage-draft-command.v1` and `v2-stage-draft-withdraw-command.v1`. Keep the same gates. No new watchdog line, because it's the same route.
5. **Screen.** On the K5A payment schedule screen, each due stage shows "Make draft invoice". A draft shows these lines:
   - "Draft · not an invoice · not sent";
   - the stage name;
   - "£X net";
   - "Includes extras: …";
   - "VAT and the invoice number are added when it is issued. Issuing comes next.";
   - a Withdraw button.
   Text comes from pure helpers tested with `renderToStaticMarkup`.
6. **Lane** `config/lanes/v2-k5b1.json`. Note each mount on K5A-owned files: `v2-payment-schedule-repository.ts`, the route, the application, the screen, `bootstrap.mjs`, `seed.integration.test.mjs`, and `purchase-order-audit.integration.test.ts` (the stem and one "table absent" check).

## Tests
- **Seed tests**, appended, with K5A's fixed clock:
  1. **Done-when case.** On the practice job, the 25% deposit stage is due on acceptance and frozen by K5A. Make a draft. Its amount equals the frozen row, and the counted ids match. Withdraw it and draft again (draft 2), with the same amount.
  2. **Date stage, the midnight case.** A date stage due today and not yet frozen. One transaction approves an extra; the draft command runs in another, before and after UK midnight. Exactly one frozen row exists. The draft equals it, and the extra is counted only if its approval committed before the freeze.
  3. A stage not due yet is refused with `STAGE_NOT_DUE`, and nothing is frozen or drafted.
  4. A second draft while one is live is refused.
  5. The database refuses a draft for a stage with no frozen row (FK), and a draft whose amount differs from the frozen row (trigger).
  6. Replay and conflict. UPDATE and DELETE are refused.
  7. Nothing else moved. Before and after, `customer_invoice`, ledger and final-account tables have identical counts.
  8. **Rule 30, firm A/B read check:** the second firm's runtime sees no rows of either table.
- **Rule 29:** same route as K5A. Add the no-session, invalid-session and second-firm refusals for the new POST bodies. If SX #965 isn't on the base, write "Rule 29: pending V2-SX".
- **Unit tests:** the zod commands, the labels, and the failure mapping. Migration proof `2034_v2_stage_invoice_draft.proof.json`.

## For Ben, later (K5B-2, not this piece)
Issuing a stage invoice needs his choice of VAT treatment and invoice numbering for deposit and stage invoices, and whether the final invoice nets them off. The planner will put those on a card when K5B-1 merges. K5B-1 needs none of them.

## Done when
- On the practice job, a due deposit or stage has a "Draft · not an invoice" with the exact frozen amount and the extras it counts. A date stage is frozen in the same transaction as its draft.
- No draft can exist without a frozen stage, and nothing is issued, posted or sent.
- CI1 is green, and the Codex check is clean or answered.

## Claude plan check, 27 Nov (stands in for Astra under Ben's 13:27 UK rule): PASS WITH CONDITIONS
1. `freeze()` (v2-payment-schedule-repository.ts lines 256 to 269 on the base) counts every approval visible **now** (`countedApprovalIds: approvalIds`). For a date stage that went due earlier, `draftStage` must freeze at the **due moment** from `facts()` (London midnight, capped at the schedule start), passed as `at`, and count only approvals created before it. Otherwise extras approved after the due date leak into the stage, and the draft differs from what the screen showed.
2. Seed test 2: an extra counts only if it was created before the due moment **and** committed before the freeze. Add a case that drafts a date stage days after it went due, with an extra approved in between; the draft equals the projection shown before the press.
3. The same applies to an acceptance stage from before 2046 with no frozen row: it freezes at the schedule start, not at the draft time.
