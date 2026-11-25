import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { appendAuditBatch } from "./audit.js";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { initialStageAmounts, paymentScheduleSetV1, paymentScheduleTaskDoneV1, PaymentScheduleError, pounds, projectPaymentSchedule,
  replayPaymentSchedule, type FrozenStage, type PaymentStage, type ScheduleFact } from "./v2-payment-schedule.js";
import { WorkPlanRepository } from "./v2-work-plan-repository.js";

type Saved = { tenant_id: string; command_id: string; quote_revision_id: string; job_id: string; stages: PaymentStage[];
  actor_membership_id: string; recorded_at: Date; recorded_order: string; expected_version: number };

export class PaymentScheduleRepository {
  private readonly plans: WorkPlanRepository;
  constructor(private readonly pool: Pool) { this.plans = new WorkPlanRepository(pool); }

  private fence() {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
  }

  async read(context: VerifiedTenantContext, jobId: string) {
    this.fence();
    return withTenant(this.pool, context, async ({ $client: client }) => {
      const head = await this.head(client, context.tenantId, jobId);
      const saved = await this.schedule(client, context.tenantId, jobId, head.revision);
      const tasks = await this.effectiveTasks(client, context.tenantId, jobId, head.revision);
      const base = { jobId, quoteRevisionId: head.revision, acceptedTotal: pounds(Number(head.net)),
        basis: "net" as const, environment: "synthetic_demo" as const, tasks, realExternalActions: 0 };
      if (!saved) return { ...base, schedule: null };
      const { facts } = await this.facts(client, context.tenantId, jobId, saved);
      const frozen = await this.frozenRows(client, context.tenantId, jobId, saved.quote_revision_id);
      const projected = projectPaymentSchedule(Number(head.net), saved.stages, facts, await this.clock(client), frozen);
      // A trigger task that left the effective plan stays visible; its amount stays in the total.
      const stages = projected.stages.map(stage => ({ ...stage, triggerRemoved: stage.status === "planned" &&
        stage.trigger.kind === "task" && !hasTask(tasks, stage.trigger.scopeItemId, stage.trigger.taskKey) }));
      return { ...base, schedule: { ...projected, stages,
        version: await this.currentVersion(client, context.tenantId, jobId, saved.quote_revision_id), commandId: saved.command_id, actorMembershipId: saved.actor_membership_id,
        recordedAt: saved.recorded_at.toISOString() } };
    });
  }

  async set(context: VerifiedTenantContext, jobId: string, sessionId: string, raw: unknown) {
    this.fence();
    const parsed = paymentScheduleSetV1.safeParse(raw);
    if (!parsed.success || parsed.data.jobId !== jobId) throw new PaymentScheduleError("SCHEDULE_INVALID");
    const command = parsed.data;
    return withTenant(this.pool, context, async db => {
      const client = db.$client;
      const { rows: [actor] } = await client.query<{id: string | null}>("SELECT app.v2_work_plan_editor($1) AS id",
        [createHash("sha256").update(sessionId).digest("hex")]);
      if (!actor?.id) throw new PaymentScheduleError("SCHEDULE_BUILDER_REQUIRED");
      // Serialize this tenant's two schedule commands, including cross-job replay identities.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`v2-schedule:${context.tenantId}`]);
      const head = await this.head(client, context.tenantId, jobId);
      const { rows: [existing] } = await client.query<Saved>(`SELECT * FROM app.v2_payment_schedule
        WHERE tenant_id=$1 AND command_id=$2`, [context.tenantId, command.commandId]);
      if (existing) {
        const matches = existing.job_id === jobId && existing.quote_revision_id === command.quoteRevisionId &&
          existing.expected_version === command.expectedVersion && existing.actor_membership_id === actor.id &&
          (await client.query<{matches:boolean}>("SELECT $1::jsonb = $2::jsonb AS matches",
            [JSON.stringify(existing.stages), JSON.stringify(command.stages)])).rows[0]?.matches;
        if (!matches) throw new PaymentScheduleError("SCHEDULE_REPLAY_CONFLICT");
        return this.receipt(existing);
      }
      if ((await client.query("SELECT 1 FROM app.v2_payment_schedule_task_done WHERE tenant_id=$1 AND command_id=$2",
        [context.tenantId,command.commandId])).rowCount) throw new PaymentScheduleError("SCHEDULE_REPLAY_CONFLICT");
      if (command.expectedVersion !== 0 || head.revision !== command.quoteRevisionId ||
        (await client.query(`SELECT 1 FROM app.v2_payment_schedule WHERE (tenant_id,job_id,quote_revision_id)=($1,$2,$3)`,
          [context.tenantId, jobId, head.revision])).rowCount) throw new PaymentScheduleError("SCHEDULE_STALE");
      try { initialStageAmounts(Number(head.net), command.stages); }
      catch { throw new PaymentScheduleError("SCHEDULE_INVALID"); }
      // K5A-2: triggers bind the effective plan, so custom-scope-item tasks count too.
      const tasks = await this.effectiveTasks(client, context.tenantId, jobId, head.revision);
      for (const stage of command.stages) {
        if (stage.trigger.kind === "task" && !hasTask(tasks, stage.trigger.scopeItemId, stage.trigger.taskKey)) {
          throw new PaymentScheduleError("SCHEDULE_INVALID");
        }
      }
      const { rows: [saved] } = await client.query<Saved>(`INSERT INTO app.v2_payment_schedule
        (tenant_id,job_id,quote_revision_id,command_id,expected_version,stages,actor_membership_id)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *,
        to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS recorded_order`, [context.tenantId, jobId, head.revision,
        command.commandId, command.expectedVersion, JSON.stringify(command.stages), actor.id]);
      await this.freeze(db, Number(head.net), saved!, command.stages.flatMap((stage, index) =>
        stage.trigger.kind === "acceptance" ? [index] : []), saved!.recorded_order, command.commandId, actor.id);
      await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor.id}`,
        eventType: "v2.billing_schedule.set", subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: command.commandId, quoteRevisionId: head.revision, scheduleVersion: "1" },
          classifications: { action: "operational" } } }]);
      return this.receipt(saved!);
    });
  }

  private async currentVersion(client: PoolClient, tenantId: string, jobId: string, revision: string) {
    const { rows: [row] } = await client.query<{n:number}>(`SELECT count(*)::int + 1 AS n
      FROM app.v2_payment_schedule_task_done WHERE (tenant_id,job_id,quote_revision_id)=($1,$2,$3)`, [tenantId, jobId, revision]);
    return row!.n;
  }

  async recordTaskDone(context: VerifiedTenantContext, jobId: string, sessionId: string, raw: unknown) {
    this.fence();
    const parsed = paymentScheduleTaskDoneV1.safeParse(raw);
    if (!parsed.success || parsed.data.jobId !== jobId) throw new PaymentScheduleError("SCHEDULE_INVALID");
    const command = parsed.data;
    return withTenant(this.pool, context, async db => {
      const client = db.$client;
      const { rows: [actor] } = await client.query<{id:string|null}>("SELECT app.v2_work_plan_editor($1) AS id",
        [createHash("sha256").update(sessionId).digest("hex")]);
      if (!actor?.id) throw new PaymentScheduleError("SCHEDULE_BUILDER_REQUIRED");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`v2-schedule:${context.tenantId}`]);
      const head = await this.head(client, context.tenantId, jobId);
      const values = [context.tenantId, jobId, command.quoteRevisionId, command.commandId, command.expectedVersion,
        command.scopeItemId, command.taskKey, actor.id];
      const { rows: [replay] } = await client.query<{matches:boolean; recordedAt:Date}>(`SELECT
        (job_id,quote_revision_id,expected_version,scope_item_id,template_task_key,actor_membership_id)
          = ($2,$3,$5,$6,$7,$8) AS matches, recorded_at AS "recordedAt"
        FROM app.v2_payment_schedule_task_done WHERE tenant_id=$1 AND command_id=$4`, values);
      if (replay) {
        if (!replay.matches) throw new PaymentScheduleError("SCHEDULE_REPLAY_CONFLICT");
        return {commandId:command.commandId,version:command.expectedVersion+1,recordedAt:replay.recordedAt.toISOString()};
      }
      const schedule = await this.schedule(client, context.tenantId, jobId, command.quoteRevisionId);
      if (!schedule || head.revision !== command.quoteRevisionId ||
        await this.currentVersion(client,context.tenantId,jobId,head.revision) !== command.expectedVersion) {
        throw new PaymentScheduleError("SCHEDULE_STALE");
      }
      if (!schedule.stages.some(stage => stage.trigger.kind === "task" &&
        stage.trigger.scopeItemId === command.scopeItemId && stage.trigger.taskKey === command.taskKey)) {
        throw new PaymentScheduleError("SCHEDULE_INVALID");
      }
      // K5A-2: the task must still be in the effective plan, read in this transaction under the lock.
      if (!hasTask(await this.effectiveTasks(client, context.tenantId, jobId, head.revision), command.scopeItemId, command.taskKey)) {
        throw new PaymentScheduleError("SCHEDULE_INVALID");
      }
      const {rows:[already]} = await client.query(`SELECT 1 FROM app.v2_payment_schedule_task_done
        WHERE (tenant_id,job_id,quote_revision_id,scope_item_id,template_task_key)=($1,$2,$3,$4,$5)`,
      [context.tenantId,jobId,head.revision,command.scopeItemId,command.taskKey]);
      if (already) throw new PaymentScheduleError("SCHEDULE_STALE");
      // A replay identity is tenant-wide across both schedule commands.
      if ((await client.query("SELECT 1 FROM app.v2_payment_schedule WHERE tenant_id=$1 AND command_id=$2",
        [context.tenantId,command.commandId])).rowCount) throw new PaymentScheduleError("SCHEDULE_REPLAY_CONFLICT");
      const {rows:[saved]} = await client.query<{recordedAt:Date; at:string}>(`INSERT INTO app.v2_payment_schedule_task_done
        (tenant_id,job_id,quote_revision_id,command_id,expected_version,scope_item_id,template_task_key,actor_membership_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING recorded_at AS "recordedAt",
        to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`,values);
      await this.freeze(db, Number(head.net), schedule, schedule.stages.flatMap((stage, index) => stage.trigger.kind === "task" &&
        stage.trigger.scopeItemId === command.scopeItemId && stage.trigger.taskKey === command.taskKey ? [index] : []),
      saved!.at, command.commandId, actor.id);
      await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${actor.id}`,
        eventType:"v2.billing_schedule.task_recorded",subjectType:"job",subjectRef:jobId,
        payload:{references:{commandId:command.commandId,quoteRevisionId:head.revision,scopeItemId:command.scopeItemId,
          taskKey:command.taskKey,scheduleVersion:String(command.expectedVersion+1)},classifications:{action:"operational"}}}]);
      return {commandId:command.commandId,version:command.expectedVersion+1,recordedAt:saved!.recordedAt.toISOString()};
    });
  }

  private receipt(saved: Saved) {
    return { commandId: saved.command_id, quoteRevisionId: saved.quote_revision_id, version: 1,
      actorMembershipId: saved.actor_membership_id, recordedAt: saved.recorded_at.toISOString(),
      environment: "synthetic_demo", realExternalActions: 0 };
  }

  private async head(client: PoolClient, tenantId: string, jobId: string) {
    const { rows: [head] } = await client.query<{revision: string; net: string}>(`
      SELECT q.quote_revision_id AS revision, q.snapshot->>'netPence' AS net
      FROM app.job j JOIN app.quote_document_version q
        ON (q.tenant_id,q.job_id,q.id)=(j.tenant_id,j.id,j.accepted_quote_version_id)
      JOIN app.quote_acceptance a ON (a.tenant_id,a.job_id,a.document_id)=(q.tenant_id,q.job_id,q.id)
      WHERE (j.tenant_id,j.id)=($1,$2)`, [tenantId, jobId]);
    if (!head || head.net === null) throw new PaymentScheduleError("SCHEDULE_ACCEPTANCE_REQUIRED");
    return head;
  }

  private async facts(client: PoolClient, tenantId: string, jobId: string, saved: Saved) {
    // Fixed-width UTC text preserves PostgreSQL microseconds for ordering and the schedule boundary.
    const start = saved.recorded_order;
    const facts: ScheduleFact[] = [];
    const approvalIds: string[] = [];
    for (const [index, stage] of saved.stages.entries()) {
      let at: string | undefined;
      if (stage.trigger.kind === "acceptance") at = start;
      if (stage.trigger.kind === "date") {
        const row = (await client.query<{at:string}>(`SELECT to_char(
          ($1::date::timestamp AT TIME ZONE 'Europe/London') AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at`, [stage.trigger.date])).rows[0]!;
        at = row.at;
      }
      if (stage.trigger.kind === "task") {
        const row = (await client.query<{at:string}>(`SELECT
          to_char(min(recorded_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
          FROM app.v2_payment_schedule_task_done
          WHERE (tenant_id,job_id,quote_revision_id,scope_item_id,template_task_key)=($1,$2,$3,$4,$5)`,
        [tenantId, jobId, saved.quote_revision_id, stage.trigger.scopeItemId, stage.trigger.taskKey])).rows[0];
        if (row?.at) at = row.at;
      }
      if (at) facts.push({ kind: "due", at: at < start ? start : at, index });
    }
    const approvals = (await client.query<{id:string; variation_id:string; pence:string; at:string}>(`
      SELECT a.id,a.variation_id,a.signed_delta_pence AS pence,
        to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
      FROM app.variation_approval a JOIN app.variation_revision r
        ON (r.tenant_id,r.job_id,r.variation_id,r.id,r.revision,r.content_hash,r.signed_delta_pence)
         = (a.tenant_id,a.job_id,a.variation_id,a.revision_id,a.revision,a.content_hash,a.signed_delta_pence)
      JOIN app.variation v ON (v.tenant_id,v.job_id,v.id)=(a.tenant_id,a.job_id,a.variation_id)
      WHERE (a.tenant_id,a.job_id)=($1,$2) AND v.origin IN ('builder_logged','final_review')
      ORDER BY a.created_at,a.variation_id,a.revision,a.id`, [tenantId, jobId])).rows;
    const initial = new Map<string, number>();
    // One read: the frozen amount and its counted ids come from this same row set (plan-check condition 1).
    for (const approval of approvals) {
      approvalIds.push(approval.id);
      const at = approval.at;
      if (at < start) {
        initial.set(approval.variation_id, Number(approval.pence));
        facts.push({ kind: "prior_extra", at, variationId: approval.variation_id, pence: Number(approval.pence) });
      }
      else facts.push({ kind: "extra", at, variationId: approval.variation_id, approvalId: approval.id,
        pence: Number(approval.pence) - (initial.get(approval.variation_id) ?? 0) });
    }
    return { facts, approvalIds };
  }

  private async schedule(client: PoolClient, tenantId: string, jobId: string, revision: string) {
    const { rows: [saved] } = await client.query<Saved>(`SELECT *,
      to_char(recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS recorded_order
      FROM app.v2_payment_schedule
      WHERE (tenant_id,job_id,quote_revision_id)=($1,$2,$3)`, [tenantId, jobId, revision]);
    return saved;
  }

  private async clock(client: PoolClient) {
    const { rows: [clock] } = await client.query<{now: string}>(`SELECT
      to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS now`);
    return clock!.now;
  }

  private async effectiveTasks(client: PoolClient, tenantId: string, jobId: string, revision: string) {
    const plan = await this.plans.readEffectivePlan(client, [tenantId, jobId, revision]);
    return (plan?.tasks ?? []).map(task => ({ scopeItemId: task.scopeItemId, taskKey: task.key }));
  }

  private async frozenRows(client: PoolClient, tenantId: string, jobId: string, revision: string): Promise<FrozenStage[]> {
    const { rows } = await client.query<{index: number; at: string; countedApprovalIds: string[]; amountPence: string}>(`
      SELECT stage_index AS index, counted_approval_ids AS "countedApprovalIds", amount_pence AS "amountPence",
        to_char(due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
      FROM app.v2_payment_stage_due WHERE (tenant_id,job_id,quote_revision_id)=($1,$2,$3)`, [tenantId, jobId, revision]);
    return rows.map(row => ({ index: row.index, at: row.at, countedApprovalIds: row.countedApprovalIds,
      amountPence: Number(row.amountPence) }));
  }

  /** K5A-2: freeze the stages this command makes due, in its transaction, with one audit event each. */
  private async freeze(db: TenantTransaction, total: number, saved: Saved, indexes: number[],
    at: string, commandId: string, actorId: string) {
    if (!indexes.length) return;
    const client = db.$client;
    const key = [saved.tenant_id, saved.job_id, saved.quote_revision_id] as const;
    const { facts, approvalIds } = await this.facts(client, key[0], key[1], saved);
    const pending = indexes.map(index => ({ index, at, countedApprovalIds: approvalIds }));
    const { amounts } = replayPaymentSchedule(total, saved.stages, facts, await this.clock(client),
      [...await this.frozenRows(client, ...key), ...pending]);
    const countedHash = createHash("sha256").update([...approvalIds].sort().join(",")).digest("hex");
    for (const index of indexes) {
      await client.query(`INSERT INTO app.v2_payment_stage_due
        (tenant_id,job_id,quote_revision_id,stage_index,command_id,due_at,amount_pence,counted_approval_ids)
        VALUES($1,$2,$3,$4,$5,$6::timestamptz,$7,$8::uuid[])`, [...key, index, commandId, at, amounts[index], approvalIds]);
    }
    await appendAuditBatch(db, indexes.map(index => ({ id: randomUUID(), version: "audit.v1" as const,
      actorRef: `membership:${actorId}`, eventType: "v2.billing_stage.due_frozen", subjectType: "job", subjectRef: key[1],
      payload: { references: { commandId, quoteRevisionId: key[2], stageIndex: String(index), countedApprovalsHash: countedHash },
        classifications: { action: "operational" as const } } })));
  }
}

const hasTask = (tasks: {scopeItemId: string; taskKey: string}[], scopeItemId: string, taskKey: string) =>
  tasks.some(task => task.scopeItemId === scopeItemId && task.taskKey === taskKey);
export type PaymentScheduleView = Awaited<ReturnType<PaymentScheduleRepository["read"]>>;
