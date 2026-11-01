import { describe, expect, it, vi } from "vitest";
import { MAX_MONEY_PENCE } from "@jobguard/core";
import { moneyCheckFigures, moneyCheckLinkFrom, readRecoveryJourney, readSavedMoneyCheck, recoveryJourneyMarkers, recoveryJourneySteps } from "./recovery-journey";

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
    expect(snapshot.allocations.eligibleNetPence).toBe(282000);
    expect(snapshot).not.toHaveProperty("successFeeNetPosted");
    expect(snapshot).not.toHaveProperty("unresolvedDifferenceCount");
  });
  it("catch review availability never completes recovery collection, refund or reconciliation", async () => {
    const { dependency: _dependency, ...available } = fees();
    const snapshot = await readRecoveryJourney(jobId, reader(allocations(), { ...available, state: "catch_review_available" }));
    expect(snapshot.allocations.realExternalActions).toBe(0);
    for (const field of ["successFeeNetPosted", "feeRefundedPrincipal", "valueFoundYoursBeforeTax", "unresolvedDifferenceCount"])
      expect(snapshot).not.toHaveProperty(field);
  });
  it.each([
    { version: "fee-collection-reference-projection.v1", refundedPrincipal: { pence: 25000, currency: "GBP" } },
    { version: "simulation-fee-statement-document.v1", documentPrincipal: { pence: 28200, currency: "GBP" } },
    { version: "money-trail-reference-result.v1", complete: true, unresolvedDifferenceCount: 0 },
  ])("refuses a reference helper result as a persisted money outcome", async reference => {
    await expect(readRecoveryJourney(jobId, reader(allocations(), reference))).rejects.toThrow();
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
  it("gives every journey step a real workbench link and no producer hold", () => {
    const steps = recoveryJourneySteps(jobId);
    expect(steps).toHaveLength(21);
    expect(steps.every(step => step.href.startsWith(`/jobs/${jobId}`) && step.href.includes("#"))).toBe(true);
  });
  it("only reads a saved run from a well-formed link, and shows the report's figures", async () => {
    const sourceHash = "a".repeat(64), runId = otherJob;
    expect(moneyCheckLinkFrom("")).toBeNull();
    expect(moneyCheckLinkFrom(`?run=${runId}&source=nothex`)).toBeNull();
    expect(moneyCheckLinkFrom(`?run=${runId}&source=${sourceHash}`)).toEqual({ runId, sourceHash });
    const refused = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(readSavedMoneyCheck(jobId, { runId, sourceHash }, refused)).rejects.toThrow("unavailable");
    const body = JSON.parse(String(refused.mock.calls[0]![1]!.body));
    expect(body).toMatchObject({ action: "read", runId, sourceHash });
    const figures = moneyCheckFigures({ unresolvedDifferenceCount: 0, realExternalActions: 0, successFee: { postedPence: 3200, refundedPence: 25000, yoursBeforeTax: { numerator: "28800", denominator: "1" } } } as Parameters<typeof moneyCheckFigures>[0]);
    expect(figures).toEqual({ "success-fee-net-posted": "£32.00", "fee-refunded-principal": "£250.00", "value-found-yours-before-tax": "£288.00", "unresolved-money-differences": "0", "real-external-actions": "0" });
  });

});
