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
type PlanHead = {
  quoteRevisionId: string | null;
  jobStatus: string;
  acceptedDocumentId: string | null;
  acceptedNetPence: string | null;
  activationId: string | null;
};
type ApprovedVariation = {
  scopeItemId: string;
  revisionId: string;
  approvalId: string;
  description: string;
  quantity: string;
  unit: string;
  signedDeltaPence: number;
};
type ApprovedScopeRow = Omit<ApprovedVariation, "signedDeltaPence"> & { signedDeltaPence: string;
  source: WorkPlanScopeRow["source"]; onQuote: boolean; createdAt: Date; variationId: string };
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
    return withTenant(this.pool, context, async database => {
      const head = await this.planHead(database.$client, context.tenantId, jobId, true);
      if (!head) throw new WorkPlanError("QUOTE_REVISION_NOT_FOUND");
      this.checkFrozenRevision(head, quoteRevisionId);
      return this.generatePlan(database, [context.tenantId, jobId, quoteRevisionId], head);
    });
  }

  async read(context: VerifiedTenantContext, source: PlanSource) {
    const { jobId, quoteRevisionId } = planSource.parse(source);
    return withTenant(this.pool, context, async ({ $client }) => {
      const head = await this.planHead($client, context.tenantId, jobId);
      if (!head) return null;
      this.checkFrozenRevision(head, quoteRevisionId);
      return this.readPlan($client, [context.tenantId, jobId, quoteRevisionId], head);
    });
  }

  async open(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async database => {
      const head = await this.planHead(database.$client, context.tenantId, jobId, true);
      this.requireCurrentRevision(head);
      return this.generatePlan(database, [context.tenantId, jobId, head.quoteRevisionId], head);
    });
  }

  // Called inside quote save, under the same draft lock and before the audit append.
  async refreshDraft(client: PoolClient, key: PlanKey, previousRevisionId: string) {
    const prior = await this.planRow(client, [key[0], key[1], previousRevisionId]);
    if (!prior || prior.template_key !== this.template.key) return;
    const head = await this.planHead(client, key[0], key[1]);
    if (head && this.isDraft(head)) await this.insertPlan(client, key, previousRevisionId);
  }

  async edit(context: VerifiedTenantContext, jobId: string, sessionId: string, input: WorkPlanEdit) {
    const command = workPlanEditV1.parse(input);
    const key: PlanKey = [context.tenantId, jobId, command.quoteRevisionId];
    return withTenant(this.pool, context, async database => {
      const { $client: client } = database;
      const digest = createHash("sha256").update(sessionId).digest("hex");
      const { rows: [editor] } = await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [digest]);
      if (!editor?.id) throw new WorkPlanError("WORK_PLAN_EDITOR_REQUIRED");

      const head = await this.planHead(client, key[0], jobId, true);
      const receipt = await this.replay(client, key, editor.id, command);
      if (receipt) return receipt;
      this.requireCurrentRevision(head);
      if (head.quoteRevisionId !== command.quoteRevisionId) throw new WorkPlanError("WORK_PLAN_VERSION_CONFLICT");

      const plan = await this.generatePlan(database, key, head);
      if (plan.version !== command.expectedVersion) throw new WorkPlanError("WORK_PLAN_VERSION_CONFLICT");
      const existing = plan.tasks.some(task => task.scopeItemId === command.scopeItemId && task.key === command.taskKey);
      // An approved extra's edit names the approved revision the builder planned against, read in this
      // same plan snapshot. A later approval makes that revision stale, so the edit is refused.
      const extra = plan.scopeItems.find(item => item.scopeItemId === command.scopeItemId)?.variationRevisionId ?? null;
      const named = command.variationRevisionId ?? null;
      if (extra && named && named !== extra) throw new WorkPlanError("WORK_PLAN_VERSION_CONFLICT");
      if (named !== extra) throw new WorkPlanError("WORK_PLAN_INVALID_EDIT");
      const { position, trade, durationMinutes } = command.changes;
      const newCustom = command.taskKey === customWorkPlanTaskKey && position !== undefined &&
        trade !== undefined && durationMinutes !== undefined &&
        plan.unplanned.some(item => item.scopeItemId === command.scopeItemId);
      if ((!existing && !newCustom) || (position !== undefined && position > plan.tasks.length + Number(!existing))) {
        throw new WorkPlanError("WORK_PLAN_INVALID_EDIT");
      }
      const { rows: [saved] } = await client.query<EditReceipt>(`
        INSERT INTO app.v2_work_plan_edit
          (tenant_id, job_id, quote_revision_id, command_id, scope_item_id, template_task_key, expected_version, changes,
           actor_membership_id, variation_revision_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING command_id AS "commandId", quote_revision_id AS "quoteRevisionId",
          expected_version + 1 AS version, actor_membership_id AS "actorMembershipId", recorded_at AS "recordedAt"
      `, [...key, command.commandId, command.scopeItemId, command.taskKey, command.expectedVersion,
        JSON.stringify(command.changes), editor.id, extra]);
      // A replay returned above, so each recorded edit appends exactly one event in this transaction.
      await this.audit(database, editor.id, jobId, command, saved!.version, extra);
      return saved;
    });
  }

  private audit(database: TenantTransaction, actor: string, jobId: string, command: WorkPlanEdit, planVersion: number,
    variationRevisionId: string | null) {
    const changed = Object.entries(command.changes).filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
      eventType: "v2_work_plan.edited", subjectType: "job", subjectRef: jobId,
      payload: {
        references: { commandId: command.commandId, quoteRevisionId: command.quoteRevisionId,
          scopeItemId: command.scopeItemId, taskKey: command.taskKey,
          expectedVersion: String(command.expectedVersion), planVersion: String(planVersion),
          changedFields: changed.map(([field]) => field).join("/"),
          ...(variationRevisionId && { variationRevisionId }) },
        hashes: { changes: createHash("sha256").update(JSON.stringify(Object.fromEntries(changed))).digest("hex") },
        classifications: { action: "operational" },
      } }]);
  }

  private async replay(client: PoolClient, key: PlanKey, actor: string, command: WorkPlanEdit) {
    const { rows: [receipt] } = await client.query<EditReceipt & { matches: boolean }>(`
      SELECT command_id AS "commandId", quote_revision_id AS "quoteRevisionId",
        expected_version + 1 AS version, actor_membership_id AS "actorMembershipId", recorded_at AS "recordedAt",
        (quote_revision_id, scope_item_id, template_task_key, expected_version, changes, actor_membership_id)
          = ($3, $5, $6, $7, $8, $9) AND variation_revision_id IS NOT DISTINCT FROM $10::uuid AS matches
      FROM app.v2_work_plan_edit WHERE (tenant_id, job_id, command_id) = ($1, $2, $4)
    `, [...key, command.commandId, command.scopeItemId, command.taskKey, command.expectedVersion,
      JSON.stringify(command.changes), actor, command.variationRevisionId ?? null]);
    if (!receipt) return null;
    const { matches, ...saved } = receipt;
    if (!matches) throw new WorkPlanError("WORK_PLAN_COMMAND_CONFLICT");
    return saved;
  }

  private async planHead(client: PoolClient, tenantId: string, jobId: string, lockDraft = false) {
    if (lockDraft) {
      // Read lifecycle facts after waiting for any concurrent quote save or plan edit.
      await client.query(`SELECT 1 FROM app.quote_draft WHERE (tenant_id, job_id) = ($1, $2) FOR UPDATE`, [tenantId, jobId]);
    }
    // Cancellation clears the job's active acceptance pointer. Its immutable acceptance still anchors the plan.
    const { rows: [head] } = await client.query<PlanHead>(`
      SELECT CASE WHEN q.id IS NULL THEN d.current_revision_id ELSE q.quote_revision_id END AS "quoteRevisionId",
        j.status AS "jobStatus", q.id AS "acceptedDocumentId", q.snapshot->>'netPence' AS "acceptedNetPence",
        a.id AS "activationId"
      FROM app.job j
      LEFT JOIN app.quote_draft d ON (d.tenant_id, d.job_id) = (j.tenant_id, j.id)
      LEFT JOIN app.job_activation a ON (a.tenant_id, a.job_id) = (j.tenant_id, j.id)
      LEFT JOIN app.quote_document_version q ON (q.tenant_id, q.job_id, q.id) = (j.tenant_id, j.id,
        COALESCE(a.accepted_document_id, j.accepted_quote_version_id, (
          SELECT x.document_id FROM app.quote_acceptance x WHERE (x.tenant_id, x.job_id) = (j.tenant_id, j.id)
          ORDER BY x.recorded_at DESC, x.document_version DESC, x.id DESC LIMIT 1
        )))
      WHERE (j.tenant_id, j.id) = ($1, $2)
    `, [tenantId, jobId]);
    return head;
  }

  private isDraft(head: PlanHead) {
    return !head.acceptedDocumentId && (head.jobStatus === "draft" || head.jobStatus === "quoting");
  }

  private requireCurrentRevision(head: PlanHead | undefined): asserts head is PlanHead & { quoteRevisionId: string } {
    if (!head?.quoteRevisionId) throw new WorkPlanError("QUOTE_REVISION_NOT_FOUND");
    if (!head.acceptedDocumentId && !this.isDraft(head)) throw new WorkPlanError("WORK_PLAN_DRAFT_REQUIRED");
  }

  private checkFrozenRevision(head: PlanHead, revisionId: string) {
    if (head.acceptedDocumentId && head.quoteRevisionId !== revisionId) throw new WorkPlanError("WORK_PLAN_VERSION_CONFLICT");
  }

  private async generatePlan(database: TenantTransaction, key: PlanKey, head: PlanHead) {
    const { $client: client } = database;
    // Opening, generating or editing a plan creates it at most once. A quote-save refresh inserts through
    // refreshDraft instead, which quote.draft.saved already covers, so it appends nothing here.
    const tasks = await this.insertPlan(client, key, null);
    if (tasks) await this.recordGenerated(database, key, tasks);
    const plan = await this.readPlan(client, key, head);
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
    return created.rowCount ? this.insertTasks(client, key) : null;
  }

  // The plan is derived by rule from the quote revision, so the system rule is the actor.
  // A replay inserts nothing above and appends nothing here.
  private recordGenerated(database: TenantTransaction, [, jobId, quoteRevisionId]: PlanKey,
    tasks: readonly { scope_item_id: string; template_task_key: string }[]) {
    return appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: "system:v2-work-plan",
      eventType: "v2_work_plan.generated", subjectType: "job", subjectRef: jobId,
      payload: {
        references: { quoteRevisionId, templateKey: this.template.key, taskCount: String(tasks.length) },
        hashes: { tasks: createHash("sha256").update(JSON.stringify(tasks)).digest("hex") },
        classifications: { action: "operational" },
      } }]);
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
    return tasks;
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

  // One statement, so the agreement and the extras on the plan come from one snapshot of the approvals.
  // Each approved extra on its own scope item joins the frozen plan scope after the quote lines.
  // The plan reads the same approved revisions as the agreement and never recalculates money.
  private async approvedScope(client: PoolClient, key: PlanKey, after: number) {
    const { rows } = await client.query<ApprovedScopeRow>(`
      SELECT x.* FROM (
        SELECT DISTINCT ON (a.variation_id) r.scope_item_id AS "scopeItemId", r.id AS "revisionId", a.id AS "approvalId",
          r.description, r.quantity_decimal AS quantity, r.unit, r.signed_delta_pence AS "signedDeltaPence",
          jsonb_build_object('description', r.description, 'category', p.category,
            'quantity', r.quantity_decimal, 'unit', r.unit) AS source,
          EXISTS (SELECT FROM app.quote_line q WHERE (q.tenant_id, q.job_id, q.quote_revision_id, q.scope_item_id)
            = ($1, $2, $3, r.scope_item_id)) AS "onQuote",
          v.created_at AS "createdAt", a.variation_id AS "variationId"
        FROM app.variation_approval a JOIN app.variation_revision r
          ON (r.tenant_id, r.job_id, r.variation_id, r.id, r.revision, r.content_hash)
           = (a.tenant_id, a.job_id, a.variation_id, a.revision_id, a.revision, a.content_hash)
        JOIN app.variation v ON (v.tenant_id, v.job_id, v.id) = (a.tenant_id, a.job_id, a.variation_id)
        LEFT JOIN app.quote_line p ON (p.tenant_id, p.job_id, p.quote_revision_id, p.scope_item_id)
          = (v.tenant_id, v.job_id, $3, v.lineage_parent_scope_item_id)
        WHERE (a.tenant_id, a.job_id) = ($1, $2)
          AND r.signed_delta_pence = a.signed_delta_pence
        ORDER BY a.variation_id, a.revision DESC
      ) x
      ORDER BY x."variationId"
    `, key);
    const approvedVariations = rows.map(({ scopeItemId, revisionId, approvalId, description, quantity, unit, signedDeltaPence }) =>
      ({ scopeItemId, revisionId, approvalId, description, quantity, unit, signedDeltaPence: Number(signedDeltaPence) }));
    const revisions = new Map<string, string>();
    const scope: WorkPlanScopeRow[] = rows.filter(row => !row.onQuote)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.variationId < b.variationId ? -1 : 1))
      .filter(row => !revisions.has(row.scopeItemId) && revisions.set(row.scopeItemId, row.revisionId))
      .map(row => ({ scope_item_id: row.scopeItemId, source: row.source, template_task_key: null }));
    const tasks = scope.flatMap(row => this.template.tasks.filter(task => task.category === row.source.category)
      .map(({ category: _category, ...task }) => ({ ...task, scopeItemId: row.scope_item_id, position: 0,
        dependsOn: task.dependsOn.map(templateTaskKey => ({ scopeItemId: row.scope_item_id, templateTaskKey })) })))
      .map((task, index) => ({ ...task, position: after + index + 1 }));
    return { approvedVariations, scope, tasks, revisions };
  }

  private async readPlan(client: PoolClient, key: PlanKey, head: PlanHead) {
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
      SELECT e.scope_item_id, e.template_task_key, e.quote_revision_id, e.changes, CASE WHEN e.variation_revision_id IS NULL
        THEN jsonb_build_object('description', l.description, 'category', l.category, 'quantity', l.quantity_decimal, 'unit', l.unit)
        ELSE jsonb_build_object('description', r.description, 'category', p.category, 'quantity', r.quantity_decimal, 'unit', r.unit)
        END AS source
      FROM history h JOIN app.v2_work_plan_edit e ON (e.tenant_id, e.job_id, e.quote_revision_id) = ($1, $2, h.quote_revision_id)
      LEFT JOIN app.quote_line l ON e.variation_revision_id IS NULL AND (l.tenant_id, l.job_id, l.quote_revision_id, l.scope_item_id)
        = (e.tenant_id, e.job_id, e.quote_revision_id, e.scope_item_id)
      LEFT JOIN app.variation_revision r ON (r.tenant_id, r.job_id, r.id) = (e.tenant_id, e.job_id, e.variation_revision_id)
      LEFT JOIN app.variation v ON (v.tenant_id, v.job_id, v.id) = (r.tenant_id, r.job_id, r.variation_id)
      LEFT JOIN app.quote_line p ON (p.tenant_id, p.job_id, p.quote_revision_id, p.scope_item_id)
        = (e.tenant_id, e.job_id, e.quote_revision_id, v.lineage_parent_scope_item_id)
      WHERE l.scope_item_id IS NOT NULL OR r.id IS NOT NULL
      ORDER BY h.distance DESC, e.expected_version
    `, key);
    const inherited = edits.filter(edit => edit.quote_revision_id !== key[2]);
    const base = await this.loadTasks(client, key);
    // Approved extras exist only once the quote is accepted, so they never appear in a refresh comparison.
    const extras = head.acceptedDocumentId ? await this.approvedScope(client, key, base.tasks.length) : null;
    const current = applyWorkPlanEdits([...base.scope, ...extras?.scope ?? []], [...base.tasks, ...extras?.tasks ?? []], edits);
    let previous = null;
    if (plan.previous_plan_revision_id) {
      const prior = await this.loadTasks(client, [key[0], key[1], plan.previous_plan_revision_id]);
      previous = applyWorkPlanEdits(prior.scope, prior.tasks, inherited);
    }
    // Compare the refresh before applying edits made on this revision.
    const refreshed = previous ? applyWorkPlanEdits(base.scope, base.tasks, inherited) : current;
    const agreement = head.acceptedDocumentId ? {
      documentId: head.acceptedDocumentId,
      netPence: head.acceptedNetPence === null ? null : Number(head.acceptedNetPence),
      approvedVariations: extras!.approvedVariations,
    } : null;
    const state = head.activationId ? "live" as const : agreement ? "accepted" as const : "draft" as const;
    return { jobId: key[1], quoteRevisionId: key[2], templateKey: plan.template_key, state, agreement,
      activationId: head.activationId,
      version: edits.length - inherited.length, tasks: current.tasks, unplanned: current.unplanned,
      scopeItems: [...current.sources].map(([scopeItemId, details]) => {
        const variationRevisionId = extras?.revisions.get(scopeItemId);
        return { scopeItemId, ...details, ...(variationRevisionId && { variationRevisionId }) };
      }),
      changes: compareWorkPlanTasks(previous, refreshed) };
  }
}

export type WorkPlan = Awaited<ReturnType<WorkPlanRepository["open"]>>;
