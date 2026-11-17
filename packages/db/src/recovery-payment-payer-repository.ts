import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { RECOVERY_PAYMENT_PAYER_REFUSALS, recoveryPaymentPayerCommandV1, recoveryPaymentPayerMarkResultV1, RecoveryPaymentPayerError, type RecoveryPaymentPayerMarkResult } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

export class RecoveryPaymentPayerRepository {
 constructor(private readonly pool: Pool, private readonly environment = process.env.JOBGUARD_ENV ?? "unconfigured") {}
 async command(context: VerifiedTenantContext, jobId: string, raw: unknown, actor: Readonly<{ membershipId: string; identityUserId: string }>, sessionDigest: string): Promise<RecoveryPaymentPayerMarkResult> {
  if (this.environment !== "synthetic_demo") throw new RecoveryPaymentPayerError("PAYER_MARK_FORBIDDEN");
  const parsed = recoveryPaymentPayerCommandV1.safeParse(raw);
  if (!parsed.success) throw new RecoveryPaymentPayerError("INVALID_COMMAND");
  const p = parsed.data, job = jobId.toLowerCase();
  const input = { ...p, commandId: p.commandId.toLowerCase(), caseId: p.caseId.toLowerCase(), sourceEventId: p.sourceEventId.toLowerCase(), ...(p.action === "mark_customer_own" ? { evidenceId: p.evidenceId.toLowerCase() } : {}) };
  return withTenant(this.pool, context, async db => {
   await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
   const member = await db.$client.query(`SELECT 1 FROM app.membership m JOIN app.authenticate_practice_session($4) p
    ON p.tenant_id=m.tenant_id AND p.membership_id=m.id AND p.identity_user_id=m.identity_user_id
    WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND m.role='owner' AND m.revoked_at IS NULL
    AND (m.expires_at IS NULL OR m.expires_at>transaction_timestamp()) FOR SHARE OF m`, [context.tenantId, actor.membershipId, actor.identityUserId, sessionDigest]);
   if (member.rowCount !== 1) throw new RecoveryPaymentPayerError("PAYER_MARK_FORBIDDEN");
   if (!(await db.$client.query(`SELECT 1 FROM app.job WHERE tenant_id=$1 AND id=$2 AND practice_session_digest=$3
    AND nullif(current_setting('app.practice_material_digest',true),'')=$3`, [context.tenantId, job, sessionDigest])).rowCount) throw new Error("RECOVERY_JOB_NOT_FOUND");
   const row = (await db.$client.query(`SELECT * FROM app.write_recovery_payment_payer_mark($1,$2,$3::jsonb)`, [context.tenantId, job, JSON.stringify(input)])).rows[0];
   const result = recoveryPaymentPayerMarkResultV1.parse({ id: row.id, revision: row.revision, sourceEventId: row.source_event_id, state: row.state, evidenceId: row.evidence_id });
   // A replay returns the stored immutable mark without a second audit append.
   const recorded = await db.$client.query(`SELECT 1 FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'markId'=$2
    AND event_type IN('recovery.payment_payer.marked','recovery.payment_payer.mark_withdrawn')`, [context.tenantId, result.id]);
   if (!recorded.rowCount) await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${row.actor_membership_id}`, eventType: result.state === "customer_own" ? "recovery.payment_payer.marked" : "recovery.payment_payer.mark_withdrawn", subjectType: "recovery_case", subjectRef: input.caseId,
    payload: { references: { jobId: job, markId: result.id, commandId: input.commandId, sourceEventId: result.sourceEventId, payingPartyBindingId: row.party_binding_id, ...(result.evidenceId ? { evidenceId: result.evidenceId } : {}) }, hashes: { command: row.payload_hash.trim() }, classifications: { recovery: "financial" } } }]);
   return result;
  }).catch((error: unknown) => {
   const failure = error as { code?: string; message?: string };
   if (["42501", "23514", "40001", "23505"].includes(failure?.code ?? "") && typeof failure?.message === "string") {
    if (RECOVERY_PAYMENT_PAYER_REFUSALS.some(code => code === failure.message)) throw new RecoveryPaymentPayerError(failure.message as typeof RECOVERY_PAYMENT_PAYER_REFUSALS[number]);
    if (["RECOVERY_JOB_NOT_FOUND", "RECOVERY_CASE_NOT_FOUND", "IDEMPOTENCY_PAYLOAD_CONFLICT", "INVALID_COMMAND"].includes(failure.message)) throw Object.assign(new Error(failure.message), { code: failure.message });
   }
   throw error;
  });
 }
}
