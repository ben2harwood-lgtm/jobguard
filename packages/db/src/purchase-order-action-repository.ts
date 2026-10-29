import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { normalizePackRate, purchaseOrderNet } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { consequentialCommandV1Schema, UserCommandDispatcher } from "./commands.js";
import { appendOutboundAction } from "./outbox.js";
import { claimCommandIdentity, requestHashFor, requireLiveJob, runStoredCommand } from "./watchdog.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { requireSyntheticOrders, readMerchantOrder, merchantOrderContent, orderContentHash, orderAmount,
  PurchaseOrderActionError } from "./purchase-order-action.js";

const uuid = z.guid({ error: "Invalid uuid" });
const scopeV1 = z.object({ version: z.literal("merchant-order-scope.v1"), jobId: uuid, revisionId: uuid }).strict();
const attestationV1 = z.object({ version: z.literal("manual-order-attestation.v1"), jobId: uuid, revisionId: uuid,
  commandId: uuid, actorMembershipId: uuid, supplierReference: z.string().regex(/^synthetic-[a-zA-Z0-9-]{1,80}$/u),
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

  /** Records the owner's assertion, never an outbound action or provider-confirmed placement. */
  async attestManual(context: VerifiedTenantContext, raw: unknown) {
    requireSyntheticOrders(); const input = attestationV1.parse(raw);
    try { return await withTenant(this.pool, context, async db => {
      await lockOrder(db, context.tenantId, input.jobId);
      const member = await db.$client.query(`SELECT 1 FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner'
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp())`, [context.tenantId, input.actorMembershipId]);
      if (!member.rowCount) throw new PurchaseOrderActionError("ORDER_ACTION_INVALID");
      return runStoredCommand(db, { tenantId: context.tenantId, jobId: input.jobId, kind: "purchase_order.attest_manual",
        commandId: input.commandId, request: input }, { work: async () => {
        const order = await readMerchantOrder(db, context.tenantId, input.jobId, input.revisionId);
        if ((await db.$client.query("SELECT 1 FROM app.purchase_order_placement WHERE tenant_id=$1 AND draft_id=$2",
          [context.tenantId, order.draftId])).rowCount) throw new PurchaseOrderActionError("ORDER_ALREADY_COMMITTED");
        const id = randomUUID();
        await db.$client.query(`INSERT INTO app.purchase_order_manual_attestation(id,tenant_id,job_id,draft_id,revision_id,
          merchant_id,actor_membership_id,command_id,supplier_reference_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id, context.tenantId, input.jobId, order.draftId, order.revisionId, order.merchantId, input.actorMembershipId,
            input.commandId, orderContentHash(input.supplierReference)]);
        await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${input.actorMembershipId}`,
          eventType: "purchase_order.manual_attested", subjectType: "job", subjectRef: input.jobId,
          payload: { references: { attestationId: id }, classifications: { action: "operational" } } }]);
        return { attestationId: id, fact: "owner_attestation", providerConfirmed: false, realExternalActions: 0 };
      } });
    }); } catch (error) {
      if ((error as { code?: string }).code === "23505") throw new PurchaseOrderActionError("ORDER_ALREADY_COMMITTED");
      throw error;
    }
  }
}
