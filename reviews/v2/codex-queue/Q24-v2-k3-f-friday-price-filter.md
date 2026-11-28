# Q24 · V2-K3-F: Friday update keeps measurements and times, still drops money

**Tier:** T1 (one pure function and its unit tests). **Builder:** Opus 5.5 thread (Ben, 25 Nov 19:53 UK: Opus builds and repairs, Codex only checks). **Base:** `codex/sandbox/v2-k3` (#935). **Branch:** `codex/sandbox/v2-k3-f`. **PR:** draft into `codex/sandbox/v2-k3`. **Planner:** Fable thread, 25 Nov 14:55 UK. Use ★★, effort XS, rework risk low. The finding came from the Claude check of #942 (comment 7154552179).

## Rules this piece must meet
`01-RULES.md` (rules 1 to 28) and `02-BUILD-RULES-CHECKLIST.md`, with a "Rules met" list in the PR body.

## Dry-check against the code (planner, 25 Nov 14:45 UK, rule 23)
In `packages/db/src/v2-friday-update.ts` (K3 at `codex/k3-friday-browser-proof`), the `line` validator refuses `/[£$€]|\b(?:GBP|USD|EUR)\b|\d+[.,]\d{2}\b|\b\d+\s*(?:pence|pounds?)\b/iu`. The `\d+[.,]\d{2}\b` part refuses "2.40 m worktop" and "Start 09.30am". `fridayContentFromPlan` silently drops any title that fails, so a busy week can show "No work scheduled this week." The same validator also guards the builder's manual edits (`fridayContentV1`), so the fix must not let money through there either.

## Change
1. Keep refusing: `£ $ €`, GBP/USD/EUR, `pence`/`pounds`/`p` after a number (for example "50p"), and a bare two-decimal number with nothing after it (for example "120.00", or "2.40" on its own), because that could be money.
2. Newly allow a two-decimal number in two cases:
   - when it is directly followed, optionally after a space, by a unit: `mm|cm|m|m2|m²|m3|kg|g|l|ltr|litres?|metres?|sq ?m|lm`;
   - when it is a clock time followed by `am`/`pm` (for example "9.30am", "09.30 pm").
   Colon times such as "09:30" already pass, so keep that.
3. In `fridayContentFromPlan`, count dropped titles. If any dropped titles fall in a week, add one line to that week: "Some work this week has been left out of this update. Please check before sending." (use "next week" for next week). Never show "No work scheduled this week." when titles were dropped. Add this wording next to `fridayEmpty`. That line must itself pass the validator.
4. No change to the repository, routes, screen or migration.

## Tests (in `packages/db/test/v2-friday-update.test.ts`)
- Kept: "Fit 2.40 m worktop", "Lay 12.50m² tiles", "Start 09.30am", "Deliver 10:15".
- Refused (both from the plan and through `fridayContentV1` edits): "Worktop £120", "Extra 120.00", "2.40", "50p sundries", "GBP 30".
- All titles refused in a week gives the "left out" line, not "No work scheduled".
- The existing tests stay green.

## Done when
Unit tests pass, CI is green apart from Vercel, and a Claude check has been done on the frozen head.
