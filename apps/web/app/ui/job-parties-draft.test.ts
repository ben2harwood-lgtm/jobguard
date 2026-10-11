import { describe, expect, it } from "vitest";
import { siteV1 } from "@jobguard/core";
import { MAX_ADDRESS_LINES, addressLinesFromDraft, moreAddressLines, sameSite } from "./job-parties-draft";

const saved = siteV1.parse({ version: "site.v1", addressLines: ["14 Fictional Street", "Fictional Court"], town: "London", postcode: "sw1a1aa", unit: "Flat 1" });
const draft = (over: Record<string, unknown> = {}) => ({ version: "site.v1", addressLines: ["14 Fictional Street", "Fictional Court"], town: "London", postcode: "SW1A 1AA", unit: "Flat 1", ...over });

describe("address lines in the Customer and site draft", () => {
  it("builds every line from the first-line input and the more-lines input, trimmed and without blanks", () => {
    expect(addressLinesFromDraft("14 Fictional Street", "Fictional Court\r\n\n  Fictional Village  \nFictional Parish")).toEqual(["14 Fictional Street", "Fictional Court", "Fictional Village", "Fictional Parish"]);
    expect(addressLinesFromDraft("  14 Fictional Street ", "")).toEqual(["14 Fictional Street"]);
  });
  it("round-trips a saved two-to-four-line address through the two inputs without losing a line", () => {
    for (const lines of [["A"], ["A", "B"], ["A", "B", "C"], ["A", "B", "C", "D"]]) {
      expect(addressLinesFromDraft(lines[0]!, moreAddressLines(lines))).toEqual(lines);
    }
    expect(MAX_ADDRESS_LINES).toBe(4);
  });
});

describe("is the drafted site the one already saved?", () => {
  it("is the same site when nothing but spacing or case of the postcode differs", () => {
    expect(sameSite(draft(), saved)).toBe(true);
    expect(sameSite(draft({ postcode: "sw1a1aa" }), saved)).toBe(true);
    expect(sameSite(draft({ unit: undefined }), siteV1.parse({ ...saved, unit: undefined }))).toBe(true);
  });
  it("is a different site when any line, the town, the unit or the UPRN changes, or a line is added or removed", () => {
    expect(sameSite(draft({ town: "Leeds" }), saved)).toBe(false);
    expect(sameSite(draft({ unit: "Flat 2" }), saved)).toBe(false);
    expect(sameSite(draft({ uprn: "100023336956" }), saved)).toBe(false);
    expect(sameSite(draft({ addressLines: ["14 fictional street", "Fictional Court"] }), saved)).toBe(false);
    expect(sameSite(draft({ addressLines: ["14 Fictional Street"] }), saved)).toBe(false);
    expect(sameSite(draft({ addressLines: ["14 Fictional Street", "Fictional Court", "Fictional Village"] }), saved)).toBe(false);
  });
  it("is never the same site when the draft is not a valid site, so the server reports the error", () => {
    expect(sameSite(draft({ postcode: "not a postcode" }), saved)).toBe(false);
    expect(sameSite(draft({ addressLines: [] }), saved)).toBe(false);
  });
});
