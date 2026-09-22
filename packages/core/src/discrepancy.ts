import { z } from "zod";

const MAX = 1_000_000_000_000;
const pence = z.number().int().min(0).max(MAX);
const quantity = z.number().int().min(0).max(1_000_000);
export const discrepancyInputV1 = z.object({
  version: z.literal("discrepancy-input.v1"),
  ruleRevision: z.string().min(1),
  sourceDocumentId: z.string().uuid(),
  sourceVersionId: z.string().uuid(),
  matchRevisionId: z.string().uuid(),
  confirmed: z.literal(true),
  matched: z.literal(true),
  orderedQuantity: quantity,
  acceptedQuantity: quantity,
  billedQuantity: quantity,
  orderedUnitPricePence: pence,
  billedUnitPricePence: pence,
}).strict();
export type DiscrepancyInput = z.infer<typeof discrepancyInputV1>;
export type DiscrepancyResult = {
  kind: "actionable" | "none";
  pricePence: number;
  quantityPence: number;
  totalPence: number;
  priceCalculation: string;
  quantityCalculation: string;
};

/** Pure reference rule. Price applies to all billed units; quantity uses the agreed
 * order price, so the shared units are never charged at the price variance twice. */
export function evaluateBillDiscrepancy(raw: DiscrepancyInput): DiscrepancyResult {
  const i = discrepancyInputV1.parse(raw);
  const priceDelta = Math.max(0, i.billedUnitPricePence - i.orderedUnitPricePence);
  const excessQuantity = Math.max(0, i.billedQuantity - i.acceptedQuantity);
  const price = BigInt(i.billedQuantity) * BigInt(priceDelta);
  const qty = BigInt(excessQuantity) * BigInt(i.orderedUnitPricePence);
  const total = price + qty;
  if (total > BigInt(MAX)) throw new Error("MONEY_MAGNITUDE_EXCEEDED");
  return {
    kind: total > 0n ? "actionable" : "none",
    pricePence: Number(price), quantityPence: Number(qty), totalPence: Number(total),
    priceCalculation: `${i.billedQuantity} × (${i.billedUnitPricePence} − ${i.orderedUnitPricePence})`,
    quantityCalculation: `(${i.billedQuantity} − ${i.acceptedQuantity}) × ${i.orderedUnitPricePence}`,
  };
}

export type ComparableDiscrepancyInput = Partial<DiscrepancyInput> & Pick<DiscrepancyInput,"version"|"ruleRevision"|"sourceDocumentId"|"sourceVersionId"|"matchRevisionId">;
export function evaluateComparableBill(input: ComparableDiscrepancyInput): DiscrepancyResult | {kind:"insufficient"} {
  if (input.confirmed !== true || input.matched !== true || input.orderedQuantity === undefined || input.acceptedQuantity === undefined || input.billedQuantity === undefined || input.orderedUnitPricePence === undefined || input.billedUnitPricePence === undefined) return {kind:"insufficient"};
  return evaluateBillDiscrepancy(input as DiscrepancyInput);
}
