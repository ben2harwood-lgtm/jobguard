import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch, withTenant, type VerifiedTenantContext } from "@jobguard/db";
import { assertAcyclicDependencies } from "@jobguard/core";
import { ReadinessSeamError, scopeV1 } from "./readiness-adapters.js";
import { scheduledPlanV1, type ReadinessProposal, type ReadinessSchedulePorts } from "./readiness-scheduler.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const proposalV1 = z.object({
  version: z.literal("readiness-prevention-proposal.v1"), scope: scopeV1, key: digest,
  planHash: digest, ruleRevision: z.literal("readiness-scheduled.v1"), evaluatedAt: z.iso.datetime(),
  ready: z.boolean(), reasons: z.array(z.string().max(200)), weather: z.union([z.boolean(), z.literal("unknown")]),
  classification: z.literal("prevention"), feeEligible: z.literal(false), recoveryFeePence: z.literal(0),
  status: z.literal("proposal"), programmeChanged: z.literal(false),
}).strict().refine(p => p.ready === (p.reasons.length === 0) && !(p.ready && p.weather !== true));

/** Opt-in synthetic composition only; never registered in the live application or worker. */
export class DurableReadinessStore implements ReadinessSchedulePorts {
  constructor(private readonly pool: Pool, private readonly context: VerifiedTenantContext, private readonly mode = "disabled") {}
  private assertDark(): void {
    if (this.mode !== "synthetic_demo") throw new ReadinessSeamError("READINESS_LIVE_DISABLED");
  }
  private scope(raw: unknown) {
    this.assertDark();
    const parsed = scopeV1.safeParse(raw);
    if (!parsed.success) throw new ReadinessSeamError("INVALID_READINESS_PLAN");
    return parsed.data;
  }
  async confirm(raw: unknown, actorRef: string): Promise<void> {
    this.assertDark();
    const parsed = scheduledPlanV1.safeParse(raw);
    if (!parsed.success) throw new ReadinessSeamError("INVALID_READINESS_PLAN");
    const plan = parsed.data, scope = this.scope(plan.scope);
    if (scope.tenantId !== this.context.tenantId) throw new ReadinessSeamError("READINESS_SCOPE_MISMATCH");
    assertAcyclicDependencies(plan.edges);
    const planHash = hash(plan);
    await withTenant(this.pool, this.context, async db => {
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`readiness-store:${scope.tenantId}:${scope.jobId}:${scope.taskId}`]);
      const previous = (await db.$client.query<{ fact_revision: number; plan_hash: string }>(
        `SELECT fact_revision,plan_hash FROM app.scheduled_readiness_plan WHERE tenant_id=$1 AND job_id=$2 AND task_id=$3 ORDER BY fact_revision DESC LIMIT 1`,
        [scope.tenantId, scope.jobId, scope.taskId])).rows[0];
      const replay = (await db.$client.query<{ plan_hash: string }>(
        `SELECT plan_hash FROM app.scheduled_readiness_plan WHERE tenant_id=$1 AND job_id=$2 AND task_id=$3 AND fact_revision=$4`,
        [scope.tenantId, scope.jobId, scope.taskId, plan.factRevision])).rows[0];
      if (replay?.plan_hash === planHash) return;
      if (replay || (previous && previous.fact_revision >= plan.factRevision)) throw new ReadinessSeamError("READINESS_STORE_CONFLICT");
      const auditId = randomUUID();
      await db.$client.query(`INSERT INTO app.scheduled_readiness_plan(tenant_id,job_id,task_id,fact_revision,plan_hash,payload,audit_event_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [scope.tenantId, scope.jobId, scope.taskId, plan.factRevision, planHash, plan, auditId]);
      await appendAuditBatch(db, [{ id: auditId, version: "audit.v1", actorRef, eventType: "readiness.scheduled_plan_confirmed", subjectType: "job", subjectRef: scope.jobId,
        payload: { references: { taskId: scope.taskId }, hashes: { planHash }, classifications: { action: "operational" } } }]);
    });
  }
  async load(raw: unknown): Promise<unknown> {
    const scope = this.scope(raw);
    if (scope.tenantId !== this.context.tenantId) return null;
    return withTenant(this.pool, this.context, async db => (await db.$client.query(
      `SELECT payload FROM app.scheduled_readiness_plan WHERE tenant_id=$1 AND job_id=$2 AND task_id=$3 ORDER BY fact_revision DESC LIMIT 1`,
      [scope.tenantId, scope.jobId, scope.taskId])).rows[0]?.payload ?? null);
  }
  async recordProposal(raw: unknown): Promise<void> {
    this.assertDark();
    const parsed = proposalV1.safeParse(raw);
    if (!parsed.success) throw new ReadinessSeamError("INVALID_READINESS_PROPOSAL");
    const scope = this.scope(parsed.data.scope);
    if (scope.tenantId !== this.context.tenantId) throw new ReadinessSeamError("READINESS_SCOPE_MISMATCH");
    const proposal = parsed.data;
    await withTenant(this.pool, this.context, async db => {
      // Serialize against plan confirmation before taking the audit head (the final lock).
      await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`readiness-store:${scope.tenantId}:${scope.jobId}:${scope.taskId}`]);
      const current = (await db.$client.query(`SELECT plan_hash,payload FROM app.scheduled_readiness_plan WHERE tenant_id=$1 AND job_id=$2 AND task_id=$3 ORDER BY fact_revision DESC LIMIT 1`,
        [scope.tenantId, scope.jobId, scope.taskId])).rows[0];
      if (!current || current.plan_hash !== proposal.planHash || current.payload.status !== "confirmed") throw new ReadinessSeamError("READINESS_STORE_CONFLICT");
      const auditId = randomUUID();
      const inserted = await db.$client.query(`INSERT INTO app.scheduled_readiness_proposal(tenant_id,job_id,task_id,proposal_key,plan_hash,payload,audit_event_id)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(tenant_id,proposal_key) DO NOTHING RETURNING proposal_key`,
        [scope.tenantId, scope.jobId, scope.taskId, proposal.key, proposal.planHash, proposal, auditId]);
      if (!inserted.rowCount) {
        const same = await db.$client.query(`SELECT 1 FROM app.scheduled_readiness_proposal WHERE tenant_id=$1 AND proposal_key=$2 AND payload-'evaluatedAt'=$3::jsonb-'evaluatedAt'`,
          [scope.tenantId, proposal.key, proposal]);
        if (!same.rowCount) throw new ReadinessSeamError("READINESS_STORE_CONFLICT");
        return;
      }
      await appendAuditBatch(db, [{ id: auditId, version: "audit.v1", actorRef: "system:readiness-rule", eventType: "readiness.scheduled_proposal_recorded", subjectType: "job", subjectRef: scope.jobId,
        payload: { references: { taskId: scope.taskId }, hashes: { planHash: proposal.planHash, proposalKey: proposal.key }, classifications: { action: "operational" } } }]);
    });
  }
  async proposals(raw: unknown): Promise<readonly ReadinessProposal[]> {
    const scope = this.scope(raw);
    if (scope.tenantId !== this.context.tenantId) return [];
    return withTenant(this.pool, this.context, async db => {
      const rows = await db.$client.query(`SELECT payload FROM app.scheduled_readiness_proposal WHERE tenant_id=$1 AND job_id=$2 AND task_id=$3 ORDER BY created_at,proposal_key`, [scope.tenantId, scope.jobId, scope.taskId]);
      return rows.rows.map(row => proposalV1.parse(row.payload));
    });
  }
}
