import { describe, expect, it } from "vitest";
import { V2_EXCLUSION_ROW_WIDTH, v2ExclusionEntries } from "../src/quote-delivery-repository.js";

// V2-C6: an excluded line's wording is wrapped into PDF-row-sized exclusion entries, at word boundaries only.
describe("V2-C6 exclusion entries", () => {
  it("keeps a short exclusion as one entry", () => {
    expect(v2ExclusionEntries("Contingency", "Customer will cover this")).toEqual(["Contingency: Customer will cover this"]);
  });

  it("wraps a 200-character reason into entries that fit the row and join back to the full text", () => {
    const reason = Array.from({ length: 40 }, (_, index) => `w${String(index).padStart(3, "0")}`).join(" ");
    expect(reason).toHaveLength(199);
    const description = "Skip or waste removal for the whole job";
    const entries = v2ExclusionEntries(description, `${reason}.`);
    expect(entries.length).toBeGreaterThan(2);
    expect(entries.every(entry => entry.length <= V2_EXCLUSION_ROW_WIDTH)).toBe(true);
    expect(entries.join(" ")).toBe(`${description}: ${reason}.`);
    expect(entries.flatMap(entry => entry.split(" "))).toEqual(`${description}: ${reason}.`.split(" "));
  });

  it("splits a word longer than a row, so a 500-character description still fits the document", () => {
    const entries = v2ExclusionEntries("x".repeat(500), "Customer excluded");
    expect(entries.every(entry => entry.length <= V2_EXCLUSION_ROW_WIDTH)).toBe(true);
    expect(entries).toEqual([...Array.from({ length: 5 }, () => "x".repeat(84)), `${"x".repeat(80)}:`, "Customer excluded"]);
  });
});
