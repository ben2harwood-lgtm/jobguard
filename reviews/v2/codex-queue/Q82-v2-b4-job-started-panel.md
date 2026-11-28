# Q82 · V2-B4: a live job loaded fresh shows the "Job started" panel (proof stage, extras, final account)

**Tier:** T2 (a screen fix once the cause is found). **Builder:** Opus 5.5 thread. **Checker:** desktop Codex. **Base:** v2/main @ 77ed320e7 plus #1057; bisect on v2/main plus #1042. **Migration:** none. **Plan:** Q80 report B4. Planner: 28 Nov 15:15 UK.

## What breaks
On a live job loaded fresh, the Work tab has no "Job started" panel. `#variations-title` count is 0, and "Log an extra" goes nowhere. `/quotes`, `/quotes/activation` and `/quotes/acceptance` all return 200 and parse. This blocks H1 step 9 (extra approved by link) and step 15 (final-account lock).

## Steps
1. Reproduce on v2/main alone, then on v2/main plus #1042. If v2/main alone works, bisect the SQ chain commits.
2. Find the render condition. Likely suspects are the activation or acceptance shape the panel waits for, or a state that is only set after a client action, not on load. Fix it where the cause is.
3. If the cause is in the three red-team files (capture-fixture-parser.ts, context-reader.ts, core/job-understanding.ts), stop and tell the planner.

## Tests
- A browser spec on the V2 launcher: Switch live, reload, and the panel shows with its three parts. This spec fails before the fix.
- Unit tests for the render condition.

## Done when
The panel shows on a fresh load at 1280 and 360, and CI1 plus desktop Codex are clean.
