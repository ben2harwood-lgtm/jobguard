# Q09 · V2-F1: Done, Blocked and Changed on a trade's brief

> **Rules this piece must meet (read before writing code).** AGENTS.md rev 3.0 and BUILD_PLAN.md on `main`, plus `codex-queue/01-RULES.md`. Ben's build rules checklist `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md` (version 1.1, in this repo on branch `claude/project-thread-cw5qv5`) applies in full, and its rules 1 to 18 go in the PR's "Rules met" list. The rule missed most on 24 Nov is the **audit chain (AGENTS.md §5.7)**: every command that changes data appends exactly one event with `appendAuditBatch` (`packages/db/src/audit.ts`) in the same transaction (`audit.v1`, actor `membership:<id>`, event type `v2.<thing>.<verb>`, no payload key `version`, a replay appends nothing), with a test that a forced failure after the insert leaves neither row nor event. Also: RLS forced and a second-firm test for any new table; exact decimal strings for money; sends only to the local catcher; hidden financial findings never reach a crew, customer or audit payload. The checker rejects the PR if any is missing.

Tier: **RED** (new table; proof for the Final Check). Migration **2015**. Astra: yes. Rework risk: **high** (D4 is in review and has a pending audit fix).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-f1, plus section 2B item 20 (one-tap photo).
**Starts:** NOW (released 25 Nov 14:55 UK; see the release section below, which overrides the base, PR and diary lines elsewhere). **Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Base:** D4's branch `claude/project-thread-btt9d2` (#916) at `f7aacf55d` or later, which has D4A and `taskKey`. **Branch:** `codex/sandbox/v2-f1`. **PR:** draft **into `v2/main`** (not into D4's branch), so CI1's V2 seed job runs. Do not edit D4's files.

> **c3 audit gap (standard line, coordinator ruling 25 Nov 00:09 UK).** c3's plan read creates a plan with no audit event. That is a known c2/c3 gap, and its fix waits for Ben. This piece **reads or links to the plan only**: build against c3 as it is, and **keep out of `packages/db/src/v2-work-plan-repository.ts`** (and every other c2/c3 file). Do not hold on this gap. Put this line in the PR body: "Inherits c3's plan-creation audit gap; needs c3 re-merged after the c2/c3 fix." 

## Who creates the brief (planner, 25 Nov 17:00 UK, answering the Codex finding on #953)
**D5B-B (Q23, #954) owns brief creation in the app.** It adds `POST /api/v2-backend/jobs/[id]/crew-briefs`, which calls D4's `crewBriefs.generate`, and the "Make brief" button. F1 must not add a second creation path. So:
- **F1's seed tests** make the brief directly through D4's application (`workspace.crewBriefs.generate`, `apps/api/src/workspace/crew-brief.application.ts`) in test setup.
- **F1's browser test** does the same in its `before()`, through the application and not the screen. Then it opens Brief progress.
- **"No trade briefs yet"** on Brief progress is the correct empty state. Add one line under it: "Make a brief on the Briefs card first." Link to the Work tab only once D5B-B has merged into your branch. Until then, show the text only.
- **Merge order for Ben:** D5B-B #954, then F1 #953. A builder can then make a brief and press Done, Blocked or Changed with screens only. Put this in the PR body.

## Release check (planner, 25 Nov 14:55 UK, rule 23; overrides older lines in this packet)
- **The task key is in.** On #916 @ f7aacf55d, `CrewBriefContent.tasks[].taskKey` is saved (`v2-crew-brief-repository.ts` line 40) and filled from the plan task's key (line 276). The schema label is still `v2-crew-brief.v1`, so there is no v2 label to test for. Instead, **refuse a press when the saved task has no `taskKey`**, with "This brief needs regenerating". Match only on `(brief trade + version, scopeItemId, taskKey)`, never on title or position.
- **How briefs are read:** through `workspace.crewBriefs.read(jobId, { version: "v2-crew-brief-query.v1", trade })` (D4's application). F1 adds its **own** route `apps/web/app/api/v2-backend/jobs/[id]/brief-progress/route.ts`. It returns D4's brief plus F1's progress rows, and takes the three press commands behind the rule-21 origin check. Don't add a crew-briefs route: D5B-B (Q23) owns `crew-briefs/` and is being built at the same time.
- **No database is needed before building.** Write the repository and migration `2015`, then prove them with seed tests added to `tools/v2/seed.integration.test.mjs`:
  - Done, Blocked and Changed are each recorded once, and a replay appends nothing;
  - a forced failure after the insert leaves neither row nor event;
  - a second firm can't read or press;
  - a press on a task with no `taskKey` is refused;
  - Changed leaves scope, price and orders unchanged.
  CI1 runs these. Mac lane B may too. Don't wait for a local PostgreSQL.
- **The plan is read only.** Keep out of every c1 to c3 file and D4's files. The "c3 audit gap" line above is no longer needed, because c1 to c3 merged into v2/main with the audit fix at 12:12 UK.
- **Browser:** add `tools/v2/brief-progress.browser.test.mjs` at 360 and 1280 px, plus phone mode, following rule 22, with three passes on fresh stacks in CI or lane B.
- **Plan check:** RED, so a Claude plan check is requested on frm-management-layer#3 in place of Astra's (Ben, 12:50 UK). Building starts now; the PR isn't called ready until the verdict and its conditions are in.

## Dry-check against the code (planner, 25 Nov 00:20 UK): verified with re-scoping; the mock-up passed (#930 at ff4d3366)
- **Who presses:** there is no crew sign-in or crew link on V2 yet, and assignees are free text until C3C. So in this piece **the builder** presses Done, Blocked or Changed on a trade's brief (D4 #916), recording on the trade's behalf. A crew member pressing from their own link comes later, after C3C.
- **Where it's recorded:** in F1's own table, shown on the brief. **No diary write.** The existing diary intake (0505 and 0539) has never been exercised on the V2 database. Writing to it is a later small piece (F1-D), after a probe shows it works on V2.
- **Photos:** none in this piece. The upload path (`EvidenceService.beginUpload`/`finalize`) refuses on the V2 database (see V2-PX). Keep a nullable photo-reference column empty and add photos as F1-P after V2-PX. No camera.
- **Task key:** tasks come from D4's brief, keyed by c3's `(quote_revision_id, scope_item_id, template_task_key)`.
- **Missed by the first dry-check (corrected 25 Nov 00:55 UK).** D4's saved brief (`CrewBriefContent.tasks`, #916 lines 35 to 44) has **no** task key, and compose drops it (lines 253 to 258). Two tiling tasks share one `scopeItemId`, so neither title nor position can stand in. **Don't build until D4 saves `taskKey` (`v2-crew-brief.v2`, in the D4A round).** Then:
  - tie each press to `(brief id, taskKey)`;
  - refuse a press on a v1 brief with "This brief needs regenerating";
  - never match on title or position.
- **Round 1 work is kept.** The F1 branch keeps what it has. On restart it merges D4 again and switches its task reference to `taskKey`, which is not a new round of design.
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
