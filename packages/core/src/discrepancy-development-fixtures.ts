import type { SupplierLineMatchInput } from "./supplier-line-matching.js";

/** Made-up DEVELOPMENT data. Not held out, not representative, never G2 evidence. */
export const discrepancyDevelopmentNotice = "DEVELOPMENT DATA ONLY — fictional regression cases; not the held-out benchmark.";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const developmentSnapshotId = id(900);
export const developmentLineIdentity = (n: number) => ({ lineId: id(n), versionId: id(n + 1), documentVersionId: id(n + 2),
  sourceHash: String(n).padStart(64, "0"), page: 1, sku: "TIMBER", orderReference: "DEVELOPMENT-PO-1",
  unit: "each", baseUnit: "each", unitsPerPack: "1" });
export function developmentOverchargeFacts(): SupplierLineMatchInput {
  return { version: "supplier-line-match-input.v1", environment: "synthetic_demo", tenantId: id(1), jobId: id(2), merchantId: id(3),
    orders: [{ ...developmentLineIdentity(10), quantity: "40", unitNetPence: 2000, discountBps: 0,
      rateVersionId: id(19), validFrom: "2030-01-01", validTo: "2030-01-31" }],
    receipts: [{ ...developmentLineIdentity(20), acceptedQuantity: "40" }],
    bills: [{ ...developmentLineIdentity(30), kind: "invoice", documentReference: "DEVELOPMENT-INV-1", quantity: "40",
      netPence: 112000, taxBasis: "net", supplyDate: "2030-01-02", creditsInvoiceVersionId: null }], aliases: [], mappings: [] };
}
export function discrepancyDevelopmentCases() {
  const match = developmentOverchargeFacts(); match.bills[0]!.netPence = 80000;
  const ambiguous = developmentOverchargeFacts(); ambiguous.orders.push({ ...ambiguous.orders[0]!, ...developmentLineIdentity(40) });
  const boundary = developmentOverchargeFacts(); boundary.bills[0]!.netPence = 82500;
  const short = structuredClone(match); short.receipts[0]!.acceptedQuantity = "38";
  return [
    { id: "photographed-invoice-320-net", label: "discrepancy" as const, labelledNetPence: 32000, facts: developmentOverchargeFacts() },
    { id: "genuine-match", label: "match" as const, labelledNetPence: 0, facts: match },
    { id: "ambiguous-order", label: "ambiguous" as const, labelledNetPence: 0, facts: ambiguous },
    { id: "25-net-boundary", label: "discrepancy" as const, labelledNetPence: 2500, facts: boundary },
    { id: "short-delivery", label: "discrepancy" as const, labelledNetPence: 4000, facts: short },
  ];
}
