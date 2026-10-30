import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { runCaptureEvaluation } from "./evaluation-runner.js";

// These proposed pilot targets cannot be changed by editing a run record. A
// policy change needs a recorded decision and corresponding contract/test edits.
export const GOLDEN_TARGETS = Object.freeze({ scopeIntentRecallPercent: 95,
  unsupportedMonetaryFacts: 0, validCitationsPercent: 100, designatedAmbiguities: "ALL",
  additionalGuard: "Every case must match its explicit labels; no pooling away failures" });
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const count = z.number().int().nonnegative();
const predictions = z.array(z.object({
  id: z.string().min(1), output: z.object({ lines: z.array(z.unknown()).min(1) }),
  scopeIntentRecall: z.object({ numerator: count, denominator: count.positive() }),
  citations: z.object({ valid: count, total: count.positive() }),
  ambiguityChecks: z.object({ passed: count, total: count.positive() }),
})).min(20);

/** Bind source bytes as well as declared versions, so an unversioned edit also
 * requires a fresh fixture record. Paths work from both src and compiled dist. */
export async function captureImplementationHashes() {
  const paths = ["packages/core/src/capture.ts", "packages/ai/src/capture.ts",
    "packages/ai/src/capture-fixture-parser.ts", "packages/ai/src/fixture-provider.ts",
    "packages/ai/src/gateway.ts", "packages/ai/src/types.ts",
    "packages/ai/src/capture-evaluation.ts", "packages/ai/src/evaluation-runner.ts",
    "packages/ai/src/golden-run-record.ts"];
  return Object.fromEntries(await Promise.all(paths.map(async path => [path,
    sha256(await readFile(new URL(`../../../${path}`, import.meta.url), "utf8"))])));
}

export async function createGoldenRunRecord(report: Awaited<ReturnType<typeof runCaptureEvaluation>>) {
  predictions.parse(report.results);
  if (new Set(report.results.map(result => result.id)).size !== report.results.length ||
    report.cases.total !== report.results.length || !isDeepStrictEqual(report.targets, GOLDEN_TARGETS) ||
    report.executionMode !== "DETERMINISTIC_STRUCTURED_FIXTURES" || report.costPence !== 0) {
    throw new Error("Invalid fixture golden run");
  }
  const { elapsedMs: _elapsed, results, ...summary } = report;
  return {
    recordVersion: "jobguard-fixture-golden-run/1",
    deployment: { provider: "recorded-fixture", model: "fixture-v1", deployment: "local-only" },
    implementationSha256: await captureImplementationHashes(),
    ...summary,
    results: results.map(({ output, ...result }) => ({ ...result, predictionSha256: sha256(JSON.stringify(output)) })),
  };
}

/** Never writes or refreshes the expected record as a side effect of CI. */
export async function verifyGoldenRunRecord(report: Awaited<ReturnType<typeof runCaptureEvaluation>>, recorded: unknown) {
  const actual = await createGoldenRunRecord(report);
  if (!isDeepStrictEqual(actual, recorded)) throw new Error("Golden run changed; produce and review a new fixture record");
}
