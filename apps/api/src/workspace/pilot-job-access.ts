import { requirePilotG1 } from "@jobguard/config";
import { withTenant, type VerifiedTenantContext } from "@jobguard/db";
import type { Pool } from "pg";
import { AuthError } from "../auth/auth-provider.js";
import { WorkspaceService, WorkspaceServiceError } from "./workspace.service.js";

/** Every repository transaction rebinds the persisted session through withTenant. */
export function pilotJobAccess(pool: Pool, context: VerifiedTenantContext) {
  const jobs = new WorkspaceService(pool);
  return async (jobId?: string, owner = false) => {
    requirePilotG1(process.env);
    const actor = await withTenant(pool, context, async db => (await db.$client.query<{ id: string; role: string }>(
      "SELECT id, role FROM app.membership WHERE tenant_id=$1 AND id=app.current_actor()",
      [context.tenantId],
    )).rows[0]);
    if (!actor || (owner && actor.role !== "owner")) throw new AuthError("TENANT_FORBIDDEN");
    if (jobId !== undefined) {
      const result = await jobs.listPilotJobs(context, jobId);
      if (result.jobs.length !== 1) throw new WorkspaceServiceError("NOT_FOUND");
    }
    return { getContext: () => context, membershipId: actor.id };
  };
}

export type PilotJobAccess = ReturnType<typeof pilotJobAccess>;
