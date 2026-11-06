import { describe, expect, it } from "vitest";
import { matchSupplierLines, type SupplierLineMatchInput } from "./supplier-line-matching.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const identity = (n: number) => ({ lineId: id(n), versionId: id(n + 1), documentVersionId: id(n + 2),
  sourceHash: String(n).padStart(64, "0"), page: 1, sku: "TIMBER", orderReference: "PO-1", unit: "each", baseUnit: "each", unitsPerPack: "1" });
function fixture(): SupplierLineMatchInput {
  return { version: "supplier-line-match-input.v1", environment: "synthetic_demo", tenantId: id(1), jobId: id(2), merchantId: id(3),
    orders: [{ ...identity(10), quantity: "10", unitNetPence: 100, discountBps: 0, rateVersionId: id(19), validFrom: "2030-01-01", validTo: "2030-01-31" }],
    receipts: [{ ...identity(20), acceptedQuantity: "10" }],
    bills: [{ ...identity(30), kind: "invoice", documentReference: "INV-1", quantity: "10", netPence: 1000, taxBasis: "net", supplyDate: "2030-01-02", creditsInvoiceVersionId: null }],
    aliases: [], mappings: [] };
}
const codes = (input: SupplierLineMatchInput) => {
  const result = matchSupplierLines(input);
  return [...result.unresolved, ...result.groups.flatMap(g => g.issues)].map(i => i.code);
};

describe("M2-4 confirmed synthetic line matching", () => {
  it("matches without mutating input or creating authoritative money facts", () => {
    const input = fixture(), before = structuredClone(input), result = matchSupplierLines(input);
    expect(input).toEqual(before);
    expect(codes(input)).toEqual([]);
    expect(result.status).toBe("proposal_requires_confirmation");
    expect(result.groups[0]).toMatchObject({ orderedQuantity: "10000000000000", deliveredQuantity: "10000000000000", billedQuantity: "10000000000000" });
  });
  it("covers short delivery and billing for undelivered quantities", () => {
    const input = fixture(); input.receipts[0]!.acceptedQuantity = "8";
    expect(codes(input)).toEqual(["short_delivery", "billed_above_received"]);
  });
  it("represents partial deliveries and split invoices as one-to-many, without reusing quantities", () => {
    const input = fixture();
    input.receipts[0]!.acceptedQuantity = "3";
    input.receipts.push({ ...identity(40), acceptedQuantity: "7" });
    input.bills[0]!.quantity = "4"; input.bills[0]!.netPence = 400;
    input.bills.push({ ...input.bills[0]!, ...identity(50), documentReference: "INV-2", quantity: "6", netPence: 600 });
    expect(codes(input)).toEqual([]);
    expect(matchSupplierLines(input).groups[0]).toMatchObject({ receiptVersionIds: [id(21), id(41)], billVersionIds: [id(31), id(51)] });
    input.bills[1]!.quantity = "7"; input.bills[1]!.netPence = 700;
    expect(codes(input)).toContain("billed_above_received");
  });
  it("holds both duplicate invoice versions rather than selecting a winner", () => {
    const input = fixture(); input.bills.push({ ...input.bills[0]!, ...identity(40), documentReference: " inv-1 " });
    const result = matchSupplierLines(input);
    expect(result.unresolved.map(i => i.code)).toEqual(["duplicate_document", "duplicate_document"]);
    expect(result.groups[0]!.billVersionIds).toEqual([]);
  });
  it("holds repeated bytes even under a different invoice reference or receipt identity", () => {
    const input = fixture();
    input.bills.push({ ...input.bills[0]!, ...identity(40), sourceHash: input.bills[0]!.sourceHash, documentReference: "INV-2" });
    expect(codes(input).filter(c => c === "duplicate_document")).toHaveLength(2);
    expect(matchSupplierLines(input).groups[0]!.billedQuantity).toBeNull();
    input.bills.pop();
    input.receipts.push({ ...input.receipts[0]!, lineId: id(40), versionId: id(41), documentVersionId: id(42) });
    expect(codes(input).filter(c => c === "duplicate_document")).toHaveLength(2);
    expect(matchSupplierLines(input).groups[0]!.deliveredQuantity).toBeNull();
  });
  it("allows multiple distinct lines on the same invoice", () => {
    const input = fixture(); input.bills[0]!.quantity = "5"; input.bills[0]!.netPence = 500;
    input.bills.push({ ...input.bills[0]!, lineId: id(40), versionId: id(41) });
    expect(codes(input)).toEqual([]);
  });
  it("applies the explicitly agreed discount on a net basis", () => {
    const input = fixture(); input.orders[0]!.discountBps = 1250; input.bills[0]!.netPence = 875;
    expect(codes(input)).toEqual([]);
    input.bills[0]!.netPence = 1000;
    expect(codes(input)).toEqual(["net_price_variance"]);
  });
  it("uses exact pack conversion and half-even pence", () => {
    const input = fixture(); input.orders[0]!.quantity = "2"; input.orders[0]!.unit = "box/5";
    input.orders[0]!.unitsPerPack = "5"; input.orders[0]!.unitNetPence = 500;
    input.bills[0]!.unit = "pack/2"; input.bills[0]!.unitsPerPack = "2"; input.bills[0]!.quantity = "5";
    expect(codes(input)).toEqual([]);
    input.orders[0]!.unitNetPence = 1; input.orders[0]!.unitsPerPack = "4"; input.orders[0]!.quantity = "2.5";
    input.bills[0]!.netPence = 2; // 10 each / 4 each per pack = 2.5 pence -> 2.
    expect(codes(input)).toEqual([]);
    input.bills[0]!.netPence = 3; expect(codes(input)).toContain("net_price_variance");
  });
  it("credits only an explicit invoice line in the same group and caps cumulative credits", () => {
    const input = fixture();
    input.bills.push({ ...input.bills[0]!, ...identity(40), kind: "credit", documentReference: "CR-1", quantity: "2", netPence: 200, creditsInvoiceVersionId: id(31) });
    expect(codes(input)).toEqual([]);
    expect(matchSupplierLines(input).groups[0]!.billedQuantity).toBe("8000000000000");
    input.bills.push({ ...input.bills[1]!, ...identity(50), documentReference: "CR-2", quantity: "9", netPence: 900 });
    expect(codes(input)).toContain("credit_exceeds_invoice");
  });
  it("caps net credits independently of quantity and emits one cumulative issue", () => {
    const input = fixture();
    for (const n of [40, 50, 60]) input.bills.push({ ...input.bills[0]!, ...identity(n), kind: "credit", documentReference: `CR-${n}`,
      quantity: "1", netPence: 600, creditsInvoiceVersionId: id(31) });
    expect(codes(input).filter(c => c === "credit_exceeds_invoice")).toHaveLength(1);
    expect(matchSupplierLines(input).groups[0]!.billedQuantity).toBeNull();
  });
  it("preserves fractional quantities exactly without binary float arithmetic", () => {
    const input = fixture(); input.orders[0]!.quantity = "0.3";
    input.receipts[0]!.acceptedQuantity = "0.1";
    input.receipts.push({ ...identity(40), acceptedQuantity: "0.2" });
    input.bills[0]!.quantity = "0.3"; input.bills[0]!.netPence = 30;
    expect(codes(input)).toEqual([]);
    expect(matchSupplierLines(input).groups[0]!.deliveredQuantity).toBe("300000000000");
  });
  it("does not subtract unlinked credits to conceal an overbilling", () => {
    const input = fixture(); input.receipts[0]!.acceptedQuantity = "8";
    input.bills.push({ ...input.bills[0]!, ...identity(40), kind: "credit", documentReference: "CR-1", quantity: "2", netPence: 200, creditsInvoiceVersionId: id(99) });
    expect(codes(input)).toContain("unlinked_credit");
    expect(matchSupplierLines(input).groups[0]!.billedQuantity).toBeNull();
  });
  it("does not infer a substitution; an explicit version-bound approved mapping resolves it", () => {
    const input = fixture(); input.bills[0]!.sku = "SUBSTITUTE";
    expect(codes(input)).toContain("unmatched_line");
    input.mappings.push({ sourceVersionId: id(31), orderVersionId: id(11), approvalRef: "synthetic-review-1" });
    expect(codes(input)).toEqual([]);
    input.bills[0]!.versionId = id(99);
    expect(() => matchSupplierLines(input)).toThrow();
  });
  it("supports explicit aliases and exact normalized references without fuzzy guesses", () => {
    const input = fixture(); input.receipts[0]!.sku = "T-1"; input.receipts[0]!.orderReference = " po-1 ";
    input.aliases = [{ alias: "t-1", sku: "TIMBER" }]; expect(codes(input)).toEqual([]);
    input.receipts[0]!.orderReference = "PO1"; expect(codes(input)).toContain("unmatched_line");
  });
  it("keeps duplicate order candidates and conflicting aliases/mappings unresolved", () => {
    const input = fixture(); input.orders.push({ ...input.orders[0]!, ...identity(40) });
    expect(codes(input)).toContain("ambiguous_order");
    input.mappings = [{ sourceVersionId: id(31), orderVersionId: id(11), approvalRef: "one" }, { sourceVersionId: id(31), orderVersionId: id(41), approvalRef: "two" }];
    expect(codes(input)).toContain("ambiguous_order");
    input.orders.pop(); input.mappings = []; input.aliases = [{ alias: "TIMBER", sku: "A" }, { alias: "timber", sku: "B" }];
    expect(codes(input)).toContain("unmatched_line");
  });
  it("never converts unknown packs or unlike dimensions", () => {
    const input = fixture(); input.bills[0]!.unitsPerPack = null;
    expect(codes(input)).toContain("missing_unit_conversion");
    input.bills[0]!.unitsPerPack = "1"; input.bills[0]!.baseUnit = "metre";
    expect(codes(input)).toContain("missing_unit_conversion");
  });
  it.each(["2029-12-31", "2030-02-01"])("rejects applying a rate outside its dates: %s", date => {
    const input = fixture(); input.bills[0]!.supplyDate = date;
    expect(codes(input)).toEqual(["rate_outside_validity"]);
  });
  it.each(["2030-01-01", "2030-01-31"])("includes rate boundary %s", date => {
    const input = fixture(); input.bills[0]!.supplyDate = date; expect(codes(input)).toEqual([]);
  });
  it.each(["gross", "unknown"] as const)("never compares %s invoice amounts with net agreed rates", basis => {
    const input = fixture(); input.bills[0]!.taxBasis = basis; input.bills[0]!.netPence = 1200;
    expect(codes(input)).toEqual(["incomparable_tax_basis"]);
  });
  it("reruns produce the same results, IDs and digest regardless of input array order", () => {
    const input = fixture(); input.receipts[0]!.acceptedQuantity = "3";
    input.receipts.push({ ...identity(40), acceptedQuantity: "5" });
    input.aliases = [{ alias: "A", sku: "TIMBER" }, { alias: "B", sku: "TIMBER" }];
    const first = matchSupplierLines(input);
    input.receipts.reverse(); input.aliases.reverse();
    expect(matchSupplierLines(input)).toEqual(first);
    input.tenantId = id(99); expect(matchSupplierLines(input).groups[0]!.id).not.toBe(first.groups[0]!.id);
  });
  it.each(["-1", "1e2", "0.0000001", "9007199254740992"])("rejects unsafe quantity %s", quantity => {
    const input = fixture(); input.bills[0]!.quantity = quantity; expect(() => matchSupplierLines(input)).toThrow();
  });
  it("rejects repeated versions, historical versions of the same line, live mode and extra fields", () => {
    const input = fixture(); input.receipts.push({ ...input.receipts[0]! }); expect(() => matchSupplierLines(input)).toThrow();
    input.receipts[1]!.versionId = id(99); expect(() => matchSupplierLines(input)).toThrow();
    expect(() => matchSupplierLines({ ...fixture(), environment: "production" })).toThrow();
    expect(() => matchSupplierLines({ ...fixture(), paid: true })).toThrow();
  });
  it("rejects conflicting metadata for the same immutable document", () => {
    const input = fixture(); input.bills.push({ ...input.bills[0]!, lineId: id(40), versionId: id(41), documentReference: "DIFFERENT" });
    expect(() => matchSupplierLines(input)).toThrow("INVALID_MATCH_INPUT");
  });
  it("keeps missing sources explicit and suppresses incomplete quantity totals", () => {
    const input = fixture(); input.receipts = []; input.bills = [];
    expect(codes(input)).toEqual(["missing_receipt", "missing_invoice"]);
    const ambiguous = fixture(); ambiguous.bills[0]!.sku = "UNKNOWN";
    expect(matchSupplierLines(ambiguous).groups[0]!.billedQuantity).toBeNull();
  });
  it("checks aggregate expected money before narrowing bigint", () => {
    const input = fixture(); input.orders[0]!.unitNetPence = 1_000_000_000_000;
    expect(() => matchSupplierLines(input)).toThrow("Money result exceeds");
  });
});
