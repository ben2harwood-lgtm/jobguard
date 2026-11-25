# Q23 · V2-D5B-B: Briefs screen (one brief per trade, generate and internal export)

**Tier:** T1 (screen plus one V2-only web route over D4's existing, checked application; no migration, no new command). **Builder:** desktop Codex (lane A). It needs no database at build time: unit-test the route with mocks like `materials/route.test.ts`, and the browser proof runs on CI or Mac lane B. **Base:** D4's branch `claude/project-thread-btt9d2` (#916) at `f7aacf55d` or later. **Branch:** `codex/sandbox/v2-d5b-b`. **PR:** draft **into `v2/main`**, so CI1's V2 seed job runs (it runs only for bases `v2/main` and `codex/sandbox/v2-*`). The PR shows D4's commits too; say so in the body ("Stacked on #916; review only the commits after f7aacf55d"). **Planner:** Fable thread, 25 Nov 14:55 UK. Use ★★, effort S–M, rework risk medium.

## Rules this piece must meet
Read `01-RULES.md` (rules 1 to 28) and `02-BUILD-RULES-CHECKLIST.md` first. A "Rules met" list goes in the PR body (rule 26). Rule 21 applies to the POST route. Rule 22 applies to the browser test (use BH1's helper from #936 if it has merged; otherwise copy K5A's `before()` exactly as rule 22 says).

## Dry-check against the code (planner, 25 Nov 14:50 UK, rule 23)
- D4 (#916 @ f7aacf55d) exposes `workspace.crewBriefs` (`apps/api/src/workspace/application.ts` line 112) with `read(jobId, query)`, `generate(jobId, command)` and `exportInternal(jobId, trade)` (`crew-brief.application.ts`). Schemas: `crewBriefQueryV1` and `crewBriefCommandV1` from `@jobguard/db`. The saved shape is `CrewBriefContent` (`v2-crew-brief-repository.ts` lines 30 to 49). It has `version: "v2-crew-brief.v1"`, trade, accessWindow, tasks (each with `taskKey`, title, scope, durationMinutes, visit, owner, proofNeeded), photos and proofNeeded. There is **no price field**, so don't add one.
- No web route for crew briefs exists on any branch. The pattern to copy is `apps/web/app/api/v2-backend/jobs/[id]/materials/route.ts` and its test on `codex/sandbox/v2-d5b` (#925), for auth, caching and the `JOBGUARD_LOCAL_V2` gate.
- The mock-up is on v2/main: `apps/web/app/(designed)/v2-mock/work-mock.tsx` (Briefs section), with screenshots `e2e/artifacts/v2-mock/briefs-*.png` (filled, empty, problem). Match it.
- F1 (Q09) is being built at the same time and owns `brief-progress/`. Don't touch it.

## Correction (planner, 25 Nov 15:40 UK, rule-23 miss found by the coordinator; overrides the route and screen lines below)
`CrewBriefRepository.read` returns only briefs that already exist (`DISTINCT ON (trade)` over `app.v2_crew_brief`, line 94 onwards). So a job with a plan but no briefs yet would show no cards. The work-plan web route (`api/v2-backend/jobs/[id]/work-plan/route.ts`) is only on c4's branch `codex/sandbox/v2-c4`, **not** on this base (#916 @ f7aacf55d). So:
- The GET in your `crew-briefs/route.ts` returns `{ trades, briefs }`:
  - `trades`: the distinct `task.trade` values, in plan order, from `workspace.workPlan.read(jobId, { version: "work-plan-query.v1" })` (`apps/api/src/workspace/work-plan.application.ts` line 19, on this base).
  - `briefs`: `workspace.crewBriefs.read(...)`.
  Map `QUOTE_REVISION_NOT_FOUND` to the screen's empty state ("Accept a quote to plan the work first").
- The screen shows **one card per planned trade**. A trade with no brief shows "No brief yet" and "Make brief". A trade with a brief shows it and "Make a new version". A brief whose trade is no longer in the plan still shows, marked "No longer in the plan".
- Don't import or copy c4's work-plan route or `work-plan.tsx`. Call the application from your own route.
- Test the route with: no quote (empty state); a plan with two trades and no briefs (two "No brief yet" cards); one brief made; and a brief for a trade dropped from the plan.

## What to build (files you own)
1. `apps/web/app/api/v2-backend/jobs/[id]/crew-briefs/route.ts` and its `route.test.ts`:
   - GET (read, `?trade=`) and GET export (`?trade=&export=internal`) call `crewBriefs.read` and `crewBriefs.exportInternal`. Use `cache-control: no-store`.
   - POST (generate) calls `crewBriefs.generate`, behind the rule-21 origin check (`isTrustedBrowserOrigin`).
   - Return 404 unless `JOBGUARD_LOCAL_V2 === "1"`.
   - Pass errors through as codes, never stack traces.
2. `apps/web/app/(designed)/jobs/[id]/work/briefs.tsx`, one card per trade:
   - The access window, then tasks in order with title, scope wording, duration and proof needed. Then photos (thumbnails via the existing evidence route only if D4's content already carries `evidenceId`; otherwise "Photos: N attached").
   - A "Make brief" / "Make a new version" button that sends the generate command. Use a stable `commandId` per attempt, reused on retry (copy work-plan.tsx's `editReplay` pattern), and send the expected version.
   - An "Internal copy" button that downloads the export JSON.
   - Empty and problem states copied from the mock-up wording.
3. **One mount** in `apps/web/app/(designed)/jobs/[id]/work/page.tsx`: one import line plus one element, rendered only when `process.env.JOBGUARD_LOCAL_V2 === "1"`. Put it in your lane file with the note "mount only, owned by main (live Work tab)". Change nothing else in that file. If F1's or D5B-M's mount line is already there, keep both.
4. Browser test `tools/v2/crew-briefs.browser.test.mjs` at 360 and 1280 px, and phone mode, on a fresh stack:
   - make the tiling brief;
   - reload, and check it is still there;
   - make a new version, and check the version goes up;
   - download the internal copy, and check it has no `£` and no amount.

   Three passes in a row (rule 22). The run happens in CI or on Mac lane B, never as a pre-build step.

## Not in scope
Sending a brief (K1 later), crew links (C3C), progress buttons (F1, Q09), or any change to D4's files.

## Done when
- Route unit tests pass. The browser test is green three times in a row on a fresh stack. CI is green apart from Vercel.
- The PR body has the "Rules met" list.
- A Codex review on the frozen head, or for a Codex build, a Claude check (rule 27 is for RED; T1 still needs a different-vendor check).
