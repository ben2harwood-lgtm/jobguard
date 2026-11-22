# Build order PILOT-06 (JobGuard real free pilot, G1) — coordinator, 22 Nov 2026

Build ahead on passed predecessors: start from branch codex/sandbox/pilot-04b at 9c48bca105cd22d03882cc507e575aa3acc0e52c (PILOT-04a and 04b, independent checks PASS, landing via PRs #877 and #879), then merge origin/main into it first (main already has PILOT-01a, 01b, 02, 03 and 08). Push to branch codex/sandbox/pilot-06. Do not open a PR.

Contract: `git show eefbdcd7dfdd13e0f81598c3e905ae65b07ed738:docs/plans/PILOT-G1-PLAN.md`, section "PILOT-06 — Build real customer portal sign-in and job-scoped access" (Goal, Reference, Allowed paths, Done when). Also read docs/workflow/SIMPLICITY_RULE.md if present.

Rules:
- Stay inside the section's Allowed paths; add config/lanes/pilot-06.json listing exactly the files you change.
- Do not weaken, skip or delete any existing test or guard, and change no existing test expectation. If one seems to need changing, stop and say which and why.
- Do not add imports from @jobguard/api/* into practice-only web files (synthetic-server.ts etc.).
- Fictional data, fake ports and isolated fixtures only. No real providers, credentials, people or secrets. G1 stays closed by default.
- If you add a migration, take the next free number after the base's highest (0774), declare every owner change, grant and routine in its proof file in its own group with an authority path (as 0773 and 0774 do, never inside a group an existing test pins), and run the db guard tests (lp-0-grant-freeze, lp-0-authority-paths, bound-context-reader, money-trail-security, deployment-preflight) if you can.
- Money and amounts always come from the server, never the client. Stamp times on the server.
- Before pushing, run and report with counts: the FULL apps/api suite, the full apps/web suite, config tests, any db tests you touch, API and web typecheck with packages/config/dist removed, web build:cloudflare, `node --test tools/*.test.mjs`.
- Keep it simple: the smallest change that meets the contract.

For PILOT-06 only: PILOT-05 (final account, Final Check, invoice screens) is built in parallel; do not edit those files. Include the cancellation notice kit (attachCancellationKit, as the practice path does) on customer-facing quotes, and stamp customer acceptance time on the server.
