# Q35 · V2-FL-1: firm lock, V2 core: v2 work plan, job, quote, variation, customer, scope, proposal

> Q35 was split on 25 Nov 17:45 UK after its builder hit stop rule 3 (258 unlocked tables; report `/mnt/project-files/jobguard-v2/v2-fl-catalog-stop-2026-11-25.md`). **FL-1 carries the guard test and runs first.** FL-2 to FL-5 (Q36 to Q39) start as soon as FL-1's branch is pushed, and run in parallel. FL-F (Q40) reviews the definer functions.

**Builder:** Claude Opus thread (it needs a live V2 database to build the guard). **Base:** PX branch #964 @ b1b0bf11, or v2/main once PX has merged. **Branch:** `codex/sandbox/v2-fl1`. The `codex/sandbox/v2-*` name matters, because it makes CI1 run on the stacked FL-2 to FL-5 PRs (ci.yml lines 138 to 142). **PR:** draft into v2/main. **Migration: 2047.** Planner: Fable thread.

## FL-1 also builds the guard (the real fix)
1. **Guard test** in the seed suite. It queries the catalog and fails when an `app` table with `tenant_id` + `job_id` (or an indirect table from the report's list) passes all three of these:
   - it lacks `v2_practice_firm`;
   - `jobguard_runtime` has any of SELECT, INSERT, UPDATE or DELETE on it (`has_table_privilege`);
   - it is not named in a file under `tools/v2/firm-lock/pending/`.
   It prints every failing table.
2. **Pending files.** Create `tools/v2/firm-lock/pending/FL-2.json` to `FL-5.json`, each holding exactly that slice's table list from Q36 to Q39. Copy them from those packets; don't regenerate them.
3. **Tables with no runtime grant** (96 direct, 6 indirect in the report) pass the guard because they have no privilege, not because they are on a list. If a later migration grants runtime access to one, the guard fails. Prove that by granting SELECT on one in a scratch run, and show the run in the PR.
4. **Prove the guard bites.** Drop one FL-1 policy in a scratch run, show the guard fails, and show it in the PR.
5. **Loader.** The seed suite imports every `tools/v2/firm-lock/FL-*.checks.mjs` in name order. CI1 already runs the seed file (ci.yml line 184), so no CI change is needed.

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
- RED (tenancy). Builder: Claude Opus thread for FL-1. FL-2 to FL-5 go to Codex (Ben, 25 Nov: keep Codex coding). Codex needs no live database while building: the migration is a list in 2001's pattern, and CI1's seed job is the proof. The checker is Claude (rule 27). Rules 1 to 29 apply. A "Rules met" list goes in the PR body, and a Codex review is required. The merge thread merges once CI is green and the review is clean.

## FL-1 table list (39 tables, all unlocked and runtime-readable in the report)
- `app.customer_credit_note`
- `app.customer_invoice`
- `app.customer_message_source`
- `app.customer_payment`
- `app.customer_payment_reversal`
- `app.job_activation`
- `app.job_activation_terms`
- `app.job_assignment`
- `app.job_commercial_track`
- `app.job_diary_entry`
- `app.job_finding`
- `app.job_import_v3`
- `app.job_party_binding`
- `app.job_party_current`
- `app.job_site_source_receipt`
- `app.job_small_trip_event`
- `app.job_small_trip_observation`
- `app.job_source_original`
- `app.job_work_state_event`
- `app.proposal_review`
- `app.proposal_review_line`
- `app.proposal_review_line_parent`
- `app.proposal_review_question`
- `app.quote_acceptance_sequence`
- `app.quote_version`
- `app.scope_lineage`
- `app.scope_progress`
- `app.v2_work_plan`
- `app.v2_work_plan_edit`
- `app.v2_work_plan_task`
- `app.variation`
- `app.variation_approval`
- `app.variation_rate_observation`
- `app.variation_rejection`
- `app.variation_revision`
- `app.variation_withdrawal`
- `app.finding_suppression` (indirect, via app.job_finding)
- `app.job_link` (indirect, via app.job_party_binding)
- `app.quote_delivery_event` (indirect, via app.quote_send)

## Done when
- Migration 2047 applies twice cleanly.
- The guard test passes, and the PR shows it failing for both a dropped policy and a new grant.
- The firm A/B checks pass, and CI1 is green.
- A Codex review is clean or answered.
