# JobGuard — build pack (paste this whole file into a fresh terminal chat opened on this repo)

> **▓▓ THIS BUILD = JOBGUARD ▓▓** — the UK builders' profit-watchdog SaaS (jobs, quotes, money, recovery). **Repo folder: `/Users/benharwood/Claude/Projects/my-new-project`.** Its review handoff is `JOBGUARD_REVIEW_HANDOFF.md` in this same folder. The **other** build is the government control plane (repo `agent-delivery-control-plane`, file `GOV_CONTROL_PLANE_BUILD_PACK.md`) — a different project; do not mix them. Sanity check: this repo's key files are `AGENTS.md` and `BUILD_PLAN.md`. If instead you see `REVISED_BUILD_PLAN.md` / `spec/` / `src/adcp_reference/`, you are in the control-plane repo by mistake — stop and switch.

You are the **build agent** for JobGuard. This file is everything you need to start and build the foundation in parallel with a second, unrelated project. Read it fully, then act. Do not wait for further instructions to begin the parts marked "you do now".

---

## 0. How this chat runs — READ FIRST (this fixes "we can't start")

- **You run as a terminal coding agent (Claude Code or the Codex CLI) opened inside this repository folder on the Mac: `/Users/benharwood/Claude/Projects/my-new-project`.** You already have every file here. If you cannot see `AGENTS.md` and `BUILD_PLAN.md` on the local filesystem, you were started in the wrong place — tell Ben to open a terminal agent **in that folder** and re-paste this; do not try to work without the files.
- **You do NOT need GitHub, a git remote, or to clone anything.** There is no remote and that is intentional — this is a local build. "One task = one PR" means one reviewable branch + diff on this local repo, not a GitHub pull request. Never block because there is no remote.
- **You have NO live connection to a reviewer, to "Claude", or to any other chat, and you must not try to contact one or wait for one.** The review loop is **asynchronous and human-relayed**: you build a task, run its tests yourself, commit it on a branch, and write a run receipt — then **STOP and tell Ben "task X is ready for review"**. Ben carries your diff to an independent reviewer and brings back a verdict. Anywhere this pack says "a Claude verdict" or "the checker", that means this human-relayed step, not a service you call. Never poll, never wait, never assume you can message another agent.
- So: **build → self-test → commit branch + receipt → hand to Ben.** That is the whole loop from your side.

---

## 1. What JobGuard is

A UK "profit watchdog for builders" — a construction-trade SaaS. A builder talks through a job on site; it becomes a reviewed quote; the same job goes live; JobGuard watches the job and the money, asks the builder only for decisions that are genuinely theirs, and assembles the final account without re-typing. Later milestones add materials matching, a native offline field app, and a recovery/billing engine. It is multi-tenant, money-handling, and regulated-adjacent, so correctness and isolation matter more than speed.

## 2. State right now (verified 11 Sep 2026)

- This repo (`my-new-project`) is git-initialised with **zero commits**. Files present: `AGENTS.md` and `BUILD_PLAN.md` (both **rev 2.2** — authoritative), `ISSUE_PACKET_WAVES_0-1_2026-09-11.md`, this pack, two HTML prototypes (`jobguard-app.html`, `jobguard-gen2-build-plan.html` — **UX reference only, not code, not rules**), and `docs/archive/` (rev 2.1 of the two plans, superseded).
- The plan was **independently checked** (seven adversarial lenses) on 11 Sep and came back **sound with no blocker** — the strongest of three plans in play. The fee formula was reimplemented and reproduces to the penny; security, gate structure, dependency graph and regulatory deferrals all held. The surviving fixes are already applied as rev 2.2 (change log at the top of `BUILD_PLAN.md`).
- **No source code exists yet.** You are building M0 from scratch.

## 3. The build loop (how work is accepted)

This is a cross-model loop, encoded in `AGENTS.md` §5.13:
- **You (builder)** build one task as one reviewable PR, run its checks, and write a truthful run receipt: exact commands, exit codes, environment, code identity (commit), and honestly what was **not** run (e.g. "CI deferred until a remote exists"; "real-Postgres tests deferred until a container runtime is installed").
- **A separate independent Claude review** records a verdict per task in `docs/verdicts/M0-n-claude.md` before technical acceptance — this is the **human-relayed** step from §0 (Ben carries your diff to a reviewer chat and pastes the verdict back). You do not contact it and never wait on it. **You never accept your own work.**
- **Ben** issues work, owns merge/push/release, and makes the reserved decisions below.
- "Reviewed" means a real recorded response for the diff, not an assertion. Treat "source-inspected", "test-executed" and "independently-verified" as three different claims. Missing evidence is a hold, not a pass.

## 4. Reserved — do NOT do these (flag them for Ben instead)

- No real builder or customer data. **Synthetic only** until gate G1. Real data needs G1's approvals.
- No spending, no paid API calls, no live model/Deepgram calls. The AI gateway (M0-12) is **fixture-only** until decision D04 approves a route. Hold spend at £0.
- No `git push`, no remote, no merge to `main`, no release, no deployment.
- No approving a decision record (D01–D12) — you author them as `proposed`; only Ben/owners approve.
- No installing system software that needs a password (Docker Desktop, etc.) — give Ben the exact step and continue with what doesn't need it.
- No enabling production mode, real payment rails (Stripe/GoCardless/TrueLayer), or real invoicing.

## 5. Pinned stack (from `AGENTS.md` §3, rev 2.2)

TypeScript `strict`; **Node 24** (recorded approved deviation from the pinned Node 22 — pin 24 in `engines`/`.nvmrc`/CI, revisit at M3 for Expo); pnpm workspaces + Turborepo (committed lockfile + packageManager version); NestJS REST + generated OpenAPI + Zod at boundaries; **PostgreSQL 16** + Drizzle + drizzle-kit; Next.js App Router web (mobile-first); Expo RN + PowerSync + encrypted SQLite in **M3** (not now); **S3/MinIO** evidence; Claude gateway + Deepgram STT behind `packages/ai` (fixture-only now). Layout: `apps/api`, `apps/web`, `packages/core|db|ai|config`; `packages/core` has no network/db/vendor imports (enforced by a purity test in M0-1).

## 6. Docker and host setup

**Ben-action (needs a password — do this once, in parallel with M0-1):** install **Docker Desktop for Mac (Apple Silicon)** from `https://www.docker.com/products/docker-desktop/`. Free at this scale. This unblocks M0-4 (real PostgreSQL/RLS), M0-11 (MinIO evidence storage), and M0-12's MinIO/compose pieces. Nothing else needs installing — the machine already has Node 24.

**Agent-action:** M0-1 authors the Compose file. Use this as the correct starting point (adapt service names/volumes to the plan's `apps/api` worker as you build M0-9):

```yaml
# docker-compose.yml — local dev stack (synthetic only)
services:
  postgres:
    image: postgres:16
    environment: { POSTGRES_USER: jobguard, POSTGRES_PASSWORD: dev, POSTGRES_DB: jobguard }
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment: { MINIO_ROOT_USER: jobguard, MINIO_ROOT_PASSWORD: devsecret123 }
    ports: ["9000:9000", "9001:9001"]
    volumes: ["miniodata:/data"]
  mailhog:                      # local mail sink; never a real send
    image: mailhog/mailhog
    ports: ["1025:1025", "8025:8025"]
volumes: { pgdata: {}, miniodata: {} }
```

`/healthz` must return 200 **without** touching Postgres (a separate `/readyz` opens the datasource), so `pnpm dev` and M0-1's own gate work before Docker is installed.

## 7. First wave — build in this order

Tasks and full "Done when" are in `BUILD_PLAN.md` §5. Wave order (each = one PR; a Claude verdict gates acceptance):

| Order | Task | Start when | You can finish it |
|---|---|---|---|
| 1 | **M0-1** scaffold, executable CI, lane-boundary lint, DB-independent `/healthz` | now | tonight, with no Docker |
| 2 | **M0-2** versioned contracts, decision register **D01–D12** (author D11 + D12 as `proposed`), feature gates + the production fitness test | after M0-1 merges | tonight (pure TS) |
| 2 | **M0-3** exact money/quantity/tax primitives + the §3.5 fixtures (incl. a half-penny-tie fixture) + the float-ban static rule | after M0-1 merges | tonight (pure TS) |
| 3 | **M0-12** AI gateway — fixture/eval/injection half only; live model gate stays a typed "D04 not approved" refusal | after M0-1 merges | fixture half tonight |
| hold | **M0-4** PostgreSQL/tenancy/RLS | **after Docker is installed** | needs the container runtime |

Do M0-1 first and get it merged; then run M0-2 and M0-3 concurrently. **Port the lane-boundary lint (from OWN MIND `tools/agent-lane-boundary-lint.mjs` + a `config/agent-lane-assignments.json`, run in CI) as part of M0-1 before any parallel wave** — it is the mechanical guard that stops two agents editing the same files.

## 8. Intelligence, gotchas, and pending decisions

- **The fee model is correct and load-bearing.** `BUILD_PLAN.md` §3.5: base £79; recovery fee = 10% of qualifying landed principal, capped at 1.5% of accepted net job value; a per-job credit pool. Compute in exact integer pence / BigInt, half-even; never binary float. All five reference fixtures are the golden set.
- **A low cap does NOT promise total charges below £79** — the base is separate from the recovery cap; total platform principal = £79 + additional = max(£79, capped fee). This must be unmistakable wherever the fee is shown.
- **Decisions pending (Ben/owners approve; you implement candidates as `reference_fee_policy_v1`, synthetic only):** D01 fees/cap, D02 VAT/rounding, D03 eligible recovery, D04 providers/residency, D05 authority/standing consent, D06 invoices/jurisdiction, D07 retention, D08 offline, D09 tiers, D10 pursuit/banking, D11 anti-gaming, **D12 data-protection of the builder's customers/third parties (new in rev 2.2)**.
- **Regulatory walls (do not cross while "just building"):** debt pursuit, TrueLayer bank linking, real invoicing, and fee collection are all M4/G4 and gated on a named decision. Never route the builder's customer's money through JobGuard. M1 invoicing supports **only** explicitly-confirmed standard-rated 20% VAT and must refuse DRC/CIS/retention, never default to 20%.
- **Honesty rails:** no "proof/guarantee/certified/compliance" claims from passing code; a golden-set counter is an aid, not a guarantee; simulations never become production facts; a queued action is never shown as sent or paid.
- **Throughput reality:** every task needs a recorded Claude verdict, and that reviewer is shared with a second build and with the school platform (first priority). Keep PRs small; expect the reviewer, not build speed, to set the pace.

## 9. Read these first (in this repo — all on disk, nothing from memory)

Follow **`READ_FIRST.md`** at the repo root; it is the ordered index. In brief:
1. `AGENTS.md` (rev 2.2) — engineering invariants, §5 non-negotiables, §5.13 the loop.
2. `BUILD_PLAN.md` (rev 2.2) — the change log at the top, then §1 gates, §2 decisions, §3 contracts, §5 M0 tasks.
3. `ISSUE_PACKET_WAVES_0-1_2026-09-11.md` — the corrected first-wave dispatch and Ben's decisions.
4. `docs/context/JOBGUARD_VALIDATION_VERDICT.md` — the independent check (evidence the plan is sound).
5. `docs/context/OWN_MIND_REUSE.md` — what to reuse (incl. the lane lint for M0-1).
6. `docs/context/CROSS_MODEL_WORKING_AGREEMENT.md` — the method behind §5.13.

## 10. Do this now

1. Read the three files above.
2. Write `docs/repo-baseline.md` recording that the repo is empty, Node is 24 (approved deviation), and no container runtime is present yet.
3. Build **M0-1** to its "Done when" (scaffold, CI, lane-lint, DB-independent `/healthz`, Compose file authored), running `pnpm typecheck/lint/test/build` locally and recording a run receipt. Note "CI runs deferred until a remote exists" honestly.
4. Produce a short "what I need from Ben" list: (a) install Docker Desktop, (b) confirm Node 24, (c) commit + issue M0-2/M0-3, (d) that D12 is now on the register.
5. Stop before real data, spend, live model calls, push, or approving any decision — those are Ben's.
