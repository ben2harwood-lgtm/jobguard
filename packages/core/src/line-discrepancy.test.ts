import { describe, expect, it } from "vitest";
import { evaluateLineDiscrepancies } from "./line-discrepancy.js";
import { correctSupplierLineMapping } from "./supplier-match-corrections.js";
import { developmentOverchargeFacts, developmentLineIdentity as identity, developmentSnapshotId as snapshotId } from "./discrepancy-development-fixtures.js";

const run = (facts = developmentOverchargeFacts(), correctionRevision = 0) => evaluateLineDiscrepancies({
  version: "line-discrepancy-input.v1", snapshotId, correctionRevision, facts });
describe("M2-5 confirmed line discrepancies (development only)", () => {
  it("shows the £320 net Decision, agreed basis, citations, quantities and arithmetic without commercial effects", () => {
    const facts = developmentOverchargeFacts(), before = structuredClone(facts), decision = run(facts).decisions[0]!;
    expect(decision).toMatchObject({ kind: "Decision", status: "proposed", amount: { pence: 32000, currency: "GBP" },
      agreedRate: { unitNetPence: 2000, discountBps: 0, rateVersionId: facts.orders[0]!.rateVersionId },
      quantities: { ordered: "40000000000000", accepted: "40000000000000", billed: "40000000000000" },
      arithmetic: { calculation: "112000 − 80000 + 0 = 32000 pence net" }, claimSent: false, cashLandedPence: 0, feePence: 0 });
    expect(decision.invoices[0]).toEqual({ lineId: facts.bills[0]!.lineId, versionId: facts.bills[0]!.versionId,
      documentVersionId: facts.bills[0]!.documentVersionId, sourceHash: facts.bills[0]!.sourceHash, page: 1 });
    expect(decision.agreedRate.citation.versionId).toBe(facts.orders[0]!.versionId);
    expect(decision.receipts[0]!.versionId).toBe(facts.receipts[0]!.versionId);
    expect(facts).toEqual(before); expect(run(facts)).toEqual(run(facts));
  });
  it("combines partial receipts and split invoices once, with pack conversions and agreed discount", () => {
    const facts = developmentOverchargeFacts();
    Object.assign(facts.orders[0]!, { quantity: "4", unitsPerPack: "10", unitNetPence: 20000, discountBps: 1000 });
    facts.receipts[0]!.acceptedQuantity = "10"; facts.receipts.push({ ...identity(40), acceptedQuantity: "20" });
    Object.assign(facts.bills[0]!, { quantity: "10", unitsPerPack: "2", netPence: 40000 });
    facts.bills.push({ ...facts.bills[0]!, ...identity(50), documentReference: "DEVELOPMENT-INV-2", quantity: "20", netPence: 40000 });
    const result = run(facts), d = result.decisions[0]!;
    expect(d.arithmetic).toMatchObject({ netPence: 80000, expectedNetPence: 72000, quantityPence: 18000 });
    expect(d.amount.pence).toBe(26000);
    facts.receipts.reverse(); facts.bills.reverse(); expect(run(facts)).toEqual(result);
  });
  it("subtracts linked credit quantities and money, including negative price offsets", () => {
    const facts = developmentOverchargeFacts();
    facts.bills.push({ ...facts.bills[0]!, ...identity(40), kind: "credit", documentReference: "DEVELOPMENT-CR-1",
      quantity: "10", netPence: 28000, creditsInvoiceVersionId: facts.bills[0]!.versionId });
    expect(run(facts).decisions[0]!.amount.pence).toBe(24000);
    facts.bills[0]!.netPence = 70000; facts.bills.pop(); facts.receipts[0]!.acceptedQuantity = "35";
    expect(run(facts).decisions).toEqual([]); // 10000 below agreed price offsets 10000 excess quantity.
  });
  it("preserves exact fractional packs and half-even line rounding", () => {
    const facts = developmentOverchargeFacts();
    Object.assign(facts.orders[0]!, { quantity: "1", unitsPerPack: "4", unitNetPence: 10 });
    facts.receipts[0]!.acceptedQuantity = "1";
    Object.assign(facts.bills[0]!, { quantity: "0.5", unitsPerPack: "2", netPence: 3 });
    expect(run(facts).decisions[0]!.arithmetic.terms[0]!.expectedNetPence).toBe(2);
    expect(run(facts).decisions[0]!.amount.pence).toBe(1);
  });
  it.each(["ambiguous", "missing-receipt", "unknown-pack", "gross", "invalid-rate", "duplicate", "bad-credit"])("suppresses %s rather than inventing actionable facts", scenario => {
    const facts = developmentOverchargeFacts();
    if (scenario === "ambiguous") facts.orders.push({ ...facts.orders[0]!, ...identity(40) });
    if (scenario === "missing-receipt") facts.receipts = [];
    if (scenario === "unknown-pack") facts.bills[0]!.unitsPerPack = null;
    if (scenario === "gross") facts.bills[0]!.taxBasis = "gross";
    if (scenario === "invalid-rate") facts.bills[0]!.supplyDate = "2030-02-01";
    if (scenario === "duplicate") facts.bills.push({ ...facts.bills[0]!, ...identity(40) });
    if (scenario === "bad-credit") facts.bills.push({ ...facts.bills[0]!, ...identity(40), kind: "credit", documentReference: "CR",
      quantity: "41", netPence: 112001, creditsInvoiceVersionId: facts.bills[0]!.versionId });
    expect(run(facts).decisions).toEqual([]);
  });
  it("uses corrected mappings, keeps historical reruns stable and withdraws findings when ambiguity returns", () => {
    const facts = developmentOverchargeFacts(); facts.bills[0]!.sku = "SUBSTITUTION";
    expect(run(facts).decisions).toEqual([]);
    const correction = { version: "supplier-line-correction.v1", commandId: snapshotId, snapshotId, expectedRevision: 0,
      sourceVersionId: facts.bills[0]!.versionId, orderVersionId: facts.orders[0]!.versionId };
    const corrected = correctSupplierLineMapping(facts, correction, "human:development");
    const first = run(corrected, 1); expect(first.decisions[0]!.amount.pence).toBe(32000);
    expect(run(corrected, 1)).toEqual(first);
    expect(run(corrected, 2).decisions[0]!.id).not.toBe(first.decisions[0]!.id);
    const withdrawn = correctSupplierLineMapping(corrected, { ...correction, expectedRevision: 1, orderVersionId: null }, "human:withdraw");
    expect(run(withdrawn, 2).decisions).toEqual([]);
    const otherTenant = structuredClone(corrected); otherTenant.tenantId = snapshotId;
    expect(run(otherTenant, 1).decisions[0]!.id).not.toBe(first.decisions[0]!.id);
  });
  it("rejects malformed envelopes and live facts", () => {
    expect(() => run(developmentOverchargeFacts(), -1)).toThrow();
    expect(() => evaluateLineDiscrepancies({ version: "line-discrepancy-input.v1", snapshotId, correctionRevision: 0,
      facts: { ...developmentOverchargeFacts(), environment: "production" } })).toThrow();
  });
});
