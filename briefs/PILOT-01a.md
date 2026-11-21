# Build order PILOT-01a (JobGuard real free pilot, G1) — coordinator, 21 Nov 2026

Base: origin/main at ee974f0343fee3822f952b0299bc1f4c2ac8ad3d. Push to branch codex/sandbox/pilot-01a. Do not open a PR; the coordinator does.

Read first: docs/plans/PILOT-G1-PLAN.md from commit eefbdcd7dfdd13e0f81598c3e905ae65b07ed738 (`git show eefbdcd7dfdd13e0f81598c3e905ae65b07ed738:docs/plans/PILOT-G1-PLAN.md`), section "PILOT-01a — Enforce pilot approval and G1 before opening a workspace path". That section's Goal, Allowed paths and both "Done when" paragraphs are the full contract. Also read docs/workflow/SIMPLICITY_RULE.md if present.

Rules:
- Stay inside the section's Allowed paths. Do not weaken, skip or delete any existing test or guard; the only expectation change allowed is the one the section names (enterprise-real-data.test.ts:26 now expects refusal for proposed pilot D04).
- Fictional approvals only, in isolated tests. No real providers, emails, people or secrets. The G1 switch defaults closed.
- No new migrations unless strictly required; if you need one, take the next free number after main's highest and say so.
- Run: pnpm --filter @jobguard/config test, the API tests you touch, web typecheck, and the boundary proof. Report exact commands and pass counts in the final message, plus the 243-reference inventory file path.
- Keep it simple: smallest change that meets the contract.
