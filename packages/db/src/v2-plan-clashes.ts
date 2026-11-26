import type { Pool } from "pg";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import type { WorkPlanTask } from "./v2-work-plan-edits.js";
import { WorkPlanError, WorkPlanRepository } from "./v2-work-plan-repository.js";

/** V2-E5A: the other job is named only by its own firm's title and the clashing date. */
export type PlanClash = { jobTitle: string; scheduledDate: string };
export type TaskClashes = { scopeItemId: string; taskKey: string; scheduledDate: string; clashes: PlanClash[] };
export type PlanClashes = { version: "v2-plan-clashes.v1"; jobId: string; tasks: TaskClashes[] };

type Booked = Pick<WorkPlanTask, "key" | "scopeItemId" | "scheduledDate" | "assigneeRef">;
export type OtherPlan = { jobId: string; jobTitle: string; tasks: readonly Booked[] };

const slot = (task: Booked) => task.assigneeRef && task.scheduledDate ? `${task.assigneeRef}/${task.scheduledDate}` : null;

/**
 * Pure matcher. A clash is the same crew record (assigneeRef) on the same date on another job.
 * The free-text `assignee` is never read, so two people with one name never clash and one
 * person typed two ways is never guessed at.
 */
export function matchPlanClashes(own: readonly Booked[], others: readonly OtherPlan[]): TaskClashes[] {
  const booked = new Map<string, Map<string, PlanClash>>();
  for (const other of others) {
    for (const task of other.tasks) {
      const key = slot(task);
      if (!key) continue;
      const jobs = booked.get(key) ?? new Map<string, PlanClash>();
      // One entry per other job, however many of its tasks share the slot.
      jobs.set(other.jobId, { jobTitle: other.jobTitle, scheduledDate: task.scheduledDate! });
      booked.set(key, jobs);
    }
  }
  return own.flatMap(task => {
    const jobs = booked.get(slot(task) ?? "");
    if (!jobs) return [];
    const clashes = [...jobs].sort(([a, x], [b, y]) => x.jobTitle.localeCompare(y.jobTitle) || (a < b ? -1 : 1))
      .map(([, clash]) => clash);
    return [{ scopeItemId: task.scopeItemId, taskKey: task.key, scheduledDate: task.scheduledDate!, clashes }];
  });
}

export class PlanClashRepository {
  private readonly plans: WorkPlanRepository;

  constructor(private readonly pool: Pool) {
    this.plans = new WorkPlanRepository(pool);
  }

  /**
   * Read-only. Never generates a plan, writes nothing and appends no audit event.
   * Other jobs are limited to the signed-in firm twice: by row security (v2_practice_firm)
   * and by the explicit firm key below, which also leaves out jobs with no practice firm.
   */
  async sameFirmClashes(context: VerifiedTenantContext, jobId: string): Promise<PlanClashes> {
    return withTenant(this.pool, context, async ({ $client: client }) => {
      const empty: PlanClashes = { version: "v2-plan-clashes.v1", jobId, tasks: [] };
      const own = await this.plans.readCurrent(client, context.tenantId, jobId);
      if (!own || !own.tasks.some(slot)) return empty;
      // Only a job with an assigneeRef edit can hold a crew booking, so the rest are not read.
      const { rows: candidates } = await client.query<{ id: string; title: string }>(`
        SELECT j.id, j.title FROM app.job j
        WHERE j.tenant_id = $1 AND j.id <> $2 AND j.practice_session_digest IS NOT NULL
          AND 'practice:' || j.practice_session_digest = app.current_firm_profile_key()
          AND EXISTS (SELECT FROM app.v2_work_plan_edit e
            WHERE (e.tenant_id, e.job_id) = (j.tenant_id, j.id) AND e.changes ? 'assigneeRef')
        ORDER BY j.id
      `, [context.tenantId, jobId]);
      const others: OtherPlan[] = [];
      for (const job of candidates) {
        // A plan made from another template is not this screen's plan, so it is left out, not an error.
        const plan = await this.plans.readCurrent(client, context.tenantId, job.id).catch((error: unknown) => {
          if (error instanceof WorkPlanError && error.code === "WORK_PLAN_TEMPLATE_UNAVAILABLE") return null;
          throw error;
        });
        if (plan) others.push({ jobId: job.id, jobTitle: job.title, tasks: plan.tasks });
      }
      return { ...empty, tasks: matchPlanClashes(own.tasks, others) };
    });
  }
}
