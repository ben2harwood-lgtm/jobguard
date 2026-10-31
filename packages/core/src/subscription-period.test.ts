import { describe, expect, it } from "vitest";
import { syntheticMeterPolicyV1 } from "./jobs-on-the-go.js";
import { computeSubscriptionPeriod, roundSubscriptionContribution } from "./subscription-period.js";

function datePlus(start: string, n: number) {
  const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
function period(places: number, length = 30, plan: "Solo" | "Builder" = "Builder", start = "2026-04-01") {
  return { version: "subscription-period-preview.v1", meter: { version: "meter-supplied-period.v1", environment: "synthetic_demo", policy: syntheticMeterPolicyV1,
    startDate: start, endDateExclusive: datePlus(start, length), days: Array.from({ length }, (_, n) => ({ date: datePlus(start, n), plan, countedPlaces: places, trial: false, annualPrepaid: false })) } };
}
const principal = (input: unknown) => computeSubscriptionPeriod(input).principal.pence;

describe("MON-2A explicit supplied periods", () => {
  it("M2A-02 twelve monthly profile periods total 34800p Solo and 82800p Builder", () => {
    expect([1,1,1,2,2,2,2,2,2,3,3,4].reduce((sum, n) => sum + principal(period(n, 30, "Solo")), 0)).toBe(34800);
    expect([3,4,4,4,4,5,5,5,5,6,6,7].reduce((sum, n) => sum + principal(period(n)), 0)).toBe(82800);
  });
  it.each([[8, "Builder", 8900], [12, "Builder", 16900], [5, "Solo", 4900], [6, "Solo", 4900]] as const)("M2A-02 %i places on %s costs %ip", (n, plan, expected) => {
    expect(principal(period(n, 30, plan))).toBe(expected);
  });
  it("M2A-02 eight places for fifteen of thirty days is 7900p", () => {
    const input = period(8); input.meter.days.forEach((day, i) => { if (i < 15) day.countedPlaces = 7; });
    expect(principal(input)).toBe(7900);
    expect(computeSubscriptionPeriod(input).version).toBe("subscription-period-preview-result.v1");
  });
  it("M2A-02 Solo six upgraded on explicit day eleven is 6233p", () => {
    const input = period(6, 30, "Solo"); input.meter.days.forEach((day, i) => { if (i >= 10) day.plan = "Builder"; });
    expect(principal(input)).toBe(6233);
  });
  it("M2A-02 one extra day in thirty-one is 6965p", () => {
    const input = period(7, 31, "Builder", "2026-03-01"); input.meter.days[0]!.countedPlaces = 8;
    expect(principal(input)).toBe(6965);
  });
  it.each([28,29,30,31])("M2A-03 explicit %i local calendar dates use the actual denominator across leap and DST dates", length => {
    const input = period(8, length, "Builder", length === 29 ? "2028-02-01" : "2026-03-01");
    const result = computeSubscriptionPeriod(input);
    expect(result.denominatorDays).toBe(length); expect(result.numeratorPence).toBe(String(8900 * length)); expect(result.principal.pence).toBe(8900);
    expect(computeSubscriptionPeriod({ ...input, meter: { ...input.meter, days: [...input.meter.days].reverse() } })).toEqual(result);
  });
  it("M2A-03 sums before rounding; signed half-even ties and checked magnitudes", () => {
    for (const [numeratorPence, expected] of [["1",0],["3",2],["5",2],["-1",0],["-3",-2],["-5",-2]] as const) {
      expect(roundSubscriptionContribution({ version: "subscription-exact-contribution.v1", numeratorPence, denominator: 2 }).pence).toBe(expected);
    }
    const input = period(0, 28, "Solo"); input.meter.days.forEach((d, i) => { d.trial = i !== 0; });
    expect(principal(input)).toBe(104);
    for (const [numeratorPence, denominator] of [["1000000000001",1],["-1000000000001",1],["1",0],["01",2],["1.2",2],["1",1.5],["1",367],["9".repeat(100),1]] as const) {
      expect(() => roundSubscriptionContribution({ version: "subscription-exact-contribution.v1", numeratorPence, denominator })).toThrow();
    }
    expect(roundSubscriptionContribution({ version: "subscription-exact-contribution.v1", numeratorPence: "366000000000000", denominator: 366 }).pence).toBe(1000000000000);
  });
  it("M2A-04 bounded generated timelines, trials, prepayments and counts never exceed their ordinary maximum", () => {
    for (const length of [28,29,30,31]) for (let seed = 0; seed < 180; seed++) {
      const input = period(0, length);
      input.meter.days.forEach((d, i) => { d.plan = (seed + i) % 3 ? "Solo" : "Builder"; d.countedPlaces = (seed * 13 + i * 7) % 25; d.trial = (seed + i) % 11 === 0; d.annualPrepaid = seed % 7 === 0; });
      const result = computeSubscriptionPeriod(input);
      expect(result.principal.pence).toBeGreaterThanOrEqual(0); expect(result.principal.pence).toBeLessThanOrEqual(result.maximum.pence);
      const exact = input.meter.days.reduce((sum, d) => {
        const p = syntheticMeterPolicyV1[d.plan]; return sum + (d.trial ? 0n : BigInt(d.annualPrepaid ? 0 : p.monthlyPence) + BigInt(Math.min(Math.max(0, d.countedPlaces - p.included), p.extrasCap)) * 2000n);
      }, 0n);
      expect(result.numeratorPence).toBe(exact.toString());
    }
  });
  it("M2A-05 grace and excess add no charge without upgrade or job admission", () => {
    for (const n of [5,6,7,100]) expect(principal(period(n,30,"Solo"))).toBe(4900);
    for (const n of [12,13,14,15,16,17,100]) expect(principal(period(n))).toBe(16900);
  });
  it("M2A-12 supplied annual-prepaid days have zero base and undiscounted extras", () => {
    const input = period(8); input.meter.days.forEach(d => { d.annualPrepaid = true; });
    expect(principal(input)).toBe(2000); expect(computeSubscriptionPeriod(input).days.every(d => d.basePence === 0)).toBe(true);
  });
  it("M2A-13 supplied trial days contribute no base or extras", () => {
    const input = period(99); input.meter.days.forEach(d => { d.trial = true; }); expect(principal(input)).toBe(0);
  });
  it("M2A-08 M2A-30 unknown inputs, hidden data, missing dates and cached totals refuse without effects", () => {
    const input = period(8);
    for (const invalid of [{ ...input, hiddenSignals: [] }, { ...input, feePence: 1 }, { ...input, principal: 1 }, { ...input, meter: { ...input.meter, version: "unknown" } }, { ...input, meter: { ...input.meter, days: input.meter.days.slice(1) } }, { ...input, meter: { ...input.meter, environment: "production" } }]) expect(() => computeSubscriptionPeriod(invalid)).toThrow();
    const before = JSON.stringify(input); computeSubscriptionPeriod(input); expect(JSON.stringify(input)).toBe(before);
  });
});

it('SB-19: Signals or findings move the meter, a plan or a bill', () => {
 const input = period(8), before = JSON.stringify(input), bill = computeSubscriptionPeriod(input);
 expect(bill.principal.pence).toBe(8900);
 for (const key of ["hiddenSignals", "findings", "shadowSignals"]) {
  expect(() => computeSubscriptionPeriod({ ...input, [key]: [] })).toThrow();
  expect(() => computeSubscriptionPeriod({ ...input, meter: { ...input.meter, [key]: ["synthetic"] } })).toThrow();
 }
 expect(computeSubscriptionPeriod(input)).toEqual(bill);
 expect(JSON.stringify(input)).toBe(before);
});
