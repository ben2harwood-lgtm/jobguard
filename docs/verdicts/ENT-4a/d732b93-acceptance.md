# Technical acceptance ENT-4a — PR #110 — verified head d732b93 — ACCEPTED

**Decision:** ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (evening), a subagent of the coordinator session "Full-steam parallel build plan", 7 October 2026.
- Codex gpt-6.1-sol (Gmail account) built the code in three rounds. A merge-maker agent of the earlier integrator made the main-merge commit d732b93; this integrator verified and pushed it.
- This integrator did not build the code and did not give any verdict. It spawned the fresh delta reviewer and verified the evidence here.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order, and no founder-reserved area.
- §9.2 ENT-4a leaf, §12.3 row "2 | ENT-4a | Site-origin and contractor-fee domain | contractor | SH-1 | none (pure core)". Dependency SH-1 (#99) is on `main`.
- No migration (pure core). Under Ben's 5 October merge-ahead ruling, a PR with no migration and no unmerged dependency may merge ahead of lower-numbered open migrations.

## 2. Verified heads and verdicts — PASS
- **Code head:** `34be2c8e9ee0b32eabc0ffb8e90660fc80c71767`. Orders: `ENT-4a.txt`, `ENT-4a-r2-opus-repair.txt`, `ENT-4a-lane-verdicts-folder.txt`, `ENT-4a-r3-opus-repair.txt`. Receipts: `BUILDER_RECEIPT.md`, `BUILDER_RECEIPT_round2.md`, `BUILDER_RECEIPT_round3.md`.
- **Earlier independent verdicts:** REPAIR at a4ee9f9 (PR comment 6033070724) and REPAIR at 4f1e80d (comment 6037489389). Their items were fixed in rounds 2 and 3.
- **Independent Claude verdict on the code:** `34be2c8-opus.md`, copied verbatim from PR #110 comment 6038166086: "VERDICT: PASS — bound to head 34be2c8e9ee0b32eabc0ffb8e90660fc80c71767". No P1 or P2.
- **Main merge:** `d732b93ef7534c6b7ccabc0a3fccf8c4a21da115` merges `main` 6566abc (SEC-DEPS #113, TEST-STAB-3 #114, OUTBOX-ADAPTER-1 #112) with an exact lane-registry union, the only conflict. The integrator checked before pushing: same 14 changed files; the non-lane diff is byte-identical before and after; lane file = main's 83 lanes plus `ent-4a`; lane lint (simulated PR event) exit 0; `pnpm typecheck` exit 0.
- **Fresh delta re-check:** `d732b93-opus-delta.md`, copied verbatim from PR #110 comment 6042619777, by a fresh Opus agent that had not reviewed, built or merged this PR: "VERDICT: PASS — bound to head d732b93ef7534c6b7ccabc0a3fccf8c4a21da115". It confirmed the non-lane diff SHA-256 `44201bcf…457f53b` is identical before and after the merge, re-ran `git merge-tree` (only the lane file conflicts), found nothing merged from main touches `packages/core`, and ran core 591/591, enterprise-domain 278/278, tools 42/42, typecheck, lint and build.
- **CI on d732b93** (run 37653528092): `checks` pass (core 591, API 108, web 63, AI eval 72, PostgreSQL 39 files / 198 tests, e2e 166), `secrets` pass, `dependency-review` pass.
- **Only commit after d732b93:** this one, adding the record files inside `docs/verdicts/ENT-4a/`, which the lane allows (`docs/verdicts/ENT-4a/**`).

## 3. Scope — PASS
- Files: `packages/core/src/enterprise-domain/**` (contracts, transitions, origin, fee, index and four test files), one appended export line in `packages/core/src/index.ts`, the appended `ent-4a` lane and the receipts.
- No migration, schema, grant, RLS, API, web, worker or CI change.

## 4. Follow-ups — not blocking, recorded for the coordinator
- **P3-R2 → ENT-7:** untimestamped inputs are not frozen at the statement cutoff.
- **P3-R3 → ENT-6:** a partial refund can still be steered through the supplied `remainingGross`.
- **P3-4 → ENT-5:** recorded in the round-2 receipt, unchanged.

## 5. Founder-reserved areas — none
No live provider, production mode, real data, spending, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Build (3 rounds) | Codex gpt-6.1-sol (Gmail), dispatched by the JobGuard integrator | `BUILDER_RECEIPT*.md` |
| Main merge (lane union) | Claude Opus merge-maker agent; verified and pushed by the integrator | merge commit d732b93 |
| Independent check | Fresh Claude Opus review agent | `34be2c8-opus.md` |
| Delta re-check | Fresh Claude Opus review agent (different agent) | `d732b93-opus-delta.md` |
| Technical acceptance and merge | JobGuard integrator (evening), Claude Opus 5.5 | this file |
