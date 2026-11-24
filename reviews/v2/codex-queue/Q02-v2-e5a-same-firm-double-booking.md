# Q02 · V2-E5A: same-firm double-booking warning

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: T1 (read-only check, no table). Rework risk: **medium** (c3 is under its final repair). Rules: `01-RULES.md`.
Plan: rev 1.3 section 2B item 24 and piece v2-e5 ("a same-firm version can come first and is not RED").
**Starts when:** R2 has pushed `codex/sandbox/v2-c3` (an audit commit after `2d92684`). **Base:** that c3 head. Draft PR against `codex/sandbox/v2-c3`.

## Dry-check against the code (planner, 25 Nov 00:10 UK)
**Parked until C3C.** "The same person" can't be told apart while the assignee is free text that may be empty (c3 `v2-work-plan-edits.ts` line 9). Matching on names would give false warnings for two people with the same name and miss one person entered under two spellings. Don't build until C3C binds an assignment to a crew record.

## Goal
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
