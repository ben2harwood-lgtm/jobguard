import { describe, expect, it } from "vitest";
import { evaluateSupplierMatchFailureClusters } from "./supplier-match-failure-clusters.js";
import { madeUpOnlyManifest as manifest } from "./test-fixtures/made-up-only-supplier-benchmark.js";
import { madeUpOnlySupplierMatchInputs } from "./test-fixtures/made-up-only-supplier-match-inputs.js";
import type { SupplierLineMatchInput } from "./supplier-line-matching.js";

const pin = "df5e0d6115b143a6bd62f121b61ece0d77a4b1287176d79df3013493f9c31e5c";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function input(): SupplierLineMatchInput {
  const identity = (n: number) => ({ lineId: id(n), versionId: id(n + 1), documentVersionId: id(n + 2),
    sourceHash: String(n).padStart(64, "0"), page: 1, sku: "TIMBER", orderReference: "PO-1",
    unit: "each", baseUnit: "each", unitsPerPack: "1" });
  return { version: "supplier-line-match-input.v1", environment: "synthetic_demo", tenantId: id(1), jobId: id(2), merchantId: id(3),
    orders: [{ ...identity(10), quantity: "10", unitNetPence: 100, discountBps: 0, rateVersionId: id(19), validFrom: "2030-01-01", validTo: "2030-01-31" }],
    receipts: [{ ...identity(20), acceptedQuantity: "10" }],
    bills: [{ ...identity(30), kind: "invoice", documentReference: "INV-1", quantity: "10", netPence: 1000, taxBasis: "net", supplyDate: "2030-01-02", creditsInvoiceVersionId: null }],
    aliases: [], mappings: [] };
}
const row = (i: number, facts = input()) => ({ caseId: manifest.cases[i]!.id, sourceHash: manifest.cases[i]!.sourceHash, input: facts });
const runs = (confirmedFact = [row(40)], endToEnd = [] as ReturnType<typeof row>[]) => ({
  version: "supplier-match-evaluation-inputs.v1", confirmedFact, endToEnd,
});

describe("M2-8 evaluation only", () => {
  it("does not manufacture matcher facts from frozen labels or perfect scorer predictions", () => {
    const before = structuredClone(manifest);
    const r = evaluateSupplierMatchFailureClusters(manifest, pin);
    for (const run of [r.confirmedFact, r.endToEnd]) {
      expect(run.falseDiscovery).toEqual({ numerator: 0, denominator: 0, interval: null });
      expect(run.recallAtLeast2500PenceNet).toMatchObject({ numerator: 0, denominator: 30 });
      expect(run.targetResults).toEqual({ falseDiscovery: false, recall: false, completePredictions: false, criticalFixtures: false });
      expect(run.errors).toHaveLength(100);
    }
    expect(r.confirmedFactAnalysis.clusters["matcher input unavailable"]).toHaveLength(100);
    expect(r.endToEndAnalysis.missingInputs).toBe(100);
    expect(r.syntheticHarnessPass).toBe(false);
    expect(r.productReleaseTargetMet).toBe(false);
    expect(manifest).toEqual(before);
  });

  it("executes actual facts without consulting truth and keeps extraction results separate", () => {
    const facts = input(); facts.bills[0]!.netPence = 3500;
    const before = structuredClone(facts);
    const r = evaluateSupplierMatchFailureClusters(manifest, pin, runs([row(0, facts)], [row(0)]));
    expect(r.confirmedFact.recallAtLeast2500PenceNet).toMatchObject({ numerator: 1, denominator: 30 });
    expect(r.endToEnd.recallAtLeast2500PenceNet.numerator).toBe(0);
    expect(r.confirmedFactAnalysis.executedCases).toBe(1);
    expect(facts).toEqual(before);
    const fp = evaluateSupplierMatchFailureClusters(manifest, pin, runs([row(40, facts)]));
    expect(fp.confirmedFact.falseDiscovery).toMatchObject({ numerator: 1, denominator: 1 });
    expect(fp.confirmedFactAnalysis.clusters["price-only difference"]).toEqual(["invented-40"]);
  });

  it.each([
    ["unit/pack mismatch", (f: SupplierLineMatchInput) => { f.bills[0]!.unitsPerPack = null; }],
    ["unmatched identity (description cause unproven)", (f: SupplierLineMatchInput) => { f.bills[0]!.sku = "UNKNOWN"; }],
    ["missing line", (f: SupplierLineMatchInput) => { f.receipts = []; }],
  ] as const)("clusters observed %s without inventing a cause", (name, change) => {
    const facts = input(); change(facts);
    const r = evaluateSupplierMatchFailureClusters(manifest, pin, runs([row(0, facts)]));
    expect(r.confirmedFactAnalysis.clusters[name]).toEqual(["invented-0"]);
    expect(r.confirmedFact.falseDiscovery.denominator).toBe(0);
  });

  it("never converts a correct critical label into a passed critical assertion", () => {
    const facts = input(); facts.bills[0]!.unitsPerPack = null;
    const r = evaluateSupplierMatchFailureClusters(manifest, pin, runs([row(99, facts)]));
    expect(r.confirmedFactAnalysis.clusters["critical assertions unavailable"]).toEqual(["invented-99"]);
    expect(r.confirmedFact.criticalFailures).toBe(1);
  });

  it("rejects development leakage, duplicate IDs, false bindings, invalid facts and re-pinning", () => {
    for (const bad of [runs([row(100)]), runs([row(0), row(0)]), runs([{ ...row(0), sourceHash: "f".repeat(64) }]),
      runs([{ ...row(0), input: { ...input(), environment: "production" } as never }])]) {
      expect(() => evaluateSupplierMatchFailureClusters(manifest, pin, bad)).toThrow("INVALID_PREDICTIONS");
    }
    expect(() => evaluateSupplierMatchFailureClusters(manifest, "f".repeat(64))).toThrow("PIN_MISMATCH");
  });
});


describe("M2-8 frozen made-up corpus baseline", () => {
  it("executes every confirmed-fact case and retains stable failures without claiming extraction or release", () => {
    const before = structuredClone(madeUpOnlySupplierMatchInputs);
    const result = evaluateSupplierMatchFailureClusters(manifest, pin, runs(madeUpOnlySupplierMatchInputs));
    expect(result.confirmedFactAnalysis).toEqual({
      executedCases: 100, missingInputs: 0,
      clusters: {
        "unmatched identity (description cause unproven)": [4, 10, 16, 22, 28, 34, 40, 46, 52, 58, 64, 70, 76].map(i => `invented-${i}`),
        "missing line": [5, 11, 17, 23, 29, 35, 41, 47, 53, 59, 65, 71, 77].map(i => `invented-${i}`),
        "critical assertions unavailable": ["invented-99"],
      },
    });
    expect(result.confirmedFact.falseDiscovery).toMatchObject({ numerator: 0, denominator: 28 });
    expect(result.confirmedFact.recallAtLeast2500PenceNet).toMatchObject({ numerator: 20, denominator: 30 });
    expect(result.confirmedFact.confusionMatrix).toEqual({
      discrepancy: { match: 0, discrepancy: 28, ambiguous: 12, missing: 0 },
      match: { match: 26, discrepancy: 0, ambiguous: 14, missing: 0 },
      ambiguous: { match: 0, discrepancy: 0, ambiguous: 20, missing: 0 },
    });
    expect(result.confirmedFact.targetResults).toEqual({
      falseDiscovery: true, recall: false, completePredictions: true, criticalFixtures: false,
    });
    expect(result.endToEndAnalysis.executedCases).toBe(0);
    expect(result.endToEndAnalysis.missingInputs).toBe(100);
    expect(result.criticalAssertionsExecuted).toBe(false);
    expect(result.syntheticHarnessPass).toBe(false);
    expect(result.productReleaseTargetMet).toBe(false);
    expect(madeUpOnlySupplierMatchInputs).toEqual(before);
  });
});
