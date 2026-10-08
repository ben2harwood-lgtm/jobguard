# Technical acceptance CH-3a — PR #98 — verified head cf774fb — ACCEPTED

**Decision:** ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (evening), a subagent of the coordinator session "Full-steam parallel build plan", 7 October 2026.
- Codex gpt-6.1-sol (Gmail account) built the code through round 13; a Claude Sonnet builder agent built round 14 (two test-only fixes).
- This integrator made the main-merge commits (bd2797a, a13728b, 52006fa, e988e2c) and wrote the round 9–14 orders. It did not build the code and gave no verdict.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order, and no founder-reserved area.
- §12.3 CH-3a row; migration `0095_job_parties.sql` under Ben's 5 October merge-ahead ruling (§12.2 ledger paragraph in this PR). Merged migrations are 0053, 0054 (ENT-1) and 0094 (SBOX-SESSION-1); 0095 is the next in the integrator's order, ahead of CH-2 0096, M4-1-S-R 0097, M0-6L 0098, M4-5-S 0099, SV-2 0100, M4-7-S 0101.
- Ben, 7 October: the CH-3a lane may include one extra file. Ben, 4 October: the C7 Jobs-list substitute and fictional sample-source labels apply.

## 2. Verified heads and verdicts — PASS
- **Verdict history:** PASS at d812f99, 3b62d4e, 978ceec, 8722f7f; REPAIR at bd2797a (non-UTF8 escapes in 0095); PASS at a13728b (`a13728b-opus.md`, comment 6044228032) and its lane-format delta at 52006fa (`52006fa-opus-delta.md`, 6044524892); REPAIR at 3543cbb (`3543cbb-opus-repair.md`, 6047005201) after the SBOX-SESSION-1 integration rounds; PASS at cf774fb (`cf774fb-opus-delta.md`, 6047501532).
- **Since 52006fa:** integrator merge e988e2c of main 3395d34 (ENT-1, SBOX-SESSION-1, TEST-STAB-4; real conflicts — mechanical unions in the merge, four app-layer files handed to the builder); round 11 (0ad202c) re-applied CH-3a on SBOX's PracticeAccess versions and put job-parties endpoints behind it; round 12 (33d34dd) fixed two GPT-6.1 Sol P2s (bound-snapshot hydration; whitespace-only correction reasons); round 13 (3543cbb) made 0095's party requirement compatible with SBOX's `issue_practice_session` without editing 0094 (seeding parties only under the server role `jobguard_migration`); round 14 (cf774fb) — UTF8 initdb flag for SBOX's practice-session suite (one line) and the whitespace-reason constraint branch run as the migration role.
- **Final independent verdict:** `cf774fb-opus-delta.md`, copied verbatim from PR #98 comment 6047501532: "VERDICT: PASS — bound to head cf774fbc66a1b0144f6a9389137d09f512edf2b8". The 3543cbb review had already confirmed: 0000–0094 byte-identical to main; the `practice-session.ts` change admits only unowned imported jobs reached through a server-written adoption audit event from a job the session owns; SBOX test changes are additions only (plus round 14's one initdb flag); job-parties endpoints give 404 without labels to another session and 401 without a session; the quote/workspace re-application matches the old CH-3a diff with every SBOX check intact.
- **CI on cf774fb** (run 37689621646): `checks` pass — PostgreSQL 43 files / 320 tests (practice-session 10, job-parties 86, sandbox 2, UIWIRE-12 22, demo-bootstrap 4); browser 230 passed, none failed, flaky or skipped, both projects (CH-3a 42, SBOX-SESSION-1, VALUE-1, SBOX-1/2/resume); `dependency-review` and `secrets` pass.
- **Only commit after cf774fb:** this one, adding record files inside `docs/verdicts/CH-3a/`, which the lane allows.

## 3. Follow-ups — not blocking, recorded for the coordinator
- The ownership query scans the demo tenant's audit rows on each practice request; a partial index would help (optional).
- The runtime-insert check could also match the "permission denied for table job_party_binding" message, not only 42501.
- If 0095 is ever renumbered, UIWIRE-12/demo-bootstrap hard-code 47 and the file name, and `migrate.ts` keys on the name.

## 4. Founder-reserved areas — none
No live provider, production mode, real data, spending, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Build (rounds to 13) | Codex gpt-6.1-sol (Gmail), dispatched by JobGuard integrators | receipts in this folder |
| Build (round 14) | Claude Sonnet builder agent | `BUILDER_RECEIPT_round14.md` |
| Main merges | JobGuard integrator (evening) | bd2797a, a13728b, 52006fa, e988e2c |
| Independent checks | Fresh Claude Opus review agents | PR comments above; copies in this folder |
| Technical acceptance and merge | JobGuard integrator (evening), Claude Opus 5.5 | this file |
