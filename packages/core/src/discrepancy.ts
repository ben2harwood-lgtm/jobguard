import { z } from "zod";
import { parseQuantity } from "./quantity.js";
import { divideRounded } from "./rational.js";

const MAX = 1_000_000_000_000;
const pence = z.number().int().min(0).max(MAX);
// Preserve the numeric v1 boundary used by the repository, but only accept
// quantities that can be represented by the six-place scaled-integer contract.
const quantity = z.number().finite().min(0).max(1_000_000)
  .refine(value => /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(String(value)),
    "Quantity must have at most six fractional places");
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

/** Pure reference rule. Price applies to all billed units; quantity uses the lower
 * of billed and order prices, so an undelivered unit cannot exceed its bill or
 * duplicate its price variance. Round the combined exact discrepancy half-even
 * once; its quantity component is the remainder after the rounded price component. */
export function evaluateBillDiscrepancy(raw: DiscrepancyInput): DiscrepancyResult {
  const i = discrepancyInputV1.parse(raw);
  const priceDelta = Math.max(0, i.billedUnitPricePence - i.orderedUnitPricePence);
  const quantityUnitPrice = Math.min(i.orderedUnitPricePence, i.billedUnitPricePence);
  const billed = parseQuantity(String(i.billedQuantity));
  const accepted = parseQuantity(String(i.acceptedQuantity));
  const denominator = billed.scale * accepted.scale;
  const quantityDifference = billed.scaled * accepted.scale - accepted.scaled * billed.scale;
  const excessQuantity = quantityDifference > 0n ? quantityDifference : 0n;
  const priceNumerator = billed.scaled * accepted.scale * BigInt(priceDelta);
  const quantityNumerator = excessQuantity * BigInt(quantityUnitPrice);
  const totalNumerator = priceNumerator + quantityNumerator;
  if (totalNumerator > BigInt(MAX) * denominator) throw new Error("MONEY_MAGNITUDE_EXCEEDED");
  const total = divideRounded(totalNumerator, denominator, "half_even");
  const price = divideRounded(priceNumerator, denominator, "half_even");
  const qty = total - price;
  return {
    kind: total > 0n ? "actionable" : "none",
    pricePence: Number(price), quantityPence: Number(qty), totalPence: Number(total),
    priceCalculation: `${i.billedQuantity} × (${i.billedUnitPricePence} − ${i.orderedUnitPricePence})`,
    quantityCalculation: `(${i.billedQuantity} − ${i.acceptedQuantity}) × ${quantityUnitPrice}`,
  };
}

export type ComparableDiscrepancyInput = Partial<DiscrepancyInput> & Pick<DiscrepancyInput,"version"|"ruleRevision"|"sourceDocumentId"|"sourceVersionId"|"matchRevisionId">;
export function evaluateComparableBill(input: ComparableDiscrepancyInput): DiscrepancyResult | {kind:"insufficient"} {
  if (input.confirmed !== true || input.matched !== true || input.orderedQuantity === undefined || input.acceptedQuantity === undefined || input.billedQuantity === undefined || input.orderedUnitPricePence === undefined || input.billedUnitPricePence === undefined) return {kind:"insufficient"};
  return evaluateBillDiscrepancy(input as DiscrepancyInput);
}
