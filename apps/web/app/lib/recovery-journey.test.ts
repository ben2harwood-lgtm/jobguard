import { describe, expect, it, vi } from "vitest";
import { MAX_MONEY_PENCE } from "@jobguard/core";
import { readRecoveryJourney, recoveryJourneyMarkers, recoveryJourneySteps } from "./recovery-journey";

const jobId = "10000000-0000-4000-8000-000000000001";
const otherJob = "10000000-0000-4000-8000-000000000002";
const allocations = () => ({
  version: "recovery-allocation-view.v1", environment: "synthetic_demo", realExternalActions: 0, jobId,
  grossMovementsPence: 338400, eligibleNetPence: 282000, allocatedTaxPence: 56400, invoiceBalancePence: 1917600, paused: false,
  availableEvidence: [], reversalSources: [], receipts: [], cases: [], allocations: [], lines: [], review: null,
});
const fees = () => ({ version: "success-fee-availability.v1", environment: "synthetic_demo", jobId, state: "dependency_bound", dependency: "accepted_attribution_source_adapter", productionEnabled: false, realExternalActions: 0 });
function reader(allocation: unknown = allocations(), fee: unknown = fees()) {
  return vi.fn<typeof fetch>().mockImplementation(async input => new Response(JSON.stringify(String(input).endsWith("success-fees") ? fee : allocation)));
}

describe("DEMO-J2 persisted recovery guide", () => {
  it("reads the real routes without issuing commands or deriving fee totals", async () => {
    const read = reader(), controller = new AbortController();
    const snapshot = await readRecoveryJourney(jobId, read, controller.signal);
    expect(read.mock.calls).toEqual([
      [`/api/jobs/${jobId}/recovery-allocations`, { cache: "no-store", signal: controller.signal }],
      [`/api/jobs/${jobId}/success-fees`, { cache: "no-store", signal: controller.signal }],
    ]);
    expect(snapshot.complete).toBe(false);
    expect(snapshot.allocations.eligibleNetPence).toBe(282000);
    expect(snapshot).not.toHaveProperty("successFeeNetPosted");
    expect(snapshot).not.toHaveProperty("unresolvedDifferenceCount");
  });
  it("duplicate reads and resume never accumulate amounts or create actions", async () => {
    const read = reader();
    expect(await readRecoveryJourney(jobId, read)).toEqual(await readRecoveryJourney(jobId, read));
    expect(read.mock.calls.every(([, options]) => options?.method === undefined)).toBe(true);
  });
  it("uses reversed saved allocations without preserving a stale eligible amount", async () => {
    const reversed = { ...allocations(), eligibleNetPence: 32000, allocatedTaxPence: 6400, invoiceBalancePence: 2217600, paused: true };
    const snapshot = await readRecoveryJourney(jobId, reader(reversed));
    expect(snapshot.allocations).toEqual(reversed);
    expect(snapshot.complete).toBe(false);
    expect(snapshot).not.toHaveProperty("feeRefundedPrincipal");
  });
  it.each([401, 403, 404, 409, 500, 503])("refusal or unknown outcome %s produces no empty successful report", async status => {
    const read = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status }));
    await expect(readRecoveryJourney(jobId, read)).rejects.toThrow("sources unavailable");
  });
  it.each(["allocations", "fees"])("rejects cross-job/tenant-selected %s responses", async family => {
    const a = allocations(), f = fees();
    if (family === "allocations") a.jobId = otherJob; else f.jobId = otherJob;
    await expect(readRecoveryJourney(jobId, reader(a, f))).rejects.toThrow("source mismatch");
  });
  it.each([-1, MAX_MONEY_PENCE + 1, 1.5])("rejects an invalid allocated amount %s", async eligibleNetPence => {
    await expect(readRecoveryJourney(jobId, reader({ ...allocations(), eligibleNetPence }))).rejects.toThrow();
  });
  it("does not accept a reference result, fabricated fee totals or hidden/shadow fields", async () => {
    for (const fee of [{ ...fees(), postedPrincipal: 3200 }, { ...fees(), shadowCount: 1 }, { version: "money-trail-reference-result.v1", unresolvedDifferenceCount: 0 }]) {
      await expect(readRecoveryJourney(jobId, reader(allocations(), fee))).rejects.toThrow();
    }
    await expect(readRecoveryJourney(jobId, reader({ ...allocations(), shadowSignals: [] }))).rejects.toThrow();
  });
  it("does not turn locked-bill or approval references into authority", async () => {
    await expect(readRecoveryJourney(jobId, reader(allocations(), { ...fees(), lockedBillId: otherJob, approvalHash: "a".repeat(64) }))).rejects.toThrow();
    expect(recoveryJourneyMarkers.map(([id]) => id)).toEqual(["success-fee-net-posted", "fee-refunded-principal", "value-found-yours-before-tax", "unresolved-money-differences"]);
  });
  it("retains every journey step and marks unavailable producers without command links", () => {
    const steps = recoveryJourneySteps(jobId);
    expect(steps).toHaveLength(15);
    for (const producer of ["M4-9-S", "M4-10-S", "M4-12-S", "M4-17-S", "SV-6"]) {
      expect(steps.filter(step => step.title.includes(producer)).every(step => step.href === null)).toBe(true);
    }
    expect(steps.filter(step => step.href).every(step => step.href?.startsWith(`/jobs/${jobId}#`))).toBe(true);
  });
});
