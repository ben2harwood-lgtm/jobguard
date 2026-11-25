# Q36 · V2-FL-2: firm lock, money: extras, final account, billing, fee, cap, close-out

**Builder:** desktop Codex (lane A). **Base:** `codex/sandbox/v2-fl1` (FL-1, Q35) as soon as it's pushed. **Branch:** `codex/sandbox/v2-fl2`. **PR:** draft into `codex/sandbox/v2-fl1`, so CI1 runs; retarget to v2/main after FL-1 merges. **Migration: 2048.** Planner: Fable thread. Runs in parallel with the other FL slices.

## Shared rules for every FL slice (FL-1 to FL-5)
- **Why.** V2's two linked practice firms share one tenant (`11111111-…`). Main's tenant RLS doesn't separate them. Only `v2_practice_firm` policies do. The Q35 catalog run (report: `/mnt/project-files/jobguard-v2/v2-fl-catalog-stop-2026-11-25.md`, read on PX #964 @ b1b0bf11) found 282 `app` tables with `tenant_id` + `job_id`. 24 are locked, and **162 are unlocked and readable by `jobguard_runtime`**. A further 16 indirect tables are unlocked and readable.
- **Pattern** (dry-checked on v2/main @ 63f3af5ab, `tools/v2/migrations/2001_practice_quote.sql`):
  - Lines 1 to 17: `DO $v2$` wrapper plus the database-name and data-directory fence. Copy them exactly.
  - Lines 45 to 52: for each direct table, `CREATE POLICY v2_practice_firm ON <t> AS RESTRICTIVE FOR ALL TO jobguard_runtime USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(<t>.tenant_id,<t>.job_id)))`, created only when `pg_policy` lacks it.
  - Lines 55 to 57: for an indirect table, use `EXISTS` through its named parent's key, the same way `capture_source` goes through `job_record_proposal`.
- **Each slice's migration** touches only its own list below. It changes no grants, no other policies and nothing in main's migrations. It is applied on a database already holding V2 rows, then applied a second time with no change.
- **Each slice's proof** lives in its own file, `tools/v2/firm-lock/FL-<n>.checks.mjs`, which the FL-1 loader runs from the seed suite. It holds one firm A/B check per table family, using real commands: firm A's session sees its own row, and firm B's session sees zero rows for the same job.
- **Each slice deletes its own pending file**, `tools/v2/firm-lock/pending/FL-<n>.json`, so the guard test then enforces it. No slice edits another slice's files, so FL-2 to FL-5 can run in parallel without conflicts.
- **Stop and ask:** a lock that breaks an existing seed or main test, unless a V2-only policy fixes it (never change main's migrations, grants or RLS); a command that writes through a SECURITY DEFINER function and so isn't covered by the lock (report it to FL-F); or a table in your list that no longer matches the catalog.
- RED (tenancy). Builder: Claude Opus thread for FL-1. FL-2 to FL-5 go to Codex (Ben, 25 Nov: keep Codex coding). Codex needs no live database while building: the migration is a list in 2001's pattern, and CI1's seed job is the proof. The checker is Claude (rule 27). Rules 1 to 29 apply. A "Rules met" list goes in the PR body, and an other-vendor review is required (Claude checks Codex's build). The merge thread merges once CI is green and the review is clean.

## FL-2 table list (34 tables, all unlocked and runtime-readable in the report)
- `app.billing_allocation_run`
- `app.billing_application_event`
- `app.billing_export_batch`
- `app.billing_export_delivery`
- `app.billing_export_line`
- `app.billing_fact`
- `app.billing_line_match`
- `app.billing_quarantine`
- `app.billing_status_import`
- `app.cap_snapshot`
- `app.closeout_answer`
- `app.extra_approval_outcome`
- `app.extra_approval_request`
- `app.extra_approval_revision_binding`
- `app.extra_approval_step_fact`
- `app.extra_client_link`
- `app.extra_duplicate_link`
- `app.extra_escalation_fact`
- `app.extra_event`
- `app.extra_order_line_link`
- `app.extra_origin`
- `app.extra_pack_artifact`
- `app.extra_pricing_basis`
- `app.extra_sor_revision`
- `app.fee_illustration_source`
- `app.final_account_draft`
- `app.final_account_invoice_binding`
- `app.final_account_invoiced_line`
- `app.final_account_line`
- `app.final_account_lock`
- `app.final_account_lock_check`
- `app.final_account_revision`
- `app.final_account_scope_disposition`
- `app.extra_client_link_closure` (indirect, via app.extra_client_link)

## Done when
- Migration 2048 applies twice cleanly.
- `pending/FL-2.json` is deleted and the guard test still passes.
- The firm A/B checks pass, and CI1 is green.
- The Claude check is clean or answered.
