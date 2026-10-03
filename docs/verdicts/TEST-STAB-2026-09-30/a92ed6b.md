# TEST-STAB-2026-09-30 — independent verdict at a92ed6b

VERDICT: REPAIR
TASK: TEST-STAB-2026-09-30 (PR #95)
HEAD: a92ed6b9084c44aa1d232863c2fb280106388f4f
Reviewer: Claude (cloud session), fresh context; not the builder (Codex) or the integrator. Date: 1 October 2026.

Claims 1–3 and 5 hold: approval gating binds the displayed revision/hash/recipient/amount; the job-scoped command lock releases on every error path and discards pre-command reads; `parsePoundsToPence` is exact (probes: "0.5"→50, "4.35"→435, "1.15"→115; whitespace, exponents, leading zeros, "1.", ".5", non-ASCII digits, >2 decimals and >MAX rejected). Eight mutations of the new code (gating, lock timing, refresh hold, generation guard, error release, float parser) each fail the new unit tests. e2e spec changes are additions only; no timeout, retry or skip changes.

Linux evidence (Node 24.15.0, pnpm 10.28.1, embedded PostgreSQL 16.10): typecheck, lint (LANE_BASE_REF=10f1fae), build and `pnpm test` exit 0 on head and on 10f1fae (db 150/150 both; core 380 vs 326; web 54 vs 36).

Findings:
- P1 — M2-5-S fails deterministically (3/3 runs, mobile-360 and desktop): `supplier-fact-editor.tsx` calls `.replace` on `confirmed.quantity_decimal`, which `row_to_json` serializes from numeric(20,6) as a JSON number; the editor remounts after confirmation (key includes revision) and throws. Base 10f1fae passed 6/6 three times; head plus `String(…)` passed 6/6.
- P1 — CI `checks` (run 36757408925) fails lane lint: against main the stacked PR includes #94's `package.json` and `pnpm-lock.yaml`, outside this lane.
- P2 — the builder receipt had no executed e2e result for the changed specs.
- P3 — placement does not reject a superseded purchase-order revision; a never-settling fetch holds the job lock until reload; parser rejects trailing whitespace (UI could trim).

The race was not reproduced deterministically on 10f1fae (a scratch held-response spec approved £200.00 on both base and head); this is not evidence either way.
