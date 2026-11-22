# Build order PILOT-04b (JobGuard real free pilot, G1) — coordinator, 21 Nov 2026

Build ahead on the passed predecessor: base = branch codex/sandbox/pilot-04a at 1c022e8c504df0e56899d510ecfa8ef08d275829 (PILOT-01a, 01b, 02 and 08 merged on main; PILOT-04a independent check PASS, landing via PR #877). Push to branch codex/sandbox/pilot-04b. Do not open a PR.

Contract: `git show eefbdcd7dfdd13e0f81598c3e905ae65b07ed738:docs/plans/PILOT-G1-PLAN.md`, section "PILOT-04b — Connect acceptance, switching live, extras and proof" (Goal, Reference, Allowed paths, Done when). Also read docs/workflow/SIMPLICITY_RULE.md if present.

Rules:
- Stay inside the section's Allowed paths; add config/lanes/pilot-04b.json listing exactly the files you change.
- Do not weaken, skip or delete any existing test or guard, and change no existing test expectation. If one seems to need changing, stop and say which and why in your final message.
- Do not add imports from @jobguard/api/* into apps/web/app/lib/synthetic-server.ts or other practice-only files (existing import-allowlist tests forbid it).
- Fictional data, fake ports and isolated fixtures only. No real providers, credentials, people, domains or secrets; .env.example and any infrastructure files get placeholders only. Nothing is deployed.
- No migration unless strictly required; if needed, take the next free number after the base's highest and say why.
- Before pushing, run and report with pass counts: the FULL apps/api suite (vitest run src), the full apps/web suite, config tests, any db tests you touch, API and web typecheck with packages/config/dist removed, web build:cloudflare, and `node --test tools/*.test.mjs`.
- Keep it simple: the smallest change that meets the contract.


For PILOT-04b only: PILOT-03 (email ports, PR #878) is in review in parallel; use the existing fake delivery where delivery is exercised and do not edit apps/api/src/auth/identity-email.ts or apps/api/src/effects/*email*. Use acceptance fixtures until PILOT-06 connects the customer portal. If you add a migration, declare every owner change and grant in its proof file the way 0773 does, and run the db guard tests (lp-0-grant-freeze, lp-0-authority-paths, money-trail-security, deployment-preflight) if you can.
