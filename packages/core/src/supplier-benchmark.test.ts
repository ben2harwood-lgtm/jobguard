import { describe, expect, it } from "vitest";
import { scoreSupplierBenchmark, supplierBenchmarkManifestHash, validateSupplierBenchmarkManifest } from "./supplier-benchmark.js";
import { madeUpOnlyManifest as manifest, madeUpOnlyPerfectPredictions as perfect } from "./test-fixtures/made-up-only-supplier-benchmark.js";

// Retained separately from candidate edits: tests must not silently re-pin labels.
const pin = "df5e0d6115b143a6bd62f121b61ece0d77a4b1287176d79df3013493f9c31e5c";
const file = (confirmedFact = perfect, endToEnd = perfect) => ({
  version: "supplier-benchmark-predictions.v1", manifestHash: pin, confirmedFact, endToEnd,
});
const score = (predictions = file()) => scoreSupplierBenchmark(manifest, predictions, pin);

describe("made-up-only supplier benchmark (no product benchmark evidence)", () => {
  it("reports hand-counted perfect results separately, without a product release claim", () => {
    expect(supplierBenchmarkManifestHash(manifest)).toBe(pin);
    const r = score();
    expect(r.dataKind).toBe("made-up-test-only");
    expect(r.productReleaseTargetMet).toBe(false);
    expect(r.syntheticHarnessPass).toBe(true);
    expect(r.confirmedFact.classCounts).toEqual({ "invented-variance": 40, "invented-clean": 40, "invented-unclear": 20 });
    expect(r.confirmedFact.labelCounts).toEqual({ discrepancy: 40, match: 40, ambiguous: 20 });
    expect(r.confirmedFact.falseDiscovery).toMatchObject({ numerator: 0, denominator: 40 });
    expect(r.confirmedFact.recallAtLeast2500PenceNet).toMatchObject({ numerator: 30, denominator: 30 });
    expect(r.confirmedFact.errors).toEqual([]);
    expect(r.confirmedFact.confusionMatrix).toEqual({
      discrepancy: { match: 0, discrepancy: 40, ambiguous: 0, missing: 0 },
      match: { match: 40, discrepancy: 0, ambiguous: 0, missing: 0 },
      ambiguous: { match: 0, discrepancy: 0, ambiguous: 20, missing: 0 },
    });
    expect(r.confirmedFact.falseDiscovery.interval?.upper).toBeCloseTo(0.0876216, 6);
    expect(r.confirmedFact.recallAtLeast2500PenceNet.interval?.lower).toBeCloseTo(0.8864866, 6);
  });

  it("proves TP=36 FP=2, recall=27/30, the full confusion matrix and error examples", () => {
    const changed = perfect.map((p, i) => ({ ...p,
      label: i === 29 ? "ambiguous" : [27, 28, 39].includes(i) ? "match" : [40, 80].includes(i) ? "discrepancy" : p.label,
    }));
    const r = score(file(perfect, changed));
    expect(r.confirmedFact.pass).toBe(true);
    expect(r.endToEnd.pass).toBe(false);
    expect(r.syntheticHarnessPass).toBe(false);
    expect(r.endToEnd.falseDiscovery).toMatchObject({ numerator: 2, denominator: 38 });
    expect(r.endToEnd.recallAtLeast2500PenceNet).toMatchObject({ numerator: 27, denominator: 30 });
    expect(r.endToEnd.targetResults).toEqual({ falseDiscovery: false, recall: true, completePredictions: true, criticalFixtures: true });
    expect(r.endToEnd.confusionMatrix).toEqual({
      discrepancy: { match: 3, discrepancy: 36, ambiguous: 1, missing: 0 },
      match: { match: 39, discrepancy: 1, ambiguous: 0, missing: 0 },
      ambiguous: { match: 0, discrepancy: 1, ambiguous: 19, missing: 0 },
    });
    expect(r.endToEnd.errors.map(e => e.caseId)).toEqual([27, 28, 29, 39, 40, 80].map(i => `invented-${i}`));
    expect(r.endToEnd.falseDiscovery.interval?.lower).toBeCloseTo(0.014554, 5);
    expect(r.endToEnd.falseDiscovery.interval?.upper).toBeCloseTo(0.172855, 5);
  });

  it("uses inclusive 5% and 90% boundaries and excludes sub-£25 labels from recall", () => {
    const boundary = perfect.map((p, i) => ({ ...p, label: [38, 39].includes(i) ? "match" : [40, 41].includes(i) ? "discrepancy" : p.label }));
    expect(score(file(boundary)).confirmedFact.falseDiscovery).toMatchObject({ numerator: 2, denominator: 40 });
    expect(score(file(boundary)).confirmedFact.pass).toBe(true);
    const belowRecall = perfect.map((p, i) => ({ ...p, label: i >= 26 && i < 30 ? "match" : p.label }));
    expect(score(file(belowRecall)).confirmedFact.targetResults.recall).toBe(false);
  });

  it("fails empty, missing and all-negative predictions, and zero eligible recall", () => {
    const r = score(file([], []));
    expect(r.syntheticHarnessPass).toBe(false);
    expect(r.confirmedFact.falseDiscovery).toEqual({ numerator: 0, denominator: 0, interval: null });
    expect(r.confirmedFact.confusionMatrix.discrepancy.missing).toBe(40);
    expect(r.confirmedFact.errors).toHaveLength(100);
    expect(score(file(perfect.slice(0, 99))).confirmedFact.pass).toBe(false);
    expect(score(file(perfect.map(p => ({ ...p, label: "match" })))).confirmedFact.pass).toBe(false);
    const smallOnly = structuredClone(manifest);
    for (const c of smallOnly.cases) if (c.netPence !== null) c.netPence = 2499;
    const hash = supplierBenchmarkManifestHash(smallOnly);
    const result = scoreSupplierBenchmark(smallOnly, { ...file(), manifestHash: hash }, hash);
    expect(result.confirmedFact.recallAtLeast2500PenceNet.denominator).toBe(0);
    expect(result.confirmedFact.pass).toBe(false);
  });

  it("fails critical deterministic fixtures despite perfect rates", () => {
    const broken = perfect.map((p, i) => ({ ...p, criticalPassed: i !== 99 }));
    const r = score(file(broken));
    expect(r.confirmedFact.targetResults.falseDiscovery).toBe(true);
    expect(r.confirmedFact.targetResults.recall).toBe(true);
    expect(r.confirmedFact.criticalFailures).toBe(1);
    expect(r.confirmedFact.pass).toBe(false);
    expect(r.confirmedFact.errors[0]).toMatchObject({ caseId: "invented-99", criticalFailure: true });
  });

  it.each(["label", "target", "split", "source", "version"])("refuses a changed %s against the original pin", change => {
    const edited = structuredClone(manifest);
    if (change === "label") edited.cases[40]!.frozenLabel = "ambiguous";
    if (change === "target") edited.targets.recall.numerator = 89;
    if (change === "split") {
      edited.cases[0]!.split = "development";
      edited.cases[100]!.split = "held-out";
    }
    if (change === "source") edited.cases[0]!.sourceHash = "f".repeat(64);
    if (change === "version") edited.corpusVersion = "edited";
    expect(() => validateSupplierBenchmarkManifest(edited, pin)).toThrow();
  });

  it("rejects overlap, short held-out sets, source leakage and unfrozen extra fields", () => {
    const duplicate = structuredClone(manifest);
    duplicate.cases[100]!.id = duplicate.cases[0]!.id;
    expect(() => supplierBenchmarkManifestHash(duplicate)).toThrow("INVALID_MANIFEST");
    const leaked = structuredClone(manifest);
    leaked.cases[100]!.sourceHash = leaked.cases[0]!.sourceHash;
    expect(() => supplierBenchmarkManifestHash(leaked)).toThrow("INVALID_MANIFEST");
    leaked.cases[100]!.sourceHash = manifest.cases[100]!.sourceHash;
    leaked.cases[1]!.sourceHash = leaked.cases[0]!.sourceHash;
    expect(() => supplierBenchmarkManifestHash(leaked)).toThrow("INVALID_MANIFEST");
    expect(() => supplierBenchmarkManifestHash({ ...manifest, dataKind: "real" })).toThrow();
    expect(() => supplierBenchmarkManifestHash({ ...manifest, cases: manifest.cases.slice(1) })).toThrow();
    expect(() => supplierBenchmarkManifestHash({ ...manifest, unpinned: true })).toThrow();
    expect(supplierBenchmarkManifestHash({ ...manifest, cases: [...manifest.cases].reverse() })).toBe(pin);
  });

  it("rejects duplicate, unknown, development, wrong-source and wrong-pin predictions", () => {
    for (const bad of [
      [...perfect, perfect[0]!],
      [{ ...perfect[0]!, caseId: "unknown" }],
      [{ ...perfect[0]!, caseId: "invented-100", sourceHash: manifest.cases[100]!.sourceHash }],
      [{ ...perfect[0]!, sourceHash: "f".repeat(64) }],
    ]) expect(() => score(file(bad))).toThrow("INVALID_PREDICTIONS");
    expect(() => score({ ...file(), manifestHash: "f".repeat(64) })).toThrow("PIN_MISMATCH");
    expect(() => scoreSupplierBenchmark(manifest, file(), "bad")).toThrow("PIN_MISMATCH");
  });
});
