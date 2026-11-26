# 2049 · V2 firm lock, orders and site (Q37 / V2-FL-3, RED)

The V2 bootstrap alone loads this migration after 2047. The database-name,
server and data-directory fence is copied verbatim from 2001. It requires
2001's job firm policy. Thirty direct tables join the firm's visible job by
(tenant_id, job_id). Three indirect tables join their FK parent:
stage_review_event → stage_completion; import_row_receipt and
work_order_revision → work_order. The proof JSON is the exact 33-table scope.

Each policy is RESTRICTIVE, FOR ALL, TO jobguard_runtime. USING also supplies
WITH CHECK. Existing ENABLE/FORCE RLS, grants and other policies stay intact.
No business command, function, main migration or production setting changes.
No new table: purchase-order-audit's main-runner deferral list is inapplicable;
2049 lives outside that runner, just as 2047 does. A forward fix uses a later
reserved V2 migration. Rollback on a rehearsal database only would remove
these 33 v2_practice_firm policies; it would reopen the firm boundary and is
not a release remedy.

## Proof and limits

FL-3.checks.mjs is discovered by FL-1's existing seed-suite loader. It checks
all 33 tables' forced RLS and policy shape, reruns 2049 twice on populated
rows (full row, grant and policy snapshots unchanged), calls registerFirmChecks
for each family, and requires at least one firm A row in every family. It
checks INSERT/UPDATE/DELETE refusal and unchanged counts using scheduling
facts, through both the second practice firm and its own real company.

FL-3.fixtures.mjs uses the seed admin pool only in the test, retaining every
constraint and trigger. It creates landing and contractor allocation parents. The separate FL-3
seed block calls the real materials, order-draft and supplier delivery intake
commands for the purchase-order/goods-receipt rows. Scheduling and commercial fixtures are made
for both firms; the second firm's job is created through the existing capture
command with the suite's cached sign-in. Isolation reads always use runtime
with the real practice sessions. No extra sign-in, retargeted function,
fixture migration, send or paid AI call is introduced.

Some tables have no executable row proof here. registerFirmChecks reports
each as "policy present, no row proof"; these are covered by the full FL-1
catalog guard and FL-3's catalog test only. In particular, checked contractor
party records refuse the owner fixture, so the contractor family uses a
sibling receipt allocation. Prevention's checked actor gate similarly
refuses the owner fixture; scheduling is the site's sibling proof. Neither
refusal is treated as proof of a successful command. The import baselines,
late source, manual/placed orders, discrepancy rows, legacy readiness rows,
stages, work-order children and customer receipt allocations may remain
policy-only; the executed seed output must be used in the PR, never guessed
row counts. Real command replays/audit are unchanged, so rules 7/25 add no new
business-command audit obligation in this policy-only packet.

PostgreSQL, the full seed suite, double-apply and CI1 cannot run in this
sandbox. These checks are authored, not executed database evidence. No
browser/UI change. CI1, a Claude review naming the router's committed head,
and Astra's plan check remain required. The remote FL-1 base advanced from
this checkout's parent; the router must merge it before final CI/review.

## Definer writes, for FL-F

Source inspection found the following writers (latest matching source body;
not a live catalog inventory or a claim of firm checks inside the routine).
The policies constrain runtime SQL; SECURITY DEFINER operations keep their
own authority and are deliberately unchanged for Q40 / FL-F.

```text
app.adopt_in_flight_job [0521_lp5a_commands.sql]: app.imported_job_baseline
app.approve_synthetic_landing [0749_lp6d_remaining_routines.sql]: app.landing_allocation
app.bind_contractor_parties [0749_lp6d_remaining_routines.sql]: app.contractor_party_binding
app.cb_derive [0748_billing_policy_hold_projection.sql]: app.contractor_receipt_line_allocation
app.ent3b_close_abandoned_visit [0749_lp6d_remaining_routines.sql]: app.site_visit
app.ent3b_complete_visit [0749_lp6d_remaining_routines.sql]: app.site_visit
app.ent3b_start_visit [0749_lp6d_remaining_routines.sql]: app.site_visit
app.import_batch_record [0749_lp6d_remaining_routines.sql]: app.import_row_receipt
app.import_late_source [0749_lp6d_remaining_routines.sql]: app.late_source_import
app.lp11_readiness_worker [0765_lp11_bound_tenant_rls.sql]: app.scheduled_readiness_proposal
app.reverse_synthetic_landing [0749_lp6d_remaining_routines.sql]: app.landing_reversal
app.work_order_commit [0749_lp6d_remaining_routines.sql]: app.work_order, app.work_order_line, app.work_order_revision
app.write_recovery_allocation [0723_lp6c_money_binding.sql]: app.receipt_line_allocation
```

Owner fixture refusals to carry to FL-F:
- app.require_contractor_party_record (0102): CONTRACTOR_PARTY_RECORD_REQUIRED.
  The test checks the deferred gate and rolls the attempted insert back to a savepoint.
- app.lp8b_prevention_actor (0767): FORBIDDEN / REQUEST_BINDING_REFUSED.
  The test rolls the attempted owner insert back; no fabricated checked receipt.

Rework risk: medium (database execution is deferred).
Not ready for Ben: waiting for Astra's plan check, CI1 and Claude's exact-head check.
