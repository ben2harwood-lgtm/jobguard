# Build order PILOT-10 (JobGuard real free pilot, G1) — coordinator, 22 Nov 2026

Build ahead on the passed predecessor: base = branch codex/sandbox/pilot-05 at 0ef999db4f09bd36576b87c76b96d7fa2289fee6 (PILOT-05 independent check PASS, landing via PR #883; it already contains main with PILOT-01a to 04b, 06, 08, 09 and 11). Push to branch codex/sandbox/pilot-10. Do not open a PR.

Contract: `git show eefbdcd7dfdd13e0f81598c3e905ae65b07ed738:docs/plans/PILOT-G1-PLAN.md`, section "PILOT-10 — Instrument the shadow pilot and no-charge report" (Goal, Reference, Allowed paths, Done when). Also read docs/workflow/SIMPLICITY_RULE.md if present.

Rules:
- Stay inside the section's Allowed paths; add config/lanes/pilot-10.json listing exactly the files you change.
- Do not weaken, skip or delete any existing test or guard, and change no existing test expectation. If one seems to need changing, stop and say which and why.
- Do not add imports from @jobguard/api/* into practice-only web files (synthetic-server.ts etc.).
- Fictional data, fake ports and isolated fixtures only. No real providers, credentials, people or secrets. G1 stays closed by default.
- If you add a migration, take the next free number after the base's highest (0776), declare every owner change, grant and routine in its proof file in its own group with an authority path (as 0773 and 0774 do, never inside a group an existing test pins), and run the db guard tests (lp-0-grant-freeze, lp-0-authority-paths, bound-context-reader, money-trail-security, deployment-preflight) if you can.
- Money and amounts always come from the server, never the client. Stamp times on the server.
- Before pushing, run and report with counts: the FULL apps/api suite, the full apps/web suite, config tests, any db tests you touch, API and web typecheck with packages/config/dist removed, web build:cloudflare, `node --test tools/*.test.mjs`.
- Keep it simple: the smallest change that meets the contract.


For PILOT-10 only: do NOT touch Final Check shadow processing, app.lp11_bind_shadow_job or the pilot worker Final Check refusal (that is PILOT-05b). Measure only what already runs in the pilot. No personal data in reports. PILOT-07 is built in parallel; do not edit email files.
