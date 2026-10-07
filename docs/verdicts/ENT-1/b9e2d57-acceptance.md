# Technical acceptance ENT-1 — PR #100 — verified head b9e2d57 — ACCEPTED

**Decision:** ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (evening), a subagent of the coordinator session "Full-steam parallel build plan", 7 October 2026.
- Codex gpt-6.1-sol (Gmail account) built the code: original build, a CI repair and rounds 3–5.
- This integrator made the main-merge commits (3d6e6c7 and b9e2d57) and wrote the round-5 order. It did not build the code and did not give any verdict.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order, and no founder-reserved area.
- §12.3 row "1 | ENT-1 | Organisations, roles, client contracts | contractor | ADOPT | 0054 | §9". ADOPT is merged.
- Migration `0054_contractor_organisation.sql`, the §12.3 number and the next above main's 0053. It is the lowest unmerged migration among the open PRs (0094–0099 follow), so it merges first.

## 2. Verified heads and verdicts — PASS
- **Code head:** builder round 5 `937145e7d3fc64ca7450be97a63a65daf0ae486c`. Orders: `ENT-1.txt`, `ENT-1-ci-repair.txt`, `ENT-1-r3-repair.txt`, `ENT-1-r4-repair.txt`, `ENT-1-r5-repair.txt`. Receipts in this folder.
- **Verdict history:** PASS at 9a5b6ba and f6f4077 (comments 5974517164, 5976048577); REPAIR at 4199eef (6038161162); PASS at addc30b (6043240532); GPT-6.1 Sol pre-check at addc30b raised a session-recovery P2; REPAIR at 3d6e6c7 confirming it (`3d6e6c7-opus-repair.md`, comment 6043850471).
- **Main merge:** `b9e2d5766f2a30251f2769e200d7751b75d9f31c` merges main 2f986a7 (LANE-FORMAT-1 #116) with an exact lane union in the new one-lane-per-line format. The earlier merge 3d6e6c7 resolved the lane registry and `packages/core/src/index.ts` (kept main's enterprise-domain and shadow-domain exports, then ENT-1's contractor export).
- **Independent Claude verdict on the final head:** `b9e2d57-opus.md`, copied verbatim from PR #100 comment 6044375418, by a fresh Opus agent: "VERDICT: PASS — bound to head b9e2d5766f2a30251f2769e200d7751b75d9f31c". It confirmed the P2 fix against every part of the required fix (12 new tests red on 3d6e6c7, green at the head; its own probe 6/6: zero session creations with an existing session, at most one otherwise, the same organisation survives), the two folded-in P3s, no weakened assertion, a clean merge (non-lane diff byte-identical; lane file exactly main's lanes plus `ent-1`), and migration 0054 unchanged.
- **CI on b9e2d57** (run 37666392510): `checks` pass (PostgreSQL 40 files / 215 incl. contractor 17/17; core 1,421; web 100; Playwright 186, retries 0, incl. all 20 ENT-1 cases), `dependency-review` pass, `secrets` pass.
- **Only commit after b9e2d57:** this one, adding record files inside `docs/verdicts/ENT-1/`, which the lane allows.

## 3. Follow-ups — not blocking, recorded for the coordinator
- P3-1: `contractor-admin.tsx:27` sets the "already tried a session" flag even when `/api/session` cleanly refuses with 503, so a first-time visitor during a database cold start loops until a browser refresh. One-line fix plus a regression in a later round.
- P3-2: `owner` is still accepted on `grant.create` — left for ENT-10.

## 4. Founder-reserved areas — none
No live provider, production mode, real data, spending, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Build (5 rounds + CI repair) | Codex gpt-6.1-sol (Gmail), dispatched by JobGuard integrators | receipts in this folder |
| Main merges | JobGuard integrator (evening) | 3d6e6c7, b9e2d57 |
| Independent checks | Fresh Claude Opus review agents | PR comments above; `3d6e6c7-opus-repair.md`, `b9e2d57-opus.md` |
| Technical acceptance and merge | JobGuard integrator (evening), Claude Opus 5.5 | this file |
