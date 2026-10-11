import { z } from "zod";
import { MAX_MONEY_PENCE, moneyFromBigInt, type Money } from "./money.js";
import { parseQuantity } from "./quantity.js";
import { multiplyRatios } from "./rational.js";

export const sorErrorCodes = ["INVALID_COMMAND", "INVALID_QUANTITY", "NEGATIVE_QUANTITY", "QUANTITY_PRECISION", "INVALID_ADJUSTMENT", "NEGATIVE_MULTIPLIER", "MONEY_OUT_OF_RANGE", "SOR_VERSION_NOT_FOUND", "AMBIGUOUS_SOR_VERSION", "UNKNOWN_SOR_CODE"] as const;
export class SorPricingError extends Error {
  constructor(readonly code: typeof sorErrorCodes[number]) { super(code); }
}
/** Bounded decimal input, not a JavaScript number. Six places are the existing quantity contract. */
export const sorQuantityV1 = z.string().max(19).regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/u);
export function assertSorQuantity(raw: unknown): asserts raw is string {
  if (typeof raw === "string" && raw.length <= 19) {
    if (/^-\d+(?:\.\d+)?$/u.test(raw)) throw new SorPricingError("NEGATIVE_QUANTITY");
    if (/^\d+\.\d{7,}$/u.test(raw)) throw new SorPricingError("QUANTITY_PRECISION");
  }
  if (!sorQuantityV1.safeParse(raw).success) throw new SorPricingError("INVALID_QUANTITY");
}
export const sorAdjustmentV1 = z.object({
  numerator: z.string().regex(/^-?(?:0|[1-9]\d{0,11})$/u),
  denominator: z.string().regex(/^[1-9]\d{0,11}$/u),
}).strict();
export const sorMoneyV1 = z.object({ pence: z.number().int().nonnegative().max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict();
export const sorLinePricingV1 = z.object({ version: z.literal("sor-line-pricing.v1"), quantity: sorQuantityV1, rate: sorMoneyV1, adjustment: sorAdjustmentV1 }).strict();
/** commercial_half_even.v1: quantity × rate × (1 + signed adjustment), rounded exactly once at the line. */
export function priceSorLine(raw: unknown): Money {
  const candidate = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  assertSorQuantity(candidate.quantity);
  if (!sorAdjustmentV1.safeParse(candidate.adjustment).success) throw new SorPricingError("INVALID_ADJUSTMENT");
  const rate = candidate.rate as { pence?: unknown } | undefined;
  if (typeof rate?.pence !== "number" || !Number.isSafeInteger(rate.pence) || rate.pence < 0 || rate.pence > MAX_MONEY_PENCE) throw new SorPricingError("MONEY_OUT_OF_RANGE");
  const parsed = sorLinePricingV1.safeParse(raw);
  if (!parsed.success) throw new SorPricingError("INVALID_COMMAND");
  const { quantity, rate: unitRate, adjustment } = parsed.data;
  const denominator = BigInt(adjustment.denominator);
  const multiplier = denominator + BigInt(adjustment.numerator);
  if (multiplier < 0n) throw new SorPricingError("NEGATIVE_MULTIPLIER");
  const q = parseQuantity(quantity);
  const pence = multiplyRatios(BigInt(unitRate.pence), [{ numerator: q.scaled, denominator: q.scale }, { numerator: multiplier, denominator }], "half_even");
  if (pence > BigInt(MAX_MONEY_PENCE)) throw new SorPricingError("MONEY_OUT_OF_RANGE");
  return moneyFromBigInt(pence);
}
const codeV1 = z.string().trim().min(1).max(80);
export const sorItemV1 = z.object({ code: codeV1, description: z.string().trim().min(1).max(500), unit: z.string().trim().min(1).max(40), rate: sorMoneyV1, standardMinutes: z.number().int().nonnegative().max(525600).optional() }).strict();
export const sorVersionImportV1 = z.object({
  version: z.literal("sor-version-import.v1"), environment: z.literal("synthetic_demo"), commandId: z.string().uuid(),
  scheduleId: z.string().uuid(), reference: z.string().trim().min(1).max(100), effectiveFrom: z.string().date(),
  items: z.array(sorItemV1).min(1).max(10000),
}).strict().superRefine((value, context) => {
  const codes = new Set<string>();
  value.items.forEach((item, index) => {
    if (codes.has(item.code)) context.addIssue({ code: "custom", path: ["items", index, "code"], message: "Duplicate SoR code" });
    codes.add(item.code);
  });
});
export type SorVersionImport = z.infer<typeof sorVersionImportV1>;
const effectiveVersionV1 = z.object({ id: z.string().uuid(), effectiveFrom: z.string().date() });
/** Caller supplies persisted, same-contract candidates. No implicit latest-version fallback. */
export function selectSorVersion<T extends { id: string; effectiveFrom: string }>(issuedOn: string, allowedIds: readonly string[], versions: readonly T[]): T {
  if (!z.string().date().safeParse(issuedOn).success || !z.array(z.string().uuid()).safeParse(allowedIds).success || versions.some(v => !effectiveVersionV1.safeParse(v).success)) throw new SorPricingError("INVALID_COMMAND");
  const candidates = versions.filter(v => allowedIds.includes(v.id) && v.effectiveFrom <= issuedOn).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  if (!candidates[0]) throw new SorPricingError("SOR_VERSION_NOT_FOUND");
  if (candidates[1]?.effectiveFrom === candidates[0].effectiveFrom) throw new SorPricingError("AMBIGUOUS_SOR_VERSION");
  return candidates[0];
}

/** A persisted SoR item as the pricing step sees it: its unit and rate come from the version, never from the order. */
export type SorItemRate = Readonly<{ unit: string; ratePence: number }>;
/**
 * Prices every line of one order revision against one persisted SoR version and the contract version's tendered adjustment. An unknown
 * code fails the whole order (the caller records the row's typed error); no line is priced twice or rounded more than once.
 */
export function priceWorkOrderLines(lines: readonly Readonly<{ sorCode: string; quantity: string }>[], items: ReadonlyMap<string, SorItemRate>, adjustment: z.infer<typeof sorAdjustmentV1>) {
  return lines.map(line => {
    const item = items.get(line.sorCode);
    if (!item) throw new SorPricingError("UNKNOWN_SOR_CODE");
    const net = priceSorLine({ version: "sor-line-pricing.v1", quantity: line.quantity, rate: { pence: item.ratePence, currency: "GBP" }, adjustment });
    return { sorCode: line.sorCode, quantity: line.quantity, unit: item.unit, rate: { pence: item.ratePence, currency: "GBP" as const }, net: { pence: net.pence as number, currency: "GBP" as const } };
  });
}
export const sorVersionResultV1 = z.object({
  version: z.literal("sor-version-result.v1"), environment: z.literal("synthetic_demo"), versionId: z.string().uuid(), scheduleId: z.string().uuid(),
  itemCount: z.number().int().positive(), effectiveFrom: z.string().date(), replayed: z.boolean(), realExternalActions: z.literal(0),
}).strict();
export const sorVersionListV1 = z.object({
  version: z.literal("sor-version-list.v1"), environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0),
  versions: z.array(z.object({ id: z.string().uuid(), scheduleId: z.string().uuid(), scheduleReference: z.string(), reference: z.string(), effectiveFrom: z.string().date(), itemCount: z.number().int().positive(), createdAt: z.string() }).strict()),
}).strict();
