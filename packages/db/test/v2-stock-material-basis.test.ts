import { describe, expect, it } from "vitest";
import { nextStockMaterialBasis } from "../src/v2-stock-material-basis.js";

describe("stock follows the confirmed product and pack basis", () => {
  const ceramic = { product: "Ceramic tiles", packSize: { quantity: "1", unit: "m²" }, setAsidePacks: "4" };
  it("keeps ordinary edits and equivalent decimal pack sizes on the same basis", () => {
    const original = nextStockMaterialBasis(undefined, ceramic, 0);
    const noteEdit = nextStockMaterialBasis(original, {}, 1);
    const equivalent = nextStockMaterialBasis(noteEdit, { packSize: { quantity: "1.0000", unit: "m²" } }, 2);
    expect(equivalent).toMatchObject({ since: 0, confirmedSetAside: "4" });
  });
  it("preserves old evidence without treating a repeated form value as newly confirmed stock", () => {
    const original = nextStockMaterialBasis(undefined, ceramic, 0);
    const replacement = nextStockMaterialBasis(original, { ...ceramic, product: "Oak flooring" }, 1);
    expect(replacement).toMatchObject({ since: 1, confirmedSetAside: "0" });
    const echoed = nextStockMaterialBasis(replacement, { product: "Oak flooring", setAsidePacks: "4" }, 2);
    expect(echoed.confirmedSetAside).toBe("0");
    expect(nextStockMaterialBasis(echoed, { setAsidePacks: "4" }, 3).confirmedSetAside).toBe("4");
    expect(nextStockMaterialBasis(echoed, { product: "Oak flooring", setAsidePacks: "2" }, 3).confirmedSetAside).toBe("2");
    expect(original.confirmedSetAside).toBe("4");
  });
  it("requires complete pack identity and does not revive an old receipt by changing back", () => {
    let basis = nextStockMaterialBasis(undefined, ceramic, 0);
    basis = nextStockMaterialBasis(basis, { packSize: null }, 1);
    expect(basis).toMatchObject({ since: null, confirmedSetAside: "0" });
    basis = nextStockMaterialBasis(basis, { packSize: { quantity: "2", unit: "m²" } }, 2);
    expect(basis).toMatchObject({ since: 2, confirmedSetAside: "0" });
    expect(nextStockMaterialBasis(basis, { packSize: ceramic.packSize }, 3).since).toBe(3);
    expect(nextStockMaterialBasis(basis, { packSize: { quantity: "2", unit: "m" } }, 3).since).toBe(3);
  });
  it("preserves declared packs when completing the first basis across different edits", () => {
    const initial = nextStockMaterialBasis(undefined, { product: ceramic.product, setAsidePacks: "4" }, 0);
    expect(initial.since).toBeNull();
    const completed = nextStockMaterialBasis(initial, { packSize: ceramic.packSize }, 1);
    expect(completed).toMatchObject({ since: 1, confirmedSetAside: "4" });
    expect(nextStockMaterialBasis(completed, ceramic, 2).confirmedSetAside).toBe("4");

    const packFirst = nextStockMaterialBasis(undefined, { packSize: ceramic.packSize, setAsidePacks: "4" }, 0);
    expect(nextStockMaterialBasis(packFirst, { product: ceramic.product }, 1)).toMatchObject({ since: 1, confirmedSetAside: "4" });
  });
  it("cannot carry provisional set-aside across a substitution before the first complete basis", () => {
    const initial = nextStockMaterialBasis(undefined, { product: ceramic.product, setAsidePacks: "4" }, 0);
    const replacement = nextStockMaterialBasis(initial, { product: "Oak flooring", setAsidePacks: "4" }, 1);
    const completed = nextStockMaterialBasis(replacement, { packSize: ceramic.packSize }, 2);
    expect(completed).toMatchObject({ since: 2, confirmedSetAside: "0" });
  });
});
