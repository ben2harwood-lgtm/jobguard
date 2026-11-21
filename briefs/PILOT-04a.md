# Build order PILOT-04a (JobGuard real free pilot, G1) — coordinator, 21 Nov 2026

Build ahead on the passed predecessor: base = branch codex/sandbox/pilot-02 at 0db78276780efabd0c07d154c6f7ef6827052152 (PILOT-01a, 01b and 08 merged on main; PILOT-02 independent check PASS, landing via PR #876). Push to branch codex/sandbox/pilot-04a. Do not open a PR.

Contract: `git show eefbdcd7dfdd13e0f81598c3e905ae65b07ed738:docs/plans/PILOT-G1-PLAN.md`, section "PILOT-04a — Open the builder job list, capture and quote issue" (Goal, Reference, Allowed paths, Done when). Also read docs/workflow/SIMPLICITY_RULE.md if present.

Rules:
- Stay inside the section's Allowed paths; add config/lanes/pilot-04a.json listing exactly the files you change.
- Do not weaken, skip or delete any existing test or guard, and change no existing test expectation. If one seems to need changing, stop and say which and why in your final message.
- Do not add imports from @jobguard/api/* into apps/web/app/lib/synthetic-server.ts or other practice-only files (existing import-allowlist tests forbid it).
- Fictional data, fake ports and isolated fixtures only. No real providers, credentials, people, domains or secrets; .env.example and any infrastructure files get placeholders only. Nothing is deployed.
- No migration unless strictly required; if needed, take the next free number after the base's highest and say why.
- Before pushing, run and report with pass counts: the FULL apps/api suite (vitest run src), the full apps/web suite, config tests, any db tests you touch, API and web typecheck with packages/config/dist removed, web build:cloudflare, and `node --test tools/*.test.mjs`.
- Keep it simple: the smallest change that meets the contract.

For PILOT-04a only: PILOT-03 (email ports) is being built in parallel; where delivery is exercised, use the existing fake delivery port from PILOT-02 and do not edit apps/api/src/auth/identity-email.ts or the email port files.
