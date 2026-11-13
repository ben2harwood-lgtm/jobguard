/**
 * MADE-UP ONLY. Recipe fixed before the first matcher run (10 Nov 2026).
 * One row per held-out case, in manifest order; never include development.
 * Variant = numeric case index % 6, independent of matcher outcomes:
 * 0 exact lines; 1 invented SKU wording via explicit alias; 2 known five-unit
 * packs; 3 two receipt and invoice lines merged against one order;
 * 4 unmapped invented invoice SKU; 5 missing receipt.
 * Discrepancies add the frozen netPence to the invoice total (to its first line
 * when split); matches add zero. Ambiguous cases add zero and, for variants
 * 0..3, omit the invoice pack conversion; variants 4..5 are already incomplete.
 * Every case orders/receives/bills ten base units at 100 pence each, except
 * the declared incompleteness. No free-text description field exists in V1.
 * Digests below are invented document identities, not source-byte evidence.
 * Canonical JSON = JSON.stringify of this array, preserving recipe field and
 * numeric case order (no whitespace). The pin excludes its own declaration.
 * After pinning and running, do not tune inputs to improve results.
 */
import type { SupplierLineMatchInput } from "../supplier-line-matching.js";
import { madeUpOnlyManifest } from "./made-up-only-supplier-benchmark.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function facts(index: number, label: string, netPence: number | null): SupplierLineMatchInput {
  const variant = index % 6;
  const base = 1000 + index * 100;
  const identity = (offset: number, documentOffset = offset) => ({
    lineId: id(base + offset), versionId: id(base + offset + 1), documentVersionId: id(base + documentOffset + 2),
    sourceHash: (base + documentOffset).toString(16).padStart(64, "0"), page: 1,
    sku: "ZORPLE-BEAM", orderReference: `FABLE-${index}`, unit: "each", baseUnit: "each", unitsPerPack: "1",
  });
  const extra = label === "discrepancy" ? netPence! : 0;
  const input: SupplierLineMatchInput = {
    version: "supplier-line-match-input.v1", environment: "synthetic_demo",
    tenantId: id(1), jobId: id(base), merchantId: id(3),
    orders: [{ ...identity(10), quantity: "10", unitNetPence: 100, discountBps: 0,
      rateVersionId: id(base + 19), validFrom: "2030-01-01", validTo: "2030-01-31" }],
    receipts: [{ ...identity(20), acceptedQuantity: "10" }],
    bills: [{ ...identity(30), kind: "invoice", documentReference: `FABLE-INVOICE-${index}`,
      quantity: "10", netPence: 1000 + extra, taxBasis: "net", supplyDate: "2030-01-02", creditsInvoiceVersionId: null }],
    aliases: [], mappings: [],
  };
  if (variant === 1) {
    input.bills[0]!.sku = "Zorple structural beam";
    input.aliases.push({ alias: "Zorple structural beam", sku: "ZORPLE-BEAM" });
  }
  if (variant === 2) {
    input.bills[0]!.unit = "pack"; input.bills[0]!.unitsPerPack = "5"; input.bills[0]!.quantity = "2";
    input.receipts[0]!.unit = "pack"; input.receipts[0]!.unitsPerPack = "5"; input.receipts[0]!.acceptedQuantity = "2";
  }
  if (variant === 3) {
    input.receipts[0]!.acceptedQuantity = "4";
    input.receipts.push({ ...identity(40, 20), acceptedQuantity: "6" });
    input.bills[0]!.quantity = "4"; input.bills[0]!.netPence = 400 + extra;
    input.bills.push({ ...input.bills[0]!, ...identity(50, 30), quantity: "6", netPence: 600 });
  }
  if (variant === 4) input.bills[0]!.sku = "QUENZO-BEAM";
  if (variant === 5) input.receipts = [];
  if (label === "ambiguous" && variant < 4) input.bills[0]!.unitsPerPack = null;
  return input;
}

export const madeUpOnlySupplierMatchInputs = madeUpOnlyManifest.cases.filter(c => c.split === "held-out").map(c => ({
  caseId: c.id, sourceHash: c.sourceHash,
  input: facts(Number(c.id.slice("invented-".length)), c.frozenLabel, c.netPence),
}));
export const MADE_UP_ONLY_SUPPLIER_MATCH_INPUTS_SHA256 = "35829f3ce11ffc15fc6741acd69d714f490c214e06fe300fcf11a7092516b1d2";
