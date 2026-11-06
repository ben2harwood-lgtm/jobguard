import { z } from "zod";
const quantity = z.string().regex(/^\d+(\.\d{1,6})?$/u);
export const merchantDeliveryReceiptV1 = z.object({
 version: z.literal("merchant-delivery-receipt.v1"), tenantId: z.guid(), jobId: z.guid(), orderId: z.guid(),
 revision: z.number().int().positive(), supplierContext: z.string().min(1).max(120), status: z.string(),
 ordered: quantity, delivered: quantity, accepted: quantity, rejected: quantity, missing: quantity,
 firstDelivered: quantity, firstMissing: quantity,
}).strict();
export type MerchantDeliveryReceipt = z.infer<typeof merchantDeliveryReceiptV1>;
const scaled = (v: string) => { const [whole, fraction = ""] = v.split("."); return BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(6,"0")); };
export function merchantDeliveryRecord(tenantId: string, raw: unknown[]) {
 z.guid().parse(tenantId);
 const latest = new Map<string, MerchantDeliveryReceipt>();
 for (const input of raw) {
  const row = merchantDeliveryReceiptV1.parse(input);
  if (row.tenantId !== tenantId) throw new Error("MERCHANT_RECORD_UNAVAILABLE");
  const prior = latest.get(row.orderId);
  if (prior?.revision === row.revision && JSON.stringify(prior) !== JSON.stringify(row)) throw new Error("MERCHANT_RECORD_UNAVAILABLE");
  if (!prior || prior.revision < row.revision) latest.set(row.orderId,row);
 }
 const suppliers = new Map<string, { supplierContext: string; ordersReceived: number; ordersMissing: number; ordersRejected: number; ordersAddedLater: number; sample: "not enough to say" | "counts" }>();
 for (const row of latest.values()) {
  if (row.status !== "ready") continue;
  const counts = suppliers.get(row.supplierContext) ?? { supplierContext: row.supplierContext, ordersReceived: 0, ordersMissing: 0, ordersRejected: 0, ordersAddedLater: 0, sample: "not enough to say" as const };
  counts.ordersReceived++;
  if (scaled(row.missing)>0n) counts.ordersMissing++;
  if (scaled(row.rejected)>0n) counts.ordersRejected++;
  if (row.revision>1 && scaled(row.firstMissing)>0n && scaled(row.delivered)>scaled(row.firstDelivered)) counts.ordersAddedLater++;
  counts.sample = counts.ordersReceived < 3 ? "not enough to say" : "counts";
  suppliers.set(row.supplierContext,counts);
 }
 return { version: "merchant-delivery-record.v1" as const, suppliers: [...suppliers.values()].sort((a,b)=>a.supplierContext < b.supplierContext ? -1 : a.supplierContext > b.supplierContext ? 1 : 0) };
}
export type MerchantDeliveryRecord = ReturnType<typeof merchantDeliveryRecord>;
