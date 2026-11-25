# Q09 · V2-F1: Done, Blocked and Changed on a trade's brief

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (new table; proof for the Final Check). Migration **2015**. Astra: yes. Rework risk: **high** (D4 is in review and has a pending audit fix).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-f1, plus section 2B item 20 (one-tap photo).
**Starts:** now. **Base:** D4's branch `claude/project-thread-btt9d2` (#916). Draft PR against it. Merge D4 again when it moves (its audit fix D4A may land later). Do not edit D4's files.

## Dry-check against the code (planner, 25 Nov 00:20 UK): verified with re-scoping; the mock-up passed (#930 at ff4d3366)
- **Who presses:** there is no crew sign-in or crew link on V2 yet, and assignees are free text until C3C. So in this piece **the builder** presses Done, Blocked or Changed on a trade's brief (D4 #916), recording on the trade's behalf. A crew member pressing from their own link comes later, after C3C.
- **Where it's recorded:** in F1's own table, shown on the brief. **No diary write.** The existing diary intake (0505 and 0539) has never been exercised on the V2 database. Writing to it is a later small piece (F1-D), after a probe shows it works on V2.
- **Photos:** none in this piece. The upload path (`EvidenceService.beginUpload`/`finalize`) refuses on the V2 database (see V2-PX). Keep a nullable photo-reference column empty and add photos as F1-P after V2-PX. No camera.
- **Task key:** tasks come from D4's brief, keyed by c3's `(quote_revision_id, scope_item_id, template_task_key)`.
- **Event names (rule 18):** `v2.progress.done_recorded`, `.blocked_recorded` and `.changed_recorded`. Never use "completed" (0758 refuses it).
- **Migration:** `packages/db/migrations/2015_...sql`.

## Screen files and mounts (planner, 25 Nov 00:25 UK; copy this wording verbatim into the builder's brief)
There is no Briefs screen yet (D5B-B waits for D4A). So F1 adds its own small **"Brief progress" page as a new route file you own**: `apps/web/app/(designed)/jobs/[id]/brief-progress/page.tsx`, which is V2 only. It lists D4's briefs read-only, with the three buttons. **One mount is allowed**, in `apps/web/app/(designed)/jobs/[id]/work/page.tsx` only: one import line plus one element, rendered only when `process.env.JOBGUARD_LOCAL_V2 === "1"`. Add that file to your lane file with the note `"mount only, owned by main (live Work tab)"`. Change nothing else in that file. It is used only for a "Brief progress" link. D5B-B will take this view over later. This overrides any other line in this packet or brief about editing screen files.

## Goal
On a trade's current brief, three actions: Done, Blocked (with a reason) and Changed (what changed on site). Each can carry proof photos attached to the right work item, and each writes into the existing job diary.

## Scope
- Table of progress updates: job, brief (D4), task, kind (done, blocked, changed), note, photo references, actor, time. Commands with expected version, replay identity and one audit event each.
- Diary: reuse the existing job diary on v2/main's base (find it; do not build a new one). If writing to it needs editing its files, stop and report.
- Photos: reference media IDs only. The camera stays held (B2B1); in tests use the existing fixture media path. The one-tap camera is a later piece (f1-cam, after B2B1-device), per Astra 21:44 UK; do not build a camera path here.
- "Changed" never changes scope or price; it is only recorded (F3 later turns it into a change draft).
- Screen: buttons on the brief view, V2 only.

## Done when
- Replaying a progress update records it once; Done on the tiling task shows on the brief (diary later, F1-D); Blocked shows the reason; Changed adds nothing to scope, price or orders.
- Second-firm and audit tests per the rules. Playwright 360/1280 + phone-mode run. CI green apart from Vercel.
