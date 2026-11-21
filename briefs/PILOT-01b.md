# Build order PILOT-01b (JobGuard real free pilot, G1) — coordinator, 21 Nov 2026

Build ahead on the passed predecessor: base = branch codex/sandbox/pilot-01a at 5181967425347f226c920ead617c3ca0f9b09adf (PILOT-01a, independent check PASS, landing via PR #872). Push to branch codex/sandbox/pilot-01b. Do not open a PR.

Contract: `git show eefbdcd7dfdd13e0f81598c3e905ae65b07ed738:docs/plans/PILOT-G1-PLAN.md`, section "PILOT-01b — Separate pilot resources from practice, sandbox and billing" (Goal, Allowed paths, Done when). Also read docs/workflow/SIMPLICITY_RULE.md if present.

Rules:
- Stay inside the section's Allowed paths; add a config/lanes/pilot-01b.json listing exactly the files you change.
- Do not weaken, skip or delete any existing test or guard, and change no existing test expectation. If one seems to need changing, stop and say which and why in your final message.
- Fictional resources and isolated fixtures only. No real providers, credentials, people or secrets; .env.example gets placeholders only.
- No migration unless strictly required; if needed, take the next free number after the base's highest and say why.
- Run and report exact commands with pass counts: config, API and web tests you touch, API and web typecheck (with packages/config/dist removed), web build:cloudflare, `node --test tools/*.test.mjs`.
- Keep it simple: the smallest change that meets the contract.
