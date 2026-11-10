import { isRequestBindingRefusal } from "./request-binding-error.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { normalizePackRate, purchaseOrderNet } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { consequentialCommandV1Schema, UserCommandDispatcher } from "./commands.js";
import { appendOutboundAction } from "./outbox.js";
import { claimCommandIdentity, requestHashFor, requireLiveJob, runStoredCommand } from "./watchdog.js";
import { InvalidTenantContextError, withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { requireSyntheticOrders, readMerchantOrder, merchantOrderContent, orderContentHash, orderAmount,
  PurchaseOrderActionError } from "./purchase-order-action.js";

const uuid = z.guid({ error: "Invalid uuid" });
const scopeV1 = z.object({ version: z.literal("merchant-order-scope.v1"), jobId: uuid, revisionId: uuid }).strict();
const attestationV1 = z.object({ version: z.literal("manual-order-attestation.v1"), jobId: uuid, revisionId: uuid,
  commandId: uuid, supplierReference: z.string().regex(/^synthetic-[a-zA-Z0-9-]{1,80}$/u),
}).strict();

async function lockOrder(db: TenantTransaction, tenantId: string, jobId: string) {
  await requireLiveJob(db, jobId);
  await db.$client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`${tenantId}:${jobId}:watchdog-command`]);
  if ((await db.$client.query("SELECT 1 FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [tenantId, jobId])).rowCount)
    throw new PurchaseOrderActionError("ORDER_AUTHORITY_STALE");
}

/** Dark application seam only: no HTTP route, worker registration, provider endpoint or live enable switch. */
export class PurchaseOrderActionRepository {
  constructor(private readonly pool: Pool) {}

  async preview(context: VerifiedTenantContext, raw: unknown) {
    requireSyntheticOrders(); const scope = scopeV1.parse(raw);
    return withTenant(this.pool, context, async db => {
      await lockOrder(db, context.tenantId, scope.jobId);
      const order = await readMerchantOrder(db, context.tenantId, scope.jobId, scope.revisionId);
      const rate = normalizePackRate(order.line.agreedPricePence, order.line.packQuantity);
      if (rate.status !== "comparable") throw new PurchaseOrderActionError("ORDER_AUTHORITY_STALE");
      return { order, contentHash: orderContentHash(merchantOrderContent(order)), amountPence: orderAmount(order),
        stock: "unknown" as const, leadTime: "unknown" as const, realExternalActions: 0,
        finding: { rateId: order.line.rateId, rateVersion: order.line.rateVersion,
          aboveAgreedRate: orderAmount(order) > purchaseOrderNet(order.line.quantity, rate.eachPence),
          classification: "prevention" as const, feeEligible: false as const, feePence: 0 } };
    });
  }

  /** The explicit confirm action atomically creates the approved Decision and durable effect. */
  async approve(context: VerifiedTenantContext, rawScope: unknown, rawCommand: unknown) {
    requireSyntheticOrders(); const scope = scopeV1.parse(rawScope), command = consequentialCommandV1Schema.parse(rawCommand);
    if (command.semanticKey !== `merchant-order:${scope.jobId}:${scope.revisionId}` || command.commandType !== "purchase_order.send.dark" || command.subjectType !== "purchase_order"
      || command.subjectRef !== scope.revisionId || command.action.actionType !== "purchase_order.send.dark"
      || command.action.policyVersion !== "dark-merchant-order.v1" || command.action.currency !== "GBP")
      throw new PurchaseOrderActionError("ORDER_ACTION_INVALID");
    return new UserCommandDispatcher(this.pool).dispatch(context, command, {
      lock: async (db, parsed) => {
        await lockOrder(db, context.tenantId, scope.jobId);
        await claimCommandIdentity(db, { tenantId: context.tenantId, jobId: scope.jobId, kind: "purchase_order.place",
          commandId: parsed.commandId, requestHash: requestHashFor("purchase_order.place", scope.jobId, parsed) });
      },
      mutate: async (db, approved) => {
        const order = await readMerchantOrder(db, context.tenantId, scope.jobId, scope.revisionId);
        const content = merchantOrderContent(order);
        if (approved.action.contentHash !== orderContentHash(content) || approved.action.recipient !== order.recipient
          || approved.action.amountPence !== orderAmount(order) || approved.action.aggregateRevision !== order.revision)
          throw new PurchaseOrderActionError("ORDER_AUTHORITY_STALE");
        const placed = (await db.$client.query(`SELECT revision_id,outbox_action_id FROM app.purchase_order_placement
          WHERE tenant_id=$1 AND draft_id=$2`, [context.tenantId, order.draftId])).rows[0];
        // One business effect per draft, including the legacy simulated-placement route.
        if (placed) throw new PurchaseOrderActionError("ORDER_ALREADY_COMMITTED");
        if ((await db.$client.query("SELECT 1 FROM app.purchase_order_manual_attestation WHERE tenant_id=$1 AND draft_id=$2",
          [context.tenantId, order.draftId])).rowCount) throw new PurchaseOrderActionError("ORDER_ALREADY_COMMITTED");
        const outboxActionId = randomUUID(), placementId = randomUUID();
        await appendOutboundAction(db, context.tenantId, { version: "outbound-action.v1", id: outboxActionId,
          authorizationId: approved.authorizationId!, adapter: "fake_merchant_order",
          providerEffectKey: `merchant-order:${context.tenantId}:${order.draftId}`, actionType: approved.action.actionType,
          recipient: order.recipient, contentHash: approved.action.contentHash, immutableContent: content,
          aggregateRevision: order.revision, amountPence: orderAmount(order), currency: "GBP",
          policyVersion: "dark-merchant-order.v1", authorizationExpiresAt: approved.action.expiresAt });
        await db.$client.query(`INSERT INTO app.purchase_order_placement(id,tenant_id,job_id,draft_id,revision_id,
          authorization_id,outbox_action_id,command_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'simulated')`,
          [placementId, context.tenantId, scope.jobId, order.draftId, order.revisionId, approved.authorizationId, outboxActionId, approved.commandId]);
        return { placementId, outboxActionId, environment: "synthetic_demo", realExternalActions: 0 };
      },
      auditEvents: result => [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${command.actorMembershipId}`,
        eventType: "purchase_order.dark_queued", subjectType: "job", subjectRef: scope.jobId,
        payload: { references: { outboxActionId: result.outboxActionId }, hashes: { authorityHash: command.action.contentHash },
          classifications: { action: "commercial" } } }],
    });
  }

  /** Records the owner resolved from the authenticated session, never from the DTO. No provider confirmation. */
  async attestManual(context: VerifiedTenantContext, raw: unknown, actor: { sessionDigest: string }) {
    requireSyntheticOrders(); const input = attestationV1.parse(raw);
    const session = z.object({ sessionDigest: z.string().regex(/^[a-f0-9]{64}$/u) }).strict().safeParse(actor);
    if (!session.success) throw new InvalidTenantContextError();
    try { return await withTenant(this.pool, context, async db => {
      await lockOrder(db, context.tenantId, input.jobId);
      // A practice session resolves its fixed owner membership through the existing practice bridge; a company session uses 1203.
      const practice = (await db.$client.query(`SELECT a.membership_id FROM app.authenticate_practice_session($1,$2) a JOIN app.membership m ON (m.tenant_id,m.id)=($2,a.membership_id)
        WHERE m.role='owner' AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())`, [session.data.sessionDigest, context.tenantId])).rows[0]?.membership_id;
      const resolved = practice ?? (await db.$client.query("SELECT app.order_attestation_actor($1,$2) AS actor_id",
        [context.tenantId, session.data.sessionDigest])).rows[0]?.actor_id;
      if (!uuid.safeParse(resolved).success) throw new PurchaseOrderActionError("ORDER_ACTION_INVALID");
      const actorMembershipId = resolved as string;
      return runStoredCommand(db, { tenantId: context.tenantId, jobId: input.jobId, kind: "purchase_order.attest_manual",
        commandId: input.commandId, request: { ...input, actorMembershipId } }, { work: async () => {
        const order = await readMerchantOrder(db, context.tenantId, input.jobId, input.revisionId);
        if ((await db.$client.query("SELECT 1 FROM app.purchase_order_placement WHERE tenant_id=$1 AND draft_id=$2",
          [context.tenantId, order.draftId])).rowCount) throw new PurchaseOrderActionError("ORDER_ALREADY_COMMITTED");
        const id = randomUUID();
        await db.$client.query(`INSERT INTO app.purchase_order_manual_attestation(id,tenant_id,job_id,draft_id,revision_id,
          merchant_id,actor_membership_id,command_id,supplier_reference_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id, context.tenantId, input.jobId, order.draftId, order.revisionId, order.merchantId, actorMembershipId,
            input.commandId, orderContentHash(input.supplierReference)]);
        await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actorMembershipId}`,
          eventType: "purchase_order.manual_attested", subjectType: "job", subjectRef: input.jobId,
          payload: { references: { attestationId: id }, classifications: { action: "operational" } } }]);
        return { attestationId: id, fact: "owner_attestation", providerConfirmed: false, realExternalActions: 0 };
      } });
    }); } catch (error) {
      if (isRequestBindingRefusal(error)) throw new PurchaseOrderActionError("ORDER_ACTION_INVALID");
      if ((error as { code?: string }).code === "23505") throw new PurchaseOrderActionError("ORDER_ALREADY_COMMITTED");
      throw error;
    }
  }
}
