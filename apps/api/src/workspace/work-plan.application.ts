import { PracticeAccessError, WorkPlanError, WorkPlanRepository, workPlanEditV1, workPlanExtraDirectionV1, workPlanQueryV1,
  type WorkPlan, type WorkPlanEdit, type WorkPlanExtraDirection } from "@jobguard/db";
import type { Pool } from "pg";
import type { z } from "zod";
import { PracticeAccess } from "../practice-access.js";

export { workPlanEditV1, workPlanExtraDirectionV1, workPlanQueryV1, type WorkPlanEdit, type WorkPlanExtraDirection };
export type WorkPlanQuery = z.infer<typeof workPlanQueryV1>;

export class WorkPlanApplication {
  private readonly access: PracticeAccess;
  private readonly plans: WorkPlanRepository;

  constructor(pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.plans = new WorkPlanRepository(pool);
  }

  async read(jobId: string, query: WorkPlanQuery): Promise<WorkPlan> {
    const { context } = await this.authorize(jobId);
    if (!workPlanQueryV1.safeParse(query).success) throw new WorkPlanError("WORK_PLAN_INVALID_QUERY");
    return this.plans.open(context, jobId);
  }

  async exportInternal(jobId: string, query: WorkPlanQuery) {
    return JSON.stringify({ version: "work-plan-export.v1", environment: "synthetic_demo",
      notice: "Practice sandbox — synthetic data; nothing is sent or charged", plan: await this.read(jobId, query) });
  }

  async edit(jobId: string, input: WorkPlanEdit) {
    const { context } = await this.authorize(jobId);
    const parsed = workPlanEditV1.safeParse(input);
    if (!parsed.success) throw new WorkPlanError("WORK_PLAN_INVALID_EDIT");
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.plans.edit(context, jobId, this.sessionId, parsed.data);
  }

  // C3B-2: say whether an approved no-charge extra adds or removes work.
  async recordExtraDirection(jobId: string, input: WorkPlanExtraDirection) {
    const { context } = await this.authorize(jobId);
    const parsed = workPlanExtraDirectionV1.safeParse(input);
    if (!parsed.success) throw new WorkPlanError("WORK_PLAN_INVALID_EDIT");
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.plans.recordExtraDirection(context, jobId, this.sessionId, parsed.data);
  }

  private authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    return this.access.job(jobId);
  }
}
