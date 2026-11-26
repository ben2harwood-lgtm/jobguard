# 2051 · Q39 / V2-FL-5 (RED tenancy)

The V2 bootstrap applies this migration after FL-1 (2047), before seeding.
It copies 2001's exact database/data-directory fence and requires the job firm policy.
Only the 37 Q39 tables change: 31 direct job joins and six indirect full-key parent joins.
No grants, functions, permissive policies, main migrations, ports or settings change.

Northside attribution follows either its evidence object or upload. Other attribution kinds
have no job reference and fail closed to runtime. FL-F owns any wider callable path.
Sandbox children follow sandbox_run; watchdog results follow watchdog_command_identity;
worm attempts follow worm_command. Parent policies remain restrictive.

## Verification and limits

`tools/v2/firm-lock/FL-5.checks.mjs` is discovered by the existing full seed loader.
It registers nine families (all 37 targets), checks catalog/FORCE RLS, populated sandbox
parent and children for both firms, exposure SELECT/INSERT/UPDATE/DELETE refusal, and
first installation over populated data plus replay in a rolled-back transaction.
It compares rows, policies and ACLs before and after both applications.
The shared helper explicitly diagnoses empty tables as "policy present, no row proof";
catalog coverage is not populated-row evidence. The other family rows depend on the full
seed suite; any emitted no-row diagnostics remain a limitation for the checker.
No business command is added or changed, so command audit/replay/rollback rules are N/A.
Test-only owner fixtures have no V2 command route and do not disable checks or triggers.
PostgreSQL, full seed, migration and browser execution are pending CI, not claimed here.

## Definer writes, for FL-F

Source inspection of SQL bodies found the following writers. This conservative text
inventory is not a live catalog/grant or firm-authorization verdict. Later dynamic or
indirect writer paths require FL-F's independent callable-path review.

- `app.answer_job_proof_statement` (0734_job_proof_statement.sql): `app.watchdog_command_identity`.
- `app.ch4_work_state_command` (0749_lp6d_remaining_routines.sql): `app.watchdog_command_identity`.
- `app.configure_recovery_demo` (0749_lp6d_remaining_routines.sql): `app.synthetic_recovery_receipt`.
- `app.lp6d_customer_message_source` (0749_lp6d_remaining_routines.sql): `app.watchdog_command_identity`.
- `app.northside_capture_action` (0167_northside_run_attribution.sql): `app.northside_action_attribution`.
- `app.pf1b_review_supplier_credit` (0749_lp6d_remaining_routines.sql): `app.practice_supplier_credit_case_binding`, `app.practice_supplier_credit_review_payment`, `app.supplier_credit_consumption`.
- `app.record_simulated_settlement` (0723_lp6c_money_binding.sql): `app.simulated_settlement_event`.
- `app.sv7a_intake_job_source` (0749_lp6d_remaining_routines.sql): `app.watchdog_command_identity`.
- `app.switch_job_live` (0723_lp6c_money_binding.sql): `app.synthetic_obligation`.
- `app.worm_claim` (0765_lp11_bound_tenant_rls.sql): `app.worm_attempt`, `app.worm_command`.
- `app.worm_finish` (0765_lp11_bound_tenant_rls.sql): `app.worm_attempt`, `app.worm_command`.
- `app.worm_submit` (0749_lp6d_remaining_routines.sql): `app.worm_command`.

## Recovery

Forward fix with a later reserved V2 migration. On a disposable rehearsal database only,
rollback removes v2_practice_firm from exactly the proof manifest's 37 tables and restores
FL-5's pending entry; do not restore access on a shared or deployed environment.
No row backfill or data deletion. No new operational alert.

Rework risk: medium. Database execution and other-vendor review remain outstanding.
Not ready for Ben: waiting for Astra's plan check.
