# Q39 · V2-FL-5: firm lock, supplier, practice feed, inbox, sandbox, watchdog, worm, synthetic and simulated

**Builder:** web Codex (lane W). **Base:** `codex/sandbox/v2-fl1` (FL-1, Q35) as soon as it's pushed. **Branch:** `claude/<thread>`. **PR:** draft into `codex/sandbox/v2-fl1`, so CI1 runs; retarget to v2/main after FL-1 merges. **Migration: 2051.** Planner: Fable thread. Runs in parallel with the other FL slices.

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
- RED (tenancy). Builder: Claude Opus thread for FL-1. FL-2 to FL-5 go to Codex (Ben, 25 Nov: keep Codex coding). Codex needs no live database while building: the migration is a list in 2001's pattern, and CI1's seed job is the proof. The checker is Claude (rule 27). Rules 1 to 29 apply. A "Rules met" list goes in the PR body, and a Codex review is required. The merge thread merges once CI is green and the review is clean.

## FL-5 table list (37 tables, all unlocked and runtime-readable in the report)
- `app.inbox_decision_revision`
- `app.inbox_finding_revision`
- `app.inbox_metric_receipt`
- `app.inbox_outcome_event`
- `app.practice_exposure_schedule`
- `app.practice_feed_account`
- `app.practice_feed_command`
- `app.practice_feed_event`
- `app.practice_feed_job_owner`
- `app.practice_feed_receipt_match`
- `app.practice_supplier_credit_case_binding`
- `app.practice_supplier_credit_review_payment`
- `app.supplier_bill_supersession`
- `app.supplier_credit_consumption`
- `app.supplier_document`
- `app.supplier_document_intake`
- `app.supplier_document_version`
- `app.supplier_fact_proposal`
- `app.supplier_fact_revision`
- `app.supplier_line_match_correction`
- `app.supplier_line_match_snapshot`
- `app.supplier_match_allocation`
- `app.supplier_match_proposal`
- `app.supplier_match_revision`
- `app.northside_action_attribution` (indirect, via app.evidence_object, app.evidence_upload)
- `app.sandbox_run`
- `app.simulated_settlement_event`
- `app.synthetic_obligation`
- `app.synthetic_recovery_receipt`
- `app.watchdog_command_identity`
- `app.worm_command`
- `app.worm_synthetic_version`
- `app.sandbox_adapter_receipt` (indirect, via app.sandbox_run)
- `app.sandbox_run_event` (indirect, via app.sandbox_run)
- `app.sandbox_work` (indirect, via app.sandbox_run)
- `app.watchdog_command_result` (indirect, via app.watchdog_command_identity)
- `app.worm_attempt` (indirect, via app.worm_command)

## Done when
- Migration 2051 applies twice cleanly.
- `pending/FL-5.json` is deleted and the guard test still passes.
- The firm A/B checks pass, and CI1 is green.
- A Codex review is clean or answered.
