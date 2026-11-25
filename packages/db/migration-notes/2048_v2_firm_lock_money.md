# 2048 · V2 firm lock, money and extras (Q36 / V2-FL-2, RED)

The V2 bootstrap applies this file after 2047. It copies 2001's database-name,
port and data-directory fence verbatim and requires the root job firm policy.
It adds only missing `v2_practice_firm` restrictive policies: 33 direct joins
to `app.job` on `(tenant_id, job_id)`, and `extra_client_link_closure` through
`extra_client_link` on `(tenant_id, link_id)`. The proof manifest lists all 34
packet tables. No existing policy, grant, routine, main migration or stored
business row changes. Existing ENABLE/FORCE RLS and tenant policies remain.
There is no new table or main migration to add to the purchase-order-audit
migration deferral list. No command implementation changes, so command audit,
replay and forced-failure tests are not new acceptance assertions for this slice.

The full seed suite discovers `tools/v2/firm-lock/FL-2.checks.mjs` using FL-1's
loader. It reuses both cached practice sessions and the admin pool supplied by
the suite. Fenced contractor commands use test-only admin fixtures, constrained
by the existing FKs and triggers, never new fixture routines or relaxed guards.
Both firms get separate job-bound billing and approval graphs; every runtime
positive control must see its own fixture and none of the other firm's fixture.
The indirect closure has its own populated positive control. Firm B's INSERT
onto firm A's final-account draft must fail with RLS SQLSTATE 42501; UPDATE
and DELETE must be refused and leave the persisted draft unchanged. Final-account
assembly and fee illustration use the existing application services on a fresh
seeded live job. The original fixture cap supplies the cap positive control.
All nine billing tables, eight direct extra tables, the closure, the draft,
revision, lines, fee source and cap have mandatory populated controls (23 tables).
The other tables still receive the shared family read checks and the catalog
policy check, with explicit `policy present, no row proof` diagnostics if empty.

The remaining owner-guarded cases are represented by siblings in their family:
closeout requires the completed visit/receipt/audit guard; duplicate and order
links require their exact raising/link audits; pack artifacts require an extra
source pack bound to the origin hash; SoR/pricing requires the same-transaction
work-order origin, price, basis and raising audit. Final lock/check/invoice and
scope disposition require their frozen final review, proof statement, terms,
audit/receipt and invoice bindings. These are not positive row proofs for those
11 tables, nor proof of the definer authority checks. Those limitations must
remain visible in CI diagnostics and review; no empty-table result is claimed
as independent verification. No trigger is disabled or fenced writer retargeted.

The reapplication test snapshots all policies, role ACLs and RLS flags on these
tables, reapplies 2048 twice after fixture/application writes, and requires an
identical catalog. FL-2's pending file is removed so the existing catalog guard
now enforces every table. Shared-file change: only FL-2's bootstrap block added.

Forward fix: a separately reserved V2 migration. Rollback, if explicitly needed
on an isolated rehearsal database, drops only the 34 policies listed in this
migration's manifest. Main's schema and data are unaffected.

## Definer writes, for FL-F

Source inspection of the installed migration definitions found these owner
writers into this slice. Restrictive policies apply to runtime directly, not
to owner execution. This list is for Q40, not an authority pass:

- `advance_final_account_draft` (0766): draft pointer.
- `create_fee_illustration_source` (0749): fee source.
- `issue_practice_customer_invoice`, `issue_lock_bound_customer_invoice` (0764): invoice bindings and invoiced lines.
- `record_legacy_builder_origin` (0765), `confirm_final_check_catch` (0749): origins.
- `record_final_account_disposition` (0749): scope disposition.
- `lock_final_account` (0735): final lock.
- `ent3b_complete_visit`, `ent3b_close_abandoned_visit` (0749): closeout.
- `ent3c_record_sor_revision` (0749): SoR and pricing basis.
- `xa_submit` (0749), `xa_price` (0752): approval revision binding.
- `xa_approve` (0749): approval step/outcome.
- `xa_withdraw` (0749): approval outcome.
- `xa_mark_duplicate` (0749): duplicate link and outcome.
- `xa_issue_link` (0749): client link and replaced-link closure.
- `xa_revoke_link` (0749): client-link closure.
- `xa_client_decide` (0749): step, outcome and closure.
- `xa_escalate` (0749), `lp6d_xa_escalate` (0765): escalation.
- `lp_command` (0749): event and origin.
- `cb_export` (0243): export batch/line and extra event.
- `cb_ingest` (0322): status import, fact, match and quarantine.
- `cb_derive` (0748): allocation run, application event and quarantine.
- `cb_delivery` (0727): export delivery.
- `ef_reconcile_exported_duplicate` (0520): duplicate link.
- `store_extra_pack_artifact` (0744): pack artifact.

## Builder validation and remaining gates

Local: `pnpm typecheck --concurrency=2` passed (8 tasks, 5 cached);
`LANE_BASE_REF=origin/codex/sandbox/v2-fl1 pnpm lint --concurrency=2` passed
(8 tasks, 5 cached); lane lint against that same base passed;
`node --test --test-concurrency=2 tools/v2-local.test.mjs tools/v2-mac.test.mjs`
passed 53/53, none skipped. Node 24.17.0, pnpm 10.28.1. Turbo emitted cache-write
permission warnings but both check commands exited zero. The first lint run
used the default main base and failed on inherited V2 files; the required FL-1
base run passed. No checks were weakened.

PostgreSQL/bootstrap/seed/migration reapplication, full CI1 and main regressions
are pending GitHub CI, since this sandbox cannot start PostgreSQL or bind ports.
No browser/page change; no new route or capability, and no new browser proof.
This is builder source inspection and local test execution, not independent
acceptance. Claude must review the frozen pushed head. Astra plan check remains
pending. Rework risk: medium (new fixture graph awaits PostgreSQL execution).
