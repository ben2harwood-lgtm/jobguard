import { describe, expect, it } from "vitest";
import { planSafeCategory } from "./capture.application.js";

describe("V2-SQ-C plan-check condition 4", () => {
  it("a spoken Tiling or Decorating line reaches the review as Other until SQ-F; other trades are unchanged", () => {
    expect(["Tiling", "Decorating", "Electrics", "Plumbing", "Other"].map(planSafeCategory)).toEqual(["Other", "Other", "Electrics", "Plumbing", "Other"]);
  });
});
