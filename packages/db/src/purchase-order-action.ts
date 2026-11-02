import { createHash } from "node:crypto";
import { z } from "zod";
import { materialQuantityV1, purchaseOrderNet } from "@jobguard/core";
import type { OutboundAction, OutboundAdapter, FakeDeliveryResult } from "./outbox.js";
import type { TenantTransaction } from "./tenant-context.js";

export class PurchaseOrderActionError extends Error {
  constructor(readonly code: "SYNTHETIC_MODE_REQUIRED" | "ORDER_AUTHORITY_STALE" | "ORDER_ACTION_INVALID" | "ORDER_ALREADY_COMMITTED") {
    super(code); this.name = "PurchaseOrderActionError";
  }
}
export function requireSyntheticOrders() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PurchaseOrderActionError("SYNTHETIC_MODE_REQUIRED");
}
const id = z.guid({ error: "Invalid uuid" });
const pence = z.number().int().nonnegative().max(1_000_000_000_000);
export const merchantOrderV1 = z.object({
  version: z.literal("merchant-order.v1"), environment: z.literal("synthetic_demo"),
  tenantId: id, jobId: id, draftId: id, revisionId: id, revision: z.number().int().positive(), merchantId: id,
  recipient: z.string().min(1).max(320).endsWith(".invalid"), deliveryDate: z.string().date(),
  line: z.object({ requirementId: id, skuId: id, quantity: materialQuantityV1, unit: z.literal("each"),
    unitPricePence: pence, rateId: id, rateVersion: z.number().int().positive(), agreedPricePence: pence,
    rateUnit: z.string().min(1).max(20), packQuantity: materialQuantityV1,
    taxBasis: z.literal("net"), currency: z.literal("GBP"),
  }).strict(),
}).strict();
export type MerchantOrder = z.infer<typeof merchantOrderV1>;
// Construct a fixed key order through the schema before hashing; client object ordering is irrelevant.
export function merchantOrderContent(raw: unknown) { return JSON.stringify(merchantOrderV1.parse(raw)); }
export const orderContentHash = (content: string) => createHash("sha256").update(content).digest("hex");
export const orderAmount = (order: MerchantOrder) => purchaseOrderNet(order.line.quantity, order.line.unitPricePence);

/** Read only authoritative, tenant/job-qualified material data; no hidden findings are consulted.
 * Stock and lead time have no trusted provider in this slice, so neither is asserted.
 */
export async function readMerchantOrder(db: TenantTransaction, tenantId: string, jobId: string, revisionId: string): Promise<MerchantOrder> {
  const row = (await db.$client.query(`SELECT r.id,r.draft_id,r.revision,r.quantity_decimal,r.unit_price_pence,
    r.recipient,to_char(r.required_date,'YYYY-MM-DD') delivery_date,d.requirement_id,q.sku_id,s.merchant_id,
    rate.id rate_id,rate.version rate_version,rate.price_pence,rate.price_unit,rate.tax_basis,rate.applicable_count,
    CASE WHEN rate.price_unit='each' THEN '1' ELSE pack.each_quantity_decimal END pack_quantity
    FROM app.purchase_order_revision r
    JOIN app.purchase_order_draft d ON(d.tenant_id,d.job_id,d.id)=(r.tenant_id,r.job_id,r.draft_id)
    JOIN app.material_requirement q ON(q.tenant_id,q.job_id,q.id)=(d.tenant_id,d.job_id,d.requirement_id)
    JOIN app.merchant_sku s ON(s.tenant_id,s.id)=(q.tenant_id,q.sku_id)
    JOIN LATERAL(SELECT a.*,count(*) OVER() applicable_count FROM app.material_rate_revision a WHERE a.tenant_id=s.tenant_id
      AND a.merchant_id=s.merchant_id AND a.sku_id=s.id AND a.effective_from<=CURRENT_DATE
      AND (a.effective_to IS NULL OR a.effective_to>=CURRENT_DATE) ORDER BY a.version DESC LIMIT 1)rate ON true
    LEFT JOIN LATERAL(SELECT p.each_quantity_decimal FROM app.material_pack_conversion p
      WHERE p.tenant_id=s.tenant_id AND p.sku_id=s.id AND p.pack_unit=rate.price_unit
      AND p.effective_from<=CURRENT_DATE ORDER BY p.effective_from DESC LIMIT 1)pack ON true
    WHERE r.tenant_id=$1 AND r.job_id=$2 AND r.id=$3 AND q.unit='each'
    AND NOT EXISTS(SELECT 1 FROM app.purchase_order_revision newer WHERE newer.tenant_id=r.tenant_id
      AND newer.draft_id=r.draft_id AND newer.revision>r.revision)`, [tenantId, jobId, revisionId])).rows[0];
  if (!row || Number(row.applicable_count) !== 1 || row.tax_basis !== "net" || !row.pack_quantity) throw new PurchaseOrderActionError("ORDER_AUTHORITY_STALE");
  return merchantOrderV1.parse({ version: "merchant-order.v1", environment: "synthetic_demo", tenantId, jobId,
    draftId: row.draft_id, revisionId: row.id, revision: row.revision, merchantId: row.merchant_id,
    recipient: row.recipient, deliveryDate: row.delivery_date,
    line: { requirementId: row.requirement_id, skuId: row.sku_id, quantity: row.quantity_decimal, unit: "each",
      unitPricePence: Number(row.unit_price_pence), rateId: row.rate_id, rateVersion: row.rate_version,
      agreedPricePence: Number(row.price_pence), rateUnit: row.price_unit, packQuantity: row.pack_quantity,
      taxBasis: row.tax_basis, currency: "GBP" } });
}

/** A deterministic merchant port, deliberately unregistered with the application worker.
 * Its map simulates provider deduplication; durable authority/attempts live in the common outbox.
 * Keep the same fake instance across retry/reconciliation in a test.
 */
export class FakeMerchantOrderPort implements OutboundAdapter {
  readonly name = "fake_merchant_order" as const;
  readonly supportsProviderDeduplication = true;
  private readonly orders = new Map<string, { hash: string; reference: string }>();
  get placedCount() { return this.orders.size; }
  async deliver(action: Readonly<OutboundAction>): Promise<FakeDeliveryResult> {
    requireSyntheticOrders();
    let order: MerchantOrder;
    try { order = merchantOrderV1.parse(JSON.parse(action.immutableContent)); }
    catch { throw new PurchaseOrderActionError("ORDER_ACTION_INVALID"); }
    if (action.adapter !== this.name || action.actionType !== "purchase_order.send.dark" || action.policyVersion !== "dark-merchant-order.v1"
      || action.contentHash !== orderContentHash(merchantOrderContent(order)) || action.recipient !== order.recipient
      || action.amountPence !== orderAmount(order) || action.currency !== "GBP" || action.aggregateRevision !== order.revision
      || action.providerEffectKey !== `merchant-order:${order.tenantId}:${order.draftId}`
      || action.authorizationExpiresAt.getTime() <= Date.now()) throw new PurchaseOrderActionError("ORDER_ACTION_INVALID");
    const prior = this.orders.get(action.providerEffectKey);
    if (prior && prior.hash !== action.contentHash) throw new PurchaseOrderActionError("ORDER_ACTION_INVALID");
    const reference = prior?.reference ?? `synthetic-order:${order.draftId}`;
    this.orders.set(action.providerEffectKey, { hash: action.contentHash, reference });
    return { kind: "succeeded", providerReference: reference };
  }
  async reconcile(key: string) { requireSyntheticOrders(); return this.orders.has(key) ? "succeeded" as const : "not_found" as const; }
}
