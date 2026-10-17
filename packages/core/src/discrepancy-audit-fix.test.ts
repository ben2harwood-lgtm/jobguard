import { describe, expect, it } from "vitest";
import { evaluateBillDiscrepancy } from "./discrepancy.js";

const base = {
  version: "discrepancy-input.v1" as const, ruleRevision: "supplier-overcharge.v1",
  sourceDocumentId: "10000000-0000-4000-8000-000000000001",
  sourceVersionId: "10000000-0000-4000-8000-000000000002",
  matchRevisionId: "10000000-0000-4000-8000-000000000003",
  confirmed: true as const, matched: true as const,
  orderedQuantity: 10, acceptedQuantity: 2.5, billedQuantity: 2.5,
  orderedUnitPricePence: 2000, billedUnitPricePence: 2500,
};

describe("audit discrepancy quantities", () => {
  it("evaluates confirmed fractional quantities", () => {
    expect(evaluateBillDiscrepancy(base)).toMatchObject({ pricePence: 1250, quantityPence: 0, totalPence: 1250 });
  });

  it("accepts SQL decimal strings and rounds each net component half-even", () => {
    expect(evaluateBillDiscrepancy({ ...base, orderedQuantity: "10.000000", acceptedQuantity: "2.500000", billedQuantity: "2.500000" }))
      .toMatchObject({ pricePence: 1250, quantityPence: 0, totalPence: 1250 });
    expect(evaluateBillDiscrepancy({ ...base, billedQuantity: "0.5", acceptedQuantity: "0", orderedUnitPricePence: 1, billedUnitPricePence: 2 }))
      .toMatchObject({ pricePence: 0, quantityPence: 0, totalPence: 0 });
    expect(evaluateBillDiscrepancy({ ...base, billedQuantity: "1.5", acceptedQuantity: "0", orderedUnitPricePence: 1, billedUnitPricePence: 2 }))
      .toMatchObject({ pricePence: 2, quantityPence: 2, totalPence: 4 });
  });

  it("subtracts fractional quantities exactly before multiplying", () => {
    expect(evaluateBillDiscrepancy({ ...base, acceptedQuantity: "0.1", billedQuantity: "0.3", orderedUnitPricePence: 5, billedUnitPricePence: 5 }))
      .toMatchObject({ pricePence: 0, quantityPence: 1, totalPence: 1 });
  });

  it.each(["-0.1", "0.0000001", "1000000.000001", "1e-1", "NaN", "01", 0.0000001, Infinity])("refuses invalid or out-of-range quantity %s", quantity => {
    expect(() => evaluateBillDiscrepancy({ ...base, billedQuantity: quantity })).toThrow();
  });
});
