import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { practiceFactsCatalogueV1 } from "@jobguard/core";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, PracticeAccessError } from "@jobguard/db";
import { PracticeAccess } from "./practice-access.js";
import { PracticeFactsApplication } from "./practice-facts.application.js";
import { practiceFactsCommandV1, practiceFactsResponseV1 } from "./practice-facts.contracts.js";
import { practiceFactsHttpError, practiceFactsHttpQuery, practiceFactsSession } from "./practice-facts.http.js";

const jobId = randomUUID();
const sessionId = randomUUID();
// What SBOX's authenticatePracticeSession derives from the cookie, and the only form of the session the repository may receive.
const digest = createHash("sha256").update(sessionId).digest("hex");
const response = {
  version: "practice-facts-view.v1" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const, jobId,
  accountId: null, feedState: "not_connected" as const, consent: null, revision: 0, catalogue: practiceFactsCatalogueV1.map((entry) => ({ ...entry })),
  movementCount: 0, movements: [], receipts: [], allocatedEligibleNetPence: 0 as const, eventCount: 0, nextCursor: null, laterInvoice: { fixture: "later-supplier-invoice", cashDuePence: 144000, settledPence: 0, state: "unpaid" },
};
const command = () => ({ version: "practice-facts-command.v1", commandId: randomUUID(), expectedRevision: 0, action: "advance", movement: "receipt-12000", step: "settled" });
function fixture() {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({ context: { tenantId: DEMO_TENANT_ID }, digest, membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID } as never);
  const repository = { factsView: vi.fn().mockResolvedValue(response), factsCommand: vi.fn().mockResolvedValue(response) };
  return { repository, application: new PracticeFactsApplication({} as Pool, repository) };
}
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("practice feed API boundary (the repository is a unit-test double)", () => {
  it("refuses a stranger before snapshot or connect even when no feed owner exists", async () => {
    const { repository, application } = fixture();
    const access = vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
    await expect(application.view(randomUUID(), jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(application.command(randomUUID(), jobId, command())).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(access).toHaveBeenCalledTimes(2);
    expect(repository.factsView).not.toHaveBeenCalled();
    expect(repository.factsCommand).not.toHaveBeenCalled();
  });

  it("passes a server-selected principal, SBOX's session digest and the job to the persistence authority, for both transports", async () => {
    const { repository, application } = fixture();
    expect(await application.view(sessionId, jobId)).toEqual(response);
    expect(repository.factsView).toHaveBeenCalledWith({ tenantId: DEMO_TENANT_ID }, { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID }, digest, jobId, { version: "practice-facts-query.v1", limit: 20 });
    const input = command();
    expect(await application.command(sessionId, jobId, input)).toEqual(response);
    expect(repository.factsCommand).toHaveBeenCalledWith({ tenantId: DEMO_TENANT_ID }, { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID }, digest, jobId, input);
  });

  it("never hands the raw 7-day bearer token to the repository, only its digest", async () => {
    const { repository, application } = fixture();
    await application.view(sessionId, jobId);
    await application.command(sessionId, jobId, command());
    const arguments_ = [...repository.factsView.mock.calls, ...repository.factsCommand.mock.calls];
    expect(arguments_).toHaveLength(2);
    expect(JSON.stringify(arguments_)).not.toContain(sessionId);
    expect(JSON.stringify(arguments_)).toContain(digest);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("requires persisted session authentication even for a UUID-shaped cookie", async () => {
    const { repository, application } = fixture();
    vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValue(new PracticeAccessError("UNAUTHENTICATED"));
    await expect(application.view(sessionId, jobId)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(application.command(sessionId, jobId, command())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(repository.factsView).not.toHaveBeenCalled();
    expect(repository.factsCommand).not.toHaveBeenCalled();
  });

  it.each([undefined, "not-a-session", "", "123"])("refuses an absent or malformed session %s before accessing facts", async (session) => {
    const { repository, application } = fixture();
    await expect(application.view(session, jobId)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(application.command(session, jobId, command())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(repository.factsView).not.toHaveBeenCalled();
    expect(repository.factsCommand).not.toHaveBeenCalled();
  });

  it.each(["production", "production_billing", "pilot_no_charge", "pilot", "provider_sandbox", "development", "unconfigured"])("refuses synthetic consumption under server mode %s", async (mode) => {
    const { repository, application } = fixture();
    vi.stubEnv("JOBGUARD_ENV", mode);
    await expect(application.view(sessionId, jobId)).rejects.toMatchObject({ code: "SYNTHETIC_ONLY" });
    // A client that forges a mode flag changes nothing: the server environment decides.
    await expect(application.command(sessionId, jobId, { ...command(), environment: "synthetic_demo" })).rejects.toMatchObject({ code: "SYNTHETIC_ONLY" });
    expect(repository.factsView).not.toHaveBeenCalled();
    expect(repository.factsCommand).not.toHaveBeenCalled();
  });

  it.each([
    { tenantId: randomUUID() }, { requestedTenantId: randomUUID() }, { accountId: randomUUID() }, { event: { state: "settled", grossPence: 1200000 } },
    { eventId: "settled-receipt-384" }, { grossPence: 1200000 }, { amount: "384.00" }, { state: "settled" }, { environment: "synthetic_demo" },
    { eligibleForAllocation: true }, { allocatedEligibleNetPence: 1200000 }, { signature: "x" },
  ])("rejects browser-supplied authority %j before invoking the deterministic adapter", async (forgery) => {
    const { repository, application } = fixture();
    await expect(application.command(sessionId, jobId, { ...command(), action: "advance", movement: "receipt-12000", step: "settled", ...forgery })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(repository.factsCommand).not.toHaveBeenCalled();
  });

  it("requires valid pagination and rejects tenant/environment injection into the query", async () => {
    const { repository, application } = fixture();
    for (const forged of [{ tenantId: randomUUID() }, { environment: "production" }, { limit: 0 }, { limit: 51 }, { cursor: "-1" }, { cursor: "secret" }, { version: "v2" }]) {
      await expect(application.view(sessionId, jobId, { version: "practice-facts-query.v1", ...forged })).rejects.toMatchObject({ code: "INVALID_QUERY" });
    }
    expect(repository.factsView).not.toHaveBeenCalled();
    await application.view(sessionId, jobId, { version: "practice-facts-query.v1", cursor: "1", limit: "1" });
    expect(repository.factsView).toHaveBeenCalledWith(expect.anything(), expect.anything(), digest, jobId, { version: "practice-facts-query.v1", cursor: "1", limit: 1 });
  });

  it("preserves repository authorization and conflict failures without pretending they are successful states", async () => {
    const { repository, application } = fixture();
    for (const code of ["PRACTICE_FEED_FORBIDDEN", "PRACTICE_FEED_STALE_REVISION", "IDEMPOTENCY_PAYLOAD_CONFLICT", "PRACTICE_FEED_DISCONNECTED", "PRACTICE_FEED_MOVEMENT_NOT_SETTLED"]) {
      const error = Object.assign(new Error(code), { code });
      repository.factsCommand.mockRejectedValueOnce(error);
      await expect(application.command(sessionId, jobId, command())).rejects.toBe(error);
    }
  });

  it("validates the persisted response shape and never admits an allocation from this leaf", async () => {
    const { repository, application } = fixture();
    repository.factsView.mockResolvedValueOnce({ ...response, environment: "production" });
    await expect(application.view(sessionId, jobId)).rejects.toThrow();
    const movement = { id: "a:receipt-384", movementKey: "receipt-12000", underlyingMovementId: "receipt-12000", kind: "customer_receipt", fixture: "test-m", label: "£384.00 customer receipt (recovery-18800)",
      grossPence: 1200000, currency: "GBP", state: "settled", allocatedEligibleNetPence: 0, eligibleForAllocation: true, eventIds: [], sourceHashes: [] };
    expect(practiceFactsResponseV1.safeParse({ ...response, movements: [movement] }).success).toBe(true);
    expect(practiceFactsResponseV1.safeParse({ ...response, movements: [{ ...movement, allocatedEligibleNetPence: 1 }] }).success).toBe(false);
    expect(practiceFactsResponseV1.safeParse({ ...response, movements: [{ ...movement, grossPence: Infinity }] }).success).toBe(false);
    expect(practiceFactsResponseV1.safeParse({ ...response, allocatedEligibleNetPence: 1 }).success).toBe(false);
    expect(practiceFactsResponseV1.safeParse({ ...response, realExternalActions: 1 }).success).toBe(false);
  });

  it("rejects malformed job identifiers without database access", async () => {
    const { repository, application } = fixture();
    await expect(application.view(sessionId, "not-a-job")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.factsView).not.toHaveBeenCalled();
  });

  it("limits advance to the fixed catalogue and steps, and requires a nonnegative expected revision", () => {
    expect(practiceFactsCommandV1.safeParse({ ...command(), action: "advance", movement: "receipt-12000", step: "live_bank_feed" }).success).toBe(false);
    expect(practiceFactsCommandV1.safeParse({ ...command(), action: "advance", movement: "receipt-385", step: "settled" }).success).toBe(false);
    expect(practiceFactsCommandV1.safeParse({ ...command(), expectedRevision: -1 }).success).toBe(false);
    expect(practiceFactsCommandV1.safeParse({ ...command(), action: "advance", movement: "receipt-12000", step: "settled" }).success).toBe(true);
  });
});

describe("practice feed HTTP error and cookie contract", () => {
  it("gives exact statuses for known typed errors and redacts internal failures", () => {
    expect(practiceFactsHttpError({ code: "UNAUTHENTICATED" })).toEqual({ status: 401, body: { version: "practice-facts-error.v1", code: "UNAUTHENTICATED" } });
    expect(practiceFactsHttpError({ code: "PRACTICE_FEED_STALE_REVISION" }).status).toBe(409);
    expect(practiceFactsHttpError({ code: "PRACTICE_FEED_MOVEMENT_NOT_SETTLED" }).status).toBe(409);
    expect(practiceFactsHttpError({ code: "PRACTICE_FEED_RECEIPT_MISMATCH" }).status).toBe(409);
    expect(practiceFactsHttpError({ code: "PRACTICE_FEED_FORBIDDEN" }).status).toBe(403);
    expect(practiceFactsHttpError({ code: "SYNTHETIC_ONLY" }).status).toBe(403);
    expect(practiceFactsHttpError({ code: "INVALID_COMMAND" }).status).toBe(400);
    expect(practiceFactsHttpError(new Error("private connection string"))).toEqual({ status: 503, body: { version: "practice-facts-error.v1", code: "DATABASE_UNAVAILABLE" } });
    expect(practiceFactsHttpError({ code: "42P01", message: "relation detail" }).status).toBe(503);
  });
  it("refuses duplicate HTTP query fields instead of silently selecting one", () => {
    expect(practiceFactsHttpQuery(new URLSearchParams("limit=1&cursor=0"))).toEqual({ version: "practice-facts-query.v1", limit: "1", cursor: "0" });
    expect(() => practiceFactsHttpQuery(new URLSearchParams("limit=1&limit=2"))).toThrow("INVALID_QUERY");
  });
  it("reads one exact cookie and rejects ambiguous session cookies", () => {
    expect(practiceFactsSession(`another=value; jg_session=${sessionId}; theme=dark`)).toBe(sessionId);
    expect(practiceFactsSession(`jg_session=${sessionId}; jg_session=${randomUUID()}`)).toBeUndefined();
    expect(practiceFactsSession("not_jg_session=one")).toBeUndefined();
    expect(practiceFactsSession(undefined)).toBeUndefined();
  });
});
