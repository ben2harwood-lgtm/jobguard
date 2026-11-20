import { PracticeAccess } from "../practice-access.js";
import { DEMO_TENANT_ID, JobRepository, JobRepositoryError, PracticeAccessError, RequestBindingRefusedError } from "@jobguard/db";
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
      const principalJob = await new PracticeAccess(this.pool,principal.sessionId).job(parsed.data);
      if (principalJob.context.tenantId !== DEMO_TENANT_ID) throw new JobRepositoryError("NOT_FOUND");
      const job = await new JobRepository(this.pool).readWorkspace(principalJob.context, ["job:view"], parsed.data);
      return jobWorkspaceResponseV1.parse({ version: 1, environment: "synthetic_demo", job: { id: job.id, tenantId: DEMO_TENANT_ID, title: job.title, status: job.status, revision: job.revision, updatedAt: job.updatedAt.toISOString(), scopeIdentityIds: job.scopeIdentityIds } });
    } catch (error) {
      if(error instanceof PracticeAccessError && (error.code==="UNAUTHENTICATED"||error.code==="NOT_FOUND"))throw new WorkspaceServiceError(error.code);
      if (error instanceof JobRepositoryError && error.code === "NOT_FOUND") throw new WorkspaceServiceError("NOT_FOUND");
      if (error instanceof RequestBindingRefusedError) throw new WorkspaceServiceError("TENANT_FORBIDDEN");
      throw new WorkspaceServiceError("DATABASE_UNAVAILABLE", { cause: error });
    }
  }
}
