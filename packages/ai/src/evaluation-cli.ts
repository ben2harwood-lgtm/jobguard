import { pathToFileURL } from "node:url";
import { MUTATIONS, runCaptureEvaluation, type EvaluationMutation } from "./evaluation-runner.js";
export async function evaluationMain(argv: readonly string[], emit: (text: string) => void = text => process.stdout.write(text)): Promise<number> {
  if (argv.length && !(argv.length === 2 && argv[0] === "--mutation" && MUTATIONS.includes(argv[1] as EvaluationMutation))) {
    emit(JSON.stringify({ schema: "jobguard-capture-evaluation-error/1", code: "INVALID_ARGUMENTS", usage: "pnpm eval [--mutation omission|money|citation|provenance|ambiguity]" }) + "\n");
    return 2;
  }
  try {
    const report = await runCaptureEvaluation(argv[1] as EvaluationMutation | undefined);
    emit(JSON.stringify(report, null, 2) + "\n");
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
