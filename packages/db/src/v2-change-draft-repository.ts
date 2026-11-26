// V2-F3 (Q55): a change draft. One new quantity on an accepted quote line drafts the price (an
// ordinary existing-scope variation, priced through main's own path), the extra time and the
// material needs together. Pending drafts never enter agreed scope, the plan or a brief.
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { ChangeDraftError, draftChange, priceVariation, type ChangeDraft, type VariationProposal,
  type VariationRevision } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { rethrowJobWorkState } from "./job-work-state-sources.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { BuilderCaptureError, VariationRevisionConflict, captureCommandFailure, insertPricedVariation,
  logBuilderExtraIn } from "./variation-repository.js";
import { splashbackDecoratingTemplate } from "./v2-splashback-decorating-template.js";
import { WorkPlanError, WorkPlanRepository } from "./v2-work-plan-repository.js";

const titles = new Map<string, string>(splashbackDecoratingTemplate.tasks.map(entry => [entry.key, entry.title]));

const uuid = z.guid({ error: "Invalid uuid" });
const quantity = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u);
const rate = z.number().int().min(0).max(1_000_000_000_000);
const task = z.strictObject({ taskKey: z.string().min(1).max(200), proposedMinutes: z.number().int().min(0).max(10_080) });
const drafted = { newQuantity: quantity, unitRatePence: rate, description: z.string().trim().min(1).max(500),
  tasks: z.array(task).max(50).refine(rows => new Set(rows.map(row => row.taskKey)).size === rows.length) };
export const changeDraftPreviewV1 = z.strictObject({ version: z.literal("v2-change-draft-preview.v1"), quoteLineId: uuid,
  newQuantity: quantity, unitRatePence: rate.optional() });
export const changeDraftCommandV1 = z.discriminatedUnion("action", [
  z.strictObject({ version: z.literal("v2-change-draft-command.v1"), action: z.literal("confirm"), commandId: uuid,
    quoteLineId: uuid, ...drafted }),
  z.strictObject({ version: z.literal("v2-change-draft-command.v1"), action: z.literal("revise"), commandId: uuid,
    variationId: uuid, expectedRevisionId: uuid, ...drafted }),
  z.strictObject({ version: z.literal("v2-change-draft-command.v1"), action: z.literal("add_time"), revisionId: uuid }),
]);
export type ChangeDraftCommand = z.input<typeof changeDraftCommandV1>;

export class ChangeDraftRepositoryError extends Error {
  constructor(readonly code: "CHANGE_DRAFT_INVALID_COMMAND" | "CHANGE_DRAFT_FORBIDDEN" | "CHANGE_DRAFT_LINE_NOT_FOUND" |
    "CHANGE_DRAFT_TASK_NOT_FOUND" | "CHANGE_DRAFT_COMMAND_CONFLICT" | "CHANGE_DRAFT_VERSION_CONFLICT" |
    "CHANGE_DRAFT_NOT_APPROVED" | "CHANGE_DRAFT_NOT_FOUND" | ChangeDraftError["code"]) { super(code); }
}

export type ChangeDraftLineRow = { quoteLineId: string; quoteRevisionId: string; scopeItemId: string; description: string;
  quantity: string | null; unit: string | null; unitRatePence: number | null };
export type ChangeDraftRow = { variationId: string; revisionId: string; revision: number; quoteLineId: string;
  lineDescription: string; acceptedQuantity: string; newQuantity: string; direction: "addition" | "omission"; unit: string;
  unitRatePence: number; signedDeltaPence: number; state: "draft" | "priced" | "approved" | "rejected"; current: boolean;
  linked: boolean; timeOnPlan: boolean; recordedAt: Date;
  tasks: { taskKey: string; title: string; proposedMinutes: number; materialNeeds: string[] }[] };

const sourceHash = "8".repeat(64);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const MEMBER = `SELECT role FROM app.membership WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at>clock_timestamp())`;
/** A stable plan-edit command id for one drafted task, so "Add the extra time" happens once per task. */
export const changeDraftTimeCommandId = (revisionId: string, taskKey: string) => {
  const hex = sha256(`v2-f3-time:${revisionId}:${taskKey}`);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${(8 | (parseInt(hex[16]!, 16) & 3)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const ACCEPTED_LINES = `
  SELECT l.id AS "quoteLineId", l.quote_revision_id AS "quoteRevisionId", l.scope_item_id AS "scopeItemId", l.description,
    l.quantity_decimal AS quantity, l.unit, l.unit_rate_pence::text AS "unitRatePence"
  FROM app.job j
  LEFT JOIN app.job_activation a ON (a.tenant_id, a.job_id) = (j.tenant_id, j.id)
  JOIN app.quote_document_version q ON (q.tenant_id, q.job_id, q.id) = (j.tenant_id, j.id, COALESCE(a.accepted_document_id, j.accepted_quote_version_id))
  JOIN app.quote_line l ON (l.tenant_id, l.job_id, l.quote_revision_id) = (j.tenant_id, j.id, q.quote_revision_id)
  WHERE (j.tenant_id, j.id) = ($1, $2) AND l.included`;

export class ChangeDraftRepository {
  private readonly plans: WorkPlanRepository;
  constructor(private readonly pool: Pool) { this.plans = new WorkPlanRepository(pool); }

  private async acceptedLines(client: PoolClient, tenantId: string, jobId: string, lineId?: string) {
    const { rows } = await client.query<Omit<ChangeDraftLineRow, "unitRatePence"> & { unitRatePence: string | null }>(
      `${ACCEPTED_LINES}${lineId ? " AND l.id = $3" : ""} ORDER BY l.ordinal`, lineId ? [tenantId, jobId, lineId] : [tenantId, jobId]);
    return rows.map(row => ({ ...row, unitRatePence: row.unitRatePence === null ? null : Number(row.unitRatePence) }));
  }

  /** The plan's tasks on one scope item, with any builder edits applied. */
  private async planTasks(context: VerifiedTenantContext, jobId: string, line: ChangeDraftLineRow) {
    const plan = await this.plans.read(context, { version: "work-plan-source.v1", jobId, quoteRevisionId: line.quoteRevisionId })
      .catch(error => { if (error instanceof WorkPlanError) return null; throw error; });
    return { plan, tasks: (plan?.tasks ?? []).filter(row => row.scopeItemId === line.scopeItemId)
      .map(row => ({ taskKey: row.key, title: row.title, durationMinutes: row.durationMinutes, materialNeeds: row.materialNeeds })) };
  }

  private draft(line: ChangeDraftLineRow, newQuantity: string, unitRatePence: number | undefined,
    tasks: { taskKey: string; durationMinutes: number; materialNeeds: readonly string[] }[]) {
    try { return draftChange({ line, newQuantity, ...(unitRatePence !== undefined && { unitRatePence }), tasks }); }
    catch (error) { if (error instanceof ChangeDraftError) throw new ChangeDraftRepositoryError(error.code); throw error; }
  }

  async lines(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async ({ $client }) => this.acceptedLines($client, context.tenantId, jobId));
  }

  /** Writes nothing. */
  async preview(context: VerifiedTenantContext, jobId: string, input: unknown) {
    const parsed = changeDraftPreviewV1.safeParse(input);
    if (!parsed.success) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_INVALID_COMMAND");
    const [line] = await withTenant(this.pool, context, ({ $client }) => this.acceptedLines($client, context.tenantId, jobId, parsed.data.quoteLineId));
    if (!line) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_LINE_NOT_FOUND");
    const { tasks } = await this.planTasks(context, jobId, line);
    const draft = this.draft(line, parsed.data.newQuantity, parsed.data.unitRatePence, tasks);
    return { line, ...draft, tasks: draft.tasks.map(row => ({ ...row, title: tasks.find(t => t.taskKey === row.taskKey)!.title })) };
  }

  async command(context: VerifiedTenantContext, jobId: string, sessionId: string, actorMembershipId: string, input: unknown) {
    const parsed = changeDraftCommandV1.safeParse(input);
    if (!parsed.success) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_INVALID_COMMAND");
    const command = parsed.data;
    if (command.action === "add_time") return this.addTime(context, jobId, sessionId, command.revisionId);
    const digest = sha256(JSON.stringify(command));
    // Read the line and plan first, outside the write; the write re-reads the line under its lock.
    const variationLine = command.action === "revise" ? await withTenant(this.pool, context, async ({ $client }) =>
      (await $client.query<{ id: string }>(`SELECT quote_line_id AS id FROM app.v2_change_draft
        WHERE (tenant_id, job_id, variation_id) = ($1, $2, $3) LIMIT 1`, [context.tenantId, jobId, command.variationId])).rows[0]?.id) : command.quoteLineId;
    if (!variationLine) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_NOT_FOUND");
    const [preRead] = await withTenant(this.pool, context, ({ $client }) => this.acceptedLines($client, context.tenantId, jobId, variationLine));
    if (!preRead) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_LINE_NOT_FOUND");
    const { tasks: planTasks } = await this.planTasks(context, jobId, preRead);
    for (const row of command.tasks) {
      if (!planTasks.some(t => t.taskKey === row.taskKey)) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_TASK_NOT_FOUND");
    }
    const result = await withTenant(this.pool, context, async database => {
      const { $client } = database;
      const member = (await $client.query<{ role: string }>(MEMBER, [context.tenantId, actorMembershipId])).rows[0];
      if (member?.role !== "owner") throw new ChangeDraftRepositoryError("CHANGE_DRAFT_FORBIDDEN");
      await $client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2031))", [`change-draft:${context.tenantId}:${jobId}`]);
      const { rows: [prior] } = await $client.query<{ revisionId: string; jobId: string; digest: string }>(`SELECT revision_id AS "revisionId",
        job_id AS "jobId", request_digest AS digest FROM app.v2_change_draft WHERE (tenant_id, command_id) = ($1, $2)`, [context.tenantId, command.commandId]);
      if (prior) {
        if (prior.jobId !== jobId || prior.digest !== digest) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_COMMAND_CONFLICT");
        return { revisionId: prior.revisionId, replayed: true };
      }
      const [line] = await this.acceptedLines($client, context.tenantId, jobId, variationLine);
      if (!line) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_LINE_NOT_FOUND");
      const draft = this.draft(line, command.newQuantity, command.unitRatePence, planTasks);
      const price = { ...draft.priceProposal, direction: draft.direction, confirmedByMembershipId: actorMembershipId,
        rateProvenance: { kind: "human_entered" as const, sourceRef: "synthetic://builder-entered", sourceHash, rateVersion: "builder-price-v1" } };
      let variationId: string, revisionId: string;
      if (command.action === "confirm") {
        const proposal: VariationProposal = { version: "variation-proposal.v1", id: command.commandId, jobId, scopeItemId: line.scopeItemId,
          existingScopeItemId: line.scopeItemId, lineageParentScopeItemId: null, captureKind: "text",
          captureText: `Change ${line.description}: ${line.quantity} to ${command.newQuantity} ${line.unit}`, description: command.description, suggestion: null };
        await logBuilderExtraIn(database, context, { version: "log-builder-extra.v1", proposal, actorMembershipId, deviceId: null,
          deviceCapturedAt: null, price });
        variationId = command.commandId;
        revisionId = (await $client.query<{ id: string }>("SELECT current_revision_id AS id FROM app.variation WHERE (tenant_id, id) = ($1, $2)",
          [context.tenantId, variationId])).rows[0]!.id;
      } else {
        variationId = command.variationId;
        revisionId = command.commandId;
        await this.revise(database, context.tenantId, jobId, command.variationId, command.expectedRevisionId, revisionId, command.description, price);
      }
      await $client.query(`INSERT INTO app.v2_change_draft (tenant_id, job_id, variation_id, revision_id, quote_line_id, accepted_quantity,
        new_quantity, direction, command_id, request_digest, actor_membership_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [context.tenantId, jobId, variationId, revisionId, line.quoteLineId, line.quantity, command.newQuantity, draft.direction,
        command.commandId, digest, actorMembershipId]);
      for (const row of draft.tasks) {
        const minutes = command.tasks.find(t => t.taskKey === row.taskKey)?.proposedMinutes ?? row.proposedMinutes;
        await $client.query(`INSERT INTO app.v2_change_draft_task (tenant_id, job_id, revision_id, task_key, proposed_minutes, material_needs)
          VALUES ($1,$2,$3,$4,$5,$6)`, [context.tenantId, jobId, revisionId, row.taskKey, minutes, row.materialNeeds]);
      }
      await appendAuditBatch(database, [{ id: randomUUID(),
        version: "audit.v1", actorRef: `membership:${actorMembershipId}`, eventType: "v2.change_draft.confirmed", subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: command.commandId, action: command.action, variationId, revisionId, quoteLineId: line.quoteLineId,
          acceptedQuantity: String(line.quantity), newQuantity: command.newQuantity, direction: draft.direction }, hashes: { request: digest },
        classifications: { action: "commercial" } } }]);
      return { revisionId, replayed: false };
    }).catch(rethrowJobWorkState).catch(error => {
      if (error instanceof BuilderCaptureError && error.code === "FORBIDDEN") throw new ChangeDraftRepositoryError("CHANGE_DRAFT_FORBIDDEN");
      if (error instanceof VariationRevisionConflict) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_VERSION_CONFLICT");
      if (error instanceof Error && error.message === "ACTIVATION_REQUIRED") throw new ChangeDraftRepositoryError("CHANGE_DRAFT_FORBIDDEN");
      return captureCommandFailure(error);
    });
    const row = (await this.list(context, jobId)).find(item => item.revisionId === result.revisionId)!;
    return { ...row, replayed: result.replayed };
  }

  /** Main's revise, as VariationApplication builds it, for the variation's current priced revision. */
  private async revise(db: TenantTransaction, tenantId: string, jobId: string, variationId: string, expectedRevisionId: string,
    revisionId: string, description: string, price: Parameters<typeof priceVariation>[0]["confirmed"] & object) {
    const { rows: [v] } = await db.$client.query<{ scopeItemId: string; existing: string | null; captureText: string; description: string;
      state: string; current: string | null }>(`SELECT scope_item_id AS "scopeItemId", existing_scope_item_id AS existing,
        capture_text AS "captureText", description, state, current_revision_id AS current FROM app.variation
      WHERE (tenant_id, job_id, id) = ($1, $2, $3)`, [tenantId, jobId, variationId]);
    if (!v) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_NOT_FOUND");
    if (v.state !== "priced" || v.current !== expectedRevisionId) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_VERSION_CONFLICT");
    const { rows: [c] } = await db.$client.query<{ revision: number; previous: string | null; description: string; quantity: string; unit: string;
      rate: string; delta: string; hash: string; actor: string; source: string }>(`SELECT revision, previous_revision_id AS previous, description,
        quantity_decimal AS quantity, unit, unit_rate_pence::text AS rate, signed_delta_pence::text AS delta, content_hash AS hash,
        confirmed_by_membership_id AS actor, rate_source_ref AS source FROM app.variation_revision WHERE (tenant_id, id) = ($1, $2)`, [tenantId, expectedRevisionId]);
    const previous = { id: expectedRevisionId, variationId, revision: c!.revision, previousRevisionId: c!.previous, scopeItemId: v.scopeItemId,
      description: c!.description, quantity: c!.quantity, unit: c!.unit, unitRatePence: Number(c!.rate), signedDeltaPence: Number(c!.delta),
      contentHash: c!.hash, confirmedByMembershipId: c!.actor,
      rateProvenance: { kind: "human_entered", sourceRef: c!.source, sourceHash, rateVersion: "builder-price-v1" }, state: "priced" } as VariationRevision;
    const proposal: VariationProposal = { version: "variation-proposal.v1", id: variationId, jobId, scopeItemId: v.scopeItemId,
      existingScopeItemId: v.existing, lineageParentScopeItemId: null, captureKind: "text", captureText: v.captureText, description: v.description, suggestion: null };
    const { confirmedByMembershipId: _actor, rateProvenance: _source, ...terms } = price;
    const revision = priceVariation({ id: revisionId, variationId, previous, proposal, description,
      contentHash: sha256(JSON.stringify({ description, ...terms })), confirmed: price });
    await insertPricedVariation(db, tenantId, revision);
  }

  /** After approval: one ordinary plan edit per drafted task, adding its minutes. Each runs once. */
  private async addTime(context: VerifiedTenantContext, jobId: string, sessionId: string, revisionId: string) {
    const row = (await this.list(context, jobId)).find(item => item.revisionId === revisionId);
    if (!row) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_NOT_FOUND");
    if (row.state !== "approved" || !row.current) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_NOT_APPROVED");
    const [line] = await withTenant(this.pool, context, ({ $client }) => this.acceptedLines($client, context.tenantId, jobId, row.quoteLineId));
    if (!line) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_LINE_NOT_FOUND");
    for (const drafted of row.tasks.filter(item => item.proposedMinutes > 0)) {
      const commandId = changeDraftTimeCommandId(revisionId, drafted.taskKey);
      const done = await withTenant(this.pool, context, async ({ $client }) => (await $client.query(`SELECT 1 FROM app.v2_work_plan_edit
        WHERE (tenant_id, job_id, command_id) = ($1, $2, $3)`, [context.tenantId, jobId, commandId])).rowCount);
      if (done) continue;
      const { plan, tasks } = await this.planTasks(context, jobId, line);
      const current = tasks.find(item => item.taskKey === drafted.taskKey);
      if (!plan || !current) throw new ChangeDraftRepositoryError("CHANGE_DRAFT_TASK_NOT_FOUND");
      await this.plans.edit(context, jobId, sessionId, { version: "work-plan-edit.v1", commandId, quoteRevisionId: line.quoteRevisionId,
        expectedVersion: plan.version, scopeItemId: line.scopeItemId, taskKey: drafted.taskKey,
        changes: { durationMinutes: current.durationMinutes + drafted.proposedMinutes } });
    }
    return { ...(await this.list(context, jobId)).find(item => item.revisionId === revisionId)!, replayed: false };
  }

  async list(context: VerifiedTenantContext, jobId: string): Promise<ChangeDraftRow[]> {
    const rows = await withTenant(this.pool, context, async ({ $client }) => (await $client.query<Omit<ChangeDraftRow, "tasks" | "timeOnPlan" |
      "unitRatePence" | "signedDeltaPence"> & { unitRatePence: string; signedDeltaPence: string; edits: string[];
      tasks: { taskKey: string; proposedMinutes: number; materialNeeds: string[] }[] }>(`
      SELECT d.variation_id AS "variationId", d.revision_id AS "revisionId", r.revision, d.quote_line_id AS "quoteLineId",
        l.description AS "lineDescription", d.accepted_quantity AS "acceptedQuantity", d.new_quantity AS "newQuantity", d.direction,
        r.unit, r.unit_rate_pence::text AS "unitRatePence", r.signed_delta_pence::text AS "signedDeltaPence",
        CASE WHEN v.current_revision_id = d.revision_id THEN v.state
          WHEN EXISTS (SELECT FROM app.variation_rejection x WHERE (x.tenant_id, x.revision_id) = (d.tenant_id, d.revision_id)) THEN 'rejected'
          ELSE 'priced' END AS state,
        v.current_revision_id = d.revision_id AS current,
        EXISTS (SELECT FROM app.v2_customer_extra_link k WHERE (k.tenant_id, k.job_id, k.revision_id) = (d.tenant_id, d.job_id, d.revision_id)) AS linked,
        d.recorded_at AS "recordedAt",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('taskKey', t.task_key, 'proposedMinutes', t.proposed_minutes,
          'materialNeeds', to_jsonb(t.material_needs)) ORDER BY t.task_key) FROM app.v2_change_draft_task t
          WHERE (t.tenant_id, t.job_id, t.revision_id) = (d.tenant_id, d.job_id, d.revision_id)), '[]') AS tasks,
        ARRAY(SELECT e.command_id::text FROM app.v2_work_plan_edit e WHERE (e.tenant_id, e.job_id) = (d.tenant_id, d.job_id)) AS edits
      FROM app.v2_change_draft d
      JOIN app.variation v ON (v.tenant_id, v.job_id, v.id) = (d.tenant_id, d.job_id, d.variation_id)
      JOIN app.variation_revision r ON (r.tenant_id, r.job_id, r.id) = (d.tenant_id, d.job_id, d.revision_id)
      JOIN app.quote_line l ON (l.tenant_id, l.id) = (d.tenant_id, d.quote_line_id)
      WHERE (d.tenant_id, d.job_id) = ($1, $2) ORDER BY d.recorded_at, d.revision_id`, [context.tenantId, jobId])).rows);
    return rows.map(({ edits, ...row }) => {
      const planned = new Set(edits);
      const tasks = row.tasks.map(item => ({ ...item, title: titles.get(item.taskKey) ?? item.taskKey }));
      return { ...row, unitRatePence: Number(row.unitRatePence), signedDeltaPence: Number(row.signedDeltaPence), tasks,
        timeOnPlan: tasks.some(item => item.proposedMinutes > 0) && tasks.filter(item => item.proposedMinutes > 0)
          .every(item => planned.has(changeDraftTimeCommandId(row.revisionId, item.taskKey))) };
    });
  }
}

export type { ChangeDraft };
