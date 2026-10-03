import { z } from "zod";
import { MAX_MONEY_PENCE, money, moneyFromBigInt, type Money } from "./money.js";
import { divideRounded } from "./rational.js";

export type ExactPence = Readonly<{ numerator: bigint; denominator: bigint }>;
const integer = z.string().regex(/^-?(?:0|[1-9]\d*)$/u).max(100);
export const exactPenceV1 = z.object({ numerator: integer, denominator: z.string().regex(/^[1-9]\d*$/u).max(100) }).strict();
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

/** Reduced exact rational pence; no rounding at allocation or aggregation. */
export function exactPence(numerator: bigint, denominator = 1n): ExactPence {
  if (denominator <= 0n) throw new SharedMoneyError("INVALID_SHARED_MONEY");
  let a = numerator < 0n ? -numerator : numerator, b = denominator;
  while (b !== 0n) { const remainder = a % b; a = b; b = remainder; }
  return Object.freeze({ numerator: numerator / a, denominator: denominator / a });
}
export function addExactPence(a: ExactPence, b: ExactPence): ExactPence {
  return exactPence(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
}
export function multiplyExactPence(a: ExactPence, b: ExactPence): ExactPence {
  return exactPence(a.numerator * b.numerator, a.denominator * b.denominator);
}
export function compareExactPence(a: ExactPence, b: ExactPence): -1 | 0 | 1 {
  const difference = a.numerator * b.denominator - b.numerator * a.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
export function parseExactPence(raw: unknown): ExactPence {
  const parsed = exactPenceV1.safeParse(raw);
  if (!parsed.success) throw new SharedMoneyError("INVALID_SHARED_MONEY");
  const value = exactPence(BigInt(parsed.data.numerator), BigInt(parsed.data.denominator));
  if (compareExactPence(value, exactPence(-BigInt(MAX_MONEY_PENCE))) < 0 ||
      compareExactPence(value, exactPence(BigInt(MAX_MONEY_PENCE))) > 0) throw new SharedMoneyError("INVALID_SHARED_MONEY");
  return value;
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
  const exactFee = multiplyExactPence(principal, exactPence(BigInt(input.rate.numerator), BigInt(input.rate.denominator)));
  const cumulativeFee = moneyFromBigInt(divideRounded(exactFee.numerator, exactFee.denominator, "half_even"));
  const postingDelta = moneyFromBigInt(BigInt(cumulativeFee.pence) - BigInt(money(input.priorNetPostedPence).pence));
  if (postingDelta.pence < 0 && input.compensatesDerivationId === null) throw new SharedMoneyError("COMPENSATION_LINK_REQUIRED");
  return Object.freeze({ version: "cumulative-fee.v1", policyVersion: input.rate.policyVersion,
    roundingPolicy: "commercial_half_even.v1", cumulativeFee, postingDelta,
    compensatesDerivationId: postingDelta.pence < 0 ? input.compensatesDerivationId : null });
}
