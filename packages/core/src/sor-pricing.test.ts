import { describe, expect, it } from "vitest";
import { priceSorLine, selectSorVersion, sorVersionImportV1 } from "./sor-pricing.js";
const id = "11000000-0000-4000-8000-000000000001";
const price = (quantity: string, ratePence: number, numerator = "0", denominator = "1000") =>
  priceSorLine({ version: "sor-line-pricing.v1", quantity, rate: { pence: ratePence, currency: "GBP" }, adjustment: { numerator, denominator } });
describe("ENT-2 exact SoR pricing (DW5)", () => {
  it.each([
    ["1", 10000, "-35", "1000", 9650],
    ["1", 10000, "0", "1000", 10000],
    ["1", 10000, "35", "1000", 10350],
    ["0.125", 10000, "-35", "1000", 1206],
    ["0.5", 1, "0", "1", 0],
    ["0.5", 3, "0", "1", 2],
    ["1.5", 3, "0", "1", 4],
    ["0", 10000, "1", "1", 0],
    ["1", 10000, "-1000", "1000", 0],
    ["0.5", 1, "1", "1", 1],
  ])("quantity %s × %ip adjusted by %s/%s → %ip", (q, r, n, d, result) => {
    expect(price(q, r, n, d)).toEqual({ pence: result, currency: "GBP" });
  });
  it.each([
    ["1", 10000, "-1001", "1000", "NEGATIVE_MULTIPLIER"],
    ["2", 1000000000000, "0", "1", "MONEY_OUT_OF_RANGE"],
    ["1", 1000000000001, "0", "1", "MONEY_OUT_OF_RANGE"],
    ["-1", 10000, "0", "1", "NEGATIVE_QUANTITY"],
    ["1.1234567", 10000, "0", "1", "QUANTITY_PRECISION"],
    ["1", 10000, "0", "0", "INVALID_ADJUSTMENT"],
    ["1", 10000, "1.5", "1", "INVALID_ADJUSTMENT"],
  ])("refuses %s × %ip adjusted by %s/%s as %s", (q, r, n, d, code) => {
    expect(() => price(q, r, n, d)).toThrow(code);
  });
  it("rejects currency, unsafe integers, floats and unbounded decimals", () => {
    expect(() => price("1", 1.5)).toThrow("MONEY_OUT_OF_RANGE");
    expect(() => price("9".repeat(100000), 1)).toThrow("INVALID_QUANTITY");
    expect(() => priceSorLine({ version: "sor-line-pricing.v1", quantity: "1", rate: { pence: 100, currency: "EUR" }, adjustment: { numerator: "0", denominator: "1" } })).toThrow("INVALID_COMMAND");
  });
  it("selects only a contract-authorized version in force on issue date, independent of input order", () => {
    const next = "11000000-0000-4000-8000-000000000002";
    const foreign = "11000000-0000-4000-8000-000000000003";
    const versions = [{ id: next, effectiveFrom: "2026-10-01" }, { id, effectiveFrom: "2026-01-01" }, { id: foreign, effectiveFrom: "2026-09-01" }];
    expect(selectSorVersion("2026-09-30", [id, next], versions).id).toBe(id);
    expect(selectSorVersion("2026-10-01", [id, next], versions).id).toBe(next);
    expect(() => selectSorVersion("2025-12-31", [id], versions)).toThrow("SOR_VERSION_NOT_FOUND");
    expect(() => selectSorVersion("2026-10-01", [id, next], [{ id, effectiveFrom: "2026-01-01" }, { id: next, effectiveFrom: "2026-01-01" }])).toThrow("AMBIGUOUS_SOR_VERSION");
    expect(() => selectSorVersion("bad", [id], versions)).toThrow("INVALID_COMMAND");
  });
  it("strictly validates immutable rate versions and rejects duplicate codes", () => {
    const command = { version: "sor-version-import.v1", environment: "synthetic_demo", commandId: id, scheduleId: id, reference: "Generated rates", effectiveFrom: "2026-01-01", items: [{ code: "REPAIR", description: "Fictional repair", unit: "each", rate: { pence: 10000, currency: "GBP" } }] };
    expect(sorVersionImportV1.safeParse(command).success).toBe(true);
    expect(sorVersionImportV1.safeParse({ ...command, tenantId: id }).success).toBe(false);
    expect(sorVersionImportV1.safeParse({ ...command, items: [command.items[0], command.items[0]] }).success).toBe(false);
    expect(sorVersionImportV1.safeParse({ ...command, items: [{ ...command.items[0], rate: { pence: 1000000000001, currency: "GBP" } }] }).success).toBe(false);
  });
});
