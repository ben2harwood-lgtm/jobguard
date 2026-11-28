# Q47 · V2-C3B-1: the plan screen sends an extra's revision, so its tasks can be edited

**Tier:** T1 (screen and read route only; no migration, no money). **Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Checker:** Codex, `@codex review` on the PR. **Base:** c4 #903 `codex/sandbox/v2-c4` @ eaa5afb3a, **after merging `origin/v2/main` @ fad1c16cf** (#922 C3B merged there 25 Nov 18:47 UK). Planner ran `git merge-tree` on the two: it is clean. **Branch:** the builder thread's own, listed in `config/lanes/v2-c3b1.json`. **PR:** draft into `codex/sandbox/v2-c4`. **Migration:** none. **Plan check:** not needed (T1). Rules 1 to 30 apply. Planner: Fable thread, 25 Nov 20:45 UK.

## Why
#922 made an approved extra join the plan, and its edit must name the approved revision it was planned against (`variationRevisionId`). c4's screen was built before #922, so it never sends that field. On the practice job, giving "Add trim" a trade, date or assignee from the screen is refused with `WORK_PLAN_INVALID_EDIT`, and the builder can't plan the extra at all.

## Dry-check (rule 23)
On `origin/v2/main` @ fad1c16cf:
- `packages/db/src/v2-work-plan-edits.ts` line 22: `variationRevisionId: uuid.optional()`, "required for an approved extra".
- `packages/db/src/v2-work-plan-repository.ts`:
  - lines 124 to 129: the edit reads the extra's revision from the same plan snapshot. A different named revision is `WORK_PLAN_VERSION_CONFLICT`; a missing one is `WORK_PLAN_INVALID_EDIT`;
  - lines 396 to 405: `open()` returns `scopeItems[]` with `variationRevisionId` for an extra, and `extrasNotPlanned[]` (`scopeItemId`, `title`, `reason` `"omission"` or `"direction_unknown"`, `planningDropped`).

On `codex/sandbox/v2-c4` @ eaa5afb3a:
- `apps/web/app/api/v2-backend/jobs/[id]/work-plan/route.ts`:
  - GET (lines 24 to 43) passes on only `state, tasks, unplanned, quoteRevisionId, version, changes` (line 29) and `acceptanceCancelled`, so `scopeItems` and `extrasNotPlanned` never reach the screen;
  - POST (lines 45 to 55) parses `workPlanEditV1`, which already accepts the field.
- `apps/web/app/(designed)/jobs/[id]/work/work-plan.tsx`:
  - `Task` (lines 8 to 11), `PlanView` (lines 12 to 17) and `EditableTask` (lines 19 to 20) have no revision field;
  - `save()` builds the command at lines 133 to 134 without `variationRevisionId`; the replay key is the payload (line 136);
  - line 149: a `WORK_PLAN_VERSION_CONFLICT` already shows as "stale, reload".
  - 232 lines.
- `apps/web/e2e/v2-c4.spec.mts` line 129: the edit command the browser test posts.

## Build
1. **Merge `origin/v2/main`** into the branch first (one merge commit, no conflicts expected).
2. **Route GET:** add `variationRevisionId` to each task and each unplanned item whose `scopeItemId` has one in `scopeItems`, and pass `extrasNotPlanned` through as it is. Nothing else in the response changes. No other field from `open()` (for example `agreement`) is added.
3. **Screen.** Put the command in a pure helper `workPlanEditCommand(plan, task, changes)` in `apps/web/app/(designed)/jobs/[id]/work/work-plan-command.ts`, with unit tests (no jsdom). It adds `variationRevisionId` only when the task or unplanned item carries one. `save()` uses it, so the replay key includes the revision.
   - Below the plan, a short read-only list, "Approved extras not on the plan", from `extrasNotPlanned`: "removed work, nothing to plan" for `omission`, "no price change: say whether it adds or removes work" for `direction_unknown` (the choice itself is C3B-2), and "planning on this extra was set aside" when `planningDropped` is true.
4. **Lane** `config/lanes/v2-c3b1.json`. The route and `work-plan.tsx` are c4-owned: note each as "C3B-1 mount, owned by c4 #903: <what>".

## Tests
- Unit: `workPlanEditCommand` with a quote-line task (no field), an extra's task, and an unplanned extra; the GET mapping in a route test (an extra's task carries the revision; `extrasNotPlanned` passes through).
- **Rule 29:** this is a real Next `route.ts` under `/api/v2-backend/`. Its GET calls `assertBuilderRouteRefuses` (positive control, then cases a, b and d), and the route is appended to `builderGetRoutes` for case c. If SX #965 hasn't merged, write "Rule 29: pending V2-SX" in "Rules met" and add the calls in one test-only commit after it merges.
- Browser (`apps/web/e2e/v2-c4.spec.mts`, extended): on the accepted practice plan with "Add trim" approved, give the extra a trade and a date from the screen, reload, and see them kept. Then approve a second revision of the extra in the test's setup and check the old screen's save is refused as stale (line 149's message), not as an invalid edit.
- The V2 seed suite stays green (no change expected).

## Done when
- The builder can plan "Add trim" from the Work tab, and the plan keeps it after reload.
- Not-planned extras are listed with a plain reason.
- CI1 is green, and the Codex check is clean or answered.
