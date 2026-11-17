import { readFile } from "node:fs/promises";
import { verifyGoldenRunRecord } from "./golden-run-record.js";
import { runShadowEvaluation, formatShadowEvaluation } from "./shadow-evaluation.js";
import { pathToFileURL } from "node:url";
import { MUTATIONS, runCaptureEvaluation, type EvaluationMutation } from "./evaluation-runner.js";
export async function evaluationMain(argv: readonly string[], emit: (text: string) => void = text => process.stdout.write(text)): Promise<number> {
  if (argv.length && !(argv.length === 2 && argv[0] === "--mutation" && MUTATIONS.includes(argv[1] as EvaluationMutation))) {
    emit(JSON.stringify({ schema: "jobguard-capture-evaluation-error/1", code: "INVALID_ARGUMENTS", usage: "pnpm eval [--mutation omission|money|citation|provenance|ambiguity]" }) + "\n");
    return 2;
  }
  try {
    const report = await runCaptureEvaluation(argv[1] as EvaluationMutation | undefined);
    if (!argv.length) {
      const recorded: unknown = JSON.parse(await readFile(new URL("../../../docs/fixtures/ai/golden-run.v1.json", import.meta.url), "utf8"));
      await verifyGoldenRunRecord(report, recorded);
    }
    const shadow = !argv.length ? await runShadowEvaluation() : undefined;
    emit(JSON.stringify({ ...report, ...(shadow ? { shadowEvaluation: shadow, shadowSummary: formatShadowEvaluation(shadow) } : {}) }, null, 2) + "\n");
    return report.status === "PASS" ? 0 : 1;
  } catch {
    // A missing/invalid corpus or runtime failure is never a successful empty
    // evaluation. Avoid reflecting stack traces, credentials or raw input.
    emit(JSON.stringify({ schema: "jobguard-capture-evaluation-error/1", code: "EVALUATION_FAILED", releaseDecision: "NOT_AUTHORIZED" }) + "\n");
    return 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await evaluationMain(process.argv.slice(2));
}
