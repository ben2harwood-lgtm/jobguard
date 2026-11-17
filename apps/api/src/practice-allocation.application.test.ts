import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PracticeAllocationApplication } from "./practice-allocation.application.js";
import { practiceAllocationCommandV1, practiceAllocationResponseV1 } from "./practice-allocation.contracts.js";
import { practiceAllocationHttpError, practiceAllocationHttpQuery, practiceAllocationSession } from "./practice-allocation.http.js";

const jobId = randomUUID();
const sessionId = randomUUID();
const response = {
  version: "practice-allocation-view.v1" as const, environment: "synthetic_demo" as const,
  jobId, revision: 0, prepared: false, landing: "Simulated" as const, realExternalActions: 0 as const,
  recoveryGrossMovementsPence: 0, eligibleNetPence: 0, allocatedTaxPence: 0,
  customerInvoiceBalancePence: null, feeExecutionState: "Ready — simulated" as const,
  invoiceId: null, invoices: [], cases: [], evidence: [], movements: [], allocations: [], events: [],
};
const command = () => ({ version: "practice-allocation-command.v1", commandId: randomUUID(), expectedRevision: 0,
  action: "approve", movementId: randomUUID(), representationId: "feed-384", caseId: randomUUID(), evidenceId: randomUUID(), netPence: 32000 });
function fixture() {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const repository = { view: vi.fn().mockResolvedValue(response), command: vi.fn().mockResolvedValue(response) };
  return { repository, application: new PracticeAllocationApplication({} as Pool, repository) };
}
afterEach(() => vi.unstubAllEnvs());

describe("practice allocation API boundary (repository is a unit-test double)", () => {
  it("delegates exact validated identity, source and amount to the persistence authority", async () => {
    const { repository, application } = fixture();
    expect(await application.view(sessionId, jobId)).toEqual(response);
    expect(repository.view).toHaveBeenCalledWith(sessionId, jobId, { version: "practice-allocation-query.v1" });
    const input = command();
    expect(await application.command(sessionId, jobId, input)).toEqual(response);
    expect(repository.command).toHaveBeenCalledWith(sessionId, jobId, input);
  });
  it.each([undefined, "not-a-session", "", "123"])("rejects malformed session %s before reading or writing", async (session) => {
    const { repository, application } = fixture();
    await expect(application.view(session, jobId)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(application.command(session, jobId, command())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(repository.view).not.toHaveBeenCalled();
    expect(repository.command).not.toHaveBeenCalled();
  });
  it.each(["production", "production_billing", "pilot_no_charge", "pilot", "development", "unconfigured"])("rejects synthetic consumption in server mode %s", async (mode) => {
    const { repository, application } = fixture();
    vi.stubEnv("JOBGUARD_ENV", mode);
    await expect(application.view(sessionId, jobId)).rejects.toMatchObject({ code: "SYNTHETIC_ONLY" });
    await expect(application.command(sessionId, jobId, { ...command(), environment: "synthetic_demo" })).rejects.toMatchObject({ code: "SYNTHETIC_ONLY" });
    expect(repository.view).not.toHaveBeenCalled();
    expect(repository.command).not.toHaveBeenCalled();
  });
  it.each([
    { tenantId: randomUUID() }, { requestedTenantId: randomUUID() }, { environment: "synthetic_demo" },
    { reviewerRef: randomUUID() }, { policyVersion: "approved-policy" }, { eligible: true },
    { state: "settled" }, { taxPence: 6400 }, { grossPence: 38400 }, { authorized: true },
  ])("rejects browser supplied authority %j", async (forgery) => {
    const { repository, application } = fixture();
    await expect(application.command(sessionId, jobId, { ...command(), ...forgery })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(repository.command).not.toHaveBeenCalled();
  });
  it("rejects query injection, unknown versions and malformed jobs", async () => {
    const { repository, application } = fixture();
    for (const forged of [{ tenantId: randomUUID() }, { environment: "production" }, { limit: 1 }, { version: "v2" }]) {
      await expect(application.view(sessionId, jobId, { version: "practice-allocation-query.v1", ...forged })).rejects.toMatchObject({ code: "INVALID_QUERY" });
    }
    await expect(application.view(sessionId, "not-a-job")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.view).not.toHaveBeenCalled();
  });
  it.each([0, -1, 0.5, Infinity, 1_000_000_000_001, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe or invalid allocation amount %s", async (netPence) => {
    const { repository, application } = fixture();
    await expect(application.command(sessionId, jobId, { ...command(), netPence })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(repository.command).not.toHaveBeenCalled();
  });
  it("preserves repository conflict/authorization errors instead of returning a successful view", async () => {
    const { repository, application } = fixture();
    for (const code of ["ALLOCATION_FORBIDDEN", "ALLOCATION_STALE_REVISION", "IDEMPOTENCY_PAYLOAD_CONFLICT", "ALLOCATION_EXCEEDS_AVAILABLE"]) {
      const error = Object.assign(new Error(code), { code });
      repository.command.mockRejectedValueOnce(error);
      await expect(application.command(sessionId, jobId, command())).rejects.toBe(error);
    }
  });
  it("validates response money and the permanent simulation boundary", async () => {
    const { repository, application } = fixture();
    for (const forgery of [{ environment: "production" }, { landing: "Verified" }, { realExternalActions: 1 }, { eligibleNetPence: Infinity }, { allocatedTaxPence: -1 }]) {
      repository.view.mockResolvedValueOnce({ ...response, ...forgery });
      await expect(application.view(sessionId, jobId)).rejects.toThrow();
    }
    expect(practiceAllocationResponseV1.safeParse({ ...response, secret: "private" }).success).toBe(false);
  });
  it("keeps partial cash reversals distinct from evidence-only invalidation and disputed cash", () => {
    const base = { version: "practice-allocation-command.v1", commandId: randomUUID(), expectedRevision: 1, allocationId: randomUUID() };
    expect(practiceAllocationCommandV1.safeParse({ ...base, action: "reverse", netPence: 10000 }).success).toBe(true);
    for (const action of ["invalidate_evidence", "dispute"]) {
      expect(practiceAllocationCommandV1.safeParse({ ...base, action }).success).toBe(true);
      expect(practiceAllocationCommandV1.safeParse({ ...base, action, netPence: 10000 }).success).toBe(false);
    }
  });
});

describe("practice allocation HTTP transport contract", () => {
  it("maps allowlisted typed errors and never leaks database details", () => {
    expect(practiceAllocationHttpError({ code: "UNAUTHENTICATED" })).toEqual({ status: 401, body: { version: "practice-allocation-error.v1", code: "UNAUTHENTICATED" } });
    expect(practiceAllocationHttpError({ code: "IDEMPOTENCY_PAYLOAD_CONFLICT" }).status).toBe(409);
    expect(practiceAllocationHttpError({ code: "ALLOCATION_FORBIDDEN" }).status).toBe(403);
    expect(practiceAllocationHttpError({ code: "ALLOCATION_NOT_FOUND" }).status).toBe(404);
    for (const code of ["ALLOCATION_STALE_REVISION", "ALLOCATION_SOURCE_MISMATCH", "ALLOCATION_EXCEEDS_AVAILABLE", "ALLOCATION_EVIDENCE_INVALID", "ALLOCATION_SETTLED_SOURCE_REQUIRED"]) {
      expect(practiceAllocationHttpError({ code }).status).toBe(409);
    }
    expect(practiceAllocationHttpError(new Error("private connection string"))).toEqual({ status: 503, body: { version: "practice-allocation-error.v1", code: "DATABASE_UNAVAILABLE" } });
    expect(practiceAllocationHttpError({ code: "42P01", message: "relation detail" }).status).toBe(503);
    expect(practiceAllocationHttpError({ code: "toString" }).status).toBe(503);
  });
  it("rejects ambiguous HTTP query fields", () => {
    expect(practiceAllocationHttpQuery(new URLSearchParams())).toEqual({ version: "practice-allocation-query.v1" });
    expect(() => practiceAllocationHttpQuery(new URLSearchParams("version=practice-allocation-query.v1&version=other"))).toThrow("INVALID_QUERY");
  });
  it("accepts only one exact session cookie", () => {
    expect(practiceAllocationSession(`another=value; jg_session=${sessionId}; theme=dark`)).toBe(sessionId);
    expect(practiceAllocationSession(`jg_session=${sessionId}; jg_session=${randomUUID()}`)).toBeUndefined();
    expect(practiceAllocationSession("not_jg_session=one")).toBeUndefined();
    expect(practiceAllocationSession(undefined)).toBeUndefined();
  });
});
