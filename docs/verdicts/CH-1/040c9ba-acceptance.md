# Technical acceptance CH-1 — PR #123 — verified head 040c9ba — ACCEPTED

**Decision:** CH-1 (new synthetic jobs switch live under the v3 pricing policy with immutable activation terms; migration 0109) is ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release; no fee is issued or collected (D01 v3, D09 and G4-S stay pending).

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (Claude week), a subagent of the coordinator session, 9 October 2026. This integrator dispatched the Sonnet builders for attempt 3, round 4 and the main-merge, and wrote the ledger line 24bc0ed; all were checked by the fresh reviewer below. It built no code and gave no verdict.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order, and no founder-reserved area.
- Order `CH-1-issued-attempt2.txt`; Q2 closed value `none_recorded_pre_mon2a` per coordinator ruling round 3 (8 Oct).
- Old v1-pricing tests: Ben "Use saved sample job" (UIWIRE-5, UIWIRE-14), "Yes, go ahead" (switch-live, fee-statement, UIWIRE-13) and "Yes, one rule" (9 Oct, card `jobguard-ch-1-old-pricing-blanket-2026-10-08`: UIWIRE-8, UIWIRE-15, VALUE-1, M1-16-S, MON-7:65, and the complete-journey fee-example step). Fixture path only, every check unchanged.
- Migration `0109_job_activation_terms.sql` under Ben's 5 October merge-ahead ruling; §12.2 ledger line (24bc0ed) records 0104 → 0109. Merged numbers at this acceptance: 0102, 0103, 0106, 0107; 0109 is above all of them. 0108 (M0-6L #104) will renumber at its own landing.

## 2. Verified head and verdict — PASS
- **Verdict:** `040c9ba-opus.md`, copied verbatim from PR #123 comment 6083694363, by a fresh Opus agent that had not built, repaired, merged or ordered any commit in the PR: "VERDICT: PASS — bound to head 040c9bae70c003739b55941321defacbb3b440c2". No P1 or P2. Migration 0109 is locked down (read-only for runtime, insert only through the controlled routine, immutable rows), shares no object with 0102/0103/0106/0107, and was a pure rename; the two attempt-3 production fixes are correct and race-safe; nine moved specs are byte-identical to main apart from the import path, MON-7 differs only on line 2, m1-15 only in its two navigation lines; nothing skipped, loosened or given a longer timeout.
- **CI on 040c9ba** (run 37947353704): `checks` 17m25s — core 1706, api 729 + OpenAPI, web 448, PostgreSQL 752 (CH-1 suite 11/11), browser 288 passed, 0 failed or flaky; `dependency-review` and `secrets` pass.
- **Only commit after 040c9ba:** this one, adding record files inside `docs/verdicts/CH-1/` (lane `docs/verdicts/CH-1/**`).

## 3. Follow-ups — not blocking (P3, outside this lane)
- P3-1: the home "See the fee example" shortcut (`jobguard-app.tsx:49`) mounts the fee statement for the first listed job, which now shows nothing unless that job has v1 pricing — a dead end allowed by Ben's ruling; a CH-6 or owner card should hide, relabel or repoint it.
- P3-2: new v3 jobs cannot complete a synthetic recovery landing yet (`0097_recovery_case_current.sql:63-64` needs the v1 cap record and fails closed) — hand-off to the v3 recovery and fee leaves (CH-7/CH-8, MON-*).
- P3-3: live v3 jobs show the internal name `reference_fee_policy_v3` (`quote-editor.tsx:67`, asserted by `CH-1.spec.ts:8`) — a CH-6 copy fix.
- Main's own flaky browser tests seen during this leaf, not caused by it: `M4-1-S.spec.ts:18` focuses a button before it is enabled; `UIWIRE-9.spec.ts` final-account proof race. Worth a TEST-STAB order.

## 4. Founder-reserved areas — none
No live provider, production mode, real data, spending, fee issuance or collection, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Build attempts 1–2 | Codex gpt-6.1-sol | `BUILDER_RECEIPT.md`, `BUILDER_RECEIPT_attempt2.md` |
| Attempt 3, round 4, main-merge | Claude Sonnet builders | `BUILDER_RECEIPT_attempt3.md`, `BUILDER_RECEIPT_round4.md`, `BUILDER_RECEIPT_main-merge-c283d4e.md` |
| Ledger line | JobGuard integrator (Claude week) | 24bc0ed |
| Independent check | Fresh Claude Opus review agent | `040c9ba-opus.md` |
| Technical acceptance and merge | JobGuard integrator (Claude week), Claude Opus 5.5 | this file |
