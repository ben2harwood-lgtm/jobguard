# Q72 · V2-WP-FIX: the work plan shows extras it can't plan, and an old task form can't save against a newer approval

**Tier:** T2 (two fixes to merged V2 code; no table, migration or money change). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** `v2/main` at its head; record the sha. **Branch:** the builder thread's own branch, in `config/lanes/v2-wp-fix.json`. **PR:** into `v2/main`. **Migration:** none. **Source:** two Codex P2s raised on the M3 catch-up #1050 against code already on `v2/main` (F8 / SQ-F), 28 Nov. **Plan check:** Claude stand-in after 2 hours. Rules 1 to 30 apply. Planner: 28 Nov 08:10 UK.

## Fixes
1. **Extras the plan can't place must still show, with the reason.**
   - `apps/web/app/api/v2-backend/jobs/[id]/work-plan/route.ts` line 41 drops the repository's `extrasNotPlanned` (`direction_unknown`, `planningDropped`).
   - The WorkPlan card shows neither, so a zero-value approved extra, or a planned addition that became an omission, vanishes from both Tasks and Unplanned with no reason.
   - Pass `extrasNotPlanned` through the response unchanged. On the card, list each under "Not planned yet" with a plain reason from a pure label helper, for example "Approved extra with no direction yet: say whether it adds work or removes it", or "Became an omission, so it was taken out of the plan".
2. **An open task form keeps the revision it opened against.**
   - `apps/web/app/(designed)/jobs/[id]/work/work-plan.tsx` line 149 reads `variationRevisionId` from the refreshed plan.
   - Variation approvals don't bump the plan's edit version, so a form left open across a job-saved refresh can save against a newer approval and get past the stale-revision check.
   - Capture `variationRevisionId` along with `openedVersion` when the form opens, and send that. The server's existing stale-revision refusal then works. Don't change the server's check.

## Tests
- **Unit:** the label helper for each reason, via `renderToStaticMarkup`. Also: the form sends the revision it captured on open, even after a refresh that changes the plan's revision.
- **Seed or route test:** a zero-value approved extra appears in the response's `extrasNotPlanned` with `direction_unknown`. A form opened before a new approval and saved after it gets the existing stale-revision refusal.
- The existing work-plan, F8 and SQ-F specs pass unchanged.
- **Rule 29/30:** no route or table added. The response gains one field.

## Done when
- No approved extra silently disappears from the work plan, and an old form can't save against a newer approval.
- CI1 is green, and the Codex check is clean or answered.
