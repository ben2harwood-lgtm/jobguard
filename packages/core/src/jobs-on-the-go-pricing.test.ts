import { describe, expect, it } from "vitest";
import { allocateMoney } from "./allocation.js";
import { money } from "./money.js";
import { divideRounded } from "./rational.js";
import {
  syntheticMeterPolicyV1, computeSuppliedMeterPeriod, suppliedMeterPeriodV1,
  suppliedMeterPeriodResultV1, suppliedMeterCorrection, MeterFoundationError,
} from "./jobs-on-the-go.js";

const input = (plan: "Solo" | "Builder", places: number, length = 30, annualPrepaid = false, trial = false) => ({
  version: "meter-supplied-period.v1", environment: "synthetic_demo", policy: syntheticMeterPolicyV1,
  startDate: length === 31 ? "2026-03-01" : "2026-04-01", endDateExclusive: length === 31 ? "2026-04-01" : "2026-05-01",
  days: Array.from({ length }, (_, i) => ({ date: `${length === 31 ? "2026-03" : "2026-04"}-${String(i + 1).padStart(2, "0")}`, plan, annualPrepaid, trial, countedPlaces: places })),
});
const gbp = (pence: number) => ({ currency: "GBP", pence });

describe("MON-1 supplied aggregate arithmetic; event replay and job attribution held", () => {
  it.each([
    ["Solo", 5, 30, 4900], ["Solo", 6, 30, 4900], ["Builder", 8, 30, 8900],
    ["Builder", 12, 30, 16900], ["Builder", 100, 30, 16900],
  ] as const)("MON1-A21/A22 partial: %s with %i supplied places in %i days", (plan, places, length, pence) => {
    const result = computeSuppliedMeterPeriod(input(plan, places, length));
    expect(result.principal).toEqual(gbp(pence));
    expect(result.hypothetical).toBe(true);
    expect(result.realExternalActions).toBe(0);
    expect(suppliedMeterPeriodResultV1.safeParse(result).success).toBe(true);
  });
  it("MON1-A21 partial: Builder eight places on 15 of 30 days is £79.00", () => {
    const raw = input("Builder", 7);
    for (const day of raw.days.slice(0, 15)) day.countedPlaces = 8;
    expect(computeSuppliedMeterPeriod(raw).principal.pence).toBe(7900);
  });
  it("MON1-A21 partial: Builder eight places on one day of 31 is £69.65, rounded once", () => {
    const raw = input("Builder", 7, 31);
    raw.days[0]!.countedPlaces = 8;
    expect(computeSuppliedMeterPeriod(raw)).toMatchObject({ principal: gbp(6965), numeratorPence: "215900", denominatorDays: 31 });
  });
  it("MON1-A14 partial: explicitly supplied trial days suppress base and extras without establishing entitlement", () => {
    expect(computeSuppliedMeterPeriod(input("Builder", 100, 30, false, true)).principal.pence).toBe(0);
    const raw = input("Solo", 5);
    raw.days.slice(0, 15).forEach(day => { day.trial = true; });
    expect(computeSuppliedMeterPeriod(raw).principal.pence).toBe(2450);
  });
  it("MON1-A21 partial: annual-prepaid base is zero; extras remain undiscounted", () => {
    expect(computeSuppliedMeterPeriod(input("Builder", 7, 30, true)).principal.pence).toBe(0);
    expect(computeSuppliedMeterPeriod(input("Builder", 8, 30, true)).principal.pence).toBe(2000);
    expect(computeSuppliedMeterPeriod(input("Solo", 6, 30, true)).principal.pence).toBe(2000);
  });
  it("MON1-A21 partial: exact half-even ties and largest-remainder conserve supplied explicit weights", () => {
    for (const [n, expected] of [[1n, 0n], [3n, 2n], [5n, 2n], [-1n, 0n], [-3n, -2n]] as const) expect(divideRounded(n, 2n, "half_even")).toBe(expected);
    for (let pence = -100; pence <= 100; pence++) {
      const weights = [{ id: "supplied-a", weight: 1n }, { id: "supplied-b", weight: 2n }, { id: "supplied-c", weight: 3n }];
      const allocation = allocateMoney(money(pence), weights);
      expect([...allocation.values()].reduce((sum, value) => sum + value.pence, 0)).toBe(pence);
      expect(allocateMoney(money(pence), [...weights].reverse())).toEqual(allocation);
    }
    expect([...allocateMoney(money(1), [{ id: "a", weight: 1n }, { id: "b", weight: 1n }]).values()].map(v => v.pence)).toEqual([1, 0]);
  });
  it("MON1-A22 partial: caps bound all supplied totals and changing plan/trial schedules", () => {
    for (const plan of ["Solo", "Builder"] as const) {
      for (let count = 0; count <= 50; count++) {
        const raw = input(plan, count);
        for (let i = 0; i < raw.days.length; i++) {
          raw.days[i]!.plan = i % 2 === 0 ? "Solo" : "Builder";
          raw.days[i]!.trial = i % 3 === 0;
          raw.days[i]!.annualPrepaid = i % 5 === 0;
        }
        const result = computeSuppliedMeterPeriod(raw);
        expect(result.principal.pence).toBeLessThanOrEqual(result.maximum.pence);
        expect(result.maximum.pence).toBe(16900);
      }
    }
  });
  it("MON1-A02/A21 partial: both DST periods have calendar-day denominators and order-independent provenance", () => {
    const spring = input("Solo", 5, 31);
    const autumn = { ...spring, startDate: "2026-10-01", endDateExclusive: "2026-11-01", days: spring.days.map(day => ({ ...day, date: day.date.replace("2026-03", "2026-10") })) };
    for (const raw of [spring, autumn]) {
      expect(computeSuppliedMeterPeriod(raw).denominatorDays).toBe(31);
      expect(computeSuppliedMeterPeriod({ ...raw, days: [...raw.days].reverse() })).toEqual(computeSuppliedMeterPeriod(raw));
    }
  });
  it("MON1-A26 partial: signed correction arithmetic uses supplied amounts and creates no payment", () => {
    for (const [original, recomputed, expected] of [[4900, 2900, -2000], [2900, 4900, 2000], [4900, 4900, 0]]) {
      expect(suppliedMeterCorrection({ version: "meter-supplied-correction.v1", original: gbp(original!), recomputed: gbp(recomputed!) })).toEqual(gbp(expected!));
    }
    expect(() => suppliedMeterCorrection({ version: "meter-supplied-correction.v1", original: gbp(1_000_000_000_001), recomputed: gbp(0) })).toThrow(MeterFoundationError);
  });
  it("MON1-A33/A35 partial: invalid/missing policy, unsafe fields, incomplete schedule and production mode fail closed", () => {
    const good = input("Solo", 5);
    const invalid: unknown[] = [
      { ...good, policy: undefined }, { ...good, policy: { ...good.policy, version: "unknown" } },
      { ...good, policy: { ...good.policy, extraPlacePence: 1999 } }, { ...good, version: "unknown" },
      { ...good, environment: "production" }, { ...good, charge: true },
      { ...good, days: good.days.slice(1) }, { ...good, days: [...good.days.slice(1), good.days[1]] },
      { ...good, days: [{ ...good.days[0], countedPlaces: Number.MAX_SAFE_INTEGER + 1 }, ...good.days.slice(1)] },
      { ...good, days: [{ ...good.days[0], countedPlaces: -1 }, ...good.days.slice(1)] },
      { ...good, days: [{ ...good.days[0], pricePence: 0 }, ...good.days.slice(1)] },
      { ...good, startDate: "2026-02-30" }, { ...good, endDateExclusive: good.startDate },
    ];
    for (const raw of invalid) {
      expect(suppliedMeterPeriodV1.safeParse(raw).success).toBe(false);
      expect(() => computeSuppliedMeterPeriod(raw)).toThrow(MeterFoundationError);
    }
    expect(computeSuppliedMeterPeriod({ ...good, environment: "pilot_no_charge" })).toMatchObject({ hypothetical: true, realExternalActions: 0 });
  });
});
