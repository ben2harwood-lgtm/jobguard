import { z } from "zod";
import { scoreSupplierBenchmark, validateSupplierBenchmarkManifest, SupplierBenchmarkError } from "./supplier-benchmark.js";
import { matchSupplierLines, supplierLineMatchInputV1 } from "./supplier-line-matching.js";

// Source hashes are declarations, as in M2-5; this evaluator does not verify source bytes.
const runSchema = z.object({
  version: z.literal("supplier-match-evaluation-inputs.v1"),
  confirmedFact: z.array(z.object({
    caseId: z.string().min(1), sourceHash: z.string().regex(/^[a-f0-9]{64}$/u), input: supplierLineMatchInputV1,
  }).strict()),
  endToEnd: z.array(z.object({
    caseId: z.string().min(1), sourceHash: z.string().regex(/^[a-f0-9]{64}$/u), input: supplierLineMatchInputV1,
  }).strict()),
}).strict();
type Run = z.infer<typeof runSchema>["confirmedFact"];
const emptyRuns = { version: "supplier-match-evaluation-inputs.v1", confirmedFact: [], endToEnd: [] };

/** Evaluation labels only. An unresolved source or incomplete fact is never actionable. */
function predict(input: z.infer<typeof supplierLineMatchInputV1>) {
  const result = matchSupplierLines(input);
  const codes = [...result.unresolved, ...result.groups.flatMap(g => g.issues)].map(i => i.code);
  const actionable = new Set(["net_price_variance", "short_delivery", "over_delivery", "billed_above_received"]);
  const ambiguous = result.groups.length === 0 || codes.some(code => !actionable.has(code));
  const label = ambiguous ? "ambiguous" : codes.length ? "discrepancy" : "match";
  return { label: label as "match" | "discrepancy" | "ambiguous", codes };
}
function failureClass(codes: string[]) {
  if (codes.includes("missing_unit_conversion")) return "unit/pack mismatch";
  if (codes.includes("unmatched_line")) return "unmatched identity (description cause unproven)";
  if (codes.includes("ambiguous_order")) return "multiple order candidates";
  if (codes.some(c => c === "missing_receipt" || c === "missing_invoice")) return "missing line";
  if (codes.length === 1 && codes[0] === "net_price_variance") return "price-only difference";
  return "other or unproven";
}

/** Pure, dark evaluation. Missing matcher/extraction inputs stay missing; labels never generate facts. */
export function evaluateSupplierMatchFailureClusters(manifest: unknown, pinnedHash: string, rawRuns: unknown = emptyRuns) {
  const m = validateSupplierBenchmarkManifest(manifest, pinnedHash);
  const parsed = runSchema.safeParse(rawRuns);
  if (!parsed.success) throw new SupplierBenchmarkError("INVALID_PREDICTIONS");
  const held = new Map(m.cases.filter(c => c.split === "held-out").map(c => [c.id, c]));
  function execute(run: Run) {
    const seen = new Set<string>();
    return run.map(row => {
      if (seen.has(row.caseId) || held.get(row.caseId)?.sourceHash !== row.sourceHash)
        throw new SupplierBenchmarkError("INVALID_PREDICTIONS");
      seen.add(row.caseId);
      const result = predict(row.input);
      return { caseId: row.caseId, sourceHash: row.sourceHash, ...result,
        // Classifying a critical row does not establish its deterministic assertions passed.
        criticalPassed: false };
    });
  }
  const confirmed = execute(parsed.data.confirmedFact), endToEnd = execute(parsed.data.endToEnd);
  const predictions = (run: typeof confirmed) => run.map(({ codes: _codes, ...p }) => p);
  const score = scoreSupplierBenchmark(m, {
    version: "supplier-benchmark-predictions.v1", manifestHash: pinnedHash,
    confirmedFact: predictions(confirmed), endToEnd: predictions(endToEnd),
  }, pinnedHash);
  function cluster(run: typeof confirmed, errors: typeof score.confirmedFact.errors) {
    const byId = new Map(run.map(r => [r.caseId, r]));
    const clusters: Record<string, string[]> = {};
    for (const error of errors) {
      const result = byId.get(error.caseId);
      const name = result ? error.criticalFailure && error.actual === error.expected
        ? "critical assertions unavailable" : failureClass(result.codes) : "matcher input unavailable";
      (clusters[name] ??= []).push(error.caseId);
    }
    return { executedCases: run.length, missingInputs: held.size - run.length, clusters };
  }
  return { ...score,
    confirmedFactAnalysis: cluster(confirmed, score.confirmedFact.errors),
    endToEndAnalysis: cluster(endToEnd, score.endToEnd.errors),
    criticalAssertionsExecuted: false,
  };
}
