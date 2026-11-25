import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { WorkPlanRepository } from "./v2-work-plan-repository.js";
import { approximateHireCost, hireCommandV1, hireNeededAfter, londonHireDate, HireError,
  type HireCommand, type HireState, type HireTask, type HireItem } from "./v2-hire.js";

export type HireReceipt = { hireId: string; itemVersion: number; actorMembershipId: string; recordedAt: string };
type HireRow = HireReceipt & { state: HireState };
/** The job's current work plan, as the work-plan application opens it. */
export type CurrentPlan = { tasks: readonly { scopeItemId: string; key: string; scheduledDate?: string | null }[] };
const taskKey = (task: HireTask) => `${task.quoteRevisionId}/${task.scopeItemId}/${task.templateTaskKey}`;

export class HireRepository {
  constructor(private readonly pool: Pool) {}

  async list(context: VerifiedTenantContext, jobId: string, sessionId: string, now = new Date(), current?: CurrentPlan) {
    const rows = await withTenant(this.pool, context, async ({ $client }) => {
      await this.editor($client, sessionId);
      return (await $client.query<HireRow>(`SELECT DISTINCT ON (hire_id)
        hire_id AS "hireId", item_version AS "itemVersion", state,
        actor_membership_id AS "actorMembershipId", recorded_at::text AS "recordedAt"
        FROM app.v2_hire_revision WHERE (tenant_id, job_id) = ($1,$2)
        ORDER BY hire_id, item_version DESC`, [context.tenantId, jobId])).rows;
    });
    // Linked tasks resolve against the job's current plan by scope item and task key, so a
    // reschedule on a newer quote revision is what counts. A link whose task is not in the
    // current plan has no date and so never triggers a reminder.
    const currentDates = new Map((current?.tasks ?? []).map(task => [`${task.scopeItemId}/${task.key}`, task.scheduledDate ?? null]));
    const dates = new Map<string, string | null>();
    if (!current) {
      // Read existing plans only: this must never create a plan as a side effect.
      const plans = new WorkPlanRepository(this.pool);
      for (const revision of new Set(rows.flatMap(row => row.state.tasks.map(task => task.quoteRevisionId)))) {
        try {
          const plan = await plans.read(context, { version: "work-plan-source.v1", jobId, quoteRevisionId: revision });
          for (const task of plan?.tasks ?? []) dates.set(taskKey({ quoteRevisionId: revision,
            scopeItemId: task.scopeItemId, templateTaskKey: task.key }), task.scheduledDate ?? null);
        } catch (error) {
          // A superseded plan is never evidence that linked work no longer needs hire.
          if (!(error instanceof Error && "code" in error && error.code === "WORK_PLAN_VERSION_CONFLICT")) throw error;
        }
      }
    }
    const dateOf = (task: HireTask) => current
      ? currentDates.get(`${task.scopeItemId}/${task.templateTaskKey}`) ?? null
      : dates.get(taskKey(task)) ?? null;
    const today = londonHireDate(now);
    return rows.map(({ state, ...row }): HireItem => {
      const neededAfter = hireNeededAfter(state, state.tasks.map(dateOf), today);
      return { ...row, ...state, reminder: neededAfter !== null, neededAfter,
        approximateCost: approximateHireCost(state, today) };
    });
  }

  async command(context: VerifiedTenantContext, jobId: string, sessionId: string, input: HireCommand) {
    const parsed = hireCommandV1.safeParse(input);
    if (!parsed.success) throw new HireError("HIRE_INVALID");
    const command = parsed.data;
    return withTenant(this.pool, context, async database => {
      const client = database.$client;
      const actor = await this.editor(client, sessionId);
      // Same job lock as c3; serializes edits, adds and task linking before the audit head.
      const lock = await client.query(`SELECT 1 FROM app.quote_draft WHERE (tenant_id,job_id)=($1,$2) FOR UPDATE`,
        [context.tenantId, jobId]);
      if (!lock.rowCount) throw new HireError("HIRE_NOT_FOUND");
      const { rows: [replay] } = await client.query<HireReceipt & { matches: boolean }>(`
        SELECT hire_id AS "hireId", item_version AS "itemVersion", actor_membership_id AS "actorMembershipId",
          recorded_at::text AS "recordedAt", (request,actor_membership_id)=($4::jsonb,$5::uuid) AS matches
        FROM app.v2_hire_revision WHERE (tenant_id,job_id,command_id)=($1,$2,$3)`,
      [context.tenantId, jobId, command.commandId, JSON.stringify(command), actor]);
      if (replay) {
        const { matches, ...receipt } = replay;
        if (!matches) throw new HireError("HIRE_COMMAND_CONFLICT");
        return receipt;
      }
      const { rows: [prior] } = await client.query<{ state: HireState; item_version: number }>(`
        SELECT state,item_version FROM app.v2_hire_revision WHERE (tenant_id,job_id,hire_id)=($1,$2,$3)
        ORDER BY item_version DESC LIMIT 1`, [context.tenantId, jobId, command.hireId]);
      if ((prior?.item_version ?? 0) !== command.expectedVersion || (command.action === "add") === !!prior) {
        throw new HireError("HIRE_VERSION_CONFLICT");
      }
      if (prior?.state.status === "off_hire" || (command.action === "request_off_hire" && prior?.state.status !== "on_hire")) {
        throw new HireError("HIRE_INVALID");
      }
      const { rows: [clock] } = await client.query<{ today: string }>(
        "SELECT (clock_timestamp() AT TIME ZONE 'Europe/London')::date::text AS today");
      const state: HireState = command.action === "add"
        ? { ...command.details!, tasks: [], status: "on_hire", offHireDate: null }
        : { ...prior!.state, ...(command.details ?? {}) };
      if (command.action === "link") {
        await this.checkTasks(client, context.tenantId, jobId, command.tasks!);
        state.tasks = command.tasks!;
      }
      if (command.action === "request_off_hire") state.status = "off_hire_requested";
      if (command.action === "off_hire") { state.status = "off_hire"; state.offHireDate = clock!.today; }
      const { rows: [saved] } = await client.query<HireReceipt>(`
        INSERT INTO app.v2_hire_revision
          (tenant_id,job_id,hire_id,item_version,command_id,request,state,actor_membership_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING hire_id AS "hireId",item_version AS "itemVersion",actor_membership_id AS "actorMembershipId",
          recorded_at::text AS "recordedAt"`, [context.tenantId, jobId, command.hireId, command.expectedVersion + 1,
        command.commandId, JSON.stringify(command), JSON.stringify(state), actor]);
      // No business locks or writes follow the tenant audit append. Replay returned above.
      await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
        eventType: `v2.hire.${command.action}`, subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: command.commandId, hireId: command.hireId,
          itemVersion: String(saved!.itemVersion) }, classifications: { action: "operational" } } }]);
      return saved!;
    });
  }

  private async editor(client: PoolClient, sessionId: string) {
    const { rows: [editor] } = await client.query<{ id: string | null }>(
      "SELECT app.v2_work_plan_editor($1) AS id", [createHash("sha256").update(sessionId).digest("hex")]);
    if (!editor?.id) throw new HireError("HIRE_EDITOR_REQUIRED");
    return editor.id;
  }

  private async checkTasks(client: PoolClient, tenant: string, job: string, tasks: HireTask[]) {
    for (const task of tasks) {
      const found = await client.query(`SELECT 1 FROM app.v2_work_plan p
        JOIN app.quote_line l ON (l.tenant_id,l.job_id,l.quote_revision_id)=(p.tenant_id,p.job_id,p.quote_revision_id)
        WHERE (p.tenant_id,p.job_id,p.quote_revision_id,l.scope_item_id)=($1,$2,$3,$4) AND l.included
        AND (EXISTS (SELECT FROM app.v2_work_plan_task t
          WHERE (t.tenant_id,t.job_id,t.quote_revision_id,t.scope_item_id,t.template_task_key)=($1,$2,$3,$4,$5))
          OR ($5='custom-scope-item' AND EXISTS (SELECT FROM app.v2_work_plan_edit e
            WHERE (e.tenant_id,e.job_id,e.quote_revision_id,e.scope_item_id,e.template_task_key)=($1,$2,$3,$4,$5))))`,
      [tenant, job, task.quoteRevisionId, task.scopeItemId, task.templateTaskKey]);
      if (!found.rowCount) throw new HireError("HIRE_TASK_NOT_FOUND");
    }
  }
}
