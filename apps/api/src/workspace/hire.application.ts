import { HireRepository, HireError, PracticeAccessError, hireCommandV1 } from "@jobguard/db";
import type { Pool } from "pg";
import { WorkPlanApplication } from "./work-plan.application.js";
import { PracticeAccess } from "../practice-access.js";
export type { HireItem, HireTask } from "@jobguard/db";

/** Builder-only V2 operational records. No send, ledger, detector or fee dependency. */
export class HireApplication {
  private readonly access: PracticeAccess;
  private readonly hires: HireRepository;
  constructor(private readonly pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.hires = new HireRepository(pool);
  }
  private async authorize(jobId: string) {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
    if (!this.sessionId) throw new PracticeAccessError("UNAUTHENTICATED");
    return this.access.job(jobId);
  }
  private plan(jobId: string) {
    return new WorkPlanApplication(this.pool, this.sessionId).read(jobId, { version: "work-plan-query.v1" });
  }
  async list(jobId: string) {
    const { context } = await this.authorize(jobId);
    const plan = await this.plan(jobId);
    return { environment: "synthetic_demo", tasks: plan.tasks.map(task => ({ quoteRevisionId: plan.quoteRevisionId,
      scopeItemId: task.scopeItemId, templateTaskKey: task.key, title: task.title })), items: await this.hires.list(context, jobId, this.sessionId!, new Date(), plan) };
  }
  async command(jobId: string, raw: unknown) {
    const { context } = await this.authorize(jobId);
    const parsed = hireCommandV1.safeParse(raw);
    if (!parsed.success) throw new HireError("HIRE_INVALID");
    // A link is checked against the same plan the panel offers, approved extras included.
    const offered = parsed.data.action === "link" ? await this.plan(jobId) : undefined;
    return this.hires.command(context, jobId, this.sessionId!, parsed.data, offered);
  }
}
