import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCaptureFixture } from "./capture-fixture-parser.js";
import { tradeOf, understoodLabels } from "./context-reader.js";

// V2-SQ-J: the review screen's rows (capture parser) and their room and trade labels (Reader A), for typed text.
const path = fileURLToPath(new URL("../../../docs/fixtures/ai/spoken-quote-understanding/capture-typed-rooms.v1.json", import.meta.url));
type Row = { words: string; room: string; trade: string; pence: number | null };
const fixture = JSON.parse(readFileSync(path, "utf8")) as { cases: { id: string; text: string; rows: Row[] }[] };
const roomOnlyWords = /^(?:in the kitchen|upstairs bathroom|kitchen|lounge|out the back)$/iu;
function review(text: string) {
  const proposal = parseCaptureFixture("00000000-0000-4000-8000-000000000001", text);
  const labels = understoodLabels("00000000-0000-4000-8000-000000000001", text, proposal.lines.map(line => ({
    start: line.description.provenance.kind === "extracted" ? line.description.provenance.span.start : null, description: line.description.value })));
  return { proposal, rows: proposal.lines.map((line, i) => ({ description: line.description.value, pence: line.unitPricePence.value, ...labels[i]! })) };
}
const caseText = (id: string) => fixture.cases.find(c => c.id === id)!.text;
const tile = "tile the floor twelve square metres at sixty pounds a metre";

describe("V2-SQ-J typed text gets the same rooms as spoken text", () => {
  it("pins the recogniser-form Smith text that Q65 Run A uses", () => {
    expect(createHash("sha256").update(caseText("smith-recogniser")).digest("hex")).toBe("ae74a578418ec93f0ef0876f6c488e46974fda1cc3b2edd81e55357a4f325ab8");
  });
  it.each(fixture.cases.map(c => [c.id, c] as const))("%s: every row in its room, trade and price, and no room-only row", (_id, c) => {
    const { rows } = review(c.text);
    expect(rows.map(row => roomOnlyWords.test(row.description.trim().replace(/[.:,]$/u, "")))).not.toContain(true);
    // B6: split the Smith suite amount from the following unpriced sockets; neither line borrows money.
    const expected = c.id === "smith-recogniser" ? [...c.rows.slice(0, 4),
      { words: "supply and fit", room: "Upstairs bathroom", trade: "Plumbing", pence: 320000 },
      { words: "move two sockets", room: "Upstairs bathroom", trade: "Electrics", pence: null }, ...c.rows.slice(5)]
      : c.id === "smith-typed" ? [...c.rows.slice(0, 5),
        { words: "supply and fit 3200", room: "Upstairs bathroom", trade: "Plumbing", pence: null },
        { words: "move two sockets", room: "Upstairs bathroom", trade: "Electrics", pence: null }, ...c.rows.slice(6)] : c.rows;
    // B6: the split retains every work row in the Smith fixture.
    expect(rows).toHaveLength(expected.length);
    expected.forEach((want, i) => {
      expect(rows[i]!.description).toContain(want.words);
      expect({ room: rows[i]!.room, category: rows[i]!.category, pence: rows[i]!.pence }).toEqual({ room: want.room, category: want.trade, pence: want.pence });
    });
  });
  it("typed and recogniser-form Smith give the same three rooms", () => {
    const rooms = (id: string) => [...new Set(review(caseText(id)).rows.map(row => row.room))];
    expect(rooms("smith-typed")).toEqual(["Kitchen", "Upstairs bathroom", "Hallway and landing"]);
    expect(rooms("smith-recogniser")).toEqual(rooms("smith-typed"));
  });
  it.each([[`${tile} upstairs bathroom`], [tile]])("a per-unit price is never a whole-line price: %s", text => {
    const { proposal } = review(text);
    expect(proposal.lines.map(line => line.unitPricePence.value)).not.toContain(6000);
    expect(proposal.lines.every(line => line.quantity.value === "1" ? line.unitPricePence.value === null : true)).toBe(true);
    expect(proposal.questions.map(q => q.question.value)).toContain(`Confirm price: ${text}`);
  });
  it("a room clause before a single work item keeps that row parsed (Codex P2)", () => {
    const { rows, proposal } = review("Jones flat. In the kitchen. Fit six doors at fifty pounds each.");
    expect(rows.map(row => [row.description, row.pence, row.room])).toEqual([["Fit six doors", 5000, "Kitchen"]]);
    expect(proposal.lines[0]!.quantity.value).toBe("6");
  });
});

// V2-SQ-K (Q71): bathroom suite work is Plumbing, so the work plan sends it to the plumber. Labels only.
describe("V2-SQ-K bathroom suite work gets the plumbing trade", () => {
  it.each(["new suite", "fit the bath", "a new basin", "shower tray", "toilet", "WC pan"])("%s is Plumbing", words => {
    expect(tradeOf(words, null).trade).toBe("Plumbing");
  });
  it.each(["Upstairs bathroom", "En-suite", "En suite", "Ensuite", "Downstairs WC", "Cloakroom"])("in %s, a fit, install or supply row with no trade word is Plumbing", room => {
    for (const words of ["supply and fit", "fit the new one", "install it"]) expect(tradeOf(words, room)).toEqual({ trade: "Plumbing", word: "bathroom" });
  });
  it("an earlier, more specific trade word still wins in a bathroom", () => {
    expect(tradeOf("supply and fit kitchen units", "Upstairs bathroom").trade).toBe("Kitchen fitting");
    expect(tradeOf("strip out", "Upstairs bathroom").trade).toBe("Strip-out");
    expect(tradeOf("supply and fit new tiles", "Upstairs bathroom").trade).toBe("Tiling");
    expect(tradeOf("supply and fit", "Lounge").trade).toBe("Other");
  });
  it("the recogniser-form Smith bathroom row is Plumbing, with the same rows and prices as before", () => {
    const { rows } = review(caseText("smith-recogniser"));
    const bathroom = rows.find(row => row.description.startsWith("supply and fit"))!;
    expect([bathroom.room, bathroom.category, bathroom.pence]).toEqual(["Upstairs bathroom", "Plumbing", 320000]);
    // Rows and prices are pinned by the fixture cases above; only this row's trade label changed (Other to Plumbing).
    // B6: the suite and unpriced sockets are separate Smith rows.
    expect(rows).toHaveLength(7);
  });
});
