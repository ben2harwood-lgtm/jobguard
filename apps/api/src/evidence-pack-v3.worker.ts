import { z } from "zod";
import { evidencePackMaterialV3 } from "@jobguard/core";
import type { EvidencePackV3WorkerRepository, VerifiedTenantContext } from "@jobguard/db";
const taskV1 = z.object({ version: z.literal("evidence-pack-task.v3"), tenantId: z.string().uuid(), commandId: z.string().uuid() }).strict();

/** No provider calls. A failed check never produces a pack or an all-clear result. */
export async function executeEvidencePackV3(
  context: VerifiedTenantContext, raw: unknown, repository: EvidencePackV3WorkerRepository,
  mustSurface: (jobId: string) => Promise<void>, environment: string,
) {
  const task = taskV1.parse(raw);
  if (environment !== "synthetic_demo" || task.tenantId !== context.tenantId) throw new Error("SYNTHETIC_MODE_REQUIRED");
  const prepared = await repository.prepare(context, task.commandId);
  const before = evidencePackMaterialV3.parse(prepared.material);
  if (before.tenantId !== context.tenantId) throw new Error("NOT_FOUND");
  if (before.lifecycle.state === "pre_lock") {
    await mustSurface(before.jobId);
    await repository.completeMustSurface(context, task.commandId, prepared.visibleRevision);
  }
  // Read again after the producer transaction. SQL finish also compares under locks.
  const after = await repository.prepare(context, task.commandId);
  await repository.finish(context, task.commandId, after.material);
}
