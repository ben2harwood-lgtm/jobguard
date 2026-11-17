import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, PracticeAccessError } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { RecoveryAllocationApplication } from "./recovery-allocation.application.js";
import { recoveryAllocationHttpError, recoveryAllocationRefusalV1, recoveryAllocationViewV1 } from "./recovery-allocation.contracts.js";
const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const tenantContext = testTenantContext(DEMO_TENANT_ID);
const jobId = randomUUID(), sessionId = randomUUID(), digest = createHash("sha256").update(sessionId).digest("hex");
const response = { version: "recovery-allocation-view.v1" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const, jobId, grossMovementsPence: 0, eligibleNetPence: 0, allocatedTaxPence: 0, invoiceBalancePence: 0, paused: false, availableEvidence: [], reversalSources: [], receipts: [], cases: [], allocations: [], lines: [], review: null };
const command = () => ({ version: "recovery-allocation-command.v1", commandId: randomUUID(), action: "review", evidenceId: randomUUID(), caseId: randomUUID(), paymentId: randomUUID(), grossPence: 38400, expectedCaseRevision: 2 });
function fixture() {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({ context: tenantContext, membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID, digest } as never);
  const repository = { view: vi.fn().mockResolvedValue(response), command: vi.fn().mockResolvedValue(response) };
  return { repository, application: new RecoveryAllocationApplication({} as Pool, repository) };
}
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("receipt allocation application boundary (repository unit double)", () => {
  it("passes only freshly authenticated scope, server actor and session digest to persistence", async () => {
    const { repository, application } = fixture();
    expect(await application.view(sessionId, jobId)).toEqual(response);
    expect(repository.view).toHaveBeenCalledWith(tenantContext, { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID }, digest, jobId);
    const input = command(); expect(await application.command(sessionId, jobId, input)).toEqual(response);
    expect(repository.command).toHaveBeenCalledWith(tenantContext, { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID }, digest, jobId, input);
    expect(JSON.stringify([...repository.view.mock.calls, ...repository.command.mock.calls])).not.toContain(sessionId);
  });
  it.each([undefined, "bad-cookie", ""])("refuses malformed authentication %s before reading", async session => {
    const { application, repository } = fixture(); await expect(application.view(session, jobId)).rejects.toMatchObject({ code: "UNAUTHENTICATED" }); expect(repository.view).not.toHaveBeenCalled();
  });
  it("refuses unissued and foreign-session cookies before persistence", async () => {
    const { application, repository } = fixture(); vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
    await expect(application.command(randomUUID(), jobId, command())).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(repository.command).not.toHaveBeenCalled();
  });
  it.each(["production", "production_billing", "pilot_no_charge", "development", "provider_sandbox", "unconfigured"])("rejects synthetic consumption in %s", async mode => {
    const { application, repository } = fixture(); vi.stubEnv("JOBGUARD_ENV", mode); await expect(application.command(sessionId, jobId, command())).rejects.toMatchObject({ code: "SYNTHETIC_ONLY" }); expect(repository.command).not.toHaveBeenCalled();
  });
  it.each([{ tenantId: randomUUID() }, { eligibleNetPence: 32000 }, { taxPence: 6400 }, { reviewerRef: "owner" }, { rule: "explicit" }, { net: { numerator: "32000", denominator: "1" } }, { settlementState: "settled" }, { environment: "synthetic_demo" }, { decisionId: randomUUID() }])("refuses forged authority %j", async extra => {
    const { application, repository } = fixture(); await expect(application.command(sessionId, jobId, { ...command(), ...extra })).rejects.toMatchObject({ code: "INVALID_COMMAND" }); expect(repository.command).not.toHaveBeenCalled();
  });
  it("authorizes the job before deferred JSON and refuses malformed JSON", async () => {
    const { application, repository } = fixture();
    const read = vi.fn().mockRejectedValue(new Error("invalid JSON"));
    await expect(application.command(sessionId, jobId, read)).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(read).toHaveBeenCalledOnce(); expect(repository.command).not.toHaveBeenCalled();
    read.mockClear(); vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
    await expect(application.command(sessionId, jobId, read)).rejects.toMatchObject({ code: "NOT_FOUND" }); expect(read).not.toHaveBeenCalled();
  });
  it("rechecks each session independently without retaining a verified context", async () => {
    const { application, repository } = fixture();
    const otherContext = testTenantContext(randomUUID());
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValueOnce({ context: tenantContext, membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID, digest } as never)
      .mockResolvedValueOnce({ context: otherContext, membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID, digest } as never);
    await application.view(sessionId, jobId); await application.view(randomUUID(), jobId);
    expect(repository.view.mock.calls.map(call => call[0])).toEqual([tenantContext, otherContext]);
  });
  it("requires exact approval hash and confines reversal transport to reversal actions", async () => {
    const { application, repository } = fixture(); await expect(application.command(sessionId, jobId, { ...command(), action: "allocate" })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    await expect(application.command(sessionId, jobId, command(), true)).rejects.toMatchObject({ code: "INVALID_COMMAND" }); expect(repository.command).not.toHaveBeenCalled();
    const reverse = { version: "recovery-allocation-command.v1", commandId: randomUUID(), action: "reverse", allocationId: randomUUID(), expectedCaseRevision: 3, grossPence: 300000, approvalHash: "a".repeat(64) };
    await application.command(sessionId, jobId, reverse, true); expect(repository.command).toHaveBeenCalledWith(expect.anything(), expect.anything(), digest, jobId, reverse);
  });
  it("accepts only selected source identities for optional remittance and credit reversals", async () => {
    const { application, repository } = fixture();
    const review = { ...command(), remittanceEvidenceId: randomUUID() };
    await application.command(sessionId, jobId, review);
    expect(repository.command).toHaveBeenLastCalledWith(tenantContext, expect.anything(), digest, jobId, review);
    const reverse = { version: "recovery-allocation-command.v1", commandId: randomUUID(), action: "review_reverse", allocationId: randomUUID(),
      expectedCaseRevision: 3, grossPence: 60000, creditNoteId: randomUUID() };
    await application.command(sessionId, jobId, reverse, true);
    expect(repository.command).toHaveBeenLastCalledWith(tenantContext, expect.anything(), digest, jobId, reverse);
    await expect(application.command(sessionId, jobId, { ...reverse, availableGrossPence: 60000 }, true)).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    const source = { allocationId: reverse.allocationId, sourceId: reverse.creditNoteId, kind: "credit_note", availableGrossPence: 60000 };
    expect(recoveryAllocationViewV1.safeParse({ ...response, reversalSources: [source] }).success).toBe(true);
    expect(recoveryAllocationViewV1.safeParse({ ...response, reversalSources: [{ ...source, availableGrossPence: 0.5 }] }).success).toBe(false);
    expect(recoveryAllocationViewV1.safeParse({ ...response, reversalSources: [{ ...source, kind: "provider_claim" }] }).success).toBe(false);
  });
  it("strictly validates responses and preserves fractional strings without rounding", () => {
    const line = { id: randomUUID(), paymentId: randomUUID(), invoiceId: randomUUID(), lineId: randomUUID(), rule: "pro_rata", sourceRef: "movement", gross: { numerator: "2400000", denominator: "43" }, net: { numerator: "2000000", denominator: "43" }, reversesId: null };
    expect(recoveryAllocationViewV1.parse({ ...response, lines: [line] }).lines[0]?.net).toEqual({ numerator: "2000000", denominator: "43" });
    expect(recoveryAllocationViewV1.safeParse({ ...response, realExternalActions: 1 }).success).toBe(false);
    expect(recoveryAllocationViewV1.safeParse({ ...response, feePence: 4651 }).success).toBe(false);
  });
  it("pairs known refusals with their HTTP status and keeps unknown outcomes paused", () => {
    const body = { version: "recovery-allocation-error.v1", code: "ALLOCATION_APPROVAL_CHANGED" };
    expect(recoveryAllocationRefusalV1.safeParse({ status: 409, body }).success).toBe(true);
    expect(recoveryAllocationRefusalV1.safeParse({ status: 400, body }).success).toBe(false);
    expect(recoveryAllocationRefusalV1.safeParse({ status: 409, body: { ...body, code: "PRIVATE_DATABASE_DETAIL" } }).success).toBe(false);
    expect(recoveryAllocationRefusalV1.safeParse({ status: 503, body: { ...body, code: "DATABASE_UNAVAILABLE" } }).success).toBe(false);
  });
  it("refuses query injection and redacts unrecognised database details", async () => {
    const { application } = fixture(); await expect(application.view(sessionId, jobId, { tenantId: randomUUID() })).rejects.toMatchObject({ code: "INVALID_QUERY" });
    expect(recoveryAllocationHttpError(new Error("internal database detail"))).toEqual({ status: 503, body: { version: "recovery-allocation-error.v1", code: "DATABASE_UNAVAILABLE" } });
    expect(recoveryAllocationHttpError({ code: "ALLOCATION_EXCEEDS_AVAILABLE" }).status).toBe(409);
  });
});
