import { z } from "zod";
import { MAX_MONEY_PENCE, money, moneyFromBigInt, type Money } from "./money.js";
import { divideRounded } from "./rational.js";

export type ExactPence = Readonly<{ numerator: bigint; denominator: bigint }>;

/** Most lines one receipt allocation covers (the allocation schema's own limit). */
export const MAX_ALLOCATION_LINES = 10_000;
/** Longest numerator or denominator accepted for one allocation input: the receipt, an explicit share or a line balance. */
export const MAX_EXACT_PENCE_INPUT_DIGITS = 100;
const MONEY_DIGITS = String(MAX_MONEY_PENCE).length;
/**
 * Longest numerator or denominator the fee kernel accepts for an exact principal, derived from the sizes the allocator
 * supports rather than fitted to an example. The exact net of every line in one allocation sums to a fraction whose
 * denominator divides (receipt denominator) x (total numerator) x (total denominator) x lcm(line gross amounts).
 * Each line gross has at most MONEY_DIGITS digits, so the lcm has at most MAX_ALLOCATION_LINES x MONEY_DIGITS digits,
 * and the three allocation values add at most 3 x MAX_EXACT_PENCE_INPUT_DIGITS. The numerator is at most the money
 * limit times the denominator, which adds MONEY_DIGITS. Larger sums fail closed with a typed error.
 */
export const MAX_EXACT_PENCE_DIGITS = Number(
  BigInt(MAX_ALLOCATION_LINES) * BigInt(MONEY_DIGITS) + 3n * BigInt(MAX_EXACT_PENCE_INPUT_DIGITS) + BigInt(MONEY_DIGITS),
);
const integerOf = (limit: number) => z.string().regex(/^-?(?:0|[1-9]\d*)$/u).max(limit);
const positiveOf = (limit: number) => z.string().regex(/^[1-9]\d*$/u).max(limit);
export const exactPenceV1 = z.object({ numerator: integerOf(MAX_EXACT_PENCE_DIGITS), denominator: positiveOf(MAX_EXACT_PENCE_DIGITS) }).strict();
/** Allocation inputs stay small: bounded work per line, and the total of one allocation is bounded the same way. */
export const exactPenceInputV1 = z.object({ numerator: integerOf(MAX_EXACT_PENCE_INPUT_DIGITS), denominator: positiveOf(MAX_EXACT_PENCE_INPUT_DIGITS) }).strict();
export const feeRateV1 = z.object({
  version: z.literal("fee-rate.v1"), policyVersion: z.string().min(1).max(80),
  numerator: z.string().regex(/^(?:0|[1-9]\d*)$/u).max(100), denominator: z.string().regex(/^[1-9]\d*$/u).max(100),
}).strict().refine(v => /^(?:0|[1-9]\d*)$/u.test(v.numerator) && /^[1-9]\d*$/u.test(v.denominator) &&
  v.numerator.length <= 100 && v.denominator.length <= 100 && BigInt(v.numerator) <= BigInt(v.denominator), "Rate must be between zero and one");
export const cumulativeFeeInputV1 = z.object({
  version: z.literal("cumulative-fee.v1"), rate: feeRateV1, cumulativeQualifyingPrincipal: exactPenceV1,
  priorNetPostedPence: z.number().int().nonnegative().max(MAX_MONEY_PENCE), priorPolicyVersion: z.string().min(1).max(80),
  compensatesDerivationId: z.string().uuid().nullable(),
}).strict();
export type CumulativeFeeInput = z.infer<typeof cumulativeFeeInputV1>;
export class SharedMoneyError extends Error {
  constructor(public readonly code: "INVALID_SHARED_MONEY" | "POLICY_VERSION_MISMATCH" | "COMPENSATION_LINK_REQUIRED" | "INVALID_ALLOCATION") {
    super(code); this.name = "SharedMoneyError";
  }
}

/** Greatest common divisor; cheap when one argument is short, because the first remainder shrinks the long one. */
function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
  return a;
}

/** Reduced exact rational pence; no rounding at allocation or aggregation. */
export function exactPence(numerator: bigint, denominator = 1n): ExactPence {
  if (denominator <= 0n) throw new SharedMoneyError("INVALID_SHARED_MONEY");
  const divisor = gcd(numerator, denominator);
  return Object.freeze({ numerator: numerator / divisor, denominator: denominator / divisor });
}
/**
 * Exact sum of two reduced values (everything this module returns is reduced; `parseExactPence` output is not).
 * Uses the common-denominator form: the sum shares a factor with the lcm only through gcd(a.denominator, b.denominator),
 * so reducing costs one gcd of short numbers instead of a full-length gcd, and adding term after term stays linear.
 */
export function addExactPence(a: ExactPence, b: ExactPence): ExactPence {
  if (a.denominator <= 0n || b.denominator <= 0n) throw new SharedMoneyError("INVALID_SHARED_MONEY");
  const shared = gcd(a.denominator, b.denominator);
  const left = a.denominator / shared, right = b.denominator / shared;
  const numerator = a.numerator * right + b.numerator * left;
  const common = gcd(numerator, shared);
  return Object.freeze({ numerator: numerator / common, denominator: left * (b.denominator / common) });
}
export function multiplyExactPence(a: ExactPence, b: ExactPence): ExactPence {
  return exactPence(a.numerator * b.numerator, a.denominator * b.denominator);
}
export function compareExactPence(a: ExactPence, b: ExactPence): -1 | 0 | 1 {
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
/**
 * Validates one boundary value against the money limit by cross-multiplication. It does not reduce: reducing a value as
 * long as the fee kernel accepts would cost a full-length gcd, and no result depends on the reduced form.
 */
export function parseExactPence(raw: unknown, schema: z.ZodType<{ numerator: string; denominator: string }> = exactPenceV1): ExactPence {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new SharedMoneyError("INVALID_SHARED_MONEY");
  const value: ExactPence = Object.freeze({ numerator: BigInt(parsed.data.numerator), denominator: BigInt(parsed.data.denominator) });
  const magnitude = value.numerator < 0n ? -value.numerator : value.numerator;
  if (magnitude > BigInt(MAX_MONEY_PENCE) * value.denominator) throw new SharedMoneyError("INVALID_SHARED_MONEY");
  return value;
}
/**
 * Exact sum of any number of terms, fully reduced, without the quadratic cost of adding one term at a time: the common
 * denominator is the running lcm (a gcd of a long number with a short one is one remainder), and the result is reduced
 * by lcm(gcd(numerator, d)) over the term denominators d, which equals gcd(numerator, lcm of the denominators).
 * A sum whose denominator or numerator would exceed `maxDigits` digits fails closed with INVALID_SHARED_MONEY.
 */
export function sumExactPence(values: readonly ExactPence[], maxDigits = MAX_EXACT_PENCE_DIGITS): ExactPence {
  const limit = 10n ** BigInt(maxDigits);
  const byDenominator = new Map<bigint, bigint>();
  for (const value of values) {
    if (value.denominator <= 0n) throw new SharedMoneyError("INVALID_SHARED_MONEY");
    byDenominator.set(value.denominator, (byDenominator.get(value.denominator) ?? 0n) + value.numerator);
  }
  let common = 1n;
  for (const denominator of byDenominator.keys()) {
    common = common / gcd(common, denominator) * denominator;
    if (common >= limit) throw new SharedMoneyError("INVALID_SHARED_MONEY");
  }
  let numerator = 0n;
  for (const [denominator, sum] of byDenominator) numerator += sum * (common / denominator);
  let divisor = 1n;
  for (const denominator of byDenominator.keys()) {
    const shared = gcd(numerator, denominator);
    divisor = divisor / gcd(divisor, shared) * shared;
  }
  const result: ExactPence = Object.freeze({ numerator: numerator / divisor, denominator: common / divisor });
  if ((result.numerator < 0n ? -result.numerator : result.numerator) >= limit) throw new SharedMoneyError("INVALID_SHARED_MONEY");
  return result;
}
export function serializeExactPence(value: ExactPence): z.infer<typeof exactPenceV1> {
  return { numerator: value.numerator.toString(), denominator: value.denominator.toString() };
}

/** Arithmetic only: qualifying proof, approval and posting remain caller responsibilities. */
export function calculateCumulativeFee(raw: unknown): Readonly<{
  version: "cumulative-fee.v1"; policyVersion: string; roundingPolicy: "commercial_half_even.v1";
  cumulativeFee: Money; postingDelta: Money; compensatesDerivationId: string | null;
}> {
  const parsed = cumulativeFeeInputV1.safeParse(raw);
  if (!parsed.success) throw new SharedMoneyError("INVALID_SHARED_MONEY");
  const input = parsed.data;
  if (input.rate.policyVersion !== input.priorPolicyVersion) throw new SharedMoneyError("POLICY_VERSION_MISMATCH");
  // The small-builder policy fixes 10%; agreement snapshots supply contractor rates.
  if (input.rate.policyVersion === "reference_fee_policy_v3" &&
      compareExactPence(exactPence(BigInt(input.rate.numerator), BigInt(input.rate.denominator)), exactPence(1n, 10n)) !== 0) {
    throw new SharedMoneyError("INVALID_SHARED_MONEY");
  }
  const principal = parseExactPence(input.cumulativeQualifyingPrincipal);
  if (principal.numerator < 0n) throw new SharedMoneyError("INVALID_SHARED_MONEY");
  // Rounded once, half-even, on the exact product; the rounding is the same whether or not the fraction is reduced.
  const cumulativeFee = moneyFromBigInt(divideRounded(
    principal.numerator * BigInt(input.rate.numerator), principal.denominator * BigInt(input.rate.denominator), "half_even"));
  const postingDelta = moneyFromBigInt(BigInt(cumulativeFee.pence) - BigInt(money(input.priorNetPostedPence).pence));
  if (postingDelta.pence < 0 && input.compensatesDerivationId === null) throw new SharedMoneyError("COMPENSATION_LINK_REQUIRED");
  return Object.freeze({ version: "cumulative-fee.v1", policyVersion: input.rate.policyVersion,
    roundingPolicy: "commercial_half_even.v1", cumulativeFee, postingDelta,
    compensatesDerivationId: postingDelta.pence < 0 ? input.compensatesDerivationId : null });
}
