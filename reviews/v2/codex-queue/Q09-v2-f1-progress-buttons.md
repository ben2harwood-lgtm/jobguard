# Q09 · V2-F1: Done, Blocked and Changed on a trade's brief

Tier: **RED** (new table; proof for the Final Check). Migration **2015**. Astra: yes. Rework risk: **high** (D4 is in review and has a pending audit fix).
Rules: `01-RULES.md` (audit chain, catcher only, shared files, no edits to others' files). Plan: V2 build plan rev 1.3 (PR #915). Piece v2-f1, plus section 2B item 20 (one-tap photo).
**Starts:** now. **Base:** D4's branch `claude/project-thread-btt9d2` (#916). Draft PR against it. Merge D4 again when it moves (its audit fix D4A may land later). Do not edit D4's files.

## Goal
On a trade's current brief, three actions: Done, Blocked (with a reason) and Changed (what changed on site). Each can carry proof photos attached to the right work item, and each writes into the existing job diary.

## Scope
- Table of progress updates: job, brief (D4), task, kind (done, blocked, changed), note, photo references, actor, time. Commands with expected version, replay identity and one audit event each.
- Diary: reuse the existing job diary on v2/main's base (find it; do not build a new one). If writing to it needs editing its files, stop and report.
- Photos: reference media IDs only. The camera stays held (B2B1); in tests use the existing fixture media path. "One tap" means the Done button goes straight to photo capture when capture is available.
- "Changed" never changes scope or price; it is only recorded (F3 later turns it into a change draft).
- Screen: buttons on the brief view, V2 only.

## Done when
- Replaying a progress update records it once; Done on the tiling task shows in the diary; Blocked shows the reason; Changed adds nothing to scope, price or orders.
- Second-firm and audit tests per the rules. Playwright 360/1280 + phone-mode run. CI green apart from Vercel.
