import { describe, expect, it } from "vitest";
import { materialRateCommandV1 } from "./material.contracts.js";

const MAX_PENCE = 1_000_000_000_000;
const base = {
 version: "material-rate-command.v1",
 merchantName: "Test Merchant",
 sku: "SKU-1",
 description: "Test item",
 pricePence: 1250,
 priceUnit: "box",
 taxBasis: "net",
 effectiveFrom: "2026-03-01",
 sourceLabel: "Synthetic list",
 expectedVersion: 0,
};
const parse = (patch: Record<string, unknown>) => materialRateCommandV1.safeParse({ ...base, ...patch });

describe("material rate command input boundaries", () => {
 it("MI1: accepts price zero and the existing maximum", () => {
  expect(parse({ pricePence: 0 }).success).toBe(true);
  expect(parse({ pricePence: MAX_PENCE }).success).toBe(true);
 });

 it.each([
  ["negative", -1],
  ["fractional", 10.5],
  ["NaN", Number.NaN],
  ["Infinity", Number.POSITIVE_INFINITY],
  ["negative Infinity", Number.NEGATIVE_INFINITY],
  ["coerced numeric string", "100"],
  ["coerced empty string", ""],
  ["coerced boolean", true],
  ["null", null],
  ["above the maximum", MAX_PENCE + 1],
  ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
 ])("MI1: refuses a %s price", (_label, pricePence) => {
  expect(parse({ pricePence }).success).toBe(false);
 });

 it("MI1: refuses a missing price", () => {
  const { pricePence: _omit, ...rest } = base;
  expect(materialRateCommandV1.safeParse(rest).success).toBe(false);
 });

 it("MI2: accepts real calendar dates, a leap day, and equal start and end dates", () => {
  expect(parse({ effectiveFrom: "2028-02-29", effectiveTo: "2028-03-01" }).success).toBe(true);
  expect(parse({ effectiveFrom: "2026-03-01", effectiveTo: "2026-03-01" }).success).toBe(true);
  expect(parse({ effectiveFrom: "2026-03-01", effectiveTo: "2026-12-31" }).success).toBe(true);
 });

 it.each([
  ["February 30", "2026-02-30"],
  ["non-leap February 29", "2027-02-29"],
  ["month 13", "2026-13-01"],
  ["day 00", "2026-03-00"],
  ["wrong format", "01/03/2026"],
  ["date-time", "2026-03-01T00:00:00Z"],
  ["empty", ""],
 ])("MI2: refuses an invalid effectiveFrom (%s)", (_label, effectiveFrom) => {
  expect(parse({ effectiveFrom }).success).toBe(false);
 });

 it.each([
  ["February 30", "2026-02-30"],
  ["month 13", "2026-13-01"],
  ["wrong format", "01/03/2026"],
  ["date-time", "2026-03-01T00:00:00Z"],
 ])("MI2: refuses an invalid effectiveTo (%s)", (_label, effectiveTo) => {
  expect(parse({ effectiveFrom: "2026-01-01", effectiveTo }).success).toBe(false);
 });

 it("MI2: refuses an end date before the start date", () => {
  expect(parse({ effectiveFrom: "2026-03-02", effectiveTo: "2026-03-01" }).success).toBe(false);
  expect(parse({ effectiveFrom: "2027-01-01", effectiveTo: "2026-12-31" }).success).toBe(false);
 });

 it("MI3: an omitted end date stays omitted", () => {
  const r = parse({});
  expect(r.success).toBe(true);
  if (r.success) {
   expect(r.data.effectiveTo).toBeUndefined();
   expect("effectiveTo" in r.data).toBe(false);
  }
 });

 it("MI3: accepted input retains the price, unit, tax and date fields", () => {
  const r = parse({ pricePence: 999, priceUnit: "bag", taxBasis: "gross", effectiveTo: "2026-06-30" });
  expect(r.success).toBe(true);
  if (r.success) {
   expect(r.data).toMatchObject({
    pricePence: 999,
    priceUnit: "bag",
    taxBasis: "gross",
    effectiveFrom: "2026-03-01",
    effectiveTo: "2026-06-30",
    expectedVersion: 0,
   });
  }
 });

 it("MI3: refuses an unknown price unit or tax basis", () => {
  expect(parse({ priceUnit: "pallet" }).success).toBe(false);
  expect(parse({ taxBasis: "vat" }).success).toBe(false);
 });
});
