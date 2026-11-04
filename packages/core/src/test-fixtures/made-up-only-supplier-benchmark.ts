/** Entirely invented case labels and source digests. NOT the M2-3 corpus or human review evidence. */
export const madeUpOnlyManifest = {
  version: "supplier-benchmark.v1", corpusVersion: "MADE-UP-ONLY-NOT-REAL-CORPUS.v1",
  dataKind: "made-up-test-only",
  targets: { falseDiscovery: { numerator: 5, denominator: 100 }, recall: { numerator: 90, denominator: 100 }, minimumNetPence: 2500 },
  cases: Array.from({ length: 101 }, (_, i) => ({
    id: `invented-${i}`, split: i === 100 ? "development" : "held-out",
    class: i < 40 ? "invented-variance" : i < 80 ? "invented-clean" : "invented-unclear",
    sourceHash: i.toString(16).padStart(64, "0"),
    frozenLabel: i < 40 ? "discrepancy" : i < 80 ? "match" : "ambiguous",
    netPence: i < 30 ? 2500 : i < 40 ? 2499 : null,
    critical: i === 99,
  })),
};
export const madeUpOnlyPerfectPredictions = madeUpOnlyManifest.cases.slice(0, 100).map(c => ({
  caseId: c.id, sourceHash: c.sourceHash, label: c.frozenLabel, criticalPassed: true,
}));
