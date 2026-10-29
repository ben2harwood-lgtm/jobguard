import { describe, expect, it } from "vitest";
import { measureShadowPilot } from "./shadow-pilot-measurement.js";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = { tenantId: id(1), jobId: id(2), lockId: id(3) };
const access = { ...binding, environment: "synthetic_demo", audience: "synthetic_researcher" };
function fixture() {
  return {
    version: "shadow-pilot-measurement.v1", environment: "synthetic_demo", ...binding,
    snapshotRef: "synthetic:snapshot-1", immutableRecordSetRef: "synthetic:record-set-1",
    captures: [{ ...binding, id: "synthetic:capture-1" }], lockedLineIds: ["synthetic:line-1"],
    signals: [{ ...binding, id: "synthetic:signal-1", workId: "synthetic:work-1", source: "voice",
      remainingAtLock: true, falsePositive: false, confirmedNetPence: 10005, attributionDisputed: false,
      useful: true, disclosedBeforeLock: false, builderCaptured: false,
      qualifyingAttributionRef: "synthetic:attribution-1", lockedLineId: null as string | null }],
    receipts: [{ ...binding, id: "synthetic:receipt-1", settledNetPence: 10005 }],
    allocations: [{ ...binding, id: "synthetic:allocation-1", signalId: "synthetic:signal-1", receiptId: "synthetic:receipt-1",
      netPence: 10005, reversesId: null as string | null, verifiedEvidenceRef: "synthetic:evidence-1" }],
    mustSurface: [{ ...binding, id: "synthetic:must-surface-1", surfacedByDeadline: false }],
    subscriptionScenario: { id: "synthetic:scenario-1", periodRef: "synthetic:october-2026", pence: 7900 },
  };
}
const report = (raw: unknown = fixture()) => measureShadowPilot(raw, access);

describe("M1-15S dark synthetic measurement instruments", () => {
  it("computes every requested instrument with its method and no financial effects", () => {
    const result = report();
    expect(result.metrics.capturesPerJob.value).toBe(1);
    expect(result.metrics.signalsRemainingAtLock.value).toBe(1);
    expect(result.metrics.falsePositives.value).toBe(0);
    expect(result.metrics.confirmedAmount.value).toEqual({ pence: 10005, currency: "GBP" });
    expect(result.metrics.recoveredAmount.value?.pence).toBe(10005);
    expect(result.metrics.disputedAttributions.value).toBe(0);
    expect(result.metrics.missedMustSurfaceEvents.value).toBe(1);
    expect(result.metrics.sourceUsefulness.value).toEqual([{ signalId: "synthetic:signal-1", source: "voice", useful: true }]);
    expect(result.metrics.hypotheticalSubscription.value?.pence).toBe(7900);
    expect(result.metrics.hypotheticalSuccessFee.value?.pence).toBe(1000); // half-even tie
    expect(result.metrics.valueLessHypotheticalCosts.value?.pence).toBe(1105);
    expect(Object.values(result.metrics).every(metric => metric.method.length > 30)).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.effects).toEqual({ accruals: 0, invoices: 0, collections: 0 });
    expect(result.releaseApproval).toBe(false);
  });

  it("clones and deeply freezes the evidence and result, preserving the original fixture", () => {
    const input = fixture(), result = report(input), digest = result.inputDigest;
    input.signals[0]!.confirmedNetPence = 1;
    expect(result.records.signals![0]!.confirmedNetPence).toBe(10005);
    expect(Object.isFrozen(result.records.signals![0])).toBe(true);
    expect(Object.isFrozen(result.metrics)).toBe(true);
    expect(report().inputDigest).toBe(digest);
  });

  it("deduplicates identical immutable record replays and refuses changed replays", () => {
    const input = fixture();
    input.captures.push({ ...input.captures[0]! });
    input.signals.push({ ...input.signals[0]! });
    input.allocations.push({ ...input.allocations[0]! });
    input.receipts.push({ ...input.receipts[0]! });
    input.mustSurface.push({ ...input.mustSurface[0]! });
    expect(report(input)).toEqual(report());
    input.signals[1]!.useful = false;
    expect(() => report(input)).toThrow("INVALID_MEASUREMENT");
  });

  it("refuses aliases for the same work rather than counting an extra signal", () => {
    const input = fixture(); input.signals.push({ ...input.signals[0]!, id: "synthetic:alias" });
    expect(() => report(input)).toThrow("INVALID_MEASUREMENT");
  });

  it("subtracts partial reversals and never infers receipt cash as recovery", () => {
    const input = fixture();
    input.allocations.push({ ...input.allocations[0]!, id: "synthetic:reversal-1", netPence: 5, reversesId: "synthetic:allocation-1" });
    expect(report(input).metrics.recoveredAmount.value?.pence).toBe(10000);
    input.allocations.push({ ...input.allocations[1]!, id: "synthetic:reversal-2", netPence: 10000 });
    expect(report(input).metrics.recoveredAmount.value?.pence).toBe(0);
    expect(report({ ...fixture(), allocations: [] }).metrics.recoveredAmount.value?.pence).toBe(0);
  });

  it.each(["unknown", "over", "chain", "wrong-signal", "wrong-receipt"])("refuses %s reversals", attack => {
    const input = fixture();
    const reversal = { ...input.allocations[0]!, id: "synthetic:reversal", netPence: 1, reversesId: "synthetic:allocation-1" };
    if (attack === "unknown") reversal.reversesId = "synthetic:missing";
    if (attack === "over") reversal.netPence = 10006;
    if (attack === "chain") reversal.reversesId = reversal.id;
    if (attack === "wrong-signal") reversal.signalId = "synthetic:missing";
    if (attack === "wrong-receipt") reversal.receiptId = "synthetic:missing";
    input.allocations.push(reversal);
    expect(() => report(input)).toThrow("INVALID_MEASUREMENT");
  });

  it.each(["captures", "signals", "receipts", "allocations", "mustSurface"] as const)("rejects cross-tenant/job/lock %s records", key => {
    for (const field of ["tenantId", "jobId", "lockId"] as const) {
      const input = fixture(); input[key][0]![field] = id(99);
      expect(() => report(input)).toThrow("INVALID_MEASUREMENT");
    }
  });

  it("bounds aggregate allocations by receipt and confirmation, even with new event IDs", () => {
    const input = fixture();
    input.allocations.push({ ...input.allocations[0]!, id: "synthetic:second", netPence: 1 });
    expect(() => report(input)).toThrow("INVALID_MEASUREMENT");
    input.receipts[0]!.settledNetPence = 10006;
    expect(() => report(input)).toThrow("INVALID_MEASUREMENT");
    input.signals[0]!.confirmedNetPence = 10006;
    expect(report(input).metrics.recoveredAmount.value?.pence).toBe(10006);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER, 1_000_000_000_001, Infinity, NaN])("rejects invalid pence %s", amount => {
    const input = fixture(); input.signals[0]!.confirmedNetPence = amount;
    expect(() => report(input)).toThrow("INVALID_MEASUREMENT");
  });

  it("requires exact locked-line references and excludes already billed work from hypothetical fees", () => {
    const input = fixture(); input.signals[0]!.lockedLineId = "synthetic:other-bill-line";
    expect(() => report(input)).toThrow("INVALID_MEASUREMENT");
    input.signals[0]!.lockedLineId = "synthetic:line-1";
    expect(report(input).metrics.hypotheticalSuccessFee.value?.pence).toBe(0);
  });

  it.each(["attributionDisputed", "disclosedBeforeLock", "builderCaptured"] as const)("excludes %s from hypothetical success fees while retaining observed recovery", key => {
    const input = fixture(); input.signals[0]![key] = true;
    expect(report(input).metrics.hypotheticalSuccessFee.value?.pence).toBe(0);
    expect(report(input).metrics.recoveredAmount.value?.pence).toBe(10005);
  });

  it("lists absent inventories and observations as missing rather than zeros", () => {
    const result = report({ ...fixture(), captures: null, signals: null, receipts: null, allocations: null, mustSurface: null, subscriptionScenario: null });
    for (const [name, metric] of Object.entries(result.metrics)) {
      expect(metric.value).toBeNull(); expect(metric.status).toBe("missing"); expect(result.missing).toContain(name);
    }
    const input = fixture();
    const partial = report({ ...input, allocations: [], signals: [{ ...input.signals[0], useful: null, falsePositive: null, attributionDisputed: null, confirmedNetPence: null }],
      mustSurface: [{ ...input.mustSurface[0], surfacedByDeadline: null }] });
    expect(partial.metrics.hypotheticalSuccessFee.value).toBeNull();
    expect(partial.missing).toContain("sourceUsefulness:synthetic:signal-1");
    expect(partial.metrics.sourceUsefulness.status).toBe("incomplete");
    expect(partial.metrics.confirmedAmount.value).toBeNull();
    expect(partial.metrics.falsePositives.value).toBeNull();
    expect(partial.metrics.disputedAttributions.value).toBeNull();
    expect(partial.metrics.missedMustSurfaceEvents.value).toBeNull();
  });

  it("distinguishes observed empty inventories from missing and preserves negative value comparisons", () => {
    const result = report({ ...fixture(), captures: [], signals: [], receipts: [], allocations: [], mustSurface: [] });
    expect(result.metrics.capturesPerJob.value).toBe(0);
    expect(result.metrics.falsePositives.value).toBe(0);
    expect(result.metrics.valueLessHypotheticalCosts.value?.pence).toBe(-7900);
  });

  it("rounds once over cumulative net, not per signal, and shares receipt capacity across signals", () => {
    const input = fixture();
    input.signals[0]!.confirmedNetPence = 5;
    input.signals.push({ ...input.signals[0]!, id: "synthetic:signal-2", workId: "synthetic:work-2" });
    input.allocations[0]!.netPence = 5;
    input.allocations.push({ ...input.allocations[0]!, id: "synthetic:allocation-2", signalId: "synthetic:signal-2" });
    input.receipts[0]!.settledNetPence = 10;
    expect(report(input).metrics.hypotheticalSuccessFee.value?.pence).toBe(1);
    input.receipts[0]!.settledNetPence = 9;
    expect(() => report(input)).toThrow("INVALID_MEASUREMENT");
  });

  it("requires qualifying proof and never treats a false positive as confirmed value", () => {
    const input = fixture();
    expect(report({ ...input, signals: [{ ...input.signals[0], qualifyingAttributionRef: null }] }).metrics.hypotheticalSuccessFee.value?.pence).toBe(0);
    input.signals[0]!.falsePositive = true;
    expect(() => report(input)).toThrow("INVALID_MEASUREMENT");
    input.signals[0]!.confirmedNetPence = 0;
    input.allocations = [];
    expect(report(input).metrics.falsePositives.value).toBe(1);
  });

  it("uniformly refuses pre-lock, builder, live and wrong-context callers without hidden details", () => {
    for (const context of [
      { ...access, lockId: null }, { ...access, audience: "builder" }, { ...access, environment: "production" },
      { ...access, environment: "pilot_no_charge" }, { ...access, tenantId: id(99) },
      { ...access, jobId: id(99) }, { ...access, lockId: id(99) },
    ]) expect(() => measureShadowPilot(fixture(), context)).toThrow("MEASUREMENT_UNAVAILABLE");
    for (const raw of [null, {}, fixture(), { ...fixture(), signals: [] }])
      expect(() => measureShadowPilot(raw, { ...access, audience: "builder" })).toThrow("MEASUREMENT_UNAVAILABLE");
    expect(() => report({ ...fixture(), environment: "production" })).toThrow("INVALID_MEASUREMENT");
    expect(() => report({ ...fixture(), description: "unexpected free text" })).toThrow("INVALID_MEASUREMENT");
  });
});
