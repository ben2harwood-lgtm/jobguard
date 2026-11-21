import { requirePilotG1 } from "@jobguard/config";
import { PracticeAccess } from "../practice-access.js";
import { DEMO_TENANT_ID, JobRepository, JobRepositoryError, PracticeAccessError, RequestBindingRefusedError, withTenant, type VerifiedTenantContext } from "@jobguard/db";
import { Pool } from "pg";
import { jobWorkspaceResponseV1, workspaceJobIdV1, type JobWorkspaceResponse } from "./contracts.js";

export type WorkspacePrincipal = Readonly<{ sessionId: string; requestedTenantId?: string }>;
export class WorkspaceServiceError extends Error {
  constructor(readonly code: "UNAUTHENTICATED" | "TENANT_FORBIDDEN" | "NOT_FOUND" | "DATABASE_UNAVAILABLE", options?: ErrorOptions) { super(code, options); }
}

export class WorkspaceService {
  constructor(private readonly pool: Pool) {}
  async listPilotJobs(context: VerifiedTenantContext, rawJobId?: string) {
    requirePilotG1(process.env);
    const jobId = rawJobId === undefined ? undefined : workspaceJobIdV1.safeParse(rawJobId);
    if (jobId && !jobId.success) throw new WorkspaceServiceError("NOT_FOUND");
    const jobs = await withTenant(this.pool, context, async db => {
      const role = (await db.$client.query<{ safe: boolean }>(`
        SELECT current_user = 'jobguard_runtime' AND session_user = current_user
          AND NOT (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication)
          AND NOT pg_has_role(oid, (SELECT relowner FROM pg_class WHERE oid = 'app.job'::regclass), 'MEMBER')
          AND row_security_active('app.job'::regclass)
          AND app.current_actor() IS NOT NULL AND app.current_tenant() = $1 AS safe
        FROM pg_roles WHERE rolname = current_user`, [context.tenantId])).rows[0];
      if (role?.safe !== true) throw new WorkspaceServiceError("DATABASE_UNAVAILABLE");
      requirePilotG1(process.env);
      return (await db.$client.query<{ id: string; title: string; status: string }>(`
        SELECT j.id, j.title, j.status
        FROM app.job j
        JOIN app.job_commercial_track c ON (c.tenant_id,c.job_id) = (j.tenant_id,j.id)
        WHERE j.tenant_id = $1 AND c.job_track = 'small_builder' AND c.environment = 'pilot_no_charge'
          AND j.practice_session_digest IS NULL AND ($2::uuid IS NULL OR j.id = $2)
          AND NOT EXISTS (
            SELECT 1 FROM app.command_receipt r WHERE r.tenant_id = j.tenant_id
              AND r.command_type = 'job.discard_draft' AND r.status = 'succeeded'
              AND r.semantic_key = 'job:' || j.id::text || ':discard'
          )
        ORDER BY j.created_at,j.id`, [context.tenantId, jobId?.data ?? null])).rows;
    });
    if (jobId && jobs.length === 0) throw new WorkspaceServiceError("NOT_FOUND");
    return { tenantId: context.tenantId, jobs };
  }

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
