import type { TaskList } from "graphile-worker";
import { z } from "zod";

/** Queue metadata identifies persisted work; it grants no completion or commercial authority. */
export const finalCheckTaskV1 = z.object({
  version: z.literal("final-check-task.v1"),
  tenantId: z.string().uuid(),
  jobId: z.string().uuid(),
  lockId: z.string().uuid(),
  manifestId: z.string().uuid(),
  executionId: z.string().uuid(),
}).strict();
export type FinalCheckTask = Readonly<z.infer<typeof finalCheckTaskV1>>;
export class FinalCheckTaskError extends Error {
  constructor(readonly code: "INVALID_FINAL_CHECK_TASK" | "FINAL_CHECK_TASK_ALREADY_REGISTERED" | "FINAL_CHECK_TASK_TENANT_MISMATCH" | "FINAL_CHECK_HANDLER_NOT_INSTALLED") {
    super(code); this.name = "FinalCheckTaskError";
  }
}
export function parseFinalCheckTask(raw: unknown): FinalCheckTask {
  const parsed = finalCheckTaskV1.safeParse(raw);
  if (!parsed.success) throw new FinalCheckTaskError("INVALID_FINAL_CHECK_TASK");
  return parsed.data;
}

/** Validate before invoking the composition callback. This module never receives a tenant context. */
export function registerFinalCheckTask(tasks: TaskList, execute: (payload: FinalCheckTask) => Promise<void>): void {
  if (Object.hasOwn(tasks, "final_check")) throw new FinalCheckTaskError("FINAL_CHECK_TASK_ALREADY_REGISTERED");
  tasks.final_check = async payload => { await execute(parseFinalCheckTask(payload)); };
}
