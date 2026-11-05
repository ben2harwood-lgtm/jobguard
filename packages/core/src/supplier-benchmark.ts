import { z } from "zod";
import { sha256 } from "./evidence-pack.js";

const identity = z.string().min(1).max(200);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const labels = ["match", "discrepancy", "ambiguous"] as const;
const label = z.enum(labels);
const caseSchema = z.object({
  id: identity, split: z.enum(["development", "held-out"]), class: identity,
  sourceHash: digest, frozenLabel: label,
  netPence: z.number().int().safe().nonnegative().nullable(), critical: z.boolean(),
}).strict().refine(c => c.frozenLabel === "discrepancy" ? c.netPence !== null : c.netPence === null,
  "Only discrepancy labels have a known net exposure");

/** Synthetic harness only: this schema cannot describe an approved real corpus. */
export const supplierBenchmarkManifestV1 = z.object({
  version: z.literal("supplier-benchmark.v1"), corpusVersion: identity,
  dataKind: z.literal("made-up-test-only"),
  targets: z.object({
    falseDiscovery: z.object({ numerator: z.literal(5), denominator: z.literal(100) }).strict(),
    recall: z.object({ numerator: z.literal(90), denominator: z.literal(100) }).strict(),
    minimumNetPence: z.literal(2500),
  }).strict(),
  cases: z.array(caseSchema).min(101).max(100000),
}).strict().superRefine((m, ctx) => {
  if (new Set(m.cases.map(c => c.id)).size !== m.cases.length)
    ctx.addIssue({ code: "custom", message: "Duplicate/overlapping case identity" });
  // Same source cannot leak between development and held-out under a different case ID.
  const sources = new Map<string, string>();
  for (const c of m.cases) {
    if (sources.has(c.sourceHash))
      ctx.addIssue({ code: "custom", message: "Duplicate source or source overlaps splits" });
    sources.set(c.sourceHash, c.split);
  }
  const held = m.cases.filter(c => c.split === "held-out");
  if (held.length < 100 || !m.cases.some(c => c.split === "development"))
    ctx.addIssue({ code: "custom", message: "Need 100 held-out cases and separate development cases" });
  for (const expected of labels) {
    if (!held.some(c => c.frozenLabel === expected))
      ctx.addIssue({ code: "custom", message: `Missing held-out label: ${expected}` });
  }
  if (!held.some(c => c.critical))
    ctx.addIssue({ code: "custom", message: "Need pinned deterministic critical fixtures" });
});
const prediction = z.object({
  caseId: identity, sourceHash: digest, label, criticalPassed: z.boolean(),
}).strict();
export const supplierBenchmarkPredictionsV1 = z.object({
  version: z.literal("supplier-benchmark-predictions.v1"), manifestHash: digest,
  confirmedFact: z.array(prediction).max(100000),
  endToEnd: z.array(prediction).max(100000),
}).strict();
type Manifest = z.infer<typeof supplierBenchmarkManifestV1>;
type Prediction = z.infer<typeof prediction>;
export class SupplierBenchmarkError extends Error {
  constructor(readonly code: "INVALID_MANIFEST" | "PIN_MISMATCH" | "INVALID_PREDICTIONS") {
    super(code); this.name = "SupplierBenchmarkError";
  }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown, code: SupplierBenchmarkError["code"]): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new SupplierBenchmarkError(code);
  return result.data;
}
/** Schema field order is canonical; case order is immaterial. Keep the pin outside candidate files. */
export function supplierBenchmarkManifestHash(raw: unknown): string {
  const m = parse(supplierBenchmarkManifestV1, raw, "INVALID_MANIFEST");
  return sha256(JSON.stringify({ ...m, cases: [...m.cases].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) }));
}
export function validateSupplierBenchmarkManifest(raw: unknown, pinnedHash: string): Manifest {
  const m = parse(supplierBenchmarkManifestV1, raw, "INVALID_MANIFEST");
  if (!digest.safeParse(pinnedHash).success || supplierBenchmarkManifestHash(m) !== pinnedHash)
    throw new SupplierBenchmarkError("PIN_MISMATCH");
  return m;
}

/** Exact counts; Wilson 95% bounds are approximate proportions, not a release gate. */
function rate(numerator: number, denominator: number) {
  if (denominator === 0) return { numerator, denominator, interval: null };
  const z95 = 1.959963984540054;
  const p = numerator / denominator;
  const divisor = 1 + z95 ** 2 / denominator;
  const centre = (p + z95 ** 2 / (2 * denominator)) / divisor;
  const half = z95 * Math.sqrt(p * (1 - p) / denominator + z95 ** 2 / (4 * denominator ** 2)) / divisor;
  return { numerator, denominator, interval: { lower: Math.max(0, centre - half), upper: Math.min(1, centre + half) } };
}
function meets(n: number, d: number, target: { numerator: number; denominator: number }, maximum: boolean) {
  if (d === 0) return false;
  const left = BigInt(n) * BigInt(target.denominator);
  const right = BigInt(d) * BigInt(target.numerator);
  return maximum ? left <= right : left >= right;
}
function scoreRun(m: Manifest, predictions: Prediction[]) {
  const held = m.cases.filter(c => c.split === "held-out");
  const cases = new Map(held.map(c => [c.id, c]));
  const byId = new Map<string, Prediction>();
  for (const p of predictions) {
    if (byId.has(p.caseId) || cases.get(p.caseId)?.sourceHash !== p.sourceHash)
      throw new SupplierBenchmarkError("INVALID_PREDICTIONS");
    byId.set(p.caseId, p);
  }
  const confusionMatrix = Object.fromEntries(labels.map(l => [l, { match: 0, discrepancy: 0, ambiguous: 0, missing: 0 }])) as
    Record<typeof labels[number], Record<typeof labels[number] | "missing", number>>;
  const classCounts: Record<string, number> = Object.create(null) as Record<string, number>;
  const labelCounts = { match: 0, discrepancy: 0, ambiguous: 0 };
  const errors: { caseId: string; class: string; sourceHash: string; expected: string; actual: string; criticalFailure: boolean }[] = [];
  let tp = 0, fp = 0, eligible = 0, recalled = 0, criticalFailures = 0;
  for (const c of held) {
    const p = byId.get(c.id);
    const actual = p?.label ?? "missing";
    classCounts[c.class] = (Object.hasOwn(classCounts, c.class) ? classCounts[c.class]! : 0) + 1;
    labelCounts[c.frozenLabel]++;
    confusionMatrix[c.frozenLabel][actual]++;
    if (actual === "discrepancy") {
      if (c.frozenLabel === "discrepancy") tp++; else fp++;
    }
    if (c.frozenLabel === "discrepancy" && c.netPence! >= m.targets.minimumNetPence) {
      eligible++;
      if (actual === "discrepancy") recalled++;
    }
    const criticalFailure = c.critical && (!p?.criticalPassed || actual !== c.frozenLabel);
    if (criticalFailure) criticalFailures++;
    if (actual !== c.frozenLabel || criticalFailure)
      errors.push({ caseId: c.id, class: c.class, sourceHash: c.sourceHash, expected: c.frozenLabel, actual, criticalFailure });
  }
  const targetResults = {
    falseDiscovery: meets(fp, tp + fp, m.targets.falseDiscovery, true),
    recall: meets(recalled, eligible, m.targets.recall, false),
    completePredictions: predictions.length === held.length,
    criticalFixtures: criticalFailures === 0,
  };
  return { classCounts, labelCounts, confusionMatrix, errors,
    falseDiscovery: rate(fp, tp + fp), recallAtLeast2500PenceNet: rate(recalled, eligible),
    criticalFailures, targetResults, pass: Object.values(targetResults).every(Boolean) };
}
export function scoreSupplierBenchmark(manifest: unknown, predictions: unknown, pinnedHash: string) {
  const m = validateSupplierBenchmarkManifest(manifest, pinnedHash);
  const p = parse(supplierBenchmarkPredictionsV1, predictions, "INVALID_PREDICTIONS");
  if (p.manifestHash !== pinnedHash) throw new SupplierBenchmarkError("PIN_MISMATCH");
  const confirmedFact = scoreRun(m, p.confirmedFact);
  const endToEnd = scoreRun(m, p.endToEnd);
  return { version: "supplier-benchmark-result.v1", dataKind: m.dataKind, corpusVersion: m.corpusVersion,
    manifestHash: pinnedHash, evaluatedSplit: "held-out", productReleaseTargetMet: false,
    uncertainty: "Approximate two-sided Wilson 95% intervals; independent-case binomial assumption, no extraction or labelling bias correction. Null if denominator is zero.",
    confirmedFact, endToEnd, syntheticHarnessPass: confirmedFact.pass && endToEnd.pass } as const;
}
