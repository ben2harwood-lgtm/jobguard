# Q80 · V2-H1-DRY: the full browser journey on a local train of every open V2 head, to find what breaks between pieces

**Tier:** T1 (findings only; no product code in this packet). **Builder:** Opus 5.5 thread. **Checker:** none, because nothing merges. Each fix becomes its own packet. **Base:** v2/main @ 77ed320e7 plus #1057, then local merges. **Branch:** local only. You may push it as `claude/project-thread-trp08u-h1dry` for the record, but it never becomes a PR. **Migration:** none. Run `tools/migration-renumber.mjs --check` on the train and report what it says. **Planner:** 28 Nov 12:55 UK.

## Why
Today's bugs (2071 and the G stack's actor keys, the G1 audit key, the K5A-1 fixture) were all hidden by stacked branches that never ran together or ran the seed suite. H1, the full run from an empty account to a kept handover, is the roadmap's acceptance gate, and it can only pass once these pieces work together. Finding the gaps now, before the trains land, saves a round of repairs each.

## Train (merge in this order; resolve conflicts the way each catch-up did, and list each one)
1. v2/main plus #1057.
2. The K5 line top, plus #1059, plus G6 #1060 (1e79f396a).
3. The G stack top, G9 @ 531fecb35, plus G7 #1066.
4. #1051 WP-FIX and #1047 C6.
5. The SQ chain through #1046 (SQ-I-3), on #1042 SQ-E.

Leave out the preview-only #1061 and the parked Q74.

## Run
1. A fresh local V2 stack (non-root, as in memory `jobguard-v2-local-seed-run`), then the full seed suite. Report pass and fail by test name.
2. In the browser, at 1280 and once at 360, as a linked builder:
   - new job by spoken quote;
   - review by room;
   - quote by room;
   - customer accepts by link;
   - Switch live;
   - work plan and a crew brief;
   - a progress photo;
   - an extra approved by link;
   - a stage draft;
   - "Before you close this job";
   - snags, recorded, fixed and then checked by a second person;
   - handover saved, then released;
   - the customer's pack acknowledged.
   Stop at main's final-account lock (Q74 is parked). Take screenshots at scale 2 for `/mnt/project-files/jobguard-v2/screens/h1dry/`.
3. Use the local catcher only. Send nothing real.

## Report (to the planner, and as `/mnt/project-files/jobguard-v2/notes/h1-dry-2026-11-28.md`)
For each break: the step, the screen or test, the error, the branch it belongs to, and a one-line likely cause. Keep "integration break" (it only happens on the train) separate from "piece bug" (it also happens on the piece's own branch). No fixes in this packet. The planner turns the list into packets.
