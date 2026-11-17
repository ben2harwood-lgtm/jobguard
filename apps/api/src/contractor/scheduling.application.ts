import type { Pool } from "pg";
import { JobSchedulingRepository, WorkOrderRepository, workOrderFailure } from "@jobguard/db";
import { WorkOrderError } from "@jobguard/core";
import { workOrderPrincipalV1 } from "./work-order.contracts.js";

/** Read projections of the scheduling facts (Q3): who is assigned to a job and its recorded site visits. There is no write method. */
export class SchedulingApplication {
  private readonly scheduling: JobSchedulingRepository;
  private readonly orders: WorkOrderRepository;
  constructor(pool: Pool) { this.scheduling = new JobSchedulingRepository(pool); this.orders = new WorkOrderRepository(pool); }
  private async member(raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new WorkOrderError("MODE_FORBIDDEN");
    const parsed = workOrderPrincipalV1.safeParse(raw);
    if (!parsed.success) throw new WorkOrderError("UNAUTHENTICATED");
    try { return await this.orders.resolveSession(parsed.data.sessionId); } catch (error) { throw workOrderFailure(error); }
  }
  async assignments(principal: unknown, jobId: string) { return this.scheduling.assignments(await this.member(principal), jobId); }
  async siteVisits(principal: unknown, jobId: string) { return this.scheduling.siteVisits(await this.member(principal), jobId); }
}
export const createSchedulingApplication = (dependencies: { pool: Pool }) => new SchedulingApplication(dependencies.pool);
