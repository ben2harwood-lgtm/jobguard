# Spoken-quote understanding set (V2-SQ-C)

`cases.v1.json` holds 30 fictional transcripts for Reader A (`packages/ai/src/context-reader.ts`). None are real customers or Ben's own words. They include the five spoken-quote browser fixtures (`apps/web/e2e/fixtures/spoken-quote/`, the four #1001 examples), the packet's three-room Smith example verbatim, 11 unpunctuated transcripts as a recogniser gives them, 7 with a room price and 6 with a correction or a reference.

Each expected line names a phrase its description must contain, its room, its trade, and the quantity, unit, price in pence and price basis. A number is null when the reader must not keep one: an approximate price, a bare figure after a work item, or a count with a price for the whole line. Expected values were written by the builder of the reader in the same session; independent label review is pending.

`pnpm eval` runs `packages/ai/src/context-reader-evaluation.test.ts`. The merge floors are: wrong or invented number 0, invented work 0, room right on at least 85% of lines, trade right on at least 80%. Set `CONTEXT_READER_REPORT=<path>` to write the report, which lists every per-fixture miss.

## Who wrote which labels
- `cases.v1.json`: the builder of the reader wrote the transcripts and the labels. A score on it is a fit to the set, not a held-out score.
- `held-out.v1.json` and `held-out-2.v1.json`: the V2 planner wrote the transcripts and the labels (27 Nov 2026), and the builder encoded them unchanged. Both sets are now **seen**: each first unseen run is recorded on PR #1016, and the reader was fixed after it. Neither set is a held-out score any more. Their hard floor (no wrong or invented number, no invented work) is gated. Room and trade are reported only. Write the reports with `CONTEXT_READER_HELD_OUT_REPORT=<path>` and `CONTEXT_READER_HELD_OUT_2_REPORT=<path>`.
