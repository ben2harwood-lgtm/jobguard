# READ FIRST — JobGuard build (this repo is self-contained)

> **▓▓ BUILD = JOBGUARD ▓▓** (UK builders' profit-watchdog SaaS). Repo `/Users/benharwood/Claude/Projects/my-new-project`. The other build (government control plane) is a different repo — not here.

Everything you need to build JobGuard is a file **in this repo** — you do not rely on any chat's memory, any other project's folder, or any live connection. Read these, in order:

1. **`JOBGUARD_BUILD_PACK.md`** — start here. Who you are, how this chat runs (§0: local terminal agent, no GitHub, no reviewer to contact), what to build first, and the guardrails.
2. **`AGENTS.md`** (rev 2.2) — engineering invariants and §5 non-negotiables, incl. §5.13 the build loop.
3. **`BUILD_PLAN.md`** (rev 2.2) — the change log at the top, then the milestones, decisions D01–D12, contracts, and the M0 task cards with their "Done when".
4. **`ISSUE_PACKET_WAVES_0-1_2026-09-11.md`** — the corrected first-wave dispatch and Ben's setup decisions.
5. **`docs/context/JOBGUARD_VALIDATION_VERDICT.md`** — the independent check of this plan: what held, the fixes applied as rev 2.2, and the environmental blockers. This is the evidence the plan is sound, not a claim you have to take on trust.
6. **`docs/context/OWN_MIND_REUSE.md`** — what was reused from the earlier build and why (e.g. the lane-boundary lint you must ship in M0-1).
7. **`docs/context/CROSS_MODEL_WORKING_AGREEMENT.md`** — the source method behind §5.13 (builder ≠ checker, recorded verdicts, founder-reserved decisions).
8. **`JOBGUARD_REVIEW_HANDOFF.md`** — for Ben: how a finished task gets an independent verdict (you don't run this; you just build, test, commit, and hand off).

`docs/archive/` holds the superseded rev 2.1 of the plan (kept, not deleted).

**If you cannot see the files in step 2–3 on disk, you are in the wrong folder or a chat with no filesystem access — stop and tell Ben.** Nothing here should be reconstructed from memory; if a fact you need is not in one of these files, say so rather than inventing it.
