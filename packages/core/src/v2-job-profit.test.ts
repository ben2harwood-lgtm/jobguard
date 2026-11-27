import { describe, expect, it } from "vitest";
import { v2JobProfit, v2JobProfitV1 } from "./v2-job-profit.js";

describe("V2-K10 recorded job profit", () => {
  it("shows the corrected ex-VAT example without a forecast", () => {
    expect(v2JobProfit("1840000", "125000", "910000")).toEqual({
      version: "v2-job-profit.v1", currency: "GBP", taxBasis: "ex-VAT",
      quoted: { pence: 1840000, currency: "GBP" }, approvedExtras: { pence: 125000, currency: "GBP" }, jobTotal: { pence: 1965000, currency: "GBP" },
      recordedCosts: { pence: 910000, currency: "GBP" }, leftInBudget: { pence: 1055000, currency: "GBP" }, spentPercent: "46.31",
      notice: "Costs recorded so far only.",
      summary: "Quoted £18,400.00, approved extras £1,250.00, job total £19,650.00, recorded costs so far £9,100.00 (46.31% spent so far), £10,550.00 left in the budget. All figures ex-VAT.",
    });
  });
  it.each([null, "0"])("has no percentage without an accepted price: %s", quoted => {
    const result = v2JobProfit(quoted, "10000", "100");
    expect(result.summary).toContain("No accepted price yet");
    expect(result.summary).not.toContain("%");
    expect(result.spentPercent).toBeNull();
    expect(result.leftInBudget).toBeNull();
  });
  it("has no percentage when approved omissions reduce the total to zero", () => {
    expect(v2JobProfit("100", "-100", "20").spentPercent).toBeNull();
  });
  it("keeps overspend, omissions and supplier credits signed", () => {
    expect(v2JobProfit("10000", "-2000", "10000")).toMatchObject({ leftInBudget: { pence: -2000, currency: "GBP" }, spentPercent: "125.00" });
    expect(v2JobProfit("10000", "0", "-100")).toMatchObject({ recordedCosts: { pence: -100, currency: "GBP" }, leftInBudget: { pence: 10100, currency: "GBP" }, spentPercent: "-1.00" });
  });
  it("uses the existing half-even rule for display ties", () => {
    expect(v2JobProfit("20000", "0", "1").spentPercent).toBe("0.00");
    expect(v2JobProfit("20000", "0", "3").spentPercent).toBe("0.02");
  });
  it("returns money only as the shared { pence, currency } shape", () => {
    expect(v2JobProfitV1.safeParse({ ...v2JobProfit("100", "0", "0"), quoted: "1.00" }).success).toBe(false);
    expect(v2JobProfitV1.safeParse({ ...v2JobProfit("100", "0", "0"), quoted: { pence: 1.5, currency: "GBP" } }).success).toBe(false);
    expect(v2JobProfitV1.safeParse({ ...v2JobProfit("100", "0", "0"), quoted: { pence: 1_000_000_000_001, currency: "GBP" } }).success).toBe(false);
  });
  it("refuses out-of-range totals instead of truncating them", () => {
    expect(() => v2JobProfit("1000000000000", "1", "0")).toThrow();
    expect(() => v2JobProfit("1", "0", "1000000000001")).toThrow();
  });
});
