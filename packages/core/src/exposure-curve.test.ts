import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "./money.js";
import { EXPOSURE_CURVE_ENABLED, ExposureCurveError, EXPOSURE_SOURCE, evaluateExposureCurve, exposureScheduleFixture } from "./exposure-curve.js";

describe("MON-7b synthetic stage exposure", () => {
  it("shows exact independent cumulative exposure, with a source and both dates for every figure", () => {
    const result = evaluateExposureCurve(exposureScheduleFixture());
    expect(result.points.map(point => point.atRisk?.pence)).toEqual([100000, 300000, 0]);
    expect(result.points.map(point => point.date)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    for (const point of result.points) {
      expect(point).toMatchObject({ status: "advisory", source: { ...EXPOSURE_SOURCE,
        retrievedAt: "2026-10-31T12:00:00.000Z", observedAt: "2026-10-31T12:00:00.000Z" } });
      expect(point.atRisk?.currency).toBe("GBP");
    }
  });
  it.each(["source", "cumulativeWorkValue", "cumulativeReceipts"] as const)("missing %s is unknown, never zero or clear", field => {
    const input = exposureScheduleFixture(); input.stages[0]![field] = null;
    expect(evaluateExposureCurve(input).points[0]).toMatchObject({ status: "unknown", reason: "missing", atRisk: null, cumulativeWorkValue: null, cumulativeReceipts: null });
    expect(evaluateExposureCurve(input).points[1]!.status).toBe("advisory");
  });
  it.each([
    ["2026-10-30T12:59:59.999Z", "2026-10-31T12:00:00.000Z", "stale"],
    [null, "2026-10-31T12:00:00.000Z", "missing"],
    ["2026-10-31T12:01:00.000Z", "2026-10-31T12:00:00.000Z", "future"],
    ["2026-10-31T12:00:00.000Z", "2026-11-01T12:00:00.000Z", "future"],
  ])("fails closed for source dates %s / %s", (observedAt, retrievedAt, reason) => {
    const input = exposureScheduleFixture();
    input.stages[0]!.source = { ...EXPOSURE_SOURCE, observedAt, retrievedAt: retrievedAt! };
    expect(evaluateExposureCurve(input).points[0]).toMatchObject({ status: "unknown", reason, atRisk: null });
  });
  it("includes the exact source age boundary and does not treat future stage dates as future observations", () => {
    const input = exposureScheduleFixture(); input.stages[0]!.source!.observedAt = "2026-10-30T13:00:00.000Z";
    expect(evaluateExposureCurve(input).points[0]!.status).toBe("advisory");
  });
  it("uses exact bounded pence and floors excess receipts at zero without creating credit or recovery", () => {
    const input = exposureScheduleFixture();
    input.stages[0]!.cumulativeWorkValue!.pence = MAX_MONEY_PENCE;
    input.stages[0]!.cumulativeReceipts!.pence = MAX_MONEY_PENCE - 1;
    input.stages[1]!.cumulativeWorkValue!.pence = 1;
    input.stages[1]!.cumulativeReceipts!.pence = MAX_MONEY_PENCE;
    expect(evaluateExposureCurve(input).points.map(point => point.atRisk?.pence)).toEqual([1, 0, 0]);
  });
  it("rejects forged citations, invalid money/dates, duplicate stages and non-synthetic inputs with typed errors", () => {
    const fixture = exposureScheduleFixture();
    const stage = fixture.stages[0]!;
    const badStages = [
      { ...stage, source: { ...stage.source, id: "live-provider" } },
      { ...stage, source: { ...stage.source, retrievedAt: undefined } },
      { ...stage, source: { ...stage.source, observedAt: "bad" } },
      { ...stage, date: "2026-02-30" },
      ...[-1, 0.5, MAX_MONEY_PENCE + 1, NaN, Infinity].map(pence => ({ ...stage, cumulativeWorkValue: { pence, currency: "GBP" } })),
      { ...stage, cumulativeReceipts: { pence: 1, currency: "USD" } },
    ];
    for (const bad of badStages) expect(() => evaluateExposureCurve({ ...fixture, stages: [bad] })).toThrow(ExposureCurveError);
    for (const bad of [
      { ...fixture, environment: "production" }, { ...fixture, tenantId: "forged" },
      { ...fixture, stages: [] }, { ...fixture, stages: [stage, stage] },
      { ...fixture, stages: [...fixture.stages].reverse() },
    ]) expect(() => evaluateExposureCurve(bad)).toThrow(ExposureCurveError);
  });
  it("is dark, deterministic and read-only, with no command, fee, receipt or meter output", () => {
    const input = exposureScheduleFixture(), before = JSON.stringify(input);
    const result = evaluateExposureCurve(input);
    expect(EXPOSURE_CURVE_ENABLED).toBe(false);
    expect(result).toEqual(evaluateExposureCurve(input));
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.keys(result).sort()).toEqual(["version", "environment", "referenceOnly", "policyVersion", "maximumAgeMinutes", "evaluatedAt", "points"].sort());
    expect(Object.isFrozen(result.points[0]!.source)).toBe(true);
    input.stages[0]!.source!.observedAt = null;
    expect(result.points[0]!.source!.observedAt).not.toBeNull();
  });
});
