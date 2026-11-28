# Q88 · V2-PAIR-1: every V2 route that reads a practice session also checks the browser pair, and every V2 POST checks the origin

**Tier:** T2 security (route files and tests only, no SQL; desktop code and security review). **Builder:** Opus 5.5 thread. **Checker:** desktop Codex, both the code review and the security review. **Base:** v2/main + #1057 at its head when you start (record the sha). **Branch:** the builder thread's own branch, in a new lane `config/lanes/v2-pair-1.json`. **Migration:** none. If SQL turns out to be needed, it becomes RED; stop and tell the planner. **From:** desktop Codex BLOCKING verdict on #1060 @ 89efa7d95: P1 (no pairing) and P2 #2 (no origin gate). Both are pre-existing on v2/main, not G6's. **Planner:** 28 Nov 16:55 UK.

## What it is
Some V2 routes call `jg_session` and act on the practice session without `enforcePracticePair`: practice-sent, the v2-backend work-plan and attendance routes, and probably quote-prompts and quotes/activation. A cookie on its own, without the paired browser, is then enough to act. The work-plan POST also has no configured-origin check.

## Steps
1. **Inventory first.** Grep every `jg_session` caller under apps/web and apps/api. Put a table in the PR: route, method, pair before and after, origin gate before and after.
2. Add `enforcePracticePair` to every V2 read and write in that table. Add the configured-origin check, the same helper the already-gated V2 POSTs use, to **every** V2 POST, not only work-plan.
3. Change no behaviour for a correctly paired, same-origin request.

## Off limits
Everything Codex has claimed: the parser and reader, `job-understanding.ts`, `jobguard-app.tsx`, `designed-ui.tsx`, `review-proposal.tsx`, `local-dictation.tsx`, `review-draft.ts`, `capture.application.ts`, the shared styles and billing-export. If a route that needs pairing lives in one of these, list it in the PR as "left for the owner" and tell the planner. Don't edit it.

## Tests
For each route in the table:
- missing pair, mismatched pair and stale pair are each refused, and nothing is written;
- for POSTs, a foreign origin and a missing origin are each refused, and nothing is written;
- a paired, same-origin request passes.

v2-seed, CI1 and the existing practice-pair tests pass unchanged. Rule 29/30: no route and no table added.

## Done when
- Every V2 `jg_session` caller pairs, and every V2 POST is origin-gated.
- Desktop code and security verdicts name the head and are clean.
- The #1060 re-review comment links this PR as the fix for the pre-existing P1 and P2 #2.
