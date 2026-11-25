# Q21 · RULES-T: one "Rules met" PR template (jobguard)

**Tier:** T1 (repo template only, no app or CI behaviour). **Migration:** none. **Base:** `main` (the template applies to every PR). **Starts:** after #915 merges, so the checklist it points to is on a base branch. **Planner:** Fable, 25 Nov 08:20 UK. Approved by Ben at 08:13 UK, with Astra condition 2 (handoff comment 7153628554).

## Rules this piece must meet
`01-RULES.md` rules 1 to 28 and `02-BUILD-RULES-CHECKLIST.md`.

## Build
- Add `.github/pull_request_template.md` with these sections:
  - Tier, packet, base and parent PR.
  - **Rules met:** one line per checklist item. Each line gives a file plus either an executed test or a review receipt, labelled "executed test" or "source inspection". N/A must give a reason.
  - LATER list, with an owner for each item.
  - Reviewed head: filled in by the reviewer's comment or the CI record, **not** typed into a tracked file.
- Link to `reviews/v2/codex-queue/02-BUILD-RULES-CHECKLIST.md`, the single source. Don't copy the checklist into the template.

## Out of scope
- No CI enforcement here. Q22 covers it.
- No changes to the AGENTS.md wording, which goes in a separate T1 PR for Ben if he wants it.

## Done when
A draft PR opened from the template renders every section, and lane lint passes.
