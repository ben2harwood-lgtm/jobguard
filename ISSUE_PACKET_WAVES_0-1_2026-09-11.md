# JobGuard — issue packet for waves 0 and 1 (corrected after the independent check)

**Date:** 11 September 2026 (rev 2, after the seven-lens check and the rev 2.2 plan fixes) · **Prepared by:** Claude (checker) as Ben's hands · **Authority:** this packet issues nothing. Ben issues work; Codex builds; a Claude verdict checks each task (AGENTS §5.13); Astra records acceptance; merges to `main` are Ben's.
**Contracts:** `AGENTS.md` and `BUILD_PLAN.md` rev 2.2 (this repo; rev 2.1 archived in `docs/archive/`).

## 0. State of this repo and machine (verified)

- `git` on `main`, **zero commits**; untracked: `AGENTS.md`, `BUILD_PLAN.md` (rev 2.2), this packet, two HTML prototypes.
- Machine: Node **24** on PATH (plan pins 22 — now an approved deviation, rev 2.2 item 5); **no Docker/Colima/Podman/Homebrew**; no local Postgres/MinIO; `codex` **not on PATH** (only `~/.codex/auth.json`).
- Consequence: the "four agents per wave" model is not available until Codex is invocable; real-database tasks cannot reach their "Done when" until a container runtime is installed.

## 1. What can start tonight

| Wave | Task | Tonight? | Needs |
|---|---|---|---|
| 0 | **M0-1** scaffold + CI + lane-lint | **Start and finish** (rev 2.2 made `/healthz` DB-independent) | Node 24; authors the Compose file (no runtime needed for M0-1's own gate) |
| 1 | **M0-2** contracts/decisions (incl. D11, D12 records) | **Start and finish** after M0-1 merges | pure TypeScript |
| 1 | **M0-3** money/tax primitives | **Start and finish** after M0-1 merges | pure TypeScript |
| 1 | **M0-12** AI gateway (fixture half) | Start after M0-1 | pure TypeScript; live model gate stays D04-stubbed; **no MinIO** (that's M0-11) |
| 1 | **M0-4** db/tenancy/RLS | **Hold** | a container runtime that does not yet exist |

Tonight's real dispatch is **M0-1**, then **M0-2 ∥ M0-3** once it merges.

## 2. Ben's decisions and installs (each one line)

1. **Commit the docs** to fix the base (command in §5).
2. **Builder channel:** put a Codex CLI on PATH + authenticate, or accept driving Codex interactively one session at a time. Without this, nothing builds tonight.
3. **Install Docker Desktop** for Apple Silicon (.dmg, no Homebrew, ~30–60 min) — unblocks M0-4, M0-11, M0-12-MinIO. Can install while M0-1 runs.
4. **Node 24** approved as the deviation (recommended) — do not install 22.
5. **M0-12 fixture-only** until D04 — holds spend at £0. Confirm.
6. **Ration the scarce checker:** set JobGuard's daily share of Codex sessions and Claude verdicts against education (first priority) and the control plane. This, not agent-days, sets the calendar (~10–16 weeks to a trial-passed M1 under three-way sharing).
7. **D12** (third-party data protection) is now on the register for you/legal before G1 — not needed tonight.

## 3. Per-task loop (AGENTS §5.13)

1. Ben issues the task ("issue M0-n to Codex").
2. Codex builds on `codex/m0-n-<slug>`, runs the checks, writes a truthful receipt (commands, exit codes, environment, code identity, what was not run — e.g. "CI deferred until push"; "real-Postgres tests deferred until runtime installed").
3. Claude records a verdict `docs/verdicts/M0-n-claude.md` (ACCEPT / REPAIR / REJECT), bound to the commit. Builder never reviews its own work.
4. Astra records acceptance `docs/verdicts/M0-n-acceptance.md` or requests repair (two attempts, then hold).
5. Merge to `main` is Ben's; no remote push until Ben says so.

## 4. Exact next step

```bash
cd "/Users/benharwood/Claude/Projects/my-new-project" && git add -A && git commit -m "docs: JobGuard plan rev 2.2 + issue packet (waves 0-1)"
```

Then issue M0-1 to Codex: "Build M0-1 per BUILD_PLAN.md §5 and AGENTS.md rev 2.2; the repo is empty; Node is 24 (record the approved deviation); make /healthz DB-independent; include the agent lane-boundary lint in CI; produce docs/repo-baseline.md and a run receipt." Install Docker Desktop in parallel so M0-4 can start after M0-1 merges.
