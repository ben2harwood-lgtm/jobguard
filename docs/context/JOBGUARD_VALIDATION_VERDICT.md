# Validation verdict — JobGuard build plan (rev 2.1 → 2.2)

**Date:** 11 September 2026 · **Checker:** Claude (Opus 4.8), independent checker under the cross-model working agreement · **Input:** `my-new-project/BUILD_PLAN.md` + `AGENTS.md` rev 2.1 (uncommitted) · **Method:** seven adversarial lenses, every blocker/major put to three independent refuters, a completeness critic, plus an independent reimplementation of the fee formula. Evidence in `evidence/`.

## TL;DR

The JobGuard plan is **sound and unusually careful** — the best-specified of the three plans in play. Its money maths, dependency graph, gate structure, security architecture and regulatory deferrals all held under adversarial refutation. **There is no defect in the plan that makes it unsafe to build.** The only things stopping a build tonight are on your machine, not in the plan: no database/container runtime, and the Codex builder isn't on your PATH. I applied the surviving fixes as rev 2.2 (change log at the top of `BUILD_PLAN.md`; rev 2.1 archived).

**Verdict:** BUILDABLE, with fixes applied. Tonight you can start M0-1, then M0-2 and M0-3 (pure TypeScript). Everything else waits on two installs and a few decisions.

## 1. What was checked, and what held

| Lens | Result |
|---|---|
| **Money / fees / tax** | No blocker, no major. I reimplemented the §3.5 fee formula in exact BigInt and ran it: all 5 reference fixtures reproduce to the penny, and every named sequence (split, reversal, credit timing) is exact. Table columns are internally consistent (base + additional = max(£79, capped fee) in every row). VAT is cleanly separated from commercial rounding. |
| **Data security** | "Sound and unusually tight." No blocker. No real-data or production-billing path is reachable before its gate; command authorization, idempotency, audit checkpoints, AI isolation and offline authority all hold. One major (below). |
| **Architecture / sequencing** | The M0 dependency graph is exactly consistent with the wave table — no cycle, no false dependency, no mis-waved task. Gates are coherent; no gate is satisfiable by synthetic evidence alone. Two wording/edge fixes (below). |
| **Buildability / coverage** | Every row of the plan's own adversarial acceptance matrix maps to a real owning task (no orphaned invariant). A few "Done when" blocks needed a test owner named (below). |
| **Regulatory / commercial** | Every regulated action (debt pursuit, bank linking, real invoicing, fee collection) is correctly walled behind M4/G4 and a named decision. Nothing tonight crosses a line. One missing decision (below). |
| **Feasibility** | The plan is buildable; the constraint is your setup and the shared Claude checker, not the plan. Detailed below. |

## 2. Fixes applied as rev 2.2

All ten are in the change log at the top of `BUILD_PLAN.md`. The material ones:

1. **Missing decision D12** — the bank feed and pursuit ingest the builder's *customers'* personal data (third parties to the builder–JobGuard contract) with no named lawful basis or transparency notice. Added D12 to the register as `proposed`, required at G1. This is a decision for you/legal, not something to approve now.
2. **M0-2 fitness test** — the "unapproved fee/tax/provider fails server-side" invariant was unit-testable but not architecturally bound; a builder could satisfy it and later paths could still skip the gate. Added a fitness test mirroring M0-8's boundary test. Also fixed D11 being dropped from M0-2's decision list (now D01–D12).
3. **Tenant-isolation provenance test** — the core §5.1 guarantee ("tenant context comes only from auth, never a request header") had no test that proved it. Added a provenance/negative test owner in M0-6.
4. **Lock-order test** — the §5.4 "no business lock after the audit append" invariant was tested only for the audit-only case; added a command-layer test owner in M0-8/M0-9.
5. **M0-1 clarified** — `/healthz` is now a database-independent liveness probe, so M0-1 completes with no container runtime; the runtime is an explicit precondition of the tasks that actually need a database. M0-1 also now ships the OWN MIND lane-boundary lint (run in CI) before the first parallel wave.
6. **Node 24** recorded as an approved deviation from the pinned Node 22 (24 supports the whole M0/M1 stack; revisit at M3 for Expo). Don't install 22.
7. **M2-start contradiction** fixed; **money float ban** added to M0-3; **oversized M0-12/M0-13** pre-split; a **half-even tie fixture** added.

None of these was a blocker; the plan was safe to fix in place rather than rebuild.

## 3. What is actually stopping a tonight start (environment, not plan)

- **The Codex builder is not on your PATH.** Only `~/.codex/auth.json` exists, no CLI. The "four agents in parallel" model can't run until Codex is invocable, or you drive it interactively one session at a time. Realistic tonight: ~1 effective builder.
- **No database / container runtime.** `docker`, `colima`, `podman`, `brew` are all absent. Any task with real-PostgreSQL tests (M0-4 and most of the foundation) cannot reach its "Done when" tonight. Fix: install Docker Desktop (direct .dmg, no Homebrew, ~30–60 min).
- **The real rate limit is the Claude checker.** Roughly 42 recorded verdicts for JobGuard's M0+M1 alone, drawn from the same interactive allowance as the government control plane and education (which is first priority). The parallel-fleet design speeds building but *increases* the queue into the one checker. This, not agent-days, sets the calendar: realistically ~10–16 weeks to a synthetic-complete, trial-passed M1 under three-way sharing.

## 4. What can start tonight

| Task | Tonight? |
|---|---|
| **M0-1** scaffold/CI | Start now; completes tonight with the `/healthz` fix (no runtime needed for its own gate). |
| **M0-2** contracts/decisions | After M0-1 merges — pure TypeScript, starts and finishes tonight. |
| **M0-3** money/tax | After M0-1 merges — pure TypeScript, starts and finishes tonight. |
| **M0-12** AI gateway | Fixture-only after M0-1 (live model gate stays D04-stubbed; no MinIO needed — that's M0-11). |
| **M0-4** db/RLS | Hold until a container runtime is installed. |

## 5. Ben's decisions (one line each)

1. Commit the plan docs so tasks have a fixed base.
2. Builder channel: put Codex on PATH + authenticate, or drive it interactively.
3. Install Docker Desktop (unblocks M0-4/M0-11/M0-12-MinIO) — free.
4. Confirm Node 24 as the approved deviation (recommended) rather than installing 22.
5. Confirm M0-12 stays fixture-only until D04 (holds spend at £0).
6. Set JobGuard's daily share of Codex sessions **and Claude verdicts** against education (first) and the control plane — this sets the real calendar.
7. D12 (third-party data protection) is now on the register for you/legal before G1.

## 6. Findings set aside

Fourteen candidate findings were refuted by the refuters, mostly because the plan already handles them (the M1-15 trial already routes through the Decision Inbox via the execution model; the fee model's reversal cannot drive the liability negative; the regulated actions are all correctly deferred). Limits of this review: no live model, database, sandbox or payment rail was exercised; four of the seven lenses degenerated on the first pass and were re-run directly; the reviewers are all Claude-family, so this is one independent checker's verdict, not a cross-family panel.

## 7. Files

- This verdict: `outputs/jobguard-plan-validation-2026-09-11/VALIDATION_VERDICT.md`
- Applied fixes: `my-new-project/BUILD_PLAN.md` + `AGENTS.md` rev 2.2 (change log at top; rev 2.1 in `docs/archive/`)
- Corrected first-wave dispatch: `my-new-project/ISSUE_PACKET_WAVES_0-1_2026-09-11.md`
- Reuse from OWN MIND: `outputs/jobguard-plan-validation-2026-09-11/OWN_MIND_REUSE.md`
- Evidence: `evidence/` (fee-fixture run, workflow findings)
