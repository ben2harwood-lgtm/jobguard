# Q05 · V2-K8: off-hire reminders (scaffold, skips, plant)

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (new table, money figures). Migration **2010**. Astra: yes. Rework risk: **medium**.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k8, section 2B item 18.
**Starts when:** R2 has pushed c3. **Base:** that c3 head. Draft PR against `codex/sandbox/v2-c3`.

## Dry-check against the code (planner, 25 Nov 00:10 UK)
**Verified, with one change.** c3 tasks have **no "done" status** (task fields are position, durationMinutes, trade, scheduledDate and assignee only; done arrives with F1). So the reminder fires when **every linked task's `scheduledDate` has passed** (date only; a linked task with no date never fires it), **or** when a builder-set "needed until" date on the hire item has passed. Link tasks by their c3 key `(quote_revision_id, scope_item_id, template_task_key)`. Put the migration where c3 and D3 put theirs: `packages/db/migrations/2010_...sql` plus a note and proof file.

## Goal
The builder records hired items on a job and is reminded to off-hire them when the work that needs them is done, so they stop paying for idle scaffold.

## Scope
- Table of hire items: job, what (scaffold, skip, plant, other), supplier text, booked-from date, weekly cost (exact decimal string, shown only to the builder), linked plan task(s) that need it, status (on hire, off-hire requested, off hire).
- Commands: add, edit, link to tasks, mark off-hire requested, mark off hire. Each with expected version, replay identity and one audit event.
- A reminder shows on the job (and Today if a list exists) when every linked task is done or its date has passed: "Scaffold not needed after Thursday: off-hire it?" Builder-only. **No message to the supplier**; at most a draft text the builder copies.
- Cost running total "about £X so far" for the builder only, from booked-from date and weekly cost, never shown to crew or customer.
- Simple screen section on the job's Work tab, V2 only.

## Done when
- Scaffold linked to the tiling task: after tiling is marked done (or its date passes), the reminder appears; marking off hire clears it; survives reload.
- Replay adds nothing; stale version refused; second firm sees none of it; every command has one audit event.
- Nothing reaches the local catcher. Playwright 360/1280 + phone-mode run. CI green apart from Vercel.
