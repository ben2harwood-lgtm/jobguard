export const MAX_MONEY_PENCE = 1_000_000_000_000;

declare const penceBrand: unique symbol;
export type Pence = number & { readonly [penceBrand]: "Pence" };
export type Money = Readonly<{ pence: Pence; currency: "GBP" }>;
export type MoneyV1 = Readonly<{ schemaVersion: 1; pence: number; currency: "GBP" }>;

export class MoneyError extends Error {
  constructor(
    public readonly code: "invalid_pence" | "magnitude_exceeded" | "currency_mismatch" | "overflow",
    message: string,
  ) {
    super(message);
    this.name = "MoneyError";
  }
}

export function money(pence: number): Money {
  if (!Number.isSafeInteger(pence)) throw new MoneyError("invalid_pence", "Pence must be a safe integer");
  if (Math.abs(pence) > MAX_MONEY_PENCE) throw new MoneyError("magnitude_exceeded", "Money exceeds the application limit");
  return Object.freeze({ pence: pence as Pence, currency: "GBP" as const });
}

export function moneyFromBigInt(pence: bigint): Money {
  const limit = BigInt(MAX_MONEY_PENCE);
  if (pence < -limit || pence > limit) throw new MoneyError("overflow", "Money result exceeds the application limit");
  return money(Number(pence));
}

export function serializeMoney(value: Money): MoneyV1 {
  return Object.freeze({ schemaVersion: 1, pence: value.pence, currency: value.currency });
}

export function parseMoneyV1(value: unknown): Money {
  if (typeof value !== "object" || value === null) throw new MoneyError("invalid_pence", "Money must be an object");
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== 1 || candidate.currency !== "GBP" || typeof candidate.pence !== "number") {
    throw new MoneyError(candidate.currency === "GBP" ? "invalid_pence" : "currency_mismatch", "Invalid Money v1 payload");
  }
  return money(candidate.pence);
}

export function addMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return moneyFromBigInt(BigInt(left.pence) + BigInt(right.pence));
}

export function subtractMoney(left: Money, right: Money): Money {
  assertSameCurrency(left, right);
  return moneyFromBigInt(BigInt(left.pence) - BigInt(right.pence));
}

export function assertSameCurrency(left: { currency: string }, right: { currency: string }): void {
  if (left.currency !== right.currency || left.currency !== "GBP") {
    throw new MoneyError("currency_mismatch", "Money currencies must both be GBP");
  }
}
