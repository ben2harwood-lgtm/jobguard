# Q22 · CI-RV: RED PRs need an other-vendor review naming the current head

**Tier:** T2 (CI change). **Migration:** none. **Base:** `main`. Astra: yes, because it changes when a PR counts as ready. **Starts:** after Astra's plan check of this packet. **Planner:** Fable, 25 Nov 08:20 UK. Approved in principle by Ben at 08:13 UK (Astra's order note, handoff comment 7153628554: this goes in the first batch for RED packets).

## Rules this piece must meet
`01-RULES.md` rules 1 to 28, especially 27, and `02-BUILD-RULES-CHECKLIST.md`.

## Build
- A CI job that runs on PRs whose title or body declares RED, or whose diff touches `migrations/`, grants, RLS, money or auth paths (reuse the lane lint's path rules).
- The job passes only when the latest independent review comment or review:
  - names the PR's **current head SHA**;
  - comes from the other vendor than the builder. The builder's vendor is read from the branch prefix (`codex/` or `claude/`). Desktop Codex and the GitHub Codex bot count as one vendor.
- If the head moves, the job goes red until a new review names it.
- The job reads only PR metadata and comments through the default `GITHUB_TOKEN` with read scope. No secrets and no writes.

## Tests
- Fixtures for:
  - a matching head with the other vendor (pass);
  - a stale head (fail);
  - the same vendor, including Codex bot plus desktop Codex (fail);
  - a non-RED PR (skipped, and the skip is logged).
- One real past PR pair as a positive fixture.

## Out of scope
- Making the job a required check. That is Ben's choice in the branch settings.
