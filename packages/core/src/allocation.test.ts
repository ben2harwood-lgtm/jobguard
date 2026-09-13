import { describe, expect, it } from "vitest";
import { allocateMoney } from "./allocation.js";
import { money } from "./money.js";

describe("deterministic penny allocation", () => {
  it("conserves positive and negative totals with a stable ID tie-break", () => {
    expect([...allocateMoney(money(2), [{ id: "b", weight: 1n }, { id: "a", weight: 1n }, { id: "c", weight: 1n }])]).toEqual([
      ["b", money(1)], ["a", money(1)], ["c", money(0)],
    ]);
    expect([...allocateMoney(money(-1), [{ id: "b", weight: 1n }, { id: "a", weight: 1n }])]).toEqual([["b", money(0)], ["a", money(-1)]]);
  });
  it("conserves pennies across generated weights", () => {
    for (let total = -101; total <= 101; total += 1) {
      const result = allocateMoney(money(total), [{ id: "c", weight: 7n }, { id: "a", weight: 3n }, { id: "b", weight: 11n }]);
      expect([...result.values()].reduce((sum, value) => sum + value.pence, 0)).toBe(total);
      expect([...allocateMoney(money(total), [{ id: "c", weight: 7n }, { id: "a", weight: 3n }, { id: "b", weight: 11n }])]).toEqual([...result]);
    }
  });
});
