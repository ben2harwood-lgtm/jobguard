import { describe, expect, it } from "vitest";
import { correctSupplierLineMapping, supplierLineCorrectionV1 } from "./supplier-match-corrections.js";
import { matchSupplierLines, type SupplierLineMatchInput } from "./supplier-line-matching.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (n: number) => ({ lineId: id(n), versionId: id(n + 1), documentVersionId: id(n + 2), sourceHash: String(n).padStart(64, "0"),
  page: 1, sku: "TIMBER", orderReference: "PO-1", unit: "each", baseUnit: "each", unitsPerPack: "1" });
function fixture(): SupplierLineMatchInput {
  const order = { ...row(10), quantity: "10", unitNetPence: 100, discountBps: 0, rateVersionId: id(19), validFrom: "2030-01-01", validTo: "2030-01-31" };
  return { version: "supplier-line-match-input.v1", environment: "synthetic_demo", tenantId: id(1), jobId: id(2), merchantId: id(3),
    orders: [order, { ...order, ...row(40) }], receipts: [{ ...row(20), acceptedQuantity: "8" }],
    bills: [{ ...row(30), kind: "invoice", documentReference: "INV-1", quantity: "10", netPence: 1000,
      taxBasis: "net", supplyDate: "2030-01-02", creditsInvoiceVersionId: null }], aliases: [], mappings: [] };
}
const command = () => ({ version: "supplier-line-correction.v1" as const, commandId: id(90), snapshotId: id(91),
  expectedRevision: 0, sourceVersionId: id(31), orderVersionId: id(11) as string | null });
describe("M2-4 reviewer correction proposals", () => {
  it("keeps ambiguity unresolved until explicitly mapped, without rewriting a source", () => {
    const facts = fixture(), original = structuredClone(facts);
    expect(matchSupplierLines(facts).unresolved.map(x => x.code)).toEqual(["ambiguous_order", "ambiguous_order"]);
    const first = correctSupplierLineMapping(facts, command(), "correction:one");
    expect(matchSupplierLines(first).unresolved).toHaveLength(1);
    const second = correctSupplierLineMapping(first, { ...command(), sourceVersionId: id(21) }, "correction:two");
    expect(matchSupplierLines(second).unresolved).toEqual([]);
    expect(facts).toEqual(original);
    for (const key of ["orders", "receipts", "bills", "aliases"] as const) expect(second[key]).toEqual(original[key]);
    const result = matchSupplierLines(second);
    expect(result.groups[0]!.issues.map(i => i.code)).toEqual(["short_delivery", "billed_above_received"]);
    expect(matchSupplierLines(second)).toEqual(result);
  });
  it("replaces conflicting mappings for the corrected source only and allows withdrawal", () => {
    const facts = fixture(); facts.mappings = [
      { sourceVersionId: id(31), orderVersionId: id(11), approvalRef: "old-one" },
      { sourceVersionId: id(31), orderVersionId: id(41), approvalRef: "old-two" },
      { sourceVersionId: id(21), orderVersionId: id(41), approvalRef: "untouched" }];
    const fixed = correctSupplierLineMapping(facts, command(), "correction:one");
    expect(fixed.mappings).toHaveLength(2);
    expect(fixed.mappings[0]!.approvalRef).toBe("untouched");
    const withdrawn = correctSupplierLineMapping(fixed, { ...command(), orderVersionId: null }, "correction:two");
    expect(matchSupplierLines(withdrawn).unresolved.map(i => i.code)).toEqual(["ambiguous_order"]);
  });
  it("rejects absent and stale source/order versions", () => {
    for (const override of [{ sourceVersionId: id(99) }, { orderVersionId: id(99) }, { sourceVersionId: id(11) }])
      expect(() => correctSupplierLineMapping(fixture(), { ...command(), ...override }, "correction:one")).toThrow("MATCH_SOURCE_VERSION_CONFLICT");
  });
  it("cannot turn duplicate documents into allocated quantities", () => {
    const facts = fixture(); facts.bills.push({ ...facts.bills[0]!, ...row(50) });
    const result = matchSupplierLines(correctSupplierLineMapping(facts, command(), "correction:one"));
    expect(result.unresolved.filter(i => i.code === "duplicate_document")).toHaveLength(2);
    expect(result.groups.every(g => g.billedQuantity === null)).toBe(true);
  });
  it("rejects client approvals, source edits and unsafe revisions at the boundary", () => {
    for (const override of [{ approvalRef: "fabricated" }, { netPence: 0 }, { expectedRevision: -1 }, { expectedRevision: 0.5 }])
      expect(supplierLineCorrectionV1.safeParse({ ...command(), ...override }).success).toBe(false);
  });
});
