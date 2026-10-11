# Technical acceptance M4-1-S-R — PR #103 — verified head f813d67 — ACCEPTED

**Decision:** ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (evening), a subagent of the coordinator session "Full-steam parallel build plan", 7–8 October 2026.
- Codex gpt-6.1-sol built repairs up to 19; Claude Sonnet builder agents built repairs 20 and 21.
- This integrator made the main-merge commits (0d81969, 96f0587, fb8e598, c0f2f9f), wrote the repair 17–21 orders and updated the PR description. It did not build the code and gave no verdict.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order, and no founder-reserved area.
- Ben's decisions: "keep documented design" (7 October); the 4 October C7 Jobs-list substitute and fictional sample-source labels.
- Migration `0097_recovery_case_current.sql` under Ben's 5 October merge-ahead ruling. Merged migrations: 0053, 0054, 0094, 0095, 0096; 0097 is next in order.

## 2. Verified heads and verdicts — PASS
- **Verdict history (PR #103 comments):** PASS at aac7740, 023c1bf, f5b4288; PASS at 0d81969 (`0d81969-opus.md`, 6043185290); a GPT-6.1 Sol P2 (post-replay refusal could settle an unfinished request) fixed by repair 17 and PASS at 96f0587 (6044488746); after the SBOX-SESSION-1 integration REPAIR at d0860d1 (6046627960, session-scoped material rates) and 4514a2a (6047526615, test imports); PASS at f813d67 (`f813d67-opus-delta.md`, 6050273407).
- **Final verdict confirmed:** the workbench test resolves without `dist` and its digest checks fail when the application is reverted to the plain pool; the CH-3a/CH-2 merge keeps both sides in the two recovery test files; the e2e changes (alerts scoped to the workbench section; evidence fixtures moved live via `app.transition_job`) are needed and weaken nothing; migration 0097 byte-identical (sha256 84aef359…9375); product code since 4514a2a carries only main's changes.
- **CI on f813d67** (run 37711476042): `checks` pass — PostgreSQL 54 files / 552 tests (workbench 41, recovery 15, recovery-cases 12, practice-session 11); api 582, web 350, core 1594; build; browser 252/252 on the production build (M4-1-S, SBOX-SESSION-1, VALUE-1 at both sizes); `dependency-review` and `secrets` pass.
- **Only commit after f813d67:** this one, adding record files inside `docs/verdicts/M4-1-S/`, which the lane allows.

## 3. Follow-ups — not blocking, recorded for the coordinator
- `BUILD_PLAN.md` §12.2 ledger line (~3330) does not name CH-2's 0096; `MIGRATIONS.md` (~563) says "45 files" where a fresh install now applies 49.
- `recovery-cases.workbench.integration.test.ts:6` finds the upgrade point by the file name `0097_recovery_case_current.sql`; a renumber must update it.
- A "stale revision" retry holds the workbench until reload (accepted cost of repair 17); raw codes show while an attempt is held; a durable per-command refusal record would be the long-term fix.
- For CH-2's owner: the CH-2 proof stage can show "This proof record could not load" on a captured job whose scope is not confirmed yet.

## 4. Founder-reserved areas — none
No live provider, production mode, real data, spending, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Build | Codex gpt-6.1-sol (repairs to 19); Claude Sonnet builders (repairs 20, 21) | receipts in this folder |
| Main merges | JobGuard integrator (evening) | 0d81969, 96f0587, fb8e598, c0f2f9f |
| Independent checks | Fresh Claude Opus review agents | PR comments above; copies in this folder |
| Technical acceptance and merge | JobGuard integrator (evening), Claude Opus 5.5 | this file |
