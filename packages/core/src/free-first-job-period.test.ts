import { describe, expect, it } from "vitest";
import { computeSubscriptionPeriod } from "./subscription-period.js";
import { syntheticMeterPolicyV1 } from "./jobs-on-the-go.js";
function suppliedPeriod(length: number, trialDays: number, plan: "Solo" | "Builder", places: number) {
  const start = length === 29 ? "2028-02-01" : length === 28 ? "2026-02-01" : length === 31 ? "2026-03-01" : "2026-04-01";
  const date = (offset: number) => new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  return { version: "subscription-period-preview.v1", meter: { version: "meter-supplied-period.v1", environment: "synthetic_demo",
    policy: syntheticMeterPolicyV1, startDate: start, endDateExclusive: date(length),
    days: Array.from({ length }, (_, i) => ({ date: date(i), plan, countedPlaces: places, trial: i < trialDays, annualPrepaid: false })) } };
}
describe("MON-3 parent pricing interaction over explicitly supplied trial days", () => {
  it("[MON3-A14] supplied trial days suppress both base and extras through the unchanged MON-2A calculator", () => {
    for (const plan of ["Solo", "Builder"] as const) {
      const result = computeSubscriptionPeriod(suppliedPeriod(30, 30, plan, 100));
      expect(result.principal.pence).toBe(0);
      expect(result.days.every(day => day.basePence === 0 && day.extraPence === 0)).toBe(true);
    }
    // Arithmetic fixture only. This does not select the chargeable conversion day or a billing anchor.
    const result = computeSubscriptionPeriod(suppliedPeriod(30, 10, "Solo", 1));
    expect(result.principal.pence).toBe(1933); expect(result.denominatorDays).toBe(30);
    expect(result.days.slice(0, 10).every(day => day.numeratorPence === "0")).toBe(true);
    expect(result.days.slice(10).every(day => day.basePence === 2900)).toBe(true);
  });
  it("[MON3-A14] trial and counted places remain separate; every supplied period remains below its monthly maximum", () => {
    let cases = 0;
    for (const length of [28, 29, 30, 31]) for (const plan of ["Solo", "Builder"] as const) for (let trialDays = 0; trialDays <= length; trialDays++) {
      for (const places of [0, 1, 5, 6, 7, 12, 13, 14, 100]) {
        const input = suppliedPeriod(length, trialDays, plan, places), before = JSON.stringify(input);
        const result = computeSubscriptionPeriod(input);
        expect(result.principal.pence).toBeGreaterThanOrEqual(0);
        expect(result.principal.pence).toBeLessThanOrEqual(syntheticMeterPolicyV1[plan].maximumPence);
        expect(result.days.every((day, i) => day.countedPlaces === places && (i >= trialDays || day.paidExtraPlaces === 0))).toBe(true);
        expect(JSON.stringify(input)).toBe(before); cases++;
      }
    }
    expect(cases).toBe(2196);
  });
  it("[MON3-A15] supplied preview refuses cached totals and hidden signals, never creates a statement", () => {
    const input = suppliedPeriod(30, 10, "Builder", 14);
    for (const extra of [{ cachedTrial: true }, { feeCreditPence: 1 }, { hiddenSignals: [] }, { amountPaid: 1 }]) {
      expect(() => computeSubscriptionPeriod({ ...input, ...extra })).toThrow();
    }
    expect(computeSubscriptionPeriod(input)).toMatchObject({ hypothetical: true, realExternalActions: 0 });
  });
});
