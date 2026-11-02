import { describe, expect, it } from "vitest";
import { applyImportedProvenance, ImportedShadowSourceError } from "./imported-shadow-source-adapter.js";

describe("CH5-E dependency-bound proposal boundary", () => {
  it.each([undefined, null, {}, { classification: "post_adoption_evidence" }, { classification: "pre_adoption_evidence", verified: true }])("refuses unaccepted provenance %j without inspecting proposals", provenance => {
    const proposals = Object.freeze([]);
    expect(() => applyImportedProvenance(proposals, provenance)).toThrow(ImportedShadowSourceError);
    expect(() => applyImportedProvenance(proposals, provenance)).toThrow("IMPORT_HISTORY_SOURCE_HANDOFF_HELD");
    expect(proposals).toEqual([]);
  });
  it("never reads model/deterministic proposal content or runs untrusted instructions", () => {
    const proposals = new Proxy([], { get() { throw new Error("proposal accessed"); } });
    const provenance = new Proxy({}, { get() { throw new Error("provenance accessed"); } });
    expect(() => applyImportedProvenance(proposals, provenance)).toThrow("IMPORT_HISTORY_SOURCE_HANDOFF_HELD");
  });
});
