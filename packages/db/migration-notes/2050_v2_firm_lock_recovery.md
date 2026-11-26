# 2050 · Q38 / V2-FL-4 · firm lock, recovery (RED)

Direct parent: `codex/sandbox/v2-fl1`. Only the checked V2 bootstrap loads this
SQL, after 2047. It preserves 2001's exact database-name/data-directory fence
and requires the job's existing `v2_practice_firm` policy. Nothing in main's
migration runner or migrations changes.

The proof manifest in `tools/v2/migrations/2050_v2_firm_lock_recovery.proof.json`
names the packet's exact 35 tables. Each gets one restrictive
`v2_practice_firm FOR ALL TO jobguard_runtime` policy, created only when missing.
The 32 direct tables join the visible job on `(tenant_id, job_id)`.
`recovery_follow_up_advance` and `recovery_follow_up_owner` join the follow-up
on its full `(tenant_id, id, run_id)` foreign key; `recovery_timeline_signal`
joins the timeline run on `(tenant_id, follow_up_id)`. The follow-up also
binds the run, so an unrelated run cannot make it visible.

No grant, other policy, routine, business row, prompt, route, money calculation
or commercial authorization changes. There are no new business commands:
command-envelope and transactional audit/replay/rollback changes are N/A.
There are no new tables, so main's purchase-order-audit new-table deferral is
N/A. Runtime stays non-owner and existing enabled/FORCE RLS remains in place.
Forward fixes require a later V2 migration. A rehearsal-only rollback drops
these 35 named policies; do not reopen firm reads on a shared running stack.

## Proof and limits

`tools/v2/firm-lock/FL-4.checks.mjs` is loaded by FL-1's existing full seed-suite
loader. It registers four recovery families and all 35 table/key pairs with
`registerFirmChecks`, plus strict positive controls in both firms for 11 tables:
case, claim, case event, legacy approval, demo selection, v1 eligibility,
allocation command, review, managed pursuit, message and message event.
These owner-created, test-only fixtures preserve table constraints, foreign
keys and triggers. Their reads use actual authenticated runtime sessions,
including the other firm's linked practice and real-company contexts.
They prove row visibility, not eligibility, authority or settlement.
The parent jobs reuse `packages/db/test/lp-practice-home-job-fixture.ts`'s
owner-only permit; their firm namespace comes from the authenticated binding's
existing `current_firm_profile_key()`, the same key used by 2001. No new session
or sign-in flow is introduced, and fixture setup does not log that key.

The shared helper reports empty tables as **policy present, no row proof**.
Those diagnostics must remain visible: the other 24 tables have catalog
coverage, not fabricated populated-row evidence. In particular the indirect
follow-up/timeline joins have a full-key catalog check, not a populated-row
claim. The packet's guard enforces all 35 after deletion of `pending/FL-4.json`.

The additional tests assert all packet tables remain in the catalog with
working restrictive locks, second-firm recovery INSERT/UPDATE/DELETE refusal,
and first installation on an already populated database followed by a second
application. The migration test drops only FL-4's own policies inside a test
transaction, recreates them, compares rows/grants/ownership/unrelated policies,
reapplies, then rolls back to restore the original bootstrap policy OIDs.

Database execution, the full V2 seed run, CI1 and exact-head Claude review
remain pending the router. Syntax/source inspection is not database evidence.
There is no changed browser workflow; existing database/browser regressions
must still pass in CI. No sends or paid AI calls are made.

## Definer writes, for FL-F

The new runtime-only policy does not constrain an owner executing a definer
routine. These existing writers were found by source inspection; none is
retargeted, granted, certified firm-safe or blocked on this slice's behalf:

| Routine | Writes in this slice | Definition inspected |
|---|---|---|
| `approve_synthetic_landing` | fee derivation, fee journal | 0749 |
| `reverse_synthetic_landing` | fee derivation, fee journal, review | 0749 |
| `review_invalidated_recovery_evidence` | review | 0018 |
| `configure_recovery_demo` | case, approval, demo selection | 0749 |
| `approve_recovery_case_terms` | case terms approval | 0723 |
| `write_recovery_allocation` | allocation command, line source, review, allocation, reversal | 0723 |
| `write_recovery_payment_payer_mark` | payer mark | 0142 |
| `pf1b_review_supplier_credit` | v3 eligibility review, claim line | 0749 |
| `final_check_open_catch_case` | case, case event | 0282 |
| `final_check_claim_catch_case` | claim revision | 0502 |
| `assess_recovery_attribution` | attribution command; calls the invoker append primitive for revision/reassessment | 0383, 0277 |
| `record_recovery_timeline_signal` | timeline signal | 0506 |
| `apply_recovery_timeline_signal` | timeline run | 0749 |
| `mon9_pursuit_guard` | managed pursuit | 0569 |
| `mon9_elect` | managed election | 0749 |
| `lp6d_recovery_message_sink_worker` | message sink | 0753 |

FL-F owns callable-helper reachability, current execution grants and firm
authorization checks. This is a discovered-writers handoff, not its verdict.
