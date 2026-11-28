# 2046 V2-K5A-2 custom-task stages and frozen due amounts

Working planning data only, like 2012. Nothing here drafts, issues or sends an
invoice or moves money. K5B stays responsible for invoices.

Fix 1. c2 keeps custom-scope-item tasks only in the effective plan (edits over
the stored template tasks), so 2012's foreign key from
`app.v2_payment_schedule_task_done` to `app.v2_work_plan_task` refused them.
2046 drops that one foreign key and adds a foreign key to the accepted scope line
`app.quote_line (tenant_id, quote_revision_id, scope_item_id)`, the same target
as `app.v2_work_plan_edit` in 2003. The set and task-done commands check the
trigger against the effective plan, read in their own transaction after the
existing per-tenant advisory lock. Grants and policies on the task table are not
touched.

Fix 2. New table `app.v2_payment_stage_due`, one row per stage when it becomes
due: acceptance stages when the schedule is set, task stages when the task is
confirmed. `amount_pence` and `counted_approval_ids` come from one read of the
approvals. The projection shows a frozen stage's stored amount exactly and
places each approval by the first frozen row that counts it; approvals no frozen
row counts come after every frozen due fact. Date stages are not frozen here;
K5B freezes every stage, date stages too, when it drafts an invoice.

Runtime grants: SELECT and INSERT only. UPDATE, DELETE and TRUNCATE are never
granted. RLS is enabled and forced with the same tenant helper and parent-job
visibility as 2012. Each frozen row appends one `v2.billing_stage.due_frozen`
tenant-chain event carrying references only, in the command's transaction; a
replay appends nothing.

Same V2-only `DO $v2$` wrapper and database-name and firm-policy fence as 2012,
so the shared runner changes nothing elsewhere. Bootstrap applies it after 2012.
Idempotent: rerunning finds no old foreign key, keeps the new one and the table.
No backfill: K5A schedules saved before 2046 keep the time-ordered projection
for their existing due stages. Shared catalogue proofs are empty because those
databases have no V2 table; the V2 seed tests exercise grants and RLS.
Forward-fix in a later migration. Do not drop frozen rows or audit history.

Firm lock (Q83, edited in place before merge): `app.v2_payment_stage_due` also
carries the restrictive `v2_practice_firm` policy (FOR ALL, TO jobguard_runtime,
joined to `app.job`), the same as the other V2 tables, so v2/main's FL guard
holds. Rerunning drops and re-creates the policy.
