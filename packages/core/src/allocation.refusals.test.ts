import { describe, expect, it } from "vitest";
import { allocateMoney } from "./allocation.js";
import { money } from "./money.js";

describe("allocation refusals (fictional values)", () => {
  it("refuses duplicate allocation IDs", () => {
    expect(() => allocateMoney(money(100), [{ id: "a", weight: 1n }, { id: "a", weight: 1n }])).toThrow(/unique/u);
  });

  it("refuses duplicate IDs even when the money is zero", () => {
    expect(() => allocateMoney(money(0), [{ id: "a", weight: 1n }, { id: "a", weight: 2n }])).toThrow(RangeError);
  });

  it("refuses a negative weight, even when the total weight is positive", () => {
    expect(() => allocateMoney(money(100), [{ id: "a", weight: 3n }, { id: "b", weight: -1n }])).toThrow(/nonnegative/u);
  });

  it("refuses a zero total weight", () => {
    expect(() => allocateMoney(money(100), [{ id: "a", weight: 0n }, { id: "b", weight: 0n }])).toThrow(/positive/u);
    expect(() => allocateMoney(money(0), [{ id: "a", weight: 0n }])).toThrow(RangeError);
  });

  it("refuses non-zero money, positive or negative, without targets", () => {
    expect(() => allocateMoney(money(1), [])).toThrow(/targets/u);
    expect(() => allocateMoney(money(-1), [])).toThrow(RangeError);
  });

  it("passes zero money without targets and returns an empty allocation", () => {
    const result = allocateMoney(money(0), []);
    expect(result.size).toBe(0);
  });

  it("does not lose or invent pennies when it does allocate", () => {
    const result = allocateMoney(money(-101), [{ id: "a", weight: 1n }, { id: "b", weight: 1n }, { id: "c", weight: 1n }]);
    expect([...result.values()].reduce((sum, value) => sum + value.pence, 0)).toBe(-101);
  });
});
