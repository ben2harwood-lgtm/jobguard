# Q83 · V2-TRAIN-1: the three piece bugs Q80's seed run found (C6 done-when, K5 firm-lock policies, K5A-1 helper)

**Tier:** C6 is RED money (#1047). K5 is RED money (the K5 line). Each fix lands on its own branch. **Builder:** Opus 5.5 thread. **Checker:** desktop Codex. **Plan:** Q80 report, seed table. Planner: 28 Nov 15:15 UK.

1. **C6 #1047, "done when" gives QUOTE_NOT_ISSUABLE at preview.** It fails on #1047's own v2-seed CI too. Find out why the added-line preview is refused, using the `missing_scope` blocker detail. Fix the cause and keep the done-when totals as written (+24000, +4800, +28800). Don't edit the expected values.
2. **K5 firm locks.** `app.v2_payment_stage_due` (2046), `app.v2_stage_invoice_draft` and `app.v2_stage_invoice_draft_withdrawal` (2071) have no `v2_practice_firm` policy, so v2/main's FL guard fails once the K5 line meets it. Add the firm-lock policy to each of the three tables, in place in its own migration, the same way FL-6 (Q44) did for V2 tables. Then catch the K5 line up with v2/main so the FL guard runs.
3. **K5A-1 helper, two tests.** `k5a1SetOrigin(…, "jobguard_catch")` breaks the `extra_origin_source_signal_kind` CHECK, because the replica role skips triggers but not CHECKs. Back it with a real `shadow_commercial_signal` row, as d9f29b442 did on #992. Make sure that commit is on the K5 top the train uses. Don't relax the CHECK.
4. **Stacked K5 PRs run v2-seed** once #1058 lands. Check this on the next K5 push.

**Done when:** on a fresh stack, the seed suite gives 0 piece failures across C6 and the K5 line, desktop Codex is clean, and each fix is on its own branch.
