import { describe, expect, it } from "vitest";
import { subscriptionCalendarPeriod, effectiveSubscriptionPlan, assertMonthlySubscriptionExecution } from "./subscription-persistence.js";
describe("persisted subscription calendar", () => {
  it("anchor 31 clamps and returns to 31", () => {
    expect(subscriptionCalendarPeriod({ anchorDay: 31, startMonth: "2028-02" })).toMatchObject({ startDate: "2028-02-29", endDateExclusive: "2028-03-31" });
    expect(subscriptionCalendarPeriod({ anchorDay: 31, startMonth: "2028-03" }).startDate).toBe("2028-03-31");
    expect(subscriptionCalendarPeriod({ anchorDay: 31, startMonth: "2027-02" })).toMatchObject({ startDate: "2027-02-28", endDateExclusive: "2027-03-31" });
  });
  it("same-day effective plan follows accepted revision", () => {
    expect(effectiveSubscriptionPlan({ date: "2028-03-01", revisions: [
      { revision: 3, effectiveDate: "2028-03-01", plan: "Builder" },
      { revision: 1, effectiveDate: "2028-02-01", plan: "Solo" },
      { revision: 2, effectiveDate: "2028-03-01", plan: "Solo" },
    ] }).plan).toBe("Builder");
  });
  it("actual London calendar days survive leap years and DST", () => {
    for (const [startMonth, length] of [["2028-02", 29], ["2027-02", 28], ["2028-03", 31], ["2028-10", 31], ["2028-04", 30]] as const) {
      expect(subscriptionCalendarPeriod({ anchorDay: 1, startMonth }).dates).toHaveLength(length);
    }
  });
  it("annual execution stays unavailable", () => {
    expect(() => assertMonthlySubscriptionExecution({ cadence: "annual", annualEnabled: false })).toThrow();
    expect(() => assertMonthlySubscriptionExecution({ cadence: "monthly", annualEnabled: true })).toThrow();
    expect(assertMonthlySubscriptionExecution({ cadence: "monthly", annualEnabled: false })).toBeUndefined();
  });
});
