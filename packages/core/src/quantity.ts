import { moneyFromBigInt, type Money } from "./money.js";
import { multiplyRatios } from "./rational.js";

export type Quantity = Readonly<{ scaled: bigint; scale: bigint; decimal: string }>;
export type DiscountRatio = Readonly<{ numerator: bigint; denominator: bigint }>;

export function parseQuantity(input: string, options: { adjustment?: boolean } = {}): Quantity {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(input)) throw new RangeError("Quantity must be a canonical decimal with at most six fractional places");
  if (input.startsWith("-") && !options.adjustment) throw new RangeError("Negative quantity requires an explicit adjustment type");
  const negative = input.startsWith("-");
  const parts = (negative ? input.slice(1) : input).split(".");
  const whole = parts[0] ?? "0";
  const fraction = parts[1] ?? "";
  const scale = 10n ** BigInt(fraction.length);
  const scaled = BigInt(whole) * scale + BigInt(fraction || "0");
  return Object.freeze({ scaled: negative ? -scaled : scaled, scale, decimal: input });
}

export function calculateNetLine(quantity: Quantity, unitRate: Money, discount: DiscountRatio = { numerator: 0n, denominator: 1n }): Money {
  if (discount.denominator <= 0n || discount.numerator < 0n || discount.numerator > discount.denominator) {
    throw new RangeError("Discount must be between zero and one");
  }
  return moneyFromBigInt(multiplyRatios(BigInt(unitRate.pence), [
    { numerator: quantity.scaled, denominator: quantity.scale },
    { numerator: discount.denominator - discount.numerator, denominator: discount.denominator },
  ], "half_even"));
}
