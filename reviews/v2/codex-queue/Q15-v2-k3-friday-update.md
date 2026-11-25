# Q15 · V2-K3: Friday customer update

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (customer-facing; must not leak private data). Migration **2021**. Astra: yes. Usefulness **high**, effort **S**. Rework risk: **medium**.
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-k3, section 2A item 5, plus plan section 9 point 4 (customer-supplied items).
**Starts when:** R2 has pushed c3. **Base:** that c3 head. It uses the job diary already on v2/main's base and the c3 plan; the QW-2 summary and F1 buttons will feed it later, so it does not wait for the main sync.


> **Customer link rule (01-RULES rule 16):** copy the existing customer job link's anonymous-access database check, not F6's (#923); recorded customer agreements are immutable to the app role; seed proofs pass in the full V2 suite without tripping the sign-in rate limit.

## Dry-check against the code (planner, 25 Nov 00:20 UK): verified with re-scoping; the mock-up passed (#930 at ff4d3366)
What exists on c3, and what this means for each section of the update:
- **Plan:** tasks have no "done" status (fields are position, durationMinutes, trade, scheduledDate and assignee; done arrives with F1). So **"This week" lists the tasks whose `scheduledDate` falls in that week, and the builder edits the wording** to say what actually got done. "Next week" lists the following week's tasks the same way.
- **Diary:** the existing diary route (`apps/web/app/api/jobs/[id]/diary/route.ts`, migrations 0505 and 0539) has never been exercised on the V2 database. **Read it only.** If the read is refused on V2, leave the section out cleanly (empty-state wording) and say so in the PR. Never write to it.
- **Photos:** there is no `customer_visible` field, and photos on V2 wait for V2-PX. Build the photo section with its empty state only. The withdraw-before-send case is marked "waits for V2-PX". Don't call the proof or evidence upload paths.
- **Open customer facts (E1) and customer-supplied items (D3):** neither is on c3's base, so leave both sections out cleanly. Show them later, when those pieces merge.
- **Recipient:** use the seed job's existing customer contact. If there is none, stop and report. Send only to the catcher.
- **Event names (rule 18):** `v2.friday_update.prepared`, `.edited` and `.sent_to_catcher`.
- **Migration:** `packages/db/migrations/2021_...sql`.

## Goal
Once a week the builder previews and sends the customer a short update: what got done, photos marked customer-visible, what's next, decisions needed, and anything the customer must buy and by when.

## Scope
- Table of updates: job, week, version, content snapshot, sent at, sent by. Commands: prepare, edit text, send. One audit event each.
- Content from the diary, plan tasks done and next, customer-visible photos only, open customer facts if E1 is available (skip that section cleanly if not), and customer-supplied items from D3 if available (skip cleanly if not).
- **No prices, private notes, other customers' photos or hidden findings.** Never sent without the builder's press; sent **only to the local catcher**.

## Acceptance cases added (Web Codex acceptance findings, frm-management-layer#3 comment 7145931890 (24 Nov 22:12 UK), folded in by the planner 22:25 UK)
- **Test the saved and sent snapshot, not only the preview.** Prepare with one customer-visible photo, withdraw that photo's visibility, then send: the catcher message and every photo reference in it must leave the withdrawn photo out (re-check at send).
- **Leak pair.** Two jobs identical except for one private diary entry or hidden finding must give identical updates, including section counts and empty-state wording.

## Done when
- The seed job's update lists done and next work and holds no amounts or private notes; editing then sending puts exactly one message in the catcher; a re-send of the same version adds nothing; second-firm and audit tests per the rules. Playwright of the preview at 360/1280. CI green apart from Vercel.
