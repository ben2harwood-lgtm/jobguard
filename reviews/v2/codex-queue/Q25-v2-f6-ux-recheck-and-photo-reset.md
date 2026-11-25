# Q25 · V2-F6-UX: customer "Check again" after a refusal, and photo ticks reset per link (F6-R plus F6-T2)

**Tier:** T1 (two client screens; no route, repository or migration change). **Builder:** any Codex (desktop lane A when a slot frees, or web Codex). No database is needed: component tests use the existing vitest and jsdom setup in `apps/web`. If there is none for these files, put the logic in a small pure helper and test that. **Base:** `codex/sandbox/v2-f6t` (#928, F6T's head). **Branch:** `codex/sandbox/v2-f6-ux`. **PR:** draft into `codex/sandbox/v2-f6t`. **Planner:** Fable thread, 25 Nov 14:55 UK. Use ★, effort XS, rework risk low.

## Rules this piece must meet
`01-RULES.md` (rules 1 to 28) and `02-BUILD-RULES-CHECKLIST.md`, with a "Rules met" list in the PR body.

## Dry-check against the code (planner, 25 Nov 14:50 UK, rule 23)
- Customer page `apps/web/app/customer/change/[capability]/view.tsx`: on a refused agree it says "Agreement refused. Ask the builder for a fresh link." and keeps `command.current`, so the name box stays locked. A link is pinned to one revision by design (F6), so "Check again" can only re-read *this* link. It must never jump to a newer version.
- Builder page `apps/web/app/v2/jobs/[id]/extra-links/view.tsx`: `photoIds` state is never cleared after `create` succeeds, so the next link starts with the last link's photos ticked.

## Change
1. **Customer page.** After a refused agreement, show a "Check again" button (min 44 px high).
   - It re-reads the same endpoint (GET, `no-store`).
   - If the link now shows `agreedAt`, show the recorded state.
   - If the link reads fine and isn't agreed, clear `command.current` so a fresh agreement uses a new `commandId` and the current `expectedVersion`, and unlock the name box.
   - If the read fails, show the existing "This link is unavailable. Ask the builder for a fresh link."
   - Keep "Agreement result unknown. Retry to check the same agreement." as it is: an unknown result must retry with the same command.
2. **Builder page.** After a successful `create`, clear `photoIds`. Don't clear them on failure, so a retry keeps the choice.
3. Don't change anything else, including wording on the approve path or the attestation.

## Tests
- Customer: refusal, then Check again, then a fresh commandId, as proven by the body sent. Unknown result, then retry sends the same commandId. A failed re-read shows the unavailable message.
- Builder: create succeeds, so the ticks clear. Create fails, so the ticks stay.
- F6T's browser test (`tools/v2/customer-extra-links.browser.test.mjs`) still passes. It runs on CI or Mac lane B, not before building.

## Done when
Tests pass, CI is green apart from Vercel, and a Claude check has been done on the frozen head.
