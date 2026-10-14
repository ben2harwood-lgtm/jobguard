import { describe, expect, it } from "vitest";
import { evaluateBillDiscrepancy, type DiscrepancyInput } from "./discrepancy.js";

const facts: DiscrepancyInput = {
  version: "discrepancy-input.v1",
  ruleRevision: "supplier-overcharge.v1",
  sourceDocumentId: "10000000-0000-4000-8000-000000000001",
  sourceVersionId: "10000000-0000-4000-8000-000000000002",
  matchRevisionId: "10000000-0000-4000-8000-000000000003",
  confirmed: true,
  matched: true,
  orderedQuantity: 1,
  acceptedQuantity: 0,
  billedQuantity: 1,
  orderedUnitPricePence: 2000,
  billedUnitPricePence: 1500,
};

describe("AUDIT-FIX-PKG-SRC-82 discrepancy regressions", () => {
  it("undelivered discounted goods cannot exceed the billed amount", () => {
    expect(evaluateBillDiscrepancy(facts)).toMatchObject({
      pricePence: 0,
      quantityPence: 1500,
      totalPence: 1500,
    });
  });

  it("fractional confirmed quantities remain comparable", () => {
    expect(evaluateBillDiscrepancy({
      ...facts,
      orderedQuantity: 1.5,
      billedQuantity: 1.5,
      acceptedQuantity: 1,
      billedUnitPricePence: 2000,
    })).toMatchObject({ pricePence: 0, quantityPence: 1000, totalPence: 1000 });
  });

  it("compares decimal quantities without binary subtraction residue", () => {
    expect(evaluateBillDiscrepancy({
      ...facts, orderedQuantity: 0.3, billedQuantity: 0.3, acceptedQuantity: 0.1,
      orderedUnitPricePence: 10, billedUnitPricePence: 10,
    })).toMatchObject({ pricePence: 0, quantityPence: 2, totalPence: 2 });
  });

  it("rounds the combined discrepancy once and conserves its penny breakdown", () => {
    // 1.5p price + 1.5p quantity = 3p, the complete undelivered bill.
    expect(evaluateBillDiscrepancy({
      ...facts, orderedQuantity: 0.003, billedQuantity: 0.003,
      orderedUnitPricePence: 500, billedUnitPricePence: 1000,
    })).toMatchObject({ pricePence: 2, quantityPence: 1, totalPence: 3 });
  });

  it.each([0.000001, 0.000003])("uses half-even at a fractional penny tie for %s units", (billedQuantity) => {
    expect(evaluateBillDiscrepancy({
      ...facts, billedQuantity, orderedQuantity: billedQuantity,
      billedUnitPricePence: 500_000, orderedUnitPricePence: 500_000,
    }).totalPence).toBe(billedQuantity === 0.000001 ? 0 : 2);
  });

  it.each(["orderedQuantity", "billedQuantity", "acceptedQuantity"] as const)(
    "rejects invalid or unsupported precision in %s", (field) => {
      for (const value of [-1, 1_000_001, NaN, Infinity, 0.0000001, 1.0000001]) {
        expect(() => evaluateBillDiscrepancy({ ...facts, [field]: value })).toThrow();
      }
    },
  );
  it("does not create a quantity charge when fractional accepted delivery exceeds the bill", () => {
    expect(evaluateBillDiscrepancy({ ...facts, acceptedQuantity: 1.5 }))
      .toMatchObject({ kind: "none", pricePence: 0, quantityPence: 0, totalPence: 0 });
  });

  it("rejects fractional overcharge exceeding the public money magnitude", () => {
    expect(() => evaluateBillDiscrepancy({
      ...facts, billedQuantity: 1.000001, acceptedQuantity: 0,
      billedUnitPricePence: 1_000_000_000_000, orderedUnitPricePence: 1_000_000_000_000,
    })).toThrow("MONEY_MAGNITUDE_EXCEEDED");
  });
});
