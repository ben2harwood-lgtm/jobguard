export type RoundingMode = "half_even" | "half_up";

export function multiplyRatio(value: bigint, numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator <= 0n) throw new RangeError("Denominator must be positive");
  return divideRounded(value * numerator, denominator, mode);
}

export function multiplyRatios(
  value: bigint,
  factors: readonly Readonly<{ numerator: bigint; denominator: bigint }>[],
  mode: RoundingMode,
): bigint {
  let numerator = value;
  let denominator = 1n;
  for (const factor of factors) {
    if (factor.denominator <= 0n) throw new RangeError("Denominator must be positive");
    numerator *= factor.numerator;
    denominator *= factor.denominator;
  }
  return divideRounded(numerator, denominator, mode);
}

export function divideRounded(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator <= 0n) throw new RangeError("Denominator must be positive");
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const doubled = remainder * 2n;
  const increment = doubled > denominator ||
    (doubled === denominator && (mode === "half_up" || quotient % 2n === 1n));
  return sign * (increment ? quotient + 1n : quotient);
}
