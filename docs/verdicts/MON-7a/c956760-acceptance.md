# Technical acceptance MON-7a — PR #121 — verified head c956760 — ACCEPTED (MON-7 not fully accepted while B4 is parked)

**Decision:** MON-7a (B1, B2, B3, B5, B6 of MON-7 with their DW parts) is ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. MON-7 as a whole is **not** fully accepted: B4 (MON-7b, the exposure curve) is parked by Ben ("park it", 7 October) and nothing for it was built. No deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (evening), a subagent of the coordinator session "Full-steam parallel build plan", 8 October 2026.
- Codex gpt-6.1-sol built round 1; a Claude Sonnet builder agent built round 2 (re-applying the mount points on main's CH-2 UI).
- The coordinator made the lane edit (4aa8ac9) under Ben's typed approval. This integrator made the main-merge commits (191db2c, f80202e), the two registry lines (caac757, exactly as the builder specified and proved) and the §12.2 ledger line (c956760). It gave no verdict.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order, and no founder-reserved area.
- Ben's rulings: MON-7b "park it" (7 October); MON-7a lane +`packages/core/src/watchdog.ts` ("Add the one file", confirmed 8 October). Coordinator rulings adopted 7 October: MON-7 Q7 interim synthetic company-check rule (business type AND valid company number only; every other type "not run — not a registered company"; production eligibility stays Ben's under D12/D14); MON-7 Q1 split into MON-7a/MON-7b; Q6 no external route, so no data-flow entry.
- Migration `0103_prevention_checks.sql`, next after merged 0102 (CH-3b) — no renumber needed.

## 2. Verified heads and verdicts — PASS
- **Verdict history (PR #121 comments):** REPAIR at 347e452 (6048458388); PASS at e7c314f (6048938674).
- **Final verdict:** `c956760-opus-delta.md`, copied verbatim from PR #121 comment 6053331301, by a fresh Opus agent that had not built, repaired, merged or ordered any commit in the PR: "VERDICT: PASS — bound to head c9567607edee8c05f5599e89ec0c2969e1eee5be". It confirmed both main-merges mechanical (`--remerge-diff`), the mount points re-applied exactly with CH-2's providers and CH-3a's guards kept, 0103 byte-identical to the passed version, the lane edit adding only `packages/core/src/watchdog.ts`, the registry commit exactly two lines, and `pre_live_allowed` the right class (its probe: the checks never change job status, revision or updated_at and write no CH-2-guarded table; removing the lines fails exactly the two registry tests).
- **CI on c956760** (run 37731565633, attempt 1): `checks` pass — PostgreSQL 583 (prevention 11/11), API 598 (registry 120), core 1634, web 350, browser 258/258 (6 MON-7); `dependency-review` and `secrets` pass.
- **Only commit after c956760:** this one, adding record files inside `docs/verdicts/MON-7a/` (lane `docs/verdicts/MON-7a/**`).

## 3. Follow-ups — not blocking (P3), recorded for the coordinator
- `prevention-checks.integration.test.ts:191` applies every migration except 0103 and then 0103; once higher migrations merge that is no longer a true upgrade path — it should apply only the migrations registered before 0103 (as CH-2's and M4-7-S's suites now do). Candidate TEST card; it does not block while 0103 is the highest merged number.
- Earlier N1 (revise-customer race: re-check eligibility after the audit append) and N2 (0103 trigger accepts a direct database write on an out-of-date binding that can never be shown) remain open.
- Paperwork: round-2 receipt still ends "not yet green: two API registry tests" (fixed by caac757; CI run above is the evidence); the 0103 note in MIGRATIONS.md should also name 0102; the ledger line does not record that MON-7's §12.3 reservation 0057 is released; `docs/verdicts/MON-7/BUILDER_RECEIPT.md` header still says "review and CI pending".
- The checks also run on live, invoiced and lost jobs (synthetic, advisory, no fee); a one-line comment on the two registry entries would record why they are pre_live_allowed.

## 4. Founder-reserved areas — none
No live provider, production mode, real data, spending, decision approval, deployment or release. No check was weakened. Production company-check eligibility stays Ben's (D12/D14).

| Step | Actor | Record |
|---|---|---|
| Build | Codex gpt-6.1-sol (round 1); Claude Sonnet builder (round 2) | receipts in this folder |
| Lane edit | Coordinator, under Ben's typed approval | 4aa8ac9 |
| Main merges, registry lines, ledger | JobGuard integrator (evening) | 191db2c, caac757, f80202e, c956760 |
| Independent check | Fresh Claude Opus review agent | `c956760-opus-delta.md` |
| Technical acceptance and merge | JobGuard integrator (evening), Claude Opus 5.5 | this file |
