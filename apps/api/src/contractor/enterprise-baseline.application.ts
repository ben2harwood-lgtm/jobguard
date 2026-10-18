import { z } from "zod";
import {
  baselineCohortsV1, BaselineError, deriveBaseline, exportBaseline, importBaselineBatch, type BaselineBatch,
} from "@jobguard/core";

export const baselinePrepareV1 = z.object({ version: z.literal("baseline-prepare.v1"),
  format: z.enum(["json", "csv"]), content: z.string().max(8_000_000), outputFormat: z.enum(["json", "csv"]),
  methodVersion: z.string().min(1).max(100), cohorts: baselineCohortsV1,
}).strict();
export const baselinePreparationErrorV1 = z.object({ version: z.literal("baseline-preparation-error.v1"),
  code: z.literal("BASELINE_REAL_HISTORY_HELD"),
}).strict();
export class BaselinePreparationHeld extends Error {
  readonly code = "BASELINE_REAL_HISTORY_HELD";
  constructor() { super("BASELINE_REAL_HISTORY_HELD"); this.name = "BaselinePreparationHeld"; }
  toJSON(): z.infer<typeof baselinePreparationErrorV1> { return { version: "baseline-preparation-error.v1", code: this.code }; }
}

/**
 * Internal preparation only. Deployment mode comes from server composition, never this request.
 * Caller owns synthetic batch state. This function grants no role, checks no session and persists nothing;
 * do not expose it as a route until checked historical-write authority and scoped reads are supplied.
 */
export function prepareEnterpriseBaseline(deploymentMode: string, raw: unknown, batches: readonly BaselineBatch[]) {
  if (deploymentMode !== "synthetic_demo") throw new BaselinePreparationHeld();
  const parsed = baselinePrepareV1.safeParse(raw);
  if (!parsed.success) throw new BaselineError("BASELINE_INVALID");
  const input = parsed.data;
  const imported = importBaselineBatch(batches, input.format, input.content);
  const report = deriveBaseline(imported.batch.history, input.cohorts, input.methodVersion);
  const content = exportBaseline(imported.batch.history, input.cohorts, input.outputFormat);
  return Object.freeze({ imported, report, content, format: input.outputFormat });
}
