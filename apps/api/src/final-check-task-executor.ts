import type { VerifiedTenantContext } from "@jobguard/db";
import { FinalCheckTaskError, parseFinalCheckTask } from "./worker-task-extensions.js";
export { FinalCheckTaskError } from "./worker-task-extensions.js";

/** SV-5 replaces this explicit failure with its checked, persisted post-lock orchestration. */
export async function executeFinalCheckTask(context: VerifiedTenantContext, raw: unknown): Promise<void> {
  const task = parseFinalCheckTask(raw);
  if (context.tenantId !== task.tenantId) throw new FinalCheckTaskError("FINAL_CHECK_TASK_TENANT_MISMATCH");
  // No successful acknowledgment, detector call, zero result, or completion publication exists here.
  throw new FinalCheckTaskError("FINAL_CHECK_HANDLER_NOT_INSTALLED");
}
