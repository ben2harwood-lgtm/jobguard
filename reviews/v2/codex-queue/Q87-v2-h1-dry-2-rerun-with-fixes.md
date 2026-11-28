# Q87 · V2-H1-DRY-2: run the H1 journey again on a train that carries the B1, B3 and B2 fixes, and list what's still broken

**Tier:** T1 (findings only; no product code). **Builder:** Opus 5.5 thread. **Checker:** none, because nothing merges. **Base:** Q80's train `claude/project-thread-trp08u-h1dry` @ 226de2fcd, rebuilt on the current v2/main. **Branch:** local, or pushed as `claude/project-thread-trp08u-h1dry2` for the record. Never a PR. **Migration:** run `tools/migration-renumber.mjs --check` and report what it says. **Start:** after Q86 is up for review. **Planner:** 28 Nov 16:45 UK.

## Train (in this order; list each conflict and how you resolved it)
1. v2/main plus #1057 (and #1076 and #1040, if they haven't landed yet).
2. The K5 line: #1059, #1098, #1099, then G6 #1060 @ 89efa7d95 or later.
3. The G stack at the Q78 heads (G9 @ 531fecb35), plus G7 #1066.
4. #1051 WP-FIX and #1047 C6 @ 610cb1160.
5. The SQ chain through #1046, on #1042.
6. **New:** #1095 (B1) and #1104 (Q81, B3), plus Q86's PR if it's up. (Q85/B2 is parked.)

## Run
Same as Q80:
- a fresh non-root stack and the full seed suite, reported by test name;
- then the 15-step H1 journey in the browser, at 1280 and once at 360, as a linked builder, with the local catcher only.

Differences from Q80:
- Wait for the editor's reads before calling a panel missing. Allow 60 s on `next dev`, or use a production build. Q82 showed that a 12–15 s wait gave a false B4.
- Step 9 stays a builder-recorded acceptance, because Q85 is parked. Note it as "known, parked", not as a new break.
- Step 12 should use crew added on screen, if Q86 is up. Otherwise use the script, and say so.

Screens go in `/mnt/project-files/jobguard-v2/screens/h1dry2/`.

## Report
Write it as `/mnt/project-files/jobguard-v2/notes/h1-dry-2-<date>.md` and send it to the planner.
- One row per step: OK or broken, compared with Q80's result.
- Each new break uses Q80's columns, and "integration break" stays separate from "piece bug".
- End with a line saying whether H1 now runs from an empty account to "the customer's pack acknowledged" with no script.
