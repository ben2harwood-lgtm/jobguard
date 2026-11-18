import { WorkerActionExecutor, reconcileWorkerAction } from "./worker-action-executor.js";
import { outboundWorkerPool } from "./worker-pool.js";
import { appendAuditBatch } from "./audit.js";
import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export const outboundActionV1Schema=z.object({version:z.literal("outbound-action.v1"),id:z.guid({ error: "Invalid uuid" }),authorizationId:z.guid({ error: "Invalid uuid" }),adapter:z.string().regex(/^fake_/u),providerEffectKey:z.string().min(1).max(300),actionType:z.string().min(1).max(100),recipient:z.string().max(320).nullable(),contentHash:z.string().regex(/^[a-f0-9]{64}$/u),immutableContent:z.string().max(1_000_000),aggregateRevision:z.number().int().nonnegative(),amountPence:z.number().int().nonnegative().nullable(),currency:z.literal("GBP").nullable(),policyVersion:z.string().min(1).max(80),authorizationExpiresAt:z.coerce.date()}).strict();
export type OutboundAction=z.infer<typeof outboundActionV1Schema>;
export async function appendOutboundAction(db:TenantTransaction,tenantId:string,raw:unknown){const a=outboundActionV1Schema.parse(raw);if(createHash("sha256").update(a.immutableContent).digest("hex")!==a.contentHash)throw new Error("CONTENT_HASH_MISMATCH");await db.$client.query(`INSERT INTO app.action_outbox(id,tenant_id,authorization_id,adapter,provider_effect_key,action_type,recipient,content_hash,immutable_content,aggregate_revision,amount_pence,currency,policy_version,authorization_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[a.id,tenantId,a.authorizationId,a.adapter,a.providerEffectKey,a.actionType,a.recipient,a.contentHash,a.immutableContent,a.aggregateRevision,a.amountPence,a.currency,a.policyVersion,a.authorizationExpiresAt]);}
export type FakeDeliveryResult={kind:"succeeded";providerReference:string}|{kind:"retryable";code:string}|{kind:"outcome_unknown";code:string};
/** signinLink is transient delivery input; adapters must never persist it in outbox, audit or telemetry. */
export interface OutboundAdapter {readonly name:`fake_${string}`;readonly supportsProviderDeduplication:boolean;deliver(action:Readonly<OutboundAction>, signinLink?:string):Promise<FakeDeliveryResult>;reconcile(providerEffectKey:string):Promise<"succeeded"|"not_found"|"unknown">;}
/** The stored nonce is not a credential. Only the identity HMAC key can materialize it. */
export function customerSigninLink(reference: string, digest: (value: string) => string): string {
  const match = /^customer-signin-reference\.v1:([a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36})\/([A-Za-z0-9_-]{43})$/u.exec(reference);
  if (!match) throw new Error("INVALID_CUSTOMER_SIGNIN_REFERENCE");
  for (const id of match[1]!.split("/")) z.guid().parse(id);
  const secret = z.string().regex(/^[a-f0-9]{64}$/u).parse(digest(`customer-delivery:${reference}`));
  return `/customer/sign-in#${match[1]}/${Buffer.from(secret, "hex").toString("base64url")}`;
}
export interface SafeTelemetry{emit(name:"outbox.queue_age"|"outbox.failure"|"outbox.retry"|"outbox.unknown_outcome",fields:Readonly<Record<string,string|number>>):void;}
/** Terminal refusal: no adapter call or delivery attempt is made. */
export type OutboxRevocationRefusal = { kind: "cancelled"; code: "AUTHORIZATION_REVOKED" };

/** Compatibility facade: execution always uses a separate worker credential. */
export class ActionExecutor {
  constructor(private pool: Pool, private adapters: Map<string, OutboundAdapter>, private telemetry: SafeTelemetry,
    private customerSigninDigest?: (value: string) => string) {}
  async execute(context: VerifiedTenantContext, id: string, beforeClaim?: (actionType: string) => void) {
    const visible = await withTenant(this.pool, context, async db =>
      (await db.$client.query("SELECT id FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [context.tenantId, id])).rowCount === 1);
    if (!visible) return;
    return new WorkerActionExecutor(await outboundWorkerPool(this.pool), this.adapters, this.telemetry, this.customerSigninDigest).execute(id, beforeClaim);
  }
}

/** Only cancel/retry controls; this entry point cannot claim or report delivery. */
export async function operateOutbox(pool: Pool, context: VerifiedTenantContext, id: string, command: "retry" | "cancel", _safeRetry = false) {
  return withTenant(pool, context, async db => {
    const result = await db.$client.query<{ changed: boolean }>("SELECT app.control_outbox($1::uuid,$2::text) AS changed", [id, command]);
    if (!result.rows[0]?.changed) throw new Error("UNSAFE_OUTBOX_COMMAND");
    await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: "system:outbox",
      eventType: `outbox.${command === "cancel" ? "cancelled" : "retryable"}`, subjectType: "outbox_action", subjectRef: id,
      payload: { references: { reason: `operator_${command}` }, classifications: { outcome: "operational" } } }]);
  }).catch(error => {
    if ((error as { code?: string }).code === "42501") throw new Error("UNSAFE_OUTBOX_COMMAND");
    throw error;
  });
}
export async function reconcileOutbox(pool: Pool, context: VerifiedTenantContext, id: string, adapter: OutboundAdapter) {
  const visible = await withTenant(pool, context, async db =>
    (await db.$client.query("SELECT id FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [context.tenantId, id])).rowCount === 1);
  if (!visible) throw new Error("NOT_RECONCILABLE");
  return reconcileWorkerAction(await outboundWorkerPool(pool), id, adapter);
}
export interface ProviderSignatureVerifier{verify(rawBody:Uint8Array,signature:string):Promise<boolean>}
export async function ingestProviderEvent(db:TenantTransaction,tenantId:string,input:{adapter:`fake_${string}`;providerEventId:string;providerEffectKey:string;eventKind:string;occurredAt:Date;rawBody:Uint8Array;signature:string},verifier:ProviderSignatureVerifier){const verified=await verifier.verify(input.rawBody,input.signature);if(!verified)throw new Error("INVALID_PROVIDER_SIGNATURE");const hash=createHash("sha256").update(input.rawBody).digest("hex");await db.$client.query(`INSERT INTO app.provider_event_inbox(id,tenant_id,adapter,provider_event_id,provider_effect_key,event_kind,occurred_at,payload_hash,signature_verified) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT DO NOTHING`,[randomUUID(),tenantId,input.adapter,input.providerEventId,input.providerEffectKey,input.eventKind,input.occurredAt,hash]);}
