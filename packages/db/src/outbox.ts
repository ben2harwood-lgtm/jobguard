import { serverEntitlement } from "./plan-entitlement-service.js";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export const outboundActionV1Schema=z.object({version:z.literal("outbound-action.v1"),id:z.guid({ error: "Invalid uuid" }),authorizationId:z.guid({ error: "Invalid uuid" }),adapter:z.string().regex(/^fake_/u),providerEffectKey:z.string().min(1).max(300),actionType:z.string().min(1).max(100),recipient:z.string().max(320).nullable(),contentHash:z.string().regex(/^[a-f0-9]{64}$/u),immutableContent:z.string().max(1_000_000),aggregateRevision:z.number().int().nonnegative(),amountPence:z.number().int().nonnegative().nullable(),currency:z.literal("GBP").nullable(),policyVersion:z.string().min(1).max(80),authorizationExpiresAt:z.coerce.date()}).strict();
export type OutboundAction=z.infer<typeof outboundActionV1Schema>;
export async function appendOutboundAction(db:TenantTransaction,tenantId:string,raw:unknown){const a=outboundActionV1Schema.parse(raw);if(createHash("sha256").update(a.immutableContent).digest("hex")!==a.contentHash)throw new Error("CONTENT_HASH_MISMATCH");await db.$client.query(`INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[a.id,tenantId,a.authorizationId,a.adapter,a.providerEffectKey,a.actionType,a.recipient,a.contentHash,a.immutableContent,a.aggregateRevision,a.amountPence,a.currency,a.policyVersion,a.authorizationExpiresAt]);}
export type FakeDeliveryResult={kind:"succeeded";providerReference:string}|{kind:"retryable";code:string}|{kind:"outcome_unknown";code:string};
export interface OutboundAdapter {readonly name:`fake_${string}`;readonly supportsProviderDeduplication:boolean;deliver(action:Readonly<OutboundAction>):Promise<FakeDeliveryResult>;reconcile(providerEffectKey:string):Promise<"succeeded"|"not_found"|"unknown">;}
export interface SafeTelemetry{emit(name:"outbox.queue_age"|"outbox.failure"|"outbox.retry"|"outbox.unknown_outcome",fields:Readonly<Record<string,string|number>>):void;}
const rowToAction=(r:any):OutboundAction=>outboundActionV1Schema.parse({version:"outbound-action.v1",id:r.id,authorizationId:r.authorization_id,adapter:r.adapter,providerEffectKey:r.provider_effect_key,actionType:r.action_type,recipient:r.recipient,contentHash:r.content_hash,immutableContent:r.immutable_content,aggregateRevision:r.aggregate_revision,amountPence:r.amount_pence===null?null:Number(r.amount_pence),currency:r.currency,policyVersion:r.policy_version,authorizationExpiresAt:r.authorization_expires_at});
/** Terminal refusal: no adapter call or delivery attempt is made. */
export type OutboxRevocationRefusal = { kind: "cancelled"; code: "AUTHORIZATION_REVOKED" };

async function cancelRevokedAction(db: TenantTransaction, id: string, adapters: readonly string[]): Promise<OutboxRevocationRefusal | undefined> {
  // A failed authority lookup must not leave revoked work eligible for blind retry.
  // Scope both the authorization and revocation to the action's tenant and author.
  const cancelled = await db.$client.query<{ id: string }>(`UPDATE app.action_outbox o SET status='cancelled',updated_at=clock_timestamp()
    FROM app.action_authorization a
    JOIN app.membership m ON m.tenant_id=a.tenant_id AND m.id=a.actor_membership_id
    JOIN app.contractor_membership_revocation revoked
      ON revoked.tenant_id=m.tenant_id AND revoked.membership_id=m.id
    WHERE o.id=$1 AND o.adapter=ANY($2::text[]) AND o.status IN ('pending','retryable')
      AND a.tenant_id=o.tenant_id AND a.id=o.authorization_id
      AND revoked.membership_id IS NOT NULL
    RETURNING o.id`, [id, adapters]);
  if (!cancelled.rows.length) return;
  await appendAuditBatch(db, [{
    id: randomUUID(), version: "audit.v1", actorRef: "system:outbox",
    eventType: "outbox.authorization_revoked", subjectType: "outbox_action", subjectRef: id,
    payload: { references: { outcome: "cancelled", code: "AUTHORIZATION_REVOKED" }, classifications: { action: "security" } },
  }]);
  return { kind: "cancelled", code: "AUTHORIZATION_REVOKED" };
}

// Append only after all business writes. Reconciliation evidence and the resulting
// state share this commit; callers cannot manufacture evidence with safeRetry.
async function auditOutcome(db: TenantTransaction, id: string, status: string, references: Record<string, string> = {}) {
  await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: "system:outbox",
    eventType: `outbox.${status}`, subjectType: "outbox_action", subjectRef: id,
    payload: { references, classifications: { outcome: "operational" } } }]);
}

export class ActionExecutor {
  constructor(private pool: Pool, private adapters: Map<string, OutboundAdapter>, private telemetry: SafeTelemetry) {}

  async execute(context: VerifiedTenantContext, id: string) {
    let action: OutboundAction | undefined;
    let attempt = 0;
    let refusal: OutboxRevocationRefusal | undefined;
    await withTenant(this.pool, context, async db => {
      await db.$client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1::text,54))`, [context.tenantId]);
      const r = (await db.$client.query<any>(`SELECT o.*,a.actor_membership_id AS authorization_actor FROM app.action_outbox o JOIN app.action_authorization a ON a.tenant_id=o.tenant_id AND a.id=o.authorization_id JOIN app.decision_resolution r ON r.tenant_id=a.tenant_id AND r.id=a.resolution_id AND r.resolution='approved' JOIN app.membership m ON m.tenant_id=a.tenant_id AND m.id=a.actor_membership_id AND m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp()) WHERE o.id=$1 AND NOT EXISTS(SELECT 1 FROM app.contractor_membership_revocation revoked WHERE revoked.tenant_id=m.tenant_id AND revoked.membership_id=m.id) AND a.revoked_at IS NULL AND o.action_type=a.action_type AND o.recipient IS NOT DISTINCT FROM a.recipient AND o.content_hash=a.content_hash AND o.aggregate_revision=a.aggregate_revision AND o.amount_pence IS NOT DISTINCT FROM a.amount_pence AND o.currency IS NOT DISTINCT FROM a.currency AND o.policy_version=a.policy_version AND o.authorization_expires_at<=a.expires_at AND (o.status='executing' OR o.next_attempt_at<=clock_timestamp()) FOR UPDATE OF o`, [id])).rows[0];
      if (!r) { refusal = await cancelRevokedAction(db, id, [...this.adapters.keys()]); return; }
      if (!this.adapters.has(r.adapter)) return;
      if (r.status === "executing" && new Date(r.claimed_at).getTime() < Date.now() - 300_000) {
        await db.$client.query(`UPDATE app.action_outbox SET status='outcome_unknown',updated_at=clock_timestamp() WHERE id=$1`, [id]);
        await auditOutcome(db, id, "outcome_unknown", { reason: "stale_claim" });
        this.telemetry.emit("outbox.unknown_outcome", { actionId: id, reason: "stale_claim" });
        return;
      }
      if (!["pending", "retryable"].includes(r.status)) return;
      this.telemetry.emit("outbox.queue_age", { actionId: id, seconds: Math.max(0, (Date.now() - new Date(r.created_at).getTime()) / 1000) });
      if (new Date(r.authorization_expires_at) <= new Date()) {
        await db.$client.query(`UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE id=$1`, [id]);
        await auditOutcome(db, id, "cancelled", { reason: "authorization_expired" });
        return;
      }
      // MON-8: eligibility is current at the claim, not inherited from an earlier approval.
      // Contractor checks use the tenant lock already held here; no subscription/business lock is added.
      if (r.action_type === "extra.client_approval_request.send" && !(await serverEntitlement(db, r.authorization_actor, "approval_chains")).executable) {
        await db.$client.query("UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE id=$1", [id]);
        await auditOutcome(db, id, "cancelled", { reason: "entitlement_lost" });
        return;
      }
      action = rowToAction(r);
      attempt = Number((await db.$client.query(`SELECT count(*)::int n FROM app.action_attempt WHERE action_id=$1`, [id])).rows[0].n) + 1;
      await db.$client.query(`UPDATE app.action_outbox SET status='executing',claimed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`, [id]);
      await db.$client.query(`INSERT INTO app.action_attempt(id,tenant_id,action_id,attempt_number,outcome) VALUES($1,$2,$3,$4,'started')`, [randomUUID(), context.tenantId, id, attempt]);
    });
    if (!action) return refusal;
    const adapter = this.adapters.get(action.adapter);
    if (!adapter) throw new Error("FAKE_ADAPTER_NOT_REGISTERED");
    const result = await adapter.deliver(Object.freeze(action));
    await withTenant(this.pool, context, async db => {
      const status = result.kind === "retryable" && attempt >= 5 ? "dead_letter" : result.kind;
      if (status === "dead_letter") this.telemetry.emit("outbox.failure", { actionId: id, attempt });
      const updated = await db.$client.query(`UPDATE app.action_outbox SET status=$2,completed_at=CASE WHEN $3='succeeded' THEN clock_timestamp() END,next_attempt_at=CASE WHEN $4='retryable' THEN clock_timestamp()+interval '1 minute' ELSE next_attempt_at END,updated_at=clock_timestamp() WHERE id=$1 AND status='executing'`, [id, status, status, status]);
      if (updated.rowCount === 0) return;
      await db.$client.query(`UPDATE app.action_attempt SET outcome=$3,provider_reference=$4,error_code=$5,finished_at=clock_timestamp() WHERE action_id=$1 AND attempt_number=$2`, [id, attempt, status === "dead_letter" ? "failed" : status, result.kind === "succeeded" ? result.providerReference : null, result.kind === "succeeded" ? null : result.code]);
      await auditOutcome(db, id, status);
    });
    if (result.kind === "outcome_unknown") this.telemetry.emit("outbox.unknown_outcome", { actionId: id, attempt });
    else if (result.kind === "retryable") this.telemetry.emit("outbox.retry", { actionId: id, attempt });
  }
}

/** Legacy boolean retained for call compatibility; never a source of retry authority. */
export async function operateOutbox(pool: Pool, context: VerifiedTenantContext, id: string, command: "retry" | "cancel", _safeRetry = false) {
  return withTenant(pool, context, async db => {
    const r = await db.$client.query<{ status: string }>(`SELECT status FROM app.action_outbox WHERE id=$1 FOR UPDATE`, [id]);
    const status = r.rows[0]?.status;
    if (command === "cancel" && status && ["pending", "retryable", "dead_letter", "outcome_unknown"].includes(status)) {
      await db.$client.query(`UPDATE app.action_outbox SET status='cancelled',updated_at=clock_timestamp() WHERE id=$1`, [id]);
      await auditOutcome(db, id, "cancelled", { reason: "operator_cancel" });
      return;
    }
    if (command === "retry" && status === "retryable") {
      await db.$client.query(`UPDATE app.action_outbox SET status='retryable',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1`, [id]);
      await auditOutcome(db, id, "retryable", { reason: "operator_retry" });
      return;
    }
    throw new Error("UNSAFE_OUTBOX_COMMAND");
  });
}

export async function reconcileOutbox(pool: Pool, context: VerifiedTenantContext, id: string, adapter: OutboundAdapter) {
  // Preserve full timestamp precision in the compare-and-set across the network call.
  const effect = await withTenant(pool, context, async db => (await db.$client.query<{
    provider_effect_key: string; status: string; adapter: string; revision: string;
  }>(`SELECT provider_effect_key,status,adapter,updated_at::text AS revision FROM app.action_outbox WHERE id=$1`, [id])).rows[0]);
  if (!effect || effect.status !== "outcome_unknown" || effect.adapter !== adapter.name) throw new Error("NOT_RECONCILABLE");
  const result = await adapter.reconcile(effect.provider_effect_key);
  if (result === "unknown") return result;
  await withTenant(pool, context, async db => {
    const status = result === "succeeded" ? "succeeded" : "retryable";
    const updated = await db.$client.query(`UPDATE app.action_outbox SET status=$2,next_attempt_at=clock_timestamp(),
      completed_at=CASE WHEN $3='succeeded' THEN clock_timestamp() END,updated_at=clock_timestamp()
      WHERE id=$1 AND status='outcome_unknown' AND adapter=$4 AND provider_effect_key=$5 AND updated_at=$6::timestamptz`,
    [id, status, status, adapter.name, effect.provider_effect_key, effect.revision]);
    if (updated.rowCount === 0) return;
    await auditOutcome(db, id, status, { reconciliation: result, adapter: adapter.name });
  });
  return result;
}
export interface ProviderSignatureVerifier{verify(rawBody:Uint8Array,signature:string):Promise<boolean>}
export async function ingestProviderEvent(db:TenantTransaction,tenantId:string,input:{adapter:`fake_${string}`;providerEventId:string;providerEffectKey:string;eventKind:string;occurredAt:Date;rawBody:Uint8Array;signature:string},verifier:ProviderSignatureVerifier){const verified=await verifier.verify(input.rawBody,input.signature);if(!verified)throw new Error("INVALID_PROVIDER_SIGNATURE");const hash=createHash("sha256").update(input.rawBody).digest("hex");await db.$client.query(`INSERT INTO app.provider_event_inbox(id,tenant_id,adapter,provider_event_id,provider_effect_key,event_kind,occurred_at,payload_hash,signature_verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT DO NOTHING`,[randomUUID(),tenantId,input.adapter,input.providerEventId,input.providerEffectKey,input.eventKind,input.occurredAt,hash]);}
