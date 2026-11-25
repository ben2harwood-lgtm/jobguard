# Q28 · V2-C3C: tasks assigned to a crew record, not free text (batch C7, data and command half)

> **Released 25 Nov 16:00 UK (planner).** **Builder:** a Claude Opus thread (RED, new table, needs a live V2 database). **Base:** `v2/main` @ 63f3af5ab or later (c1 to c3 are merged there). **Branch:** `claude/<thread>`. **PR:** draft into `v2/main`. **Migration: 2027** (the "next free 2024" line below is out of date). A Claude RED plan check has been requested.
>
> **Planner dry-check against v2/main @ 63f3af5ab (rule 23):**
> - The assignee is free text: `packages/db/src/v2-work-plan-edits.ts` line 9 (`assignee: z.string()...nullable().optional()`), applied at lines 81 to 84 and stored as `assignee?: string | null` (line 38).
> - The work-plan edit command is `work-plan-edit.v1` (line 14 onwards).
> - c4's editor (#903, `work-plan.tsx`) **isn't merged**, so this piece is **split**:
>   - **C3C (this packet):** the crew record, the `assigneeRef` on the edit command, the second-firm tests, and seed tests in `tools/v2/seed.integration.test.mjs`.
>   - **C3C-UI** (later, lane A, after #903 merges): the picker in c4's editor.
> - **Existing crew records:** the planner found no builder-crew table among the `app.*` tables on v2/main. `app.team` (0054) is an org-unit team without people, and `app.contractor_member` (0054) belongs to the contractor-organisation track. The builder's first step is to confirm this on the V2 database and put the answer in the PR body. If a suitable firm-owned person record exists, use it and add no table.
> - **Keep old data readable:** an existing free-text `assignee` stays readable, is shown as "(not linked)", and is never used for matching.
> - **Event name (rule 18):** `v2.work_plan.task_assigned` for setting or clearing `assigneeRef`, and `v2.crew_contact.recorded` for a new crew contact. Contacts use `.invalid` emails and fictional phone numbers only, enforced by a CHECK constraint.
> - **Base for later pieces:** SX (Q26) gives crew test **sessions**; this gives crew **records**. My brief (F7), E5A, F8 and K2 crew feeds need both.

# Packet V2-C3C: bind task assignment to a crew record (RED, Astra first, Claude builder)

> **Rules this piece must meet.** AGENTS.md rev 3.0, BUILD_PLAN.md, `reviews/v2/codex-queue/01-RULES.md` and `02-BUILD-RULES-CHECKLIST.md` v1.1.

**Why.** On c3, a task's assignee is free text that can be empty (`packages/db/src/v2-work-plan-edits.ts` line 9), and c4's editor accepts any name. That blocks three things: per-crew calendar feeds (K2), same-person double-booking warnings (E5A) and anything that tells a crew member "your tasks" (D4 briefs by person, F1, E8).

**Goal.** A task can be assigned to a firm crew record: an existing membership, or a firm-owned crew contact with name, trade and phone. It is then identified by that record's ID, never by name. Free-text assignee stays readable for old edits but is never used for matching.

**Scope.** Use the existing crew or contact record if main has one; otherwise add one small firm-owned crew-contact table (RED, migration number from the planner, next free 2024). Add an `assigneeRef` to `work-plan-edit.v1` (expected version, replay identity, one audit event, rule 18 names). c4's editor gets a picker, V2 only. Second-firm test: a task can never be assigned to another firm's crew.

**Done when.**
- Two crew records with the same name get separate assignments and separate feeds.
- Old free-text assignments still display.
- Second-firm, audit and replay tests pass, and CI is green apart from Vercel.

**Unblocks.** The K2 crew feeds, E5A and person-scoped briefs. This packet goes to Astra before anyone builds it.
