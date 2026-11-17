# Technical acceptance TENANT-ADAPTER-1 — PR #126 — verified head f17e6ae — ACCEPTED

**Decision:** TENANT-ADAPTER-1 (M4-5-S's fake recovery-message adapter takes the verified tenant context per call instead of keeping it in a field; behaviour identical; no migration) is ACCEPTED for merge under Ben's written delegation, provided GitHub CI is fully green on the exact final head that adds this file. No deploy or release.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the JobGuard integrator (Claude week), a subagent of the coordinator session, 9 October 2026. This integrator wrote the routine order (`jg-orders/TENANT-ADAPTER-1.txt`) on the coordinator's ruling and pushed the branch; it built nothing and gave no verdict.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 written delegation (Ben, 30 September 2026): CI fully green on the exact head, a recorded PASS bound to that head, a separate acceptance, migration order (none here), and no founder-reserved area.
- Coordinator ruling, 9 Oct: "Option A, change the adapter" — a routine, in-scope fix that makes the code stricter and leaves M0-6L's boundary scanner untouched (the alternative, a scanner exception, was refused by the Mac's permission check and is not pursued). Routine work: "bounded internal refactor that preserves agreed interfaces"; recorded as §14.3 "Discovered later".

## 2. Verified head and verdict — PASS
- **Verdict:** `f17e6ae-opus.md`, copied verbatim from PR #126 comment 6085656664, by a fresh Opus agent that had not built, ordered or merged any commit in the PR: "VERDICT: PASS — bound to head f17e6ae847e5d4d5b6c66a2afc42058a1a91d7ca". No P1 or P2. Behaviour is identical; the per-call wrapper (needed because the shared `OutboundAdapter` interface has no tenant argument) keeps no context beyond one call and is not reachable by other code; the test change is signature-only; the lane line matches the order.
- **Scanner proof (builder):** M0-6L's scanner, byte-identical at 2994f60, goes from 144/145 (flagging `recovery-message-adapter.ts:33` and `recovery-message-repository.ts:262,280`) to 145/145 with this diff applied and no exception; temp worktree `/private/tmp/jg-tenant-adapter-1-scanner-proof`.
- **CI on f17e6ae** (run 37961082363): `checks`, `dependency-review` and `secrets` pass. The `checks` job took 28 minutes, close to CI-TIME-1's 30-minute limit (see follow-ups).
- **Only commit after f17e6ae:** this one, adding record files inside `docs/verdicts/TENANT-ADAPTER-1/` (lane `docs/verdicts/TENANT-ADAPTER-1/**`).

## 3. Follow-ups — not blocking (P3)
- The per-call wrapper (`recovery-message-repository.ts:34-37`, test helper `:107-110`) is a closure over `ctx` for one call; the shape-only scanner would not catch a later edit that stored it. Proper fix (separate leaf): make `OutboundAdapter.deliver/reconcile` take the context per call (`outbox.ts:13,15` already hold it).
- `packages/db` typecheck covers `src` only, so test files are not type-checked by `pnpm typecheck` (pre-existing gap).
- CI duration: this run's `checks` job took 28 minutes against a 30-minute limit. Split the browser suite across parallel jobs before the limit bites again (also noted in CI-TIME-1's acceptance).

## 4. Founder-reserved areas — none
No live provider, production mode, real data, spending, decision approval, deployment or release. No check was weakened.

| Step | Actor | Record |
|---|---|---|
| Order (routine, on coordinator ruling) | JobGuard integrator (Claude week) | `jg-orders/TENANT-ADAPTER-1.txt` |
| Build | Claude Sonnet builder | `BUILDER_RECEIPT.md` |
| Independent check | Fresh Claude Opus review agent | `f17e6ae-opus.md` |
| Technical acceptance and merge | JobGuard integrator (Claude week), Claude Opus 5.5 | this file |
