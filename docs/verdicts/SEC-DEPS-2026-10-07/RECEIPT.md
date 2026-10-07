# SEC-DEPS-2026-10-07 — builder receipt

**Builder:** Claude Opus 5.5, coordinator session "Full-steam parallel build plan", on Ben's explicit instruction in chat (7 Oct 2026): "C makes the JobGuard dependency patch". (The JobGuard integrator's attempt to give Codex network access for this was refused by its safety check; Ben then authorised the coordinator directly.) Not independently verified, not accepted.

**Why:** GitHub `dependency-review` has been red on `main` and every PR since 5–6 Oct for three advisories: proxy-addr 2.0.7 (critical, GHSA-jqcg-44mw-7w3h → 2.0.8), source-map-js 1.2.1 (high, GHSA-68fv-2mgg-jv7q → 1.2.2), sharp 0.35.4 (high, GHSA-wq5f-xc86-pv6w → 0.35.5).

**Change (same pattern as SEC-DEPS-2026-09-30, PR #94):**
- `package.json` `pnpm.overrides`: `sharp@>=0.34.0 <0.35.4 → 0.35.4` becomes `sharp@>=0.34.0 <0.35.5 → 0.35.5`; added `proxy-addr@>=2.0.0 <2.0.8 → 2.0.8` and `source-map-js@>=1.0.0 <1.2.2 → 1.2.2`. All bounded to the vulnerable range.
- `pnpm-lock.yaml` regenerated with pnpm 10.28.1 (`pnpm install --lockfile-only`); it resolves proxy-addr 2.0.8, sharp 0.35.5, source-map-js 1.2.2.
- `config/agent-lane-assignments.json`: new lane `sec-deps-2026-10-07` (same allow list as the 09-30 lane).
No application code, test, CI workflow or other dependency changed.
