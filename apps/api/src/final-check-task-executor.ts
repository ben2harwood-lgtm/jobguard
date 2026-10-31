import { FinalCheckError } from "@jobguard/core";
import type { VerifiedTenantContext, FinalCheckManifest } from "@jobguard/db";
import { FinalCheckTaskError, parseFinalCheckTask } from "./worker-task-extensions.js";
export { FinalCheckTaskError } from "./worker-task-extensions.js";

export interface FinalCheckExecutionPorts {
  read(context: VerifiedTenantContext, jobId: string, manifestId: string): Promise<FinalCheckManifest>;
  execute(context: VerifiedTenantContext, task: { version: "final-check.task.v1"; jobId: string; manifestId: string }): Promise<unknown>;
  publish(context: VerifiedTenantContext, request: { version: "final-check-publication.v1"; jobId: string; runId: string; checkId: string }): Promise<unknown>;
}

/** Queue identifiers grant no authority. The worker's checked reader revalidates the frozen lock binding. */
export async function executeFinalCheckTask(context: VerifiedTenantContext, raw: unknown, ports: FinalCheckExecutionPorts, environment: string): Promise<void> {
  const task = parseFinalCheckTask(raw);
  if (context.tenantId !== task.tenantId) throw new FinalCheckTaskError("FINAL_CHECK_TASK_TENANT_MISMATCH");
  if (environment !== "synthetic_demo") throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
  const manifest = await ports.read(context, task.jobId, task.manifestId);
  if (manifest.comparisons.tenantId !== context.tenantId || manifest.comparisons.jobId !== task.jobId ||
      manifest.id !== task.manifestId || manifest.lockId !== task.lockId) throw new FinalCheckError("FINAL_CHECK_FORBIDDEN");
  await ports.execute(context, { version: "final-check.task.v1", jobId: task.jobId, manifestId: task.manifestId });
  // Read persisted completion rather than trusting an executor return value. Failed sources never publish.
  const completed = await ports.read(context, task.jobId, task.manifestId);
  if (completed.id !== manifest.id || completed.hash !== manifest.hash || completed.lockId !== manifest.lockId ||
      completed.cutoff !== manifest.cutoff || completed.comparisons.tenantId !== context.tenantId ||
      completed.comparisons.jobId !== task.jobId || completed.result?.lockId !== task.lockId) throw new FinalCheckError("FINAL_CHECK_PENDING");
  // Stable across redelivery, restarts and new execution IDs. The certificate routine validates proof and replay.
  await ports.publish(context, { version: "final-check-publication.v1", jobId: task.jobId,
    runId: completed.result.runId, checkId: task.manifestId });
}
