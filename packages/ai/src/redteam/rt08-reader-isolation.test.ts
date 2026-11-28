import { describe, expect, it } from "vitest";
import { extractCaptureFixture } from "../capture.js";
import { readSpokenJob } from "../context-reader.js";

// HEAD_UNDER_TEST=bfac404e2058da7759001cc0321c859f393a7ca1.
// D2/S4 module-state attacks only; these do not establish database isolation.
const cases = [
  ["RT-08-020", "Paint the kitchen £400.", "kitchen", 40000],
  ["RT-08-021", "Fit the bathroom door £250.", "door", 25000],
  ["RT-08-022", "Tile the hallway £650.", "hallway", 65000],
  ["RT-08-023", "Plaster the loft £900.", "loft", 90000],
] as const;
function checkCitations(value: unknown, sourceId: string, text: string) {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (object.kind === "extracted") {
    const span = object.span as { sourceId: string; start: number; end: number };
    expect(span.sourceId).toBe(sourceId); expect(span.start).toBeGreaterThanOrEqual(0);
    expect(span.end).toBeLessThanOrEqual(text.length); expect(text.slice(span.start, span.end).length).toBeGreaterThan(0);
  }
  for (const child of Object.values(object)) checkCitations(child, sourceId, text);
}
describe("RT-08 readers share no last-source or mutable output across requests", () => {
  it.each(cases)("%s concurrent callers keep their own words, money and citation source", async (id, text, description, pence) => {
    // The fixture label is deliberately shared; it must never act as a cache key.
    const otherText = "Repair the roof £175.";
    const [own, other] = await Promise.all([
      extractCaptureFixture(id, text, "same-fictional-fixture"),
      extractCaptureFixture(`${id}-other`, otherText, "same-fictional-fixture"),
    ]);
    expect(own.lines).toHaveLength(1); expect(own.lines[0]!.description.value.toLowerCase()).toContain(description);
    expect(own.lines[0]!.unitPricePence.value).toBe(pence);
    expect(other.lines).toHaveLength(1); expect(other.lines[0]!.unitPricePence.value).toBe(17500);
    checkCitations(own, id, text); checkCitations(other, `${id}-other`, otherText);
    const understood = readSpokenJob(id, text), stranger = readSpokenJob(`${id}-other`, otherText);
    expect(understood.lines).toHaveLength(1); expect(understood.lines[0]!.unitPricePence.value).toBe(pence);
    expect(stranger.lines[0]!.unitPricePence.value).toBe(17500);
    checkCitations(understood, id, text); checkCitations(stranger, `${id}-other`, otherText);
    // A review caller may mutate its returned draft. A later caller must get a
    // fresh result even when source ID and fixture label are reused.
    own.lines[0]!.description.value = "Changed by another caller";
    understood.lines[0]!.description.value = "Changed by another caller";
    expect((await extractCaptureFixture(id, text, "same-fictional-fixture")).lines[0]!.description.value.toLowerCase()).toContain(description);
    expect(readSpokenJob(id, text).lines[0]!.description.value.toLowerCase()).toContain(description);
  });
});
