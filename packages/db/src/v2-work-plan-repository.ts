import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { splashbackDecoratingTemplate } from "./v2-splashback-decorating-template.js";
import { applyWorkPlanEdits, compareWorkPlanTasks, customWorkPlanTaskKey, workPlanEditV1,
  type WorkPlanEdit, type WorkPlanEditRow, type WorkPlanScopeRow } from "./v2-work-plan-edits.js";

export { customWorkPlanTaskKey, workPlanEditV1, workPlanQueryV1, type WorkPlanEdit } from "./v2-work-plan-edits.js";

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
type PlanRow = { template_key: string; previous_plan_revision_id: string | null };
type CurrentDraft = { current_revision_id: string | null; status: string; accepted_quote_version_id: string | null };
type EditReceipt = { commandId: string; quoteRevisionId: string; version: number; actorMembershipId: string; recordedAt: Date };

export class WorkPlanError extends Error {
  constructor(readonly code: "QUOTE_REVISION_NOT_FOUND" | "WORK_PLAN_TEMPLATE_UNAVAILABLE" |
    "WORK_PLAN_DRAFT_REQUIRED" | "WORK_PLAN_VERSION_CONFLICT" | "WORK_PLAN_COMMAND_CONFLICT" |
    "WORK_PLAN_INVALID_EDIT" | "WORK_PLAN_INVALID_QUERY" | "WORK_PLAN_EDITOR_REQUIRED") {
    super(code);
  }
}

export class WorkPlanRepository {
  constructor(private readonly pool: Pool, private readonly template: WorkPlanTemplate = splashbackDecoratingTemplate) {}

  async generate(context: VerifiedTenantContext, source: PlanSource) {
    const { jobId, quoteRevisionId } = planSource.parse(source);
    return withTenant(this.pool, context, ({ $client }) => this.generatePlan($client, [context.tenantId, jobId, quoteRevisionId]));
  }

  async read(context: VerifiedTenantContext, source: PlanSource) {
    const { jobId, quoteRevisionId } = planSource.parse(source);
    return withTenant(this.pool, context, ({ $client }) => this.readPlan($client, [context.tenantId, jobId, quoteRevisionId]));
  }

  async openDraft(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async ({ $client }) => {
      const draft = await this.lockDraft($client, context.tenantId, jobId);
      this.requireDraft(draft);
      return this.generatePlan($client, [context.tenantId, jobId, draft.current_revision_id]);
    });
  }

  // Called inside quote save, under the same draft lock and before the audit append.
  async refreshDraft(client: PoolClient, key: PlanKey, previousRevisionId: string) {
    const prior = await this.planRow(client, [key[0], key[1], previousRevisionId]);
    if (!prior || prior.template_key !== this.template.key) return;
    const draft = await this.lockDraft(client, key[0], key[1]);
    if (draft && this.isDraft(draft)) await this.insertPlan(client, key, previousRevisionId);
  }

  async edit(context: VerifiedTenantContext, jobId: string, sessionId: string, input: WorkPlanEdit) {
    const command = workPlanEditV1.parse(input);
    const key: PlanKey = [context.tenantId, jobId, command.quoteRevisionId];
    return withTenant(this.pool, context, async database => {
      const { $client: client } = database;
      const digest = createHash("sha256").update(sessionId).digest("hex");
      const { rows: [editor] } = await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [digest]);
      if (!editor?.id) throw new WorkPlanError("WORK_PLAN_EDITOR_REQUIRED");

      const draft = await this.lockDraft(client, key[0], jobId);
      const receipt = await this.replay(client, key, editor.id, command);
      if (receipt) return receipt;
      this.requireDraft(draft);
      if (draft.current_revision_id !== command.quoteRevisionId) throw new WorkPlanError("WORK_PLAN_VERSION_CONFLICT");

      const plan = await this.generatePlan(client, key);
      if (plan.version !== command.expectedVersion) throw new WorkPlanError("WORK_PLAN_VERSION_CONFLICT");
      const existing = plan.tasks.some(task => task.scopeItemId === command.scopeItemId && task.key === command.taskKey);
      const { position, trade, durationMinutes } = command.changes;
      const newCustom = command.taskKey === customWorkPlanTaskKey && position !== undefined &&
        trade !== undefined && durationMinutes !== undefined &&
        plan.unplanned.some(item => item.scopeItemId === command.scopeItemId);
      if ((!existing && !newCustom) || (position !== undefined && position > plan.tasks.length + Number(!existing))) {
        throw new WorkPlanError("WORK_PLAN_INVALID_EDIT");
      }
      const { rows: [saved] } = await client.query<EditReceipt>(`
        INSERT INTO app.v2_work_plan_edit
          (tenant_id, job_id, quote_revision_id, command_id, scope_item_id, template_task_key, expected_version, changes, actor_membership_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING command_id AS "commandId", quote_revision_id AS "quoteRevisionId",
          expected_version + 1 AS version, actor_membership_id AS "actorMembershipId", recorded_at AS "recordedAt"
      `, [...key, command.commandId, command.scopeItemId, command.taskKey, command.expectedVersion,
        JSON.stringify(command.changes), editor.id]);
      // A replay returned above, so each recorded edit appends exactly one event in this transaction.
      await this.audit(database, editor.id, jobId, command, saved!.version);
      return saved;
    });
  }

  private audit(database: TenantTransaction, actor: string, jobId: string, command: WorkPlanEdit, planVersion: number) {
    const changed = Object.entries(command.changes).filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
      eventType: "v2_work_plan.edited", subjectType: "job", subjectRef: jobId,
      payload: {
        references: { commandId: command.commandId, quoteRevisionId: command.quoteRevisionId,
          scopeItemId: command.scopeItemId, taskKey: command.taskKey,
          expectedVersion: String(command.expectedVersion), planVersion: String(planVersion),
          changedFields: changed.map(([field]) => field).join("/") },
        hashes: { changes: createHash("sha256").update(JSON.stringify(Object.fromEntries(changed))).digest("hex") },
        classifications: { action: "operational" },
      } }]);
  }

  private async replay(client: PoolClient, key: PlanKey, actor: string, command: WorkPlanEdit) {
    const { rows: [receipt] } = await client.query<EditReceipt & { matches: boolean }>(`
      SELECT command_id AS "commandId", quote_revision_id AS "quoteRevisionId",
        expected_version + 1 AS version, actor_membership_id AS "actorMembershipId", recorded_at AS "recordedAt",
        (quote_revision_id, scope_item_id, template_task_key, expected_version, changes, actor_membership_id)
          = ($3, $5, $6, $7, $8, $9) AS matches
      FROM app.v2_work_plan_edit WHERE (tenant_id, job_id, command_id) = ($1, $2, $4)
    `, [...key, command.commandId, command.scopeItemId, command.taskKey, command.expectedVersion,
      JSON.stringify(command.changes), actor]);
    if (!receipt) return null;
    const { matches, ...saved } = receipt;
    if (!matches) throw new WorkPlanError("WORK_PLAN_COMMAND_CONFLICT");
    return saved;
  }

  private async lockDraft(client: PoolClient, tenantId: string, jobId: string) {
    const { rows: [head] } = await client.query<CurrentDraft>(`
      SELECT d.current_revision_id, j.status, j.accepted_quote_version_id FROM app.quote_draft d
      JOIN app.job j ON (j.tenant_id, j.id) = (d.tenant_id, d.job_id)
      WHERE (d.tenant_id, d.job_id) = ($1, $2) FOR UPDATE OF d
    `, [tenantId, jobId]);
    return head;
  }

  private isDraft(draft: CurrentDraft) {
    return (draft.status === "draft" || draft.status === "quoting") && !draft.accepted_quote_version_id;
  }

  private requireDraft(draft: CurrentDraft | undefined): asserts draft is CurrentDraft & { current_revision_id: string } {
    if (!draft?.current_revision_id) throw new WorkPlanError("QUOTE_REVISION_NOT_FOUND");
    if (!this.isDraft(draft)) throw new WorkPlanError("WORK_PLAN_DRAFT_REQUIRED");
  }

  private async generatePlan(client: PoolClient, key: PlanKey) {
    await this.insertPlan(client, key, null);
    const plan = await this.readPlan(client, key);
    if (!plan) throw new WorkPlanError("QUOTE_REVISION_NOT_FOUND");
    return plan;
  }

  private async insertPlan(client: PoolClient, key: PlanKey, previousPlanRevisionId: string | null) {
    // Only the transaction that creates the plan populates its task rows.
    const created = await client.query(`
      INSERT INTO app.v2_work_plan (tenant_id, job_id, quote_revision_id, template_key, previous_plan_revision_id)
      SELECT tenant_id, job_id, id, $4, $5 FROM app.quote_revision
      WHERE (tenant_id, job_id, id) = ($1, $2, $3)
      ON CONFLICT (tenant_id, job_id, quote_revision_id) DO NOTHING
    `, [...key, this.template.key, previousPlanRevisionId]);
    if (created.rowCount) await this.insertTasks(client, key);
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

  private async planRow(client: PoolClient, key: PlanKey) {
    const { rows: [plan] } = await client.query<PlanRow>(`
      SELECT template_key, previous_plan_revision_id FROM app.v2_work_plan
      WHERE (tenant_id, job_id, quote_revision_id) = ($1, $2, $3)
    `, key);
    return plan;
  }

  private async loadTasks(client: PoolClient, key: PlanKey) {
    const { rows: scope } = await client.query<WorkPlanScopeRow>(`
      SELECT l.scope_item_id, jsonb_build_object('description', l.description, 'category', l.category,
        'quantity', l.quantity_decimal, 'unit', l.unit) AS source, t.template_task_key
      FROM app.quote_line l LEFT JOIN app.v2_work_plan_task t
        USING (tenant_id, job_id, quote_revision_id, scope_item_id)
      WHERE (l.tenant_id, l.job_id, l.quote_revision_id) = ($1, $2, $3) AND l.included
      ORDER BY l.ordinal, t.position
    `, key);
    const tasks = scope.flatMap((row, index) => {
      if (row.template_task_key === null) return [];
      const task = this.template.tasks.find(entry => entry.key === row.template_task_key);
      if (!task) throw new WorkPlanError("WORK_PLAN_TEMPLATE_UNAVAILABLE");
      const { category: _category, ...details } = task;
      return [{ ...details, position: index + 1, scopeItemId: row.scope_item_id,
        dependsOn: task.dependsOn.map(templateTaskKey => ({ scopeItemId: row.scope_item_id, templateTaskKey })) }];
    });
    return { scope, tasks };
  }

  private async readPlan(client: PoolClient, key: PlanKey) {
    const plan = await this.planRow(client, key);
    if (!plan) return null;
    if (plan.template_key !== this.template.key) throw new WorkPlanError("WORK_PLAN_TEMPLATE_UNAVAILABLE");
    const { rows: edits } = await client.query<WorkPlanEditRow>(`
      WITH RECURSIVE history AS (
        SELECT quote_revision_id, previous_plan_revision_id, 0 AS distance FROM app.v2_work_plan
        WHERE (tenant_id, job_id, quote_revision_id) = ($1, $2, $3)
        UNION ALL
        SELECT p.quote_revision_id, p.previous_plan_revision_id, h.distance + 1
        FROM history h JOIN app.v2_work_plan p ON (p.tenant_id, p.job_id, p.quote_revision_id)
          = ($1, $2, h.previous_plan_revision_id)
      )
      SELECT e.scope_item_id, e.template_task_key, e.quote_revision_id, e.changes, jsonb_build_object('description', l.description, 'category', l.category,
        'quantity', l.quantity_decimal, 'unit', l.unit) AS source
      FROM history h JOIN app.v2_work_plan_edit e ON (e.tenant_id, e.job_id, e.quote_revision_id) = ($1, $2, h.quote_revision_id)
      JOIN app.quote_line l ON (l.tenant_id, l.job_id, l.quote_revision_id, l.scope_item_id)
        = (e.tenant_id, e.job_id, e.quote_revision_id, e.scope_item_id)
      ORDER BY h.distance DESC, e.expected_version
    `, key);
    const inherited = edits.filter(edit => edit.quote_revision_id !== key[2]);
    const base = await this.loadTasks(client, key);
    const current = applyWorkPlanEdits(base.scope, base.tasks, edits);
    let previous = null;
    if (plan.previous_plan_revision_id) {
      const prior = await this.loadTasks(client, [key[0], key[1], plan.previous_plan_revision_id]);
      previous = applyWorkPlanEdits(prior.scope, prior.tasks, inherited);
    }
    // Compare the refresh before applying edits made on this revision.
    const refreshed = previous && inherited.length !== edits.length
      ? applyWorkPlanEdits(base.scope, base.tasks, inherited) : current;
    return { jobId: key[1], quoteRevisionId: key[2], templateKey: plan.template_key,
      version: edits.length - inherited.length, tasks: current.tasks, unplanned: current.unplanned,
      scopeItems: [...current.sources].map(([scopeItemId, details]) => ({ scopeItemId, ...details })),
      changes: compareWorkPlanTasks(previous, refreshed) };
  }
}

export type WorkPlan = Awaited<ReturnType<WorkPlanRepository["openDraft"]>>;
