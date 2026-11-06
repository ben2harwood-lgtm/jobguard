import { describe, expect, it } from "vitest";
import { addMoney, MAX_MONEY_PENCE, money, MoneyError, moneyFromBigInt, subtractMoney } from "./money.js";

const LIMIT = BigInt(MAX_MONEY_PENCE);

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof MoneyError) return error.code;
    throw error;
  }
  return undefined;
}

describe("negative money limit (fictional values)", () => {
  it("passes at exactly the negative limit", () => {
    expect(money(-MAX_MONEY_PENCE).pence).toBe(-MAX_MONEY_PENCE);
    expect(moneyFromBigInt(-LIMIT).pence).toBe(-MAX_MONEY_PENCE);
  });

  it("refuses one below the negative limit with the typed overflow code on bigint conversion", () => {
    expect(codeOf(() => moneyFromBigInt(-LIMIT - 1n))).toBe("overflow");
  });

  it("refuses one above the positive limit with the typed overflow code on bigint conversion", () => {
    expect(codeOf(() => moneyFromBigInt(LIMIT + 1n))).toBe("overflow");
  });

  it("subtraction reaching the negative limit passes, one below refuses with overflow", () => {
    expect(subtractMoney(money(-MAX_MONEY_PENCE + 1), money(1)).pence).toBe(-MAX_MONEY_PENCE);
    expect(codeOf(() => subtractMoney(money(-MAX_MONEY_PENCE), money(1)))).toBe("overflow");
  });

  it("addition reaching the negative limit passes, one below refuses with overflow", () => {
    expect(addMoney(money(-MAX_MONEY_PENCE + 1), money(-1)).pence).toBe(-MAX_MONEY_PENCE);
    expect(codeOf(() => addMoney(money(-MAX_MONEY_PENCE), money(-1)))).toBe("overflow");
  });

  it("direct construction one below the limit is a different code (magnitude_exceeded), not overflow", () => {
    expect(codeOf(() => money(-MAX_MONEY_PENCE - 1))).toBe("magnitude_exceeded");
  });
});
