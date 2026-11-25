# Q37 · V2-FL-3: firm lock, orders and site: purchase orders, receipts, landing, work orders, rates, contractor, commercial, discrepancy, site, stage, planned work, materials, readiness, scheduling

**Builder:** desktop Codex (lane A). **Base:** `codex/sandbox/v2-fl1` (FL-1, Q35) as soon as it's pushed. **Branch:** `codex/sandbox/v2-fl3`. **PR:** draft into `codex/sandbox/v2-fl1`, so CI1 runs; retarget to v2/main after FL-1 merges. **Migration: 2049.** Planner: Fable thread. Runs in parallel with the other FL slices.

## Shared rules for every FL slice (FL-1 to FL-5)
- **Why.** V2's two linked practice firms share one tenant (`11111111-…`). Main's tenant RLS doesn't separate them. Only `v2_practice_firm` policies do. The Q35 catalog run (report: `/mnt/project-files/jobguard-v2/v2-fl-catalog-stop-2026-11-25.md`, read on PX #964 @ b1b0bf11) found 282 `app` tables with `tenant_id` + `job_id`. 24 are locked, and **162 are unlocked and readable by `jobguard_runtime`**. A further 16 indirect tables are unlocked and readable.
- **Pattern** (dry-checked on v2/main @ 63f3af5ab, `tools/v2/migrations/2001_practice_quote.sql`):
  - Lines 1 to 17: `DO $v2$` wrapper plus the database-name and data-directory fence. Copy them exactly.
  - Lines 45 to 52: for each direct table, `CREATE POLICY v2_practice_firm ON <t> AS RESTRICTIVE FOR ALL TO jobguard_runtime USING (EXISTS (SELECT FROM app.job j WHERE (j.tenant_id,j.id)=(<t>.tenant_id,<t>.job_id)))`, created only when `pg_policy` lacks it.
  - Lines 55 to 57: for an indirect table, use `EXISTS` through its named parent's key, the same way `capture_source` goes through `job_record_proposal`.
- **Each slice's migration** touches only its own list below. It changes no grants, no other policies and nothing in main's migrations. It is applied on a database already holding V2 rows, then applied a second time with no change.
- **Each slice's proof** lives in its own file, `tools/v2/firm-lock/FL-<n>.checks.mjs`, which the FL-1 loader runs from the seed suite. It holds one firm A/B check per table family, using real commands or the fixture path below: firm A's session sees its own row, and firm B's session sees zero rows for the same job.
- **Each slice deletes its own pending file**, `tools/v2/firm-lock/pending/FL-<n>.json`, so the guard test then enforces it. No slice edits another slice's files, so FL-2 to FL-5 can run in parallel without conflicts.
- **Planner ruling, 25 Nov 18:05 UK (FL-2 and FL-3 round-1 holds). This overrides the old stop item about definer writes.**
  - **Definer writes are not a slice blocker.** If a SECURITY DEFINER function writes to a table in your list, such as `app.xa_revoke_link` (0749 lines 1179 to 1199) into `extra_client_link_closure`, the lock still does its job: it limits what `jobguard_runtime` reads and writes directly. The function runs as its owner, so the lock doesn't reach inside it. List each one you find in the PR body under "Definer writes, for FL-F". Then carry on. FL-F (Q40) decides whether each one checks the firm.
  - **Fixture path on V2.** Use a real command where one works on V2. Where the only command is fenced to `jobguard_synthetic_demo`, such as `app.work_order_commit` (0749 lines 418 to 500), or has no V2 route, create the firm A and firm B rows **inside the test only**:
    - use the seed suite's owner connection, the one the bootstrap uses;
    - label each insert with a `// fixture: <command> is fenced on V2` comment;
    - give it values that pass the table's own constraints and FKs.
    Then run the **read checks** through `jobguard_runtime` with each firm's practice session. That's the proof that counts. Never add fixture rows in a migration, and never retarget a fenced function in an FL slice.
  - **Still stop and ask:** a lock that breaks an existing seed or main test, unless a V2-only policy fixes it (never change main's migrations, grants or RLS); or a table in your list that no longer matches the catalog.
- **Not blocked on FL-F.** FL-2 to FL-5 resume now. They don't wait for the definer report.
- RED (tenancy). Builder: Claude Opus thread for FL-1. FL-2 to FL-5 go to Codex (Ben, 25 Nov: keep Codex coding). Codex needs no live database while building: the migration is a list in 2001's pattern, and CI1's seed job is the proof. The checker is Claude (rule 27). Rules 1 to 29 apply. A "Rules met" list goes in the PR body, and an other-vendor review is required (Claude checks Codex's build). The merge thread merges once CI is green and the review is clean.

## FL-3 table list (33 tables, all unlocked and runtime-readable in the report)
- `app.activation_acceptance_operation_use`
- `app.imported_job_baseline`
- `app.late_source_import`
- `app.material_requirement`
- `app.planned_work_revision`
- `app.property_constraint_fact`
- `app.readiness_decision`
- `app.readiness_snapshot`
- `app.scheduled_readiness_plan`
- `app.scheduled_readiness_proposal`
- `app.site_visit`
- `app.stage_completion`
- `app.stage_review_event` (indirect, via app.stage_completion)
- `app.commercial_integrity_activity_fact`
- `app.commercial_integrity_value_fact`
- `app.contractor_party_binding`
- `app.contractor_receipt_line_allocation`
- `app.counterparty_check`
- `app.discrepancy_finding_revision`
- `app.discrepancy_review_outcome`
- `app.goods_receipt`
- `app.landing_allocation`
- `app.landing_reversal`
- `app.purchase_order_draft`
- `app.purchase_order_manual_attestation`
- `app.purchase_order_placement`
- `app.purchase_order_revision`
- `app.rate_book_observation`
- `app.receipt_line_allocation`
- `app.work_order`
- `app.work_order_line`
- `app.import_row_receipt` (indirect, via app.work_order)
- `app.work_order_revision` (indirect, via app.work_order)

## Done when
- Migration 2049 applies twice cleanly.
- `pending/FL-3.json` is deleted and the guard test still passes.
- The firm A/B checks pass, and CI1 is green.
- The Claude check is clean or answered.
