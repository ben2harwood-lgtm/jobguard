# Q34 · V2-K5A-2: stages on custom tasks, and due stages never re-split (Codex's two P2 findings on K5A #929)

> Called **K5A-2**, not K5B. **K5B** is already the planned "deposit and stage invoices drafted and issued" piece in `reviews/v2/V2-completion-roadmap.md` (batch E5, migration 2034).

**Tier:** RED (money). **Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Base:** K5A's branch `codex/sandbox/v2-k5` (#929) at `9dfaabdff` or later. **Branch:** `claude/<thread>`. **PR:** draft **into `codex/sandbox/v2-k5`**, so CI1 runs. **Migration: 2046** (next free becomes 2047). **Planner:** Fable thread, 25 Nov 17:30 UK. A Claude RED plan check has been requested on frm-management-layer#3. Rules 1 to 29 apply, with a "Rules met" list in the PR body.

## Dry-check against `codex/sandbox/v2-k5` @ 9dfaabdff and v2/main @ 63f3af5ab (rule 23)
**Finding 1: custom tasks can't trigger a stage.**
- c2 never saves custom tasks as rows in `app.v2_work_plan_task` (`2002_v2_work_plan.sql` line 25). They exist only in the **effective plan**: `applyWorkPlanEdits` (`packages/db/src/v2-work-plan-edits.ts` lines 63 to 90) builds them from `app.v2_work_plan_edit` rows with `template_task_key = 'custom-scope-item'` (`customWorkPlanTaskKey`, line 12).
- K5A reads and validates triggers against the raw table only, in three places:
  - the `read` task list: `v2-payment-schedule-repository.ts` lines 29 to 32;
  - the `set` validation: lines 75 to 81;
  - the `v2_payment_schedule_task_done` foreign key to `app.v2_work_plan_task`: `2012_v2_payment_schedule.sql`.
- The effective-plan reader is `WorkPlanRepository.read(context, { jobId, quoteRevisionId })` (`v2-work-plan-repository.ts` lines 78 to 86, read only). It opens its **own** `withTenant`, so it can't run inside K5A's transaction.

**Finding 2: an approval that started before a trigger but commits after it re-splits a stage already shown as due.**
- `facts()` (repository lines 167 to 210) orders approvals by `app.variation_approval.created_at` (line 192). It orders due facts by the task-done `recorded_at` (lines 181 to 186), by the schedule's `recorded_at` for acceptance stages, or by the UK date for date stages.
- An approval transaction that began before a task-done commit gets an earlier `created_at`, even though it becomes visible later. `projectPaymentSchedule` (`v2-payment-schedule.ts`, from line 59) replays facts by time, so a later read puts that approval **before** the due fact, and a stage the builder was already shown as due changes amount.

## Fix 1: custom tasks
- Add one exported read that takes an existing client, in `v2-work-plan-repository.ts`: `readEffectivePlan(client, key)`. It is the same body as `read` without the `withTenant` wrapper, so `read` calls it, and it makes no behaviour change. This is the only allowed edit to that c2/c3 file, which is merged on v2/main. Say so in the PR body.
- K5A's `read`, `set` and `recordTaskDone` call `readEffectivePlan` inside their own transaction. The task list and trigger validation use the effective plan's `(scopeItemId, key)`, so `custom-scope-item` tasks are included. A trigger on a task that isn't in the effective plan stays refused with `SCHEDULE_INVALID`.
- **Migration 2046**, which must not change 2012:
  - drop the FK from `app.v2_payment_schedule_task_done` to `app.v2_work_plan_task`;
  - add an FK `(tenant_id, quote_revision_id, scope_item_id) REFERENCES app.quote_line(tenant_id, quote_revision_id, scope_item_id)`, the same as `app.v2_work_plan_edit` in `2003_v2_work_plan_edits.sql`.

  The command validates the key against the effective plan in the same transaction. This is the same V2-only `DO $v2$` wrapper and database-name check as 2012, it's idempotent, and it has a migration note and a proof JSON.

## Fix 2: freeze a stage when it becomes due
- **New table `app.v2_payment_stage_due`** (migration 2046) with these columns: `tenant_id`, `job_id`, `quote_revision_id`, `stage_index`, `command_id`, `due_at`, `amount_pence bigint`, `counted_approval_ids uuid[]`, `recorded_at`.
  - PK `(tenant_id, job_id, quote_revision_id, stage_index)`.
  - FK to `app.v2_payment_schedule`.
  - Forced RLS with the same policy as 2012.
  - The runtime role gets `SELECT, INSERT` only, so the table is immutable (rule 16b, with an executed test).
- **When a row is written** (in the same transaction as the command that makes the stage due, with one audit event `v2.billing_stage.due_frozen`):
  - `set` writes a row for every acceptance-triggered stage;
  - `recordTaskDone` writes a row for every stage whose trigger is that task.

  `amount_pence` is the stage's projected amount at that moment. `counted_approval_ids` holds the approvals visible in that transaction.
- **Projection rule:**
  - A stage with a frozen row shows **exactly** `amount_pence`, never recomputed.
  - An approval whose id isn't in any frozen row's `counted_approval_ids` is treated as arriving **after** every frozen due fact, whatever its `created_at`, so it goes to the stages not yet due.
  - If no stage is left, show "£X approved after the last stage was due. It goes on the final account", as an exact decimal and **ex-VAT** (K5A's labels).
  - Rule 20's job total is unchanged: the accepted quote plus every approved variation.
- **Date-triggered stages** have no command at the moment they become due, so they aren't frozen here. They keep today's `created_at` ordering. The only race left is an approval transaction that spans UK midnight on the stage date. That's logged to **LATER (P3), owned by K5B**: when an invoice is drafted for a stage, K5B freezes its amount. **Plan-check answer (comment 7167877784): acceptable for practice**, with conditions D1 to D3 below.

## Plan-check conditions (GO WITH CONDITIONS, frm-management-layer#3 comment 7167877784, 25 Nov). All must hold before merge.
1. **One snapshot per frozen row.** `amount_pence` and `counted_approval_ids` come from the same approval row set, read once and used for both. Never two queries.
2. **Place approvals by the frozen rows.** Each approval is placed by the first frozen row whose `counted_approval_ids` holds it. Only approvals no frozen row counts use `created_at`. Add a three-stage test where an approval is in row k's set but not row k-1's, and check it lands between due facts k-1 and k.
3. **The money adds up.** On every read, frozen amounts + not-yet-due amounts + any "approved after the last stage" line = rule 20's job total (accepted quote plus every approved variation, ex-VAT). Assert this in each race test, and cross-check against K10.
4. **A removed trigger task stays visible.** If a stage's trigger task leaves the effective plan, `recordTaskDone` refuses, and the stage shows "trigger task removed from the plan". Its amount stays in the total. Test it.
5. **Migration 2046 is limited.** It only drops 2012's FK to `app.v2_work_plan_task` and adds the `quote_line` FK, plus the new table. Grants and policies on `v2_payment_schedule_task_done` stay byte-identical. Same `DO $v2$` wrapper and fence. Test it on a database already holding K5A rows, then run it twice.
6. **Lock order.** `set` and `recordTaskDone` take the existing per-tenant advisory lock before reading approvals or the effective plan. No new lock order.
7. **The work-plan extraction changes nothing.** `readEffectivePlan` is the only edit to `v2-work-plan-repository.ts`. The lane file entry says so, and c2/c3's existing tests pass unchanged.
8. **Audit.** `v2.billing_stage.due_frozen` carries references only (stage index, command id, revision, a hash of the counted ids). One event per frozen row, in the same transaction, none on replay (rule 25).

Date stages:
- **D1.** A date stage's amount reads "due from <date>; amount fixed when invoiced", never styled like a frozen stage.
- **D2.** K5B freezes every stage amount (date stages too) in the same transaction it drafts an invoice, and refuses to draft from an unfrozen projection. This is written into the K5B section of Q11.
- **D3.** Unit test the midnight case: an approval created at 23:59:59 the day before the stage date, read at 00:00:01 and after commit. It documents the known gap.

## Tests (seed tests in `tools/v2/seed.integration.test.mjs`, plus unit tests for the projection)
- A stage on a `custom-scope-item` task can be set, triggered and frozen.
- A trigger on a task that was removed from the effective plan is refused.
- **The race:** open an approval transaction (A), record task done in another transaction (B) and commit B, then commit A. Read: the stage B made due keeps its frozen amount, and A's amount goes to the next stage. Then the same case with no later stage gives the final-account line.
- A replay of `recordTaskDone` writes no second frozen row and no second event. Rollback after insert leaves neither row nor event (rule 25).
- The second firm can't read or write `v2_payment_stage_due` (rule 7).
- The runtime role can't UPDATE or DELETE a frozen row.
- Amounts are exact decimal strings, and K10's total matches.
- Rule 29: the K5A GET route (`apps/web/app/api/jobs/[id]/payment-schedule/route.ts`) is outside `api/v2-backend`, so the SX helper is optional. Run it if SX has merged.

## Done when
CI1 is green three times in a row, a Codex review of the frozen head has been done (rule 27, RED), the plan-check verdict is recorded, and the K5A browser test (`tools/v2/payment-schedule.browser.test.mjs`) still passes on lane B.
