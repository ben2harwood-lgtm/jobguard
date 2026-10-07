# Technical acceptance SV-1 — PR #111 — verified head 97c135f — ACCEPTED

**Decision:** ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (evening), a subagent of the coordinator session "Full-steam parallel build plan", 7 October 2026.
- Codex gpt-6.1-sol (Gmail account) built the code (original build, a `.pnpm-store` removal round and an Opus repair round).
- This integrator made and pushed the main-merge commit 97c135f (two deliberate conflict resolutions, below). It did not build the code and did not give any verdict.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order, and no founder-reserved area.
- §12.3 row "2 | SV-1 | Shadow commercial domain | small-builder | SH-1 | none (pure core) | §10". Dependency SH-1 (#99) is on `main`.
- No migration (pure core). Under Ben's 5 October merge-ahead ruling, a PR with no migration and no unmerged dependency may merge ahead.

## 2. Verified heads and verdicts — PASS
- **Code head:** `77769fc71f37322139b7def8fd77318526e21c11`. Orders: `SV-1.txt`, `SV-1-pnpm-store-removal.txt`, `SV-1-r2-opus-repair.txt`. Receipts: `RECEIPT.md`, `BUILDER_RECEIPT_round2.md`.
- **Earlier independent verdict:** REPAIR at 05117f3 (PR comment 6037278797); its items were fixed or dispositioned in round 2.
- **Independent Claude verdict on the code:** `77769fc-opus.md`, copied verbatim from PR #111 comment 6039677639: "VERDICT: PASS — bound to head 77769fc71f37322139b7def8fd77318526e21c11". No P1 or P2.
- **Main merge:** `97c135faa5e52333df6b571e8d04fe48acb7b716` merges `main` c6deb4f (ENT-4a #110 plus SEC-DEPS #113, TEST-STAB-3 #114, OUTBOX-ADAPTER-1 #112). The integrator inspected both conflicted hunks:
  - `config/agent-lane-assignments.json`: exact lane union (main's 84 lanes in main's order, then `sv-1`).
  - `packages/core/src/index.ts`: both sides appended one export line to the same base; kept main's enterprise-domain export, then SV-1's shadow-domain export.
  - Before pushing: same 23 changed files; all other diffs byte-identical; lane lint (simulated PR event) exit 0; `pnpm typecheck` exit 0.
- **Fresh delta re-check:** `97c135f-opus-delta.md`, copied verbatim from PR #111 comment 6043372768, by a fresh Opus agent that had not reviewed, built or merged this PR: "VERDICT: PASS — bound to head 97c135faa5e52333df6b571e8d04fe48acb7b716". It proved the rest of the diff identical (SHA-256 `6a93493b…6d46db22f`), found no exported-name clash between ENT-4a and SV-1 (0 TS2308; an injected clash control produced 3), confirmed all 25 files SV-1 depends on are unchanged, and ran typecheck, build, lint and core 1,392 tests.
- **CI on 97c135f** (run 37657950423): `checks` pass (including core, PostgreSQL and the e2e suite, 166), `dependency-review` pass, `secrets` pass.
- **Only commit after 97c135f:** this one, adding record files inside `docs/verdicts/SV-1/`, which the lane allows (`docs/verdicts/SV-1/**`).

## 3. Scope — PASS
- Files: `packages/core/src/shadow-domain/**`, one appended export line in `packages/core/src/index.ts`, the appended `sv-1` lane and the receipts. No migration, schema, grant, RLS, API, web, worker or CI change.

## 4. Follow-ups — not blocking, recorded for the coordinator (from the 77769fc verdict)
- Cross-route line identity: a line ID appearing in both routes with a different category or case still counts twice when the caller asserts a false case; one-line hardening or a CH-7/D03 decision.
- Pre-lock duplicate marker `reconciled/duplicate_signal`: SV-2/SV-3 to confirm the intended marker.
- Receipt-order check uses SH-1's allocator as comparator while SH-1 keeps its comparator private.

## 5. Founder-reserved areas — none
No live provider, production mode, real data, spending, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Build | Codex gpt-6.1-sol (Gmail), dispatched by the JobGuard integrator | `RECEIPT.md`, `BUILDER_RECEIPT_round2.md` |
| Main merge (lane + index export union) | JobGuard integrator (evening) | merge commit 97c135f |
| Independent check | Fresh Claude Opus review agent | `77769fc-opus.md` |
| Delta re-check | Fresh Claude Opus review agent (different agent) | `97c135f-opus-delta.md` |
| Technical acceptance and merge | JobGuard integrator (evening), Claude Opus 5.5 | this file |
