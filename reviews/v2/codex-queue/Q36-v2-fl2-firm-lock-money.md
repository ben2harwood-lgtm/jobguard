# Q36 · V2-FL-2: firm lock, money: extras, final account, billing, fee, cap, close-out

**Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Base:** `codex/sandbox/v2-fl1` (FL-1, Q35) as soon as it's pushed. **Branch:** `codex/sandbox/v2-fl2`. **PR:** draft into `codex/sandbox/v2-fl1`, so CI1 runs; retarget to v2/main after FL-1 merges. **Migration: 2048.** Planner: Fable thread. Runs in parallel with the other FL slices.

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
    - use the seed suite's `admin` pool (`migrationUrl`, `tools/v2/seed.integration.test.mjs` line 22). If a table trigger refuses the owner insert, record it under "Definer writes, for FL-F" and test that table through a sibling table in the same family;
    - label each insert with a `// fixture: <command> is fenced on V2` comment;
    - give it values that pass the table's own constraints and FKs.
    Then run the **read checks** through `jobguard_runtime` with each firm's practice session. That's the proof that counts. Never add fixture rows in a migration, and never retarget a fenced function in an FL slice.
  - **Still stop and ask:** a lock that breaks an existing seed or main test, unless a V2-only policy fixes it (never change main's migrations, grants or RLS); or a table in your list that no longer matches the catalog.
- **Not blocked on FL-F.** FL-2 to FL-5 resume now. They don't wait for the definer report.
- RED (tenancy). Builder: Opus 5.5 (Ben, 25 Nov 19:53 UK).  Rules 1 to 29 apply. A "Rules met" list goes in the PR body, and an other-vendor review is required (Claude checks Codex's build). The merge thread merges once CI is green and the review is clean.

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
