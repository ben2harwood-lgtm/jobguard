# Technical acceptance CH-2 — PR #97 — verified head e66d50a — ACCEPTED

**Decision:** ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (evening), a subagent of the coordinator session "Full-steam parallel build plan", 7–8 October 2026.
- Codex gpt-6.1-sol (Gmail account) built rounds 1–16; Claude Sonnet builder agents built rounds 15, 17 and 18 (test-only).
- This integrator made the main-merge commits (ed8d2e3, 91f7923, 58eef49, 9e664bc, aac02ef) and wrote the round 11–18 orders. It did not build the code and gave no verdict.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order, and no founder-reserved area.
- Ben, 7 October (card `jobguard-ch2-enforcement-2026-10-07`): "keep triggers", with the non-blocking `pg_try_advisory_xact_lock` fix — both present; `0096_watchdog_live.sql` is byte-identical since c7c0d7e (sha256 4b369d40…a4c4).
- Migration 0096 under Ben's 5 October merge-ahead ruling (§12.2 ledger paragraph in this PR). Merged migrations: 0053, 0054, 0094, 0095; 0096 is next in order.

## 2. Verified heads and verdicts — PASS
- **Verdict history (PR #97 comments):** PASS at 0617f69 (5980341337); REPAIR at 5610a6f (6033831787), fb0561f (6038470869), ed8d2e3 (6043229259); PASS at 91f7923 (`91f7923-opus.md`, 6044007272) and its lane-format delta 58eef49 (6044525197); after the SBOX-SESSION-1 integration (9e664bc, rounds 12–13) REPAIR at 9f7cb86 (6046556871, CI fixture) and bb45aad (6047232486, browser race); PASS at c7c0d7e (6047659537); after the CH-3a integration (aac02ef, round 16) REPAIR at 83d78d7 (6048208725, UTF8 test databases) and 535e588 (6048537446, parties step); PASS at e66d50a (`e66d50a-opus-delta.md`, 6048793859).
- **What the integration verdicts confirmed:** all 21 SBOX-conflicted files carry CH-2's edits on top of SBOX's PracticeAccess versions with every ownership check intact (another session 404, missing session 401, CH-2 reused-id conflicts still 409 IDEMPOTENCY_CONFLICT in Nest and Next); both global filters catch only their own errors (probed on the real AppModule); three GPT-6.1 Sol P2s (atomic finalize persistence; mutation registry missing inherited routes and @RequestMapping) fixed red-before/green-after; the ten CH-3a-conflicted files keep both sides' changes and every assertion; 0095's party guards and 0096's live-only guards do not block each other; 0000–0095 byte-identical to main.
- **CI on e66d50a** (run 37699701038): `checks` pass — PostgreSQL 52 files / 495 tests; core, API, web unit suites; build; browser 238/238, retries 0 (CH-2's 8 cases, CH-3a, SBOX-SESSION-1, VALUE-1, UIWIRE-7); `dependency-review` and `secrets` pass.
- **Only commit after e66d50a:** this one, adding record files inside `docs/verdicts/CH-2/`, which the lane allows.

## 3. Follow-ups — not blocking, recorded for the coordinator
- `packages/db/MIGRATIONS.md:155-156` says "six" non-UTF8 suites; there are eight (CH-3a's wording).
- `watchdog-legacy-identities.integration.test.ts:281` names `0096_watchdog_live.sql` literally; a renumber would fail loudly.
- `capture-journey.ts:48–49` (`startWatchdogJob`) still checks the price button once without waiting; every caller now prices first.

## 4. Founder-reserved areas — none
No live provider, production mode, real data, spending, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Build | Codex gpt-6.1-sol (Gmail) rounds 1–16; Claude Sonnet builders rounds 15, 17, 18 | receipts in this folder |
| Main merges | JobGuard integrators | ed8d2e3, 91f7923, 58eef49, 9e664bc, aac02ef |
| Independent checks | Fresh Claude Opus review agents | PR comments above; copies in this folder |
| Technical acceptance and merge | JobGuard integrator (evening), Claude Opus 5.5 | this file |
