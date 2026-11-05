import { readFileSync } from "node:fs";
import { scoreSupplierBenchmark } from "../packages/core/dist/supplier-benchmark.js";

// Hash is an independently retained pin, never computed from the candidate here.
const [manifestPath, predictionsPath, pinPath, ...extra] = process.argv.slice(2);
try {
  if (!manifestPath || !predictionsPath || !pinPath || extra.length)
    throw new Error("Usage: node tools/supplier-benchmark.mjs manifest.json predictions.json pin.sha256");
  const readJson = path => JSON.parse(readFileSync(path, "utf8"));
  const result = scoreSupplierBenchmark(readJson(manifestPath), readJson(predictionsPath), readFileSync(pinPath, "utf8").trim());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.syntheticHarnessPass ? 0 : 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Benchmark input error"}\n`);
  process.exitCode = 2;
}
