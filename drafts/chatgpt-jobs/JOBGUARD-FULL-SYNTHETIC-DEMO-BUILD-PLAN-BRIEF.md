# Brief for Astra (ChatGPT): write the full JobGuard synthetic-demo build plan

**Your job:** turn this into a detailed, ordered, leaf-by-leaf build plan (work orders with exact
"Done when" acceptance criteria) that a Codex-builds / independent-Claude-checks loop can execute and
verify. Extend the existing `BUILD_PLAN.md` (rev 2.2) — do not reinvent it. Output ordered leaves,
each buildable tonight with no live/real switches.

## Context (current reality)
- Repo `ben2harwood-lgtm/jobguard` (private). pnpm+Turbo monorepo: `apps/web` (Next.js 15),
  `apps/api` (NestJS), `packages/db` (Postgres 16, FORCED RLS, roles `jobguard_migration` /
  `jobguard_runtime`), `packages/core` (exact-integer `Money`), Zod contracts, Vitest +
  embedded-postgres, Playwright e2e (`mobile-360` + `desktop`).
- M0 (foundations) and M1 (synthetic core loop) are COMPLETE and merged. A synthetic demo is deployed
  live at `jobguard-demo.vercel.app` (Neon Postgres + Vercel), bootstrap Neon-compatible.
- **But the deployed demo only truly wires a thin slice.** `apps/web` calls only these backend routes:
  `/api/session`, `/api/jobs`, `/api/jobs/capture`, `/api/quotes/preview`, `/api/decisions`. So the
  builder can: sign in → see jobs → talk/type the work → get a **priced draft quote** → see a
  decisions inbox. Everything else — proof capture, extras/variations, final account, customer
  invoice, payment, recovery, fee illustration — is either a **front-end illustration not driving the
  backend**, or **not built**. There is **no voice capture** at all. There is **no surface that shows
  the builder the value** ("how JobGuard saves/protects your money").
- The heavy features were deliberately parked (per BUILD_PLAN): real overcharge detection,
  bank-verified recovery, platform collection, materials model (M2-1), native offline, statutory
  billing — several gated behind decisions D01–D12 / gates G1, G4 / pilot M0-13.

## Goal
A **complete synthetic sandbox** a non-technical builder (the prospect, "Tommy") can play through
**end-to-end on desktop and phone**, covering the whole product story, with **backend AND UI wired
together per leaf**. This is a **trial sandbox, not a paying customer** — so build everything on
synthetic data with every real-money / real-send / real-data action **simulated and clearly
labelled**, and keep the legal/commercial gates for the *live* switch (to be signed off before any
paying customer). Ben has authorised building the full feature set on synthetic data now.

## Build everything (make real on synthetic data; backend + UI together; each independently testable)
1. **Full core journey wired end-to-end** in `apps/web` driving the real backend commands and made
   fully clickable in plain English: capture → review/confirm → quote (price + priced revisions) →
   send (SIMULATED) → customer acceptance → switch-live → decision inbox → proof capture + operational
   stage gates → variations (priced revisions) → final-account assembly → customer invoice (immutable
   numbered, SIMULATED send) → payment recording → recovery-fee guard → fee illustration.
2. **Voice capture** on the "walk the job" step — the builder talks and it becomes editable text. Use
   the **browser's own on-device speech-to-text** (no paid/live transcription provider, synthetic
   content only). Production/paid transcription stays gated.
3. **Materials costs**: materials model, agreed rates, purchase-order pre-commit checks (M2-1 +
   materials milestone) — synthetic.
4. **Recovery / "chase the unpaid money" side** (M3/M4): qualifying outcomes, evidence packs, approved
   pursuit communications, recovery-fee engine, fee statements — all **SIMULATED** (no real bank feed,
   no real collection, no real sending).
5. **Overcharge detection / commercial-integrity signals** made real-on-synthetic — extend the M1-16
   D11 instrumentation into a builder-visible "things to check" surface. **Flag, never auto-penalise.**
6. **A clear, honest "how JobGuard protects/saves you money" value surface** — show, per job and
   overall, the concrete ways it saved/protected money (locked agreed price, every extra captured, no
   sign-off without proof, honest final bill, money chased/recovered, overcharges flagged), with
   **real numbers from the synthetic journey**. Label anything still simulated. Do not over-claim
   (respect the "mapped, inspectable" / no bare "verified" claim discipline).

## Hard constraints (bind every leaf)
- **Synthetic / sandbox only.** NO real customer data, NO live send (email/SMS), NO real
  charge/collection/payout, NO real bank feed (no live TrueLayer), NO paid/live AI provider. All such
  actions are simulated and clearly labelled. Decisions **D01–D12**, gates **G1 / G4**, pilot
  **M0-13** still govern the real/live switch and are signed off **before any paying customer** — do
  NOT flip them; keep the production-seed safety refusal.
- **Money exact-integer** (`packages/core` Money, GBP pence, no float). **Forced RLS** on every tenant
  table; `jobguard_migration` owns tables; `jobguard_runtime` restricted (non-superuser,
  non-bypass-RLS, SELECT/INSERT), Neon-compatible (non-superuser owner). **Append-only audit**
  (hash/identity, not free text/bytes).
- **Each leaf ships backend + UI together**, with Vitest (real-Postgres where it touches the DB) +
  Playwright e2e (mobile-360 + desktop) proving the builder-visible behaviour. Keep CI fail-closed
  (dependency audit, secrets scan, lane-boundary lint). Register a lane per branch. **No binary
  assets** (inline SVG/CSS, system fonts). **Mobile-first.**
- **Sequence** leaves so the demo stays shippable/green at every step, dependencies respected, sized
  for a Codex-builds / independent-Claude-checks loop (like M1).

## Output format
An ordered list of build leaves. For each: **id** (e.g. `UIWIRE-1`, `M2-2`, `M3-1`, `M4-3`,
`VALUE-1`, `VOICE-1`), a one-line **goal**, the **backend + UI** it adds, and a precise **"Done when"**
acceptance list — including the exact Playwright e2e assertions a checker will verify. **Flag any leaf
that needs a Ben decision** (e.g. a fee/tax/commercial wording, or a legal wording shown in the demo)
before it can be built. End with a short dependency/order summary.
