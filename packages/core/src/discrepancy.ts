import { z } from "zod";
import { parseQuantity } from "./quantity.js";
import { divideRounded } from "./rational.js";

const MAX = 1_000_000_000_000;
const pence = z.number().int().min(0).max(MAX);
// Keep existing numeric callers; SQL numeric sources enter as decimal strings.
const quantity = z.union([z.number().finite().min(0).max(1_000_000), z.string()]).refine(value => {
  try {
    const q = parseQuantity(String(value));
    return q.scaled >= 0n && q.scaled <= 1_000_000n * q.scale;
  } catch { return false; }
}, "Quantity must be nonnegative, at most 1000000, and have at most six fractional places");
export const discrepancyInputV1 = z.object({
  version: z.literal("discrepancy-input.v1"),
  ruleRevision: z.string().min(1),
  sourceDocumentId: z.guid({ error: "Invalid uuid" }),
  sourceVersionId: z.guid({ error: "Invalid uuid" }),
  matchRevisionId: z.guid({ error: "Invalid uuid" }),
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
  const billed = parseQuantity(String(i.billedQuantity));
  const accepted = parseQuantity(String(i.acceptedQuantity));
  const difference = billed.scaled * accepted.scale - accepted.scaled * billed.scale;
  const excess = difference > 0n ? difference : 0n;
  // Each separately displayed net component is a line boundary: half-even once.
  const price = divideRounded(billed.scaled * BigInt(priceDelta), billed.scale, "half_even");
  const qty = divideRounded(excess * BigInt(i.orderedUnitPricePence), billed.scale * accepted.scale, "half_even");
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
