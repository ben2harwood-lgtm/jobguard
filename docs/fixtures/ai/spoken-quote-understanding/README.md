# Spoken-quote understanding set (V2-SQ-C)

`cases.v1.json` holds 30 fictional transcripts for Reader A (`packages/ai/src/context-reader.ts`). None are real customers or Ben's own words. They include the five spoken-quote browser fixtures (`apps/web/e2e/fixtures/spoken-quote/`, the four #1001 examples), the packet's three-room Smith example verbatim, 11 unpunctuated transcripts as a recogniser gives them, 7 with a room price and 6 with a correction or a reference.

Each expected line names a phrase its description must contain, its room, its trade, and the quantity, unit, price in pence and price basis. A number is null when the reader must not keep one: an approximate price, a bare figure after a work item, or a count with a price for the whole line. Expected values were written by the builder of the reader in the same session; independent label review is pending.

`pnpm eval` runs `packages/ai/src/context-reader-evaluation.test.ts`. The merge floors are: wrong or invented number 0, invented work 0, room right on at least 85% of lines, trade right on at least 80%. Set `CONTEXT_READER_REPORT=<path>` to write the report, which lists every per-fixture miss.
