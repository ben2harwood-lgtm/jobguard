import { describe, expect, it } from "vitest";
import { addMoney, MAX_MONEY_PENCE, money, MoneyError, moneyFromBigInt, parseMoneyV1, parsePoundsToPence, serializeMoney, subtractMoney } from "./money.js";
import { divideRounded } from "./rational.js";

describe("Money", () => {
  it("accepts only bounded integer pence", () => {
    expect(money(MAX_MONEY_PENCE).pence).toBe(MAX_MONEY_PENCE);
    for (const invalid of [1.1, Number.NaN, Number.POSITIVE_INFINITY, MAX_MONEY_PENCE + 1]) expect(() => money(invalid)).toThrow(MoneyError);
    expect(() => moneyFromBigInt(BigInt(MAX_MONEY_PENCE) + 1n)).toThrowError(expect.objectContaining({ code: "overflow" }));
  });

  it("checks arithmetic overflow and currency mismatch", () => {
    expect(addMoney(money(100), money(25))).toEqual(money(125));
    expect(subtractMoney(money(100), money(125))).toEqual(money(-25));
    expect(() => addMoney(money(1), { pence: 1, currency: "EUR" } as never)).toThrowError(expect.objectContaining({ code: "currency_mismatch" }));
    expect(() => addMoney(money(MAX_MONEY_PENCE), money(1))).toThrowError(expect.objectContaining({ code: "overflow" }));
  });

  it("round-trips the versioned public integer serializer", () => {
    expect(parseMoneyV1(serializeMoney(money(-123)))).toEqual(money(-123));
    expect(() => parseMoneyV1({ schemaVersion: 1, pence: 100, currency: "EUR" })).toThrowError(expect.objectContaining({ code: "currency_mismatch" }));
    expect(() => parseMoneyV1({ schemaVersion: 2, pence: 100, currency: "GBP" })).toThrowError(expect.objectContaining({ code: "invalid_pence" }));
  });
});

describe("exact rounding", () => {
  it("covers positive and negative half-even ties", () => {
    expect([1n, 3n, 5n, -1n, -3n, -5n].map((n) => divideRounded(n, 2n, "half_even"))).toEqual([0n, 2n, 2n, 0n, -2n, -2n]);
  });
  it("covers sign-symmetric half-up ties", () => {
    expect([1n, 3n, -1n, -3n].map((n) => divideRounded(n, 2n, "half_up"))).toEqual([1n, 2n, -1n, -2n]);
  });
});

describe("decimal pounds input", () => {
  it.each([["0", 0], ["0.00", 0], ["0.01", 1], ["1.1", 110], ["1.15", 115], ["2.55", 255], ["20.00", 2000], ["10000000000.00", MAX_MONEY_PENCE]])("parses %s exactly", (input, expected) => {
    expect(parsePoundsToPence(String(input))).toBe(expected);
  });
  it.each(["", " ", " 20.00", "20.00 ", "-1.00", "+1", "01.00", ".50", "1.", "1.001", "1.999", "1e2", "NaN", "Infinity", "£20.00", "1,000.00", "1/2"])("rejects invalid input %s without rounding", input => {
    expect(() => parsePoundsToPence(input)).toThrowError(expect.objectContaining({ code: "invalid_pence" }));
  });
  it.each(["10000000000.01", "9007199254740993.00"])("rejects out-of-range %s", input => {
    expect(() => parsePoundsToPence(input)).toThrowError(expect.objectContaining({ code: "magnitude_exceeded" }));
  });
});
