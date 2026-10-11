# Technical acceptance M4-5-S — PR #106 — verified head df7eb1f — ACCEPTED

**Decision:** ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (evening), a subagent of the coordinator session "Full-steam parallel build plan", 8 October 2026.
- Codex gpt-6.1-sol built the early rounds; Claude Sonnet builder agents built rounds 6–10.
- This integrator made the main-merge commits (latest `6706505`, main `df1f9c1`), wrote the round 7–10 orders and refreshed the PR description. It did not build the code and gave no verdict.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order, and no founder-reserved area.
- Ben's decisions: "replay returns current state" (7 October); the 4 October C7 Jobs-list substitute and fictional sample-source labels.
- Migration `0099_recovery_messages.sql` under Ben's 5 October merge-ahead ruling (§12.2 ledger paragraph in this PR). Merged migrations: 0053, 0054, 0094, 0095, 0096, 0097; 0099 is next in order (0098 M0-6L renumbers at its own merge).

## 2. Verified heads and verdicts — PASS
- **Verdict history (PR #106 comments):** REPAIR at d3f3dd9 (6044557540); REPAIR at 2213c08 (6047337966); PASS at 0cc5c8c (6047730220); REPAIR at 227341b (6050261387, abandoned reconcile); REPAIR at 50f71cc (6051647676, an old "Check outcome" replay after a later uncertain attempt left a message stuck; Sol's malformed-answer finding rated P3).
- **Final verdict:** `df7eb1f-opus-delta.md`, copied verbatim from PR #106 comment 6052125957, by a fresh Opus agent that had not built, repaired, merged or ordered any commit in the PR and did not give the 50f71cc verdict: "VERDICT: PASS — bound to head df7eb1f3aa2261e79ea799ce5fd8666b78fe908b". No P1 or P2. It re-ran the stuck case (probe C1) on real PostgreSQL at this head: no provider call, no write, then a fresh check and a single delivery; confirmed the new replay condition only narrows the old one; confirmed round 8's takeover and the replay ruling still hold; ran 18 real server answers through the panel's new check (all accepted; all refused under another case's id).
- **Rounds covered since the last PASS (0cc5c8c):** round 8 (8f39436, abandoned-reconcile takeover), main-merge 6706505 (M4-1-S-R; recovery-cases.tsx taken from main and re-applied), round 9 (50f71cc, 0099's snapshot reads `app.recovery_case_current`; serialised with `approve_synthetic_landing`), round 10 (df7eb1f).
- **CI on df7eb1f** (run 37725142371): `checks` pass — PostgreSQL 57 files / 662 tests; core 1616, API 663, web 434; production build; browser 264/264 at both sizes (12 M4-5-S tests); `dependency-review` and `secrets` pass.
- **Only commit after df7eb1f:** this one, adding record files inside `docs/verdicts/M4-5-S/`, which the lane allows (`docs/verdicts/M4-5-S/**`).

## 3. Follow-ups — not blocking, recorded for the coordinator (BUILD_PLAN §14.3 candidates)
- P3 (df7eb1f): the reconcile replay compares command ids with exact letter case (`recovery-message-repository.ts:291`); an API caller sending an upper-case id cannot resume its own interrupted check (nothing stuck or doubled; the browser sends lower case). One-line fix.
- Closed "no recovery" cases can still be messaged (old behaviour). Reviewer's recommendation: readiness should check the case's state — a possible Ben question.
- Main's 0018 landing-reversal routine takes no case lock (outside this lane; outcome stays consistent).
- Merged M4-3-S `evidence-packs.tsx` still adopts a 200 answer unchecked (same pattern fixed here).
- Round-8 Sol P2-2 follow-up (recorded in `BUILDER_RECEIPT_round8.md`).
- An open message panel can show an older amount after an approved landing elsewhere until the next action (server refuses approval and delivery).
- `recovery-message-upgrade.integration.test.ts` hard-codes the `0099_` prefix — update it at any renumber (fails loudly otherwise).

## 4. Founder-reserved areas — none
No live provider, production mode, real data, real sends, spending, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Build | Codex gpt-6.1-sol (early rounds); Claude Sonnet builders (rounds 6–10) | receipts in this folder |
| Main merges | JobGuard integrator (evening) | latest 6706505 |
| Independent checks | Fresh Claude Opus review agents (a different agent per verdict) | PR comments above; `df7eb1f-opus-delta.md` |
| Technical acceptance and merge | JobGuard integrator (evening), Claude Opus 5.5 | this file |
