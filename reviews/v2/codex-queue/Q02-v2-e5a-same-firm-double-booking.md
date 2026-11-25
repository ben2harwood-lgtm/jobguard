# Q02 · V2-E5A: same-firm double-booking warning

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: T1 (read-only check, no table). Rework risk: **medium** (c3 is under its final repair). Rules: `01-RULES.md`.
Plan: rev 1.3 section 2B item 24 and piece v2-e5 ("a same-firm version can come first and is not RED").
**Starts when:** R2 has pushed `codex/sandbox/v2-c3` (an audit commit after `2d92684`). **Base:** that c3 head. Draft PR against `codex/sandbox/v2-c3`.

## Dry-check against the code (planner, 25 Nov 00:10 UK)
**Parked until C3C.** "The same person" can't be told apart while the assignee is free text that may be empty (c3 `v2-work-plan-edits.ts` line 9). Matching on names would give false warnings for two people with the same name and miss one person entered under two spellings. Don't build until C3C binds an assignment to a crew record.

## Release (planner, 25 Nov 20:25 UK). This overrides "parked until C3C", the base line and the c3 references above.
**Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK). **Checker:** Codex. **Tier:** T1 (read-only, no table). **Plan check:** not required for T1.

**Two parts, because the Plan screen (c4 #903 @ eaa5afb3a) and crew records (C3C #955 @ ac8c92372) are on different unmerged branches:**
- **E5A-1, now. Base: C3C #955** (`claude/project-thread-x8p19i`). PR into it.
  - A read-only query, `sameFirmClashes(context, jobId)`, in a new file `packages/db/src/v2-plan-clashes.ts`. For each task on this job's effective plan with an `assigneeRef` and a `scheduledDate`, it returns other tasks in the **same firm** with the same `assigneeRef` on the same date: the other job's title and date, and nothing more.
  - It reads the effective plan through `applyWorkPlanEdits` (`packages/db/src/v2-work-plan-edits.ts`; `assigneeRef` is at lines 11, 45 and 93 on #955).
  - **It matches on `assigneeRef` (crew id) only, never on the free-text `assignee` name.**
  - Firm scope comes from RLS plus `v2_practice_firm`. Test it with the second firm anyway.
  - Expose it as a new GET route, `apps/web/app/api/v2-backend/jobs/[id]/plan-clashes/route.ts`, with rule 29 refusals, appended to `builderGetRoutes`.
  - Unit-test the pure matcher. Seed tests:
    - two jobs where one crew record is booked on the same day both report the clash;
    - moving one day clears it;
    - the second firm's same-named crew gives no clash and no data.
- **E5A-2, after c4 #903 merges into v2/main.** Rebase onto v2/main. Show the warning next to each clashing task in `apps/web/app/(designed)/jobs/[id]/work/work-plan.tsx`, as one new component plus one mount line, with the lane note "E5A mount: warning only". It never blocks an edit. Browser test at 360 and 1280 px in phone mode.

## Goal (original)
When the builder assigns a person to a task on a day when that same person already has a task on another job **of the same firm**, the Plan screen shows a plain warning. It never blocks the edit.

## Scope
- A read-only query over the firm's own V2 plans (c3 assignments and dates) returning, per task, any same-person same-day clash in the same firm. Other firms are never read (RLS already prevents it; test it anyway).
- The warning names the other job only by its own firm's job title and date; nothing from another firm.
- Shown on c4's Plan screen next to the task, V2 only. Add it as a new component and a small change to the Plan view; if that needs editing c4 files beyond one mount line, stop and report (c4 #903 is checked and waiting to merge).
- No table, no command, so no audit event. Zero paid AI calls.

## Done when
- Two jobs in the seed firm with the tiler on both on the same day: both tasks show the warning; moving one day clears it after reload.
- A second firm with the same person name and day produces no warning and no data.
- Playwright at 360 and 1280 px with the phone-mode run on this Mac.
- CI green apart from the known Vercel check.
