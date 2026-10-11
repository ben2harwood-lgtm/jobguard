import type { Pool } from "pg";
import { z } from "zod";
import { WorkOrderError, jobAssignmentsV1, jobSiteVisitsV1 } from "@jobguard/core";
import { assertContractorGate, workOrderFailure } from "./work-order-repository.js";
import { verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership, type TenantTransaction } from "./tenant-context.js";

/**
 * Read projection of the scheduling facts ENT-2 owns (Q3, coordinator ruling 8 Oct): who is assigned to a job and its recorded site visits.
 * There is deliberately no write method: assignments come from the work-order import and visits from ENT-3. A job outside the caller's scope
 * (team, branch, region or assignment) is the same not-found as a job that does not exist.
 */
export class JobSchedulingRepository {
  constructor(private readonly pool: Pool) {}
  private async scoped(db: TenantTransaction, principal: AuthenticatedMembership, jobId: string) {
    await assertContractorGate(db, principal, "member");
    const allowed = (await db.$client.query<{ allowed: boolean }>("SELECT app.contractor_job_allowed($1,'job.read',$2) allowed", [principal.membershipId, jobId])).rows[0]!.allowed;
    if (!allowed) throw new WorkOrderError("NOT_FOUND");
  }
  async assignments(principal: AuthenticatedMembership, jobId: string) {
    if (!z.string().uuid().safeParse(jobId).success) throw new WorkOrderError("NOT_FOUND");
    try {
      return await withTenant(this.pool, verifiedTenantContextFromMembership(principal), async db => {
        await this.scoped(db, principal, jobId);
        const c = db.$client;
        const team = (await c.query<{ work_order_id: string; team_id: string; name: string }>(
          `SELECT a.work_order_id,a.team_id,t.name FROM app.work_order w JOIN app.work_order_current k ON(k.tenant_id,k.work_order_id)=(w.tenant_id,w.id)
           JOIN app.job_assignment a ON(a.tenant_id,a.revision_id)=(k.tenant_id,k.revision_id) AND a.membership_id IS NULL JOIN app.team t ON(t.tenant_id,t.id)=(a.tenant_id,a.team_id) WHERE w.tenant_id=$1 AND w.job_id=$2`, [principal.tenantId, jobId])).rows[0];
        const order = team?.work_order_id ?? (await c.query<{ id: string }>("SELECT id FROM app.work_order WHERE tenant_id=$1 AND job_id=$2", [principal.tenantId, jobId])).rows[0]?.id ?? null;
        const operatives = team ? (await c.query<{ membership_id: string }>(
          `SELECT a.membership_id FROM app.work_order w JOIN app.work_order_current k ON(k.tenant_id,k.work_order_id)=(w.tenant_id,w.id)
           JOIN app.job_assignment a ON(a.tenant_id,a.revision_id)=(k.tenant_id,k.revision_id) AND a.membership_id IS NOT NULL WHERE w.tenant_id=$1 AND w.job_id=$2 ORDER BY a.membership_id`, [principal.tenantId, jobId])).rows : [];
        return jobAssignmentsV1.parse({ version: "job-assignments.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, workOrderId: order, team: team ? { id: team.team_id, name: team.name } : null, operatives: operatives.map(o => ({ membershipId: o.membership_id })) });
      });
    } catch (error) { throw workOrderFailure(error); }
  }
  async siteVisits(principal: AuthenticatedMembership, jobId: string) {
    if (!z.string().uuid().safeParse(jobId).success) throw new WorkOrderError("NOT_FOUND");
    try {
      return await withTenant(this.pool, verifiedTenantContextFromMembership(principal), async db => {
        await this.scoped(db, principal, jobId);
        const visits = (await db.$client.query<{ id: string; membership_id: string; started_at: Date; completed_at: Date | null }>(
          "SELECT id,membership_id,started_at,completed_at FROM app.site_visit WHERE tenant_id=$1 AND job_id=$2 ORDER BY started_at,id", [principal.tenantId, jobId])).rows;
        return jobSiteVisitsV1.parse({ version: "job-site-visits.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, visits: visits.map(v => ({ id: v.id, membershipId: v.membership_id, startedAt: v.started_at.toISOString(), completedAt: v.completed_at?.toISOString() ?? null })) });
      });
    } catch (error) { throw workOrderFailure(error); }
  }
}
