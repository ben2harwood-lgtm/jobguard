# Build order PILOT-11 (JobGuard real free pilot, G1) — coordinator, 22 Nov 2026

Base: origin/main at 6cf0a9a6b31297d3f57c96fd5f2c3a03142efc4a (PILOT-01a, 01b, 02, 03, 04a, 04b, 06 and 08 merged). Push to branch codex/sandbox/pilot-11. Do not open a PR.

Contract: `git show eefbdcd7dfdd13e0f81598c3e905ae65b07ed738:docs/plans/PILOT-G1-PLAN.md`, section "PILOT-11 — Prepare the evidence index and current-head test matrix" (Goal, Reference, Allowed paths, Done when). Also read docs/workflow/SIMPLICITY_RULE.md if present.

Rules:
- Stay inside the section's Allowed paths; add config/lanes/pilot-11.json listing exactly the files you change.
- Do not weaken, skip or delete any existing test or guard, and change no existing test expectation. If one seems to need changing, stop and say which and why.
- Do not add imports from @jobguard/api/* into practice-only web files (synthetic-server.ts etc.).
- Fictional data, fake ports and isolated fixtures only. No real providers, credentials, people or secrets. G1 stays closed by default.
- If you add a migration, take the next free number after the base's highest (0774), declare every owner change, grant and routine in its proof file in its own group with an authority path (as 0773 and 0774 do, never inside a group an existing test pins), and run the db guard tests (lp-0-grant-freeze, lp-0-authority-paths, bound-context-reader, money-trail-security, deployment-preflight) if you can.
- Money and amounts always come from the server, never the client. Stamp times on the server.
- Before pushing, run and report with counts: the FULL apps/api suite, the full apps/web suite, config tests, any db tests you touch, API and web typecheck with packages/config/dist removed, web build:cloudflare, `node --test tools/*.test.mjs`.
- Keep it simple: the smallest change that meets the contract.


For PILOT-11 only: start the index now with current evidence (PRs #872, #874-#880 and their verdicts); mark PILOT-05, 07, 09, 10 and 12-23 as pending. Scrub secrets and personal data. Touch only your allowed paths.
