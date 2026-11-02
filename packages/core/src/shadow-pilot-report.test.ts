import { describe, expect, it } from "vitest";
import { generateShadowPilotReport } from "./shadow-pilot-report.js";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), lockId: id(3) };
const access = { ...binding, environment: "synthetic_demo", audience: "synthetic_researcher" };
function fixture() {
  return {
    version: "shadow-pilot-report-input.v1", environment: "synthetic_demo",
    immutableObservationSetRef: "synthetic:observations-1",
    measurement: {
      version: "shadow-pilot-measurement.v1", environment: "synthetic_demo", ...binding,
      snapshotRef: "synthetic:snapshot-1", immutableRecordSetRef: "synthetic:records-1",
      captures: [{ ...binding, id: "synthetic:capture-1" }], lockedLineIds: [],
      signals: [], receipts: [], allocations: [], mustSurface: [], subscriptionScenario: null,
    },
    reveal: { ...binding, id: "synthetic:reveal-1", revealedAt: "2026-10-30T12:00:00Z" },
    fairness: [{ ...binding, id: "synthetic:answer-1", revealId: "synthetic:reveal-1",
      answeredAt: "2026-10-30T12:01:00Z", rating: 4 }],
    harm: [{ ...binding, id: "synthetic:harm-1", harmObserved: false }],
    financialEffects: { accruals: 0, invoices: 0, collections: 0 },
  };
}
const report = (raw: unknown = fixture()) => generateShadowPilotReport(raw, access);

describe("M1-15S synthetic pilot report", () => {
  it("lists missing observations without inferring fairness or harm from usage", () => {
    const result = report({ ...fixture(), fairness: null, harm: null });
    expect(result.usage.capturesPerJob.value).toBe(1);
    expect(result.fairness.value).toBeNull();
    expect(result.harmFromWithholding.value).toBeNull();
    expect(result.missing).toEqual(expect.arrayContaining(["fairness", "harmFromWithholding", "hypotheticalSubscription"]));
    const empty = report({ ...fixture(), fairness: [], harm: [] });
    expect(empty.fairness.status).toBe("missing");
    expect(empty.harmFromWithholding.status).toBe("missing");
  });

  it.each(["2026-10-30T11:59:59Z", "2026-10-30T12:00:00Z", "2026-10-30T13:00:00+01:00"])("rejects fairness not after reveal: %s", time => {
    const input = fixture(); input.fairness[0]!.answeredAt = time;
    expect(() => report(input)).toThrow("INVALID_PILOT_REPORT");
  });

  it("requires the actual reveal and exact tenant/job/lock for each observation", () => {
    expect(() => report({ ...fixture(), reveal: null })).toThrow("INVALID_PILOT_REPORT");
    const input = fixture(); input.fairness[0]!.revealId = "synthetic:other";
    expect(() => report(input)).toThrow("INVALID_PILOT_REPORT");
    for (const key of ["tenantId", "jobId", "lockId"] as const) {
      for (const section of ["fairness", "harm"] as const) {
        const changed = fixture(); changed[section][0]![key] = id(99);
        expect(() => report(changed)).toThrow("INVALID_PILOT_REPORT");
      }
      const changed = fixture(); changed.reveal[key] = id(99);
      expect(() => report(changed)).toThrow("INVALID_PILOT_REPORT");
    }
  });

  it("validates timestamp precision and compares offsets and milliseconds", () => {
    const input = fixture();
    input.fairness[0]!.answeredAt = "2026-10-30T13:00:00.001+01:00";
    expect(report(input).fairness.status).toBe("observed");
    for (const time of ["2026-02-30T12:00:00Z", "not-a-date", "2026-10-30T12:00:00.0001Z"]) {
      input.fairness[0]!.answeredAt = time;
      expect(() => report(input)).toThrow("INVALID_PILOT_REPORT");
      expect(() => report({ ...fixture(), reveal: { ...fixture().reveal, revealedAt: time } })).toThrow("INVALID_PILOT_REPORT");
    }
  });

  it.each(["accruals", "invoices", "collections"] as const)("fails on any pilot fee %s, including a later reversal", field => {
    for (const value of [1, -1, null, undefined]) {
      expect(() => report({ ...fixture(), financialEffects: { ...fixture().financialEffects, [field]: value } })).toThrow("INVALID_PILOT_REPORT");
    }
  });

  it("reports fairness apart from usage, with every method and no approval or fee action", () => {
    const result = report();
    expect(result.fairness.value).toEqual([{ responseId: "synthetic:answer-1", rating: 4 }]);
    expect(result.usage).not.toHaveProperty("fairness");
    expect(result.harmFromWithholding.value).toEqual([{ observationId: "synthetic:harm-1", harmObserved: false }]);
    for (const metric of [...Object.values(result.usage), result.fairness, result.harmFromWithholding])
      expect(metric.method.length).toBeGreaterThan(30);
    expect(result.effects).toEqual({ accruals: 0, invoices: 0, collections: 0 });
    expect(result.releaseApproval).toBe(false);
    const input = fixture(); input.fairness[0]!.rating = 1;
    expect(report(input).usage).toEqual(result.usage);
    expect(report(input).inputDigest).not.toBe(result.inputDigest);
  });

  it("deduplicates immutable replays, rejects changed replay, and freezes cloned records", () => {
    const input = fixture(), original = report();
    input.fairness.push({ ...input.fairness[0]! }); input.harm.push({ ...input.harm[0]! });
    expect(report(input)).toEqual(original);
    input.fairness[1]!.rating = 2;
    expect(() => report(input)).toThrow("INVALID_PILOT_REPORT");
    expect(Object.isFrozen(original.records.fairness![0])).toBe(true);
    input.fairness[0]!.rating = 1;
    expect(original.records.fairness![0]!.rating).toBe(4);
  });

  it("has no real-data mode and refuses unavailable callers before reading hidden input", () => {
    for (const environment of ["production", "pilot_no_charge"])
      expect(() => report({ ...fixture(), environment })).toThrow("INVALID_PILOT_REPORT");
    for (const context of [{ ...access, environment: "pilot_no_charge" }, { ...access, audience: "builder" }, { ...access, lockId: null }])
      for (const input of [null, fixture()])
        expect(() => generateShadowPilotReport(input, context)).toThrow("MEASUREMENT_UNAVAILABLE");
    expect(() => generateShadowPilotReport(fixture(), { ...access, jobId: id(99) })).toThrow("MEASUREMENT_UNAVAILABLE");
    expect(() => report({ ...fixture(), customerName: "unapproved field" })).toThrow("INVALID_PILOT_REPORT");
    expect(() => report({ ...fixture(), measurement: { ...fixture().measurement, environment: "production" } })).toThrow("INVALID_PILOT_REPORT");
  });
});
