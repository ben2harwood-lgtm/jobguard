# JobGuard V2: the ultimate spoken quote (plan rev 1, 27 Nov 2026)

Author: Claude (Fable), thread "Make JobGuard spoken quote understand jobs". For Astra's plan check on frm-management-layer#3.
Scope: V2 practice tenant only. Fictional data only. Every new V2 table carries the firm lock. No spending without Ben's card.

## 1. What Ben asked for

Ben, 27 Nov 14:06 UK: the demo shows the old screens, "sent" leads nowhere, and the spoken quote must (1) understand the words in context, (2) pull the different jobs apart and put them in different places so they can be quoted differently, (3) price each part, (4) plan the work properly.

## 2. What is wrong today (checked 27 Nov, about 14:10 UK)

| # | Finding | Evidence |
|---|---|---|
| D1 | The public demo (`jobguard-demo.…workers.dev`) serves Worker version 19df3b67 from 17 Nov. None of #1001 to #1005 is on it. | Page shows "Talk through the example"; a three-room description gave 7 lines, 0 prices read, "supply and fit 3200" cut in two. |
| D2 | The preview (`91ea2a03-…`, built from #1005 at 87b9c4fa4) cannot open a practice firm today. | `POST /api/practice-company` returns 403 `FORBIDDEN`: the preview origin is not in the server's trusted-origin list (`apps/web/app/api/contractor/origin.ts`). |
| D3 | Only the capture step is new. Review, pricing, quote editor, send and acceptance are the v1 workflow inside the designed frame. | `demo-journeys-vs-v2.md` (SQ4, #1006): 0 of 58 demo journeys are wholly on V2; the designed capture, quote editor and send screens exist only on #918. |
| D4 | A practice send leaves no trace a builder can find. | `quote-editor.tsx`: the send is recorded as `simulated_delivery` and a status line is shown. No outbox or sent list exists. The app plays no sound; the words "draft sent" are not in the code. |
| D5 | The reader has no idea of rooms or trades. | `packages/ai/src/capture-fixture-parser.ts` is a fixed pattern list. It never fills `room` or `category`; every review row gets `room: "Practice job"`, `category: "Work"`. |
| D6 | Work plans exist for one job type. | `WorkPlanRepository` takes one template, `splashback-decorating.v1` (categories Tiling and Decorating). Any other line is "unplanned". |

Useful fact: the data model already has the places. `proposal_review_line` has `room` and `category`; `quote_line` has `category`; the work plan matches template tasks to quote lines by `category`. So most of this plan fills and uses columns that exist.

## 3. Target journey

1. Tommy presses the mic once and talks through the whole job, in any order, in his own words.
2. JobGuard shows the job split into **rooms** (or areas), and inside each room into **trade lines**, each with what he said for quantity and price. Anything unclear is a question on that line, never a guess.
3. He can move a line to another room, rename a room, and choose per room how it is quoted: itemised, or one price for the room.
4. Each room shows its own subtotal. The job total says when it is incomplete.
5. The quote the customer sees is laid out by room, each room itemised or as a single figure as he chose.
6. Once accepted, the work plan is built per room and trade, in a sensible order (strip out, first fix, plaster, tile, fit, second fix, decorate, snag), with durations, materials and proof points.
7. Every practice send shows in a Sent list, marked "Practice, not really sent".

## 4. How it understands context

### 4.1 One contract, two readers

A new versioned contract `job-understanding.v1` in `packages/core`, additive to `job-record-proposal-v1` (old proposals still read):

- `areas[]`: key, name, kind (`room`, `outside`, `whole_job`).
- `lines[]`: the existing line fields (description, quantity, unit, unit price) plus `areaKey`, `trade`, and `priceBasis` (`line`, `each`, `per_unit`, `none`).
- `areaPrices[]`: a price said for a whole room ("the bathroom all in four and a half grand"). Kept on the room. Never spread across lines.
- `wholeJobPrice`: as today, shown beside the total, never spread.
- `questions[]`: tied to a line or an area where possible.
- Every field keeps `provenance` (`extracted` with a source span, or `inferred`/`defaulted` with a note).

`trade` is a closed list so plans can key on it: Strip-out, Carpentry, Kitchen fitting, Plumbing, Electrics, Plastering, Tiling, Flooring, Decorating, Roofing, Brickwork, Groundworks, Other. Tiling and Decorating keep the spelling the existing template uses.

Two readers produce this contract:

- **Reader A, the context reader (code, no spend).** Extends the #1001 parser. It carries context forward: once a room is named ("in the kitchen", "upstairs bathroom", "then the hallway and landing"), following lines belong to it until another is named. It maps words to trades from a checked word list ("sparky", "sockets" to Electrics; "suite", "basin" to Plumbing; "skim" to Plastering). It reads measures ("about 12 square metres at 60 a metre" becomes quantity 12, unit m², rate £60, with "about" raised as a question). It always runs.
- **Reader B, the model reader (Claude, through the existing `AiGateway`).** One request per transcript, strict structured output against the same schema, with the transcript marked as untrusted data. It handles what a word list cannot: out-of-order speech, corrections ("no, make that three doors"), references ("same again in the other bedroom"), slang, and a trade implied by the task.

### 4.2 The money rule (applies to both readers, enforced in code)

A price or quantity is kept only when its provenance is `extracted` and the cited span of the untouched transcript parses, by JobGuard's own number parser, to exactly that value. Anything else becomes "Price needed" plus a question. A model can label and group; it can never introduce or alter a number. Room and trade may be `inferred`, because they are labels the builder can change in one tap, and they carry an "inferred" mark on screen.

### 4.3 How the two readers combine

- Reader B off (today's state): Reader A's result is shown.
- Reader B on: both run. Numbers must pass 4.2. Where A and B disagree on a number, the line shows the price open with a question. Where they disagree on room or trade, B's label is used and marked inferred. If B fails, times out or returns invalid output (one bounded repair, as the gateway already allows), A's result is shown and the builder sees nothing break.

### 4.4 Model use and cost

- Recommended model: Claude Opus 5.5 (`claude-opus-5-5`), adaptive thinking, structured output. Compared on the golden set against Claude Haiku 5.5 before Ben chooses.
- Rough cost per spoken quote (about 2,600 tokens in, 4,000 out including thinking), at list prices cached 3 Nov 2026: Opus 5.5 about $0.09 (7p); Sonnet 5.5 about $0.045; Haiku 5.5 about $0.002.
- **Nothing is switched on by this plan.** Reader B is built "dark", exactly like the existing `createDarkClaudeProvider`: tested on recorded fixtures with a supplied transport, `costPence: 0`, no key, no network. Turning it on needs Ben's card for: an API key, a monthly spend cap, and the processing-route decision AGENTS.md section 3 and 5.11 require (practice tenant, fictional words only).
- No audio leaves the device, as today. Only the checked transcript text would go to the model, and only after Ben's go.

### 4.5 Golden set

`docs/fixtures/ai/spoken-quote-understanding/`: 30 fictional spoken descriptions with expected areas, trades, quantities, prices and questions. It includes Ben's four acceptance examples from #1001, the five existing spoken-quote fixtures, and multi-room jobs such as: "Smith house refurb. In the kitchen rip out the old units and fit new ones for 2400, tile the floor about 12 square metres at 60 a metre. Upstairs bathroom strip out, new suite supply and fit 3200, and get the sparky to move two sockets. Paint the hallway and landing, two coats, 650."

Scored through the existing `pnpm eval` gate on: missed work, invented work, wrong room, wrong trade, wrong or invented number (must be zero), and questions raised when they should be. Reader A must meet a stated floor to merge. Reader B is scored on the same set from recordings; a live scored run happens only after Ben's go.

## 5. Packets

Order is by usefulness then easiness. Bases follow the open stack: #1001 parser, #1002 mic, #1003 rows, #1004 proof. Migration numbers are provisional and become final at merge with `tools/migration-renumber.mjs` (register next free: 2068). Queue numbers to be given by the V2 planner (next free Q64).

| Packet | What | Class | Base | Migration |
|---|---|---|---|---|
| SQ-A | **Practice Sent list.** "Messages" gains a Sent view listing every simulated send for this firm (quote, customer message, enquiry, Friday update): what, to whom, when, and a link to the exact document, each marked "Practice, not really sent". After a send, the notice links to it. Read-only over existing delivery records under existing row security. | T2 | v2/main | none |
| SQ-B | **Preview that opens.** Find why the preview origin is refused and fix it in server configuration only (never from request headers). Add a check to the preview acceptance run that a fresh browser can start a practice firm on the preview address. | RED (sessions) | #1005 | none |
| SQ-C | **Understanding contract and Reader A.** `job-understanding.v1`, the money rule validator, room carry-forward, trade word list, measures, the 30-item golden set and its eval gate. Review rows are created with real `room` and `category`. Parser version bumps; golden record changes only the parser hash. | T2 (parser, eval gate) | #1004 | none |
| SQ-D | **Rooms on the review screen.** Rows grouped by room then trade; room subtotal; move a line; rename, add or merge rooms; per-room "itemised" or "one price for the room"; a room price said aloud sits on the room; job total says when incomplete. Split and combine from #1003 keep working inside a room. 1280 and 360 screenshots. | RED (money on screen) | SQ-C | none |
| SQ-E | **Quote laid out by room.** New table `v2_quote_section` (tenant, job, quote revision, scope item, room name, room order, display mode) with the firm lock, written in the same save as the quote. The quote preview and customer page group by room and show each room itemised or as one figure. The frozen quote hash covers the layout. Totals are computed from lines exactly as today; a one-price room stores its figure as one line, never a second total. | RED (money, new table) | SQ-D | 2068 (provisional) |
| SQ-F | **Work plan by room and trade.** A trade template library as data files (strip-out, first-fix electrics, first-fix plumbing, plastering, tiling, kitchen fit, bathroom fit, second fix, decorating, snag and clean), each with tasks, durations (fixed or per unit of quantity), dependencies, materials, proof points and customer choices. The plan picks tasks per line by trade, orders trades inside a room and then across rooms, and titles tasks with the room. Lines with trade Other stay "unplanned" with the existing custom-task path. The existing splashback plan must come out unchanged. | RED (V2 plan tables) | SQ-E | none expected |
| SQ-G | **Reader B, dark.** Gateway operation `understand_spoken_job`, prompt and schema versions, recorded fixtures, combine rules of 4.3, typed failure falling back to Reader A. A live provider exists only behind server configuration that is absent by default, with a hard monthly cap read from configuration. | RED (AI gateway, spending path) | SQ-C | none |
| SQ-H | **One proof, end to end.** Browser run at 1280 and 360: speak the three-room fixture, see three rooms, price, save, reopen unchanged, quote by room, record practice acceptance, open the plan and see ordered tasks per room, find the send in the Sent list. Then a fresh preview on the free route Ben chose. | T1 | SQ-F, SQ-A | none |
| SQ-I | **V2 designed quote and send screens.** Port the designed capture, quote editor and send screens (SQ4's "missing" items 1 to 3) onto V2 routes, so the journey is no longer v1 inside a new frame. Needs its own packet split; #918 itself is never merged. | T2 | SQ-D | none |

SQ-A, SQ-B and SQ-C can start together. Each packet is one build plus up to two repairs, built by Opus 5.5, with a Codex review on every PR.

## 6. Stop conditions

- Any reader output that would show a number not said in the transcript: stop, it is a defect.
- Any packet that needs a real send, a real customer record, a key, or a paid service: stop and bring Ben a card.
- SQ-F: if ordering needs a rule a template file cannot express, stop and report before adding scheduling code.
- SQ-E: if the frozen quote hash cannot cover the layout without changing v1 quote behaviour on `main`, stop.

## 7. For Ben (cards, not part of the build)

1. Turn on the live model reader for the practice tenant, with which model and what monthly cap.
2. Update the public demo link to the new build once SQ-H passes (a deploy).

## 8. Questions for Astra

1. Is the money rule in 4.2 strict enough, and is "labels may be inferred, numbers never" the right line?
2. Is a side table (`v2_quote_section`) the right home for room layout, or should the room ride on the quote line?
3. Any refusal risk in sending fictional practice transcripts to a model before the D04 route decision, given no audio and no real customer data?
4. Is the packet order right for getting Tommy a preview he can trust soonest?
