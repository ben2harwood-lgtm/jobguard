import { describe, expect, it } from "vitest";
import { importedBaselineSourceHold, requireImportedBaselineSource, toImportedActivationSource, toImportedShadowCaptures } from "./imported-baseline-sources.js";

describe("CH5-B dependency-bound pure boundary", () => {
  it("exposes immutable synthetic unavailability, never success", () => {
    expect(importedBaselineSourceHold).toEqual({ version: "imported-baseline-source-availability.v1", status: "held", code: "IMPORTED_BASELINE_SOURCE_HANDOFF_HELD", environment: "synthetic_demo", realExternalActions: 0 });
    expect(Object.isFrozen(importedBaselineSourceHold)).toBe(true);
    expect(requireImportedBaselineSource).toThrow("IMPORTED_BASELINE_SOURCE_HANDOFF_HELD");
  });
  it.each([undefined, null, {}, { baselineQuoteVersionId: "fabricated" }, { version: "adopt-job.v3", baseline: { lines: [] } }])("never promotes unaccepted source %j", snapshot => {
    const before = JSON.stringify(snapshot);
    for (const mapper of [toImportedShadowCaptures, toImportedActivationSource])
      expect(() => mapper(snapshot)).toThrow("IMPORTED_BASELINE_SOURCE_HANDOFF_HELD");
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
