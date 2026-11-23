import { describe, expect, it } from "vitest";
import { calculateMaterialPackCount } from "./materials.js";

const input = {
  measurement: { quantity: "6", unit: "m²", confirmed: true },
  wastageMultiplier: "1.10",
  product: { packSize: { quantity: "1.2", unit: "m²" } },
  confirmedUsablePacksSetAside: 0n,
};

describe("material pack count", () => {
  it.each([
    [0n, 6n, 0n],
    [1n, 5n, 1n],
    [10n, 0n, 6n],
  ])("calculates the order when %s usable packs are set aside", (setAside, neededPacks, setAsidePacksUsed) => {
    expect(calculateMaterialPackCount({ ...input, confirmedUsablePacksSetAside: setAside })).toEqual({
      status: "calculated", grossPacks: 6n, setAsidePacksUsed, neededPacks,
    });
  });

  it.each([
    ["6", 5n],
    ["6.000001", 6n],
    ["10808639105689191.6", 9007199254740993n],
  ])("rounds %s m² up to a whole pack using exact arithmetic", (quantity, grossPacks) => {
    expect(calculateMaterialPackCount({
      ...input,
      measurement: { ...input.measurement, quantity },
      wastageMultiplier: "1.00",
    })).toEqual({ status: "calculated", grossPacks, setAsidePacksUsed: 0n, neededPacks: grossPacks });
  });

  it.each([
    ["measurement", { measurement: null }],
    ["measurement", { measurement: { ...input.measurement, confirmed: false } }],
    ["measurement", { measurement: { ...input.measurement, unit: "" } }],
    ["product", { product: null }],
    ["pack_size", { product: {} }],
    ["pack_size", { product: { packSize: { ...input.product.packSize, unit: "" } } }],
    ["unit_mismatch", { product: { packSize: { ...input.product.packSize, unit: "each" } } }],
    ["wastage_multiplier", { wastageMultiplier: null }],
    ["set_aside_packs", { confirmedUsablePacksSetAside: -1n }],
  ] as const)("asks for input when %s needs attention", (reason, change) => {
    expect(calculateMaterialPackCount({ ...input, ...change })).toEqual({ status: "needs_input", reason });
  });

  it.each(["0", "0.000000", "-1", "abc", "1e2", "1.0000001"])("refuses invalid decimal %s", (quantity) => {
    expect(calculateMaterialPackCount({
      ...input, measurement: { ...input.measurement, quantity },
    })).toEqual({ status: "needs_input", reason: "measurement" });
    expect(calculateMaterialPackCount({
      ...input, product: { packSize: { ...input.product.packSize, quantity } },
    })).toEqual({ status: "needs_input", reason: "pack_size" });
    expect(calculateMaterialPackCount({ ...input, wastageMultiplier: quantity }))
      .toEqual({ status: "needs_input", reason: "wastage_multiplier" });
  });
});
