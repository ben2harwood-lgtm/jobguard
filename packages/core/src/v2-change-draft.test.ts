import { describe, expect, it } from "vitest";
import { calculateNetLine, parseQuantity } from "./quantity.js";
import { money } from "./money.js";
import { ChangeDraftError, draftChange, proposedMinutes } from "./v2-change-draft.js";

const tasks = [
  { taskKey: "prepare-splashback", durationMinutes: 60, materialNeeds: ["Surface protection", "Primer"] },
  { taskKey: "tile-splashback", durationMinutes: 240, materialNeeds: ["Tiles", "Adhesive", "Grout"] },
];
const line = { quantity: "2.4", unit: "m2", unitRatePence: 9500 };

describe("V2-F3 draftChange", () => {
  it("drafts the splashback 2.4 to 3.2 m2 change: price as priceVariation would, time rounded up to 15, materials", () => {
    const draft = draftChange({ line, newQuantity: "3.2", tasks });
    expect(draft.delta).toBe("0.8");
    expect(draft.direction).toBe("addition");
    expect(draft.priceProposal).toEqual({ quantity: "0.8", unit: "m2", unitRatePence: 9500 });
    expect(draft.previewPence).toBe(calculateNetLine(parseQuantity("0.8"), money(9500)).pence);
    expect(draft.previewPence).toBe(7600);
    expect(draft.tasks).toEqual([
      { taskKey: "prepare-splashback", proposedMinutes: 30, materialNeeds: ["Surface protection", "Primer"] },
      { taskKey: "tile-splashback", proposedMinutes: 90, materialNeeds: ["Tiles", "Adhesive", "Grout"] },
    ]);
  });
  it("uses a rate the builder entered instead of the line's", () => {
    expect(draftChange({ line, newQuantity: "3.2", unitRatePence: 10_000, tasks }).previewPence).toBe(8000);
  });
  it("drafts an omission with a negative delta, no extra time and no materials", () => {
    const draft = draftChange({ line, newQuantity: "2", tasks });
    expect([draft.delta, draft.direction, draft.previewPence]).toEqual(["0.4", "omission", -3800]);
    expect(draft.tasks.map(task => [task.proposedMinutes, task.materialNeeds])).toEqual([[0, []], [0, []]]);
  });
  it("keeps six decimal places exact and rounds money half-even", () => {
    const draft = draftChange({ line: { quantity: "1.000001", unit: "m2", unitRatePence: 1 }, newQuantity: "1.500001", tasks: [] });
    expect(draft.delta).toBe("0.5");
    expect(draft.previewPence).toBe(0);
    expect(draftChange({ line: { quantity: "1", unit: "m", unitRatePence: 3 }, newQuantity: "1.5", tasks: [] }).previewPence).toBe(2);
    expect(draftChange({ line: { quantity: "1", unit: "m", unitRatePence: 3 }, newQuantity: "1.000001", tasks: [] }).delta).toBe("0.000001");
  });
  it("refuses an unpriced line, the same quantity and a bad quantity", () => {
    const code = (fn: () => unknown) => { try { fn(); } catch (error) { return (error as ChangeDraftError).code; } return null; };
    expect(code(() => draftChange({ line: { ...line, unitRatePence: null }, newQuantity: "3", tasks }))).toBe("CHANGE_DRAFT_LINE_UNPRICED");
    expect(code(() => draftChange({ line: { ...line, quantity: null }, newQuantity: "3", tasks }))).toBe("CHANGE_DRAFT_LINE_UNPRICED");
    expect(code(() => draftChange({ line: { ...line, unit: null }, newQuantity: "3", tasks }))).toBe("CHANGE_DRAFT_LINE_UNPRICED");
    expect(code(() => draftChange({ line: { ...line, quantity: "0" }, newQuantity: "3", tasks }))).toBe("CHANGE_DRAFT_LINE_UNPRICED");
    expect(draftChange({ line: { ...line, unitRatePence: null }, newQuantity: "3", unitRatePence: 100, tasks }).previewPence).toBe(60);
    expect(code(() => draftChange({ line, newQuantity: "2.400", tasks }))).toBe("CHANGE_DRAFT_NO_CHANGE");
    expect(code(() => draftChange({ line, newQuantity: "-1", tasks }))).toBe("CHANGE_DRAFT_INVALID_QUANTITY");
    expect(code(() => draftChange({ line, newQuantity: "1.2345678", tasks }))).toBe("CHANGE_DRAFT_INVALID_QUANTITY");
  });
  it("rounds minutes up to the next 15 and caps them at one week", () => {
    expect(proposedMinutes(240, 1n, 6n, "addition")).toBe(45);
    expect(proposedMinutes(240, 3n, 12n, "addition")).toBe(60);
    expect(proposedMinutes(1, 1n, 1000n, "addition")).toBe(15);
    expect(proposedMinutes(10_000, 100n, 1n, "addition")).toBe(10_080);
    expect(proposedMinutes(240, 1n, 6n, "omission")).toBe(0);
  });
});
