import { DEMO_TENANT_ID, readSyntheticDemoJob, SyntheticDemoReadError } from "@jobguard/db";
import { Pool } from "pg";
import { jobWorkspaceResponseV1, workspaceJobIdV1, type JobWorkspaceResponse } from "./contracts.js";

export type WorkspacePrincipal = Readonly<{ sessionId: string; requestedTenantId?: string }>;
export class WorkspaceServiceError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "TENANT_FORBIDDEN" | "NOT_FOUND" | "DATABASE_UNAVAILABLE", options?: ErrorOptions) { super(code, options); }
}

export class WorkspaceService {
  constructor(private readonly pool: Pool) {}
  async getJob(principal: WorkspacePrincipal | null, rawJobId: unknown): Promise<JobWorkspaceResponse> {
    if (!principal) throw new WorkspaceServiceError("UNAUTHENTICATED");
    const parsed = workspaceJobIdV1.safeParse(rawJobId);
    if (!parsed.success) throw new WorkspaceServiceError("NOT_FOUND");
    if (principal.requestedTenantId && principal.requestedTenantId !== DEMO_TENANT_ID) throw new WorkspaceServiceError("TENANT_FORBIDDEN");
    try {
      const { job } = await readSyntheticDemoJob(this.pool, parsed.data);
      return jobWorkspaceResponseV1.parse({ version: 1, environment: "synthetic_demo", job: { id: job.id, tenantId: DEMO_TENANT_ID, title: job.title, status: job.status, revision: job.revision, updatedAt: job.updatedAt.toISOString(), scopeIdentityIds: job.scopeIdentityIds } });
    } catch (error) {
      if (error instanceof SyntheticDemoReadError && error.code === "JOB_NOT_FOUND") throw new WorkspaceServiceError("NOT_FOUND");
      if (error instanceof SyntheticDemoReadError && error.code === "MEMBERSHIP_FORBIDDEN") throw new WorkspaceServiceError("TENANT_FORBIDDEN");
      throw new WorkspaceServiceError("DATABASE_UNAVAILABLE", { cause: error });
    }
  }
}
