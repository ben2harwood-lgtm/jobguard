import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { splashbackDecoratingTemplate } from "./v2-splashback-decorating-template.js";

interface TemplateTask {
  key: string;
  category: string;
  title: string;
  trade: string;
  durationMinutes: number;
  dependsOn: readonly string[];
  materialNeeds: readonly string[];
  proofPoints: readonly string[];
  customerChoices: readonly string[];
}

export interface WorkPlanTemplate {
  key: string;
  // For a scope item, prerequisites name earlier tasks in the same category.
  tasks: readonly TemplateTask[];
}

const planSource = z.strictObject({
  version: z.literal("work-plan-source.v1"),
  jobId: z.uuid(),
  quoteRevisionId: z.uuid(),
});

type PlanSource = z.infer<typeof planSource>;
type PlanKey = [tenantId: string, jobId: string, quoteRevisionId: string];
type TaskRow = { scope_item_id: string; template_task_key: string; position: number };

export class WorkPlanError extends Error {
  constructor(readonly code: "QUOTE_REVISION_NOT_FOUND" | "WORK_PLAN_TEMPLATE_UNAVAILABLE") {
    super(code);
  }
}

export class WorkPlanRepository {
  constructor(private readonly pool: Pool, private readonly template: WorkPlanTemplate = splashbackDecoratingTemplate) {}

  async generate(context: VerifiedTenantContext, source: PlanSource) {
    const { jobId, quoteRevisionId } = planSource.parse(source);
    const key: PlanKey = [context.tenantId, jobId, quoteRevisionId];
    return withTenant(this.pool, context, async ({ $client }) => {
      // A concurrent insert waits for the winner's complete transaction.
      // Only the transaction that creates the plan populates its task rows.
      const created = await $client.query(`
        INSERT INTO app.v2_work_plan (tenant_id, job_id, quote_revision_id, template_key)
        SELECT tenant_id, job_id, id, $4 FROM app.quote_revision
        WHERE (tenant_id, job_id, id) = ($1, $2, $3)
        ON CONFLICT (tenant_id, job_id, quote_revision_id) DO NOTHING
      `, [...key, this.template.key]);
      if (created.rowCount) await this.insertTasks($client, key);
      const plan = await this.readPlan($client, key);
      if (!plan) throw new WorkPlanError("QUOTE_REVISION_NOT_FOUND");
      return plan;
    });
  }

  async read(context: VerifiedTenantContext, source: PlanSource) {
    const { jobId, quoteRevisionId } = planSource.parse(source);
    return withTenant(this.pool, context, ({ $client }) => this.readPlan($client, [context.tenantId, jobId, quoteRevisionId]));
  }

  private async insertTasks(client: PoolClient, key: PlanKey) {
    const { rows: scope } = await client.query<{ scope_item_id: string; category: string | null }>(`
      SELECT scope_item_id, category FROM app.quote_line
      WHERE (tenant_id, job_id, quote_revision_id) = ($1, $2, $3) AND included
      ORDER BY ordinal, scope_item_id
    `, key);
    const tasks = scope.flatMap(item => this.template.tasks
      .filter(task => task.category === item.category)
      .map(task => ({ scope_item_id: item.scope_item_id, template_task_key: task.key })));
    await client.query(`
      INSERT INTO app.v2_work_plan_task (tenant_id, job_id, quote_revision_id, scope_item_id, template_task_key, position)
      SELECT $1, $2, $3, task.scope_item_id, task.template_task_key, task.position
      FROM ROWS FROM (jsonb_to_recordset($4) AS (scope_item_id uuid, template_task_key text))
        WITH ORDINALITY AS task(scope_item_id, template_task_key, position)
    `, [...key, JSON.stringify(tasks)]);
  }

  private async readPlan(client: PoolClient, key: PlanKey) {
    const { rows: [plan] } = await client.query<{ template_key: string }>(`
      SELECT template_key FROM app.v2_work_plan
      WHERE (tenant_id, job_id, quote_revision_id) = ($1, $2, $3)
    `, key);
    if (!plan) return null;
    if (plan.template_key !== this.template.key) throw new WorkPlanError("WORK_PLAN_TEMPLATE_UNAVAILABLE");

    const { rows } = await client.query<TaskRow>(`
      SELECT scope_item_id, template_task_key, position FROM app.v2_work_plan_task
      WHERE (tenant_id, job_id, quote_revision_id) = ($1, $2, $3) ORDER BY position
    `, key);
    const tasks = rows.map(row => {
      const task = this.template.tasks.find(entry => entry.key === row.template_task_key);
      if (!task) throw new WorkPlanError("WORK_PLAN_TEMPLATE_UNAVAILABLE");
      const { category: _category, ...details } = task;
      return {
        ...details, position: row.position, scopeItemId: row.scope_item_id,
        dependsOn: task.dependsOn.map(templateTaskKey => ({ scopeItemId: row.scope_item_id, templateTaskKey })),
      };
    });
    return { jobId: key[1], quoteRevisionId: key[2], templateKey: plan.template_key, tasks };
  }
}
