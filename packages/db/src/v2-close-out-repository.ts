import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { v2CloseOutReview, type V2CloseOutReview } from "@jobguard/core";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { WorkPlanRepository } from "./v2-work-plan-repository.js";
import { PaymentScheduleError } from "./v2-payment-schedule.js";

const uuid = z.guid();
const v2 = () => process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.JOBGUARD_ENV === "synthetic_demo";

/** The per-tenant lock K5B-1's schedule and draft commands take first. */
async function scheduleLock(client: PoolClient, tenantId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`v2-schedule:${tenantId}`]);
}
async function hasDraftTables(client: PoolClient) {
  return (await client.query<{ ok: boolean }>("SELECT to_regclass('app.v2_stage_invoice_draft') IS NOT NULL AS ok")).rows[0]?.ok === true;
}
async function liveDrafts(client: PoolClient, tenantId: string, jobId: string) {
  if (!await hasDraftTables(client)) return 0;
  return (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM app.v2_stage_invoice_draft d
    WHERE (d.tenant_id,d.job_id)=($1,$2) AND NOT EXISTS (SELECT 1 FROM app.v2_stage_invoice_draft_withdrawal w
      WHERE (w.tenant_id,w.job_id,w.quote_revision_id,w.stage_index,w.draft_no)=(d.tenant_id,d.job_id,d.quote_revision_id,d.stage_index,d.draft_no))`,
  [tenantId, jobId])).rows[0]!.n;
}

/**
 * V2-G6 lock guard, called first in the final-account lock's own transaction on the local V2 practice stack only.
 * It takes K5B-1's schedule lock before the lock's job and variation locks, so a stage draft and the lock are
 * serialised: while any draft is live the lock refuses and writes nothing. Off V2 it does nothing.
 */
export async function assertNoLiveStageDraft(client: PoolClient, tenantId: string, jobId: string) {
  if (!v2() || !await hasDraftTables(client)) return;
  await scheduleLock(client, tenantId);
  if (await liveDrafts(client, tenantId, jobId)) throw new PaymentScheduleError("V2_STAGE_DRAFT_OPEN");
}

/** V2-G6 draft guard: called by draftStage after it takes the same schedule lock. */
export async function assertFinalAccountOpen(client: PoolClient, tenantId: string, jobId: string) {
  if ((await client.query("SELECT 1 FROM app.final_account_lock WHERE (tenant_id,job_id)=($1,$2)", [tenantId, jobId])).rowCount) {
    throw new PaymentScheduleError("FINAL_ACCOUNT_LOCKED");
  }
}

// Approved extras still outside the plan: those the plan cannot place (omissions, zero-value) and approved
// additions waiting in Unplanned because no template task matched (an unknown trade). Each scope item counts once.
function extrasWaiting(plan: { extrasNotPlanned: { scopeItemId: string }[]; unplanned: { scopeItemId: string }[];
  scopeItems: { scopeItemId: string; variationRevisionId?: string }[] } | null) {
  if (!plan) return 0;
  const approved = new Set(plan.scopeItems.filter(item => item.variationRevisionId).map(item => item.scopeItemId));
  return new Set([...plan.extrasNotPlanned.map(item => item.scopeItemId),
    ...plan.unplanned.filter(item => approved.has(item.scopeItemId)).map(item => item.scopeItemId)]).size;
}

/** V2-G6: the facts behind "Before you close this job", read in one tenant transaction. Read only; nothing is stored. */
export class V2CloseOutRepository {
  constructor(private readonly pool: Pool) {}

  async review(context: VerifiedTenantContext, jobId: string): Promise<V2CloseOutReview | null> {
    if (!v2()) throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    uuid.parse(jobId);
    return withTenant(this.pool, context, async ({ $client: client }) => {
      const { rows: [head] } = await client.query<{ revision: string }>(`SELECT q.quote_revision_id AS revision
        FROM app.job j JOIN app.quote_document_version q ON (q.tenant_id,q.job_id,q.id)=(j.tenant_id,j.id,j.accepted_quote_version_id)
        WHERE (j.tenant_id,j.id)=($1,$2)`, [context.tenantId, jobId]);
      // Close-out starts once a quote is accepted.
      if (!head) return null;
      const plan = await new WorkPlanRepository(this.pool).readEffectivePlan(client, [context.tenantId, jobId, head.revision]);
      const done = new Set((await client.query<{ key: string }>(`SELECT scope_item_id::text||'/'||template_task_key AS key
        FROM app.v2_payment_schedule_task_done WHERE (tenant_id,job_id,quote_revision_id)=($1,$2,$3)`,
      [context.tenantId, jobId, head.revision])).rows.map(row => row.key));
      // Main's own rule: the final account's current revision records mandatory_proof_missing findings.
      const { rows: [proof] } = await client.query<{ n: number }>(`SELECT count(*)::int AS n
        FROM app.final_account_draft d JOIN app.final_account_revision r ON (r.tenant_id,r.job_id,r.id)=(d.tenant_id,d.job_id,d.current_revision_id)
        CROSS JOIN LATERAL jsonb_array_elements(r.findings) f WHERE (d.tenant_id,d.job_id)=($1,$2) AND f->>'code'='mandatory_proof_missing'`,
      [context.tenantId, jobId]);
      return v2CloseOutReview({ jobId,
        openTasks: (plan?.tasks ?? []).filter(task => !done.has(`${task.scopeItemId}/${task.key}`)).length,
        extrasNotPlanned: extrasWaiting(plan),
        stageDraftsOpen: await liveDrafts(client, context.tenantId, jobId),
        proofMissing: proof?.n ?? 0 });
    });
  }
}
