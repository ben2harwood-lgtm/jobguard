import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { practiceMovementCatalogueV1 } from "@jobguard/core";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "@jobguard/db";
import { PracticeFeedApplication } from "./practice-feed.application.js";
import { practiceFeedCommandV1, practiceFeedResponseV1 } from "./practice-feed.contracts.js";
import { practiceFeedHttpError, practiceFeedHttpQuery, practiceFeedSession } from "./practice-feed.http.js";

const jobId = randomUUID();
const sessionId = randomUUID();
const response = {
  version: "practice-feed-view.v1" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const, jobId,
  accountId: null, feedState: "not_connected" as const, consent: null, revision: 0, catalogue: practiceMovementCatalogueV1.map((entry) => ({ ...entry })),
  movementCount: 0, movements: [], receipts: [], allocatedEligibleNetPence: 0 as const, eventCount: 0, nextCursor: null,
};
const command = () => ({ version: "practice-feed-command.v1", commandId: randomUUID(), expectedRevision: 0, action: "connect" });
function fixture() {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const repository = { view: vi.fn().mockResolvedValue(response), command: vi.fn().mockResolvedValue(response) };
  return { repository, application: new PracticeFeedApplication({} as Pool, repository) };
}
afterEach(() => vi.unstubAllEnvs());

describe("practice feed API boundary (the repository is a unit-test double)", () => {
  it("passes a server-selected principal, the opaque session and the job to the persistence authority, for both transports", async () => {
    const { repository, application } = fixture();
    expect(await application.view(sessionId, jobId)).toEqual(response);
    expect(repository.view).toHaveBeenCalledWith({ tenantId: DEMO_TENANT_ID }, { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID }, sessionId, jobId, { version: "practice-feed-query.v1", limit: 20 });
    const input = command();
    expect(await application.command(sessionId, jobId, input)).toEqual(response);
    expect(repository.command).toHaveBeenCalledWith({ tenantId: DEMO_TENANT_ID }, { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID }, sessionId, jobId, input);
  });

  it.each([undefined, "not-a-session", "", "123"])("refuses an absent or malformed session %s before accessing facts", async (session) => {
    const { repository, application } = fixture();
    await expect(application.view(session, jobId)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(application.command(session, jobId, command())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(repository.view).not.toHaveBeenCalled();
    expect(repository.command).not.toHaveBeenCalled();
  });

  it.each(["production", "production_billing", "pilot_no_charge", "pilot", "provider_sandbox", "development", "unconfigured"])("refuses synthetic consumption under server mode %s", async (mode) => {
    const { repository, application } = fixture();
    vi.stubEnv("JOBGUARD_ENV", mode);
    await expect(application.view(sessionId, jobId)).rejects.toMatchObject({ code: "SYNTHETIC_ONLY" });
    // A client that forges a mode flag changes nothing: the server environment decides.
    await expect(application.command(sessionId, jobId, { ...command(), environment: "synthetic_demo" })).rejects.toMatchObject({ code: "SYNTHETIC_ONLY" });
    expect(repository.view).not.toHaveBeenCalled();
    expect(repository.command).not.toHaveBeenCalled();
  });

  it.each([
    { tenantId: randomUUID() }, { requestedTenantId: randomUUID() }, { accountId: randomUUID() }, { event: { state: "settled", grossPence: 38400 } },
    { eventId: "settled-receipt-384" }, { grossPence: 38400 }, { amount: "384.00" }, { state: "settled" }, { environment: "synthetic_demo" },
    { eligibleForAllocation: true }, { allocatedEligibleNetPence: 38400 }, { signature: "x" },
  ])("rejects browser-supplied authority %j before invoking the deterministic adapter", async (forgery) => {
    const { repository, application } = fixture();
    await expect(application.command(sessionId, jobId, { ...command(), action: "advance", movement: "receipt-384", step: "settled", ...forgery })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(repository.command).not.toHaveBeenCalled();
  });

  it("requires valid pagination and rejects tenant/environment injection into the query", async () => {
    const { repository, application } = fixture();
    for (const forged of [{ tenantId: randomUUID() }, { environment: "production" }, { limit: 0 }, { limit: 51 }, { cursor: "-1" }, { cursor: "secret" }, { version: "v2" }]) {
      await expect(application.view(sessionId, jobId, { version: "practice-feed-query.v1", ...forged })).rejects.toMatchObject({ code: "INVALID_QUERY" });
    }
    expect(repository.view).not.toHaveBeenCalled();
    await application.view(sessionId, jobId, { version: "practice-feed-query.v1", cursor: "1", limit: "1" });
    expect(repository.view).toHaveBeenCalledWith(expect.anything(), expect.anything(), sessionId, jobId, { version: "practice-feed-query.v1", cursor: "1", limit: 1 });
  });

  it("preserves repository authorization and conflict failures without pretending they are successful states", async () => {
    const { repository, application } = fixture();
    for (const code of ["PRACTICE_FEED_FORBIDDEN", "PRACTICE_FEED_STALE_REVISION", "IDEMPOTENCY_PAYLOAD_CONFLICT", "PRACTICE_FEED_DISCONNECTED", "PRACTICE_FEED_MOVEMENT_NOT_SETTLED"]) {
      const error = Object.assign(new Error(code), { code });
      repository.command.mockRejectedValueOnce(error);
      await expect(application.command(sessionId, jobId, command())).rejects.toBe(error);
    }
  });

  it("validates the persisted response shape and never admits an allocation from this leaf", async () => {
    const { repository, application } = fixture();
    repository.view.mockResolvedValueOnce({ ...response, environment: "production" });
    await expect(application.view(sessionId, jobId)).rejects.toThrow();
    const movement = { id: "a:receipt-384", movementKey: "receipt-384", underlyingMovementId: "receipt-384", kind: "customer_receipt", fixture: "recovery-18800", label: "£384.00 customer receipt (recovery-18800)",
      grossPence: 38400, currency: "GBP", state: "settled", allocatedEligibleNetPence: 0, eligibleForAllocation: true, eventIds: [], sourceHashes: [] };
    expect(practiceFeedResponseV1.safeParse({ ...response, movements: [movement] }).success).toBe(true);
    expect(practiceFeedResponseV1.safeParse({ ...response, movements: [{ ...movement, allocatedEligibleNetPence: 1 }] }).success).toBe(false);
    expect(practiceFeedResponseV1.safeParse({ ...response, movements: [{ ...movement, grossPence: Infinity }] }).success).toBe(false);
    expect(practiceFeedResponseV1.safeParse({ ...response, allocatedEligibleNetPence: 1 }).success).toBe(false);
    expect(practiceFeedResponseV1.safeParse({ ...response, realExternalActions: 1 }).success).toBe(false);
  });

  it("rejects malformed job identifiers without database access", async () => {
    const { repository, application } = fixture();
    await expect(application.view(sessionId, "not-a-job")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repository.view).not.toHaveBeenCalled();
  });

  it("limits advance to the fixed catalogue and steps, and requires a nonnegative expected revision", () => {
    expect(practiceFeedCommandV1.safeParse({ ...command(), action: "advance", movement: "receipt-384", step: "live_bank_feed" }).success).toBe(false);
    expect(practiceFeedCommandV1.safeParse({ ...command(), action: "advance", movement: "receipt-385", step: "settled" }).success).toBe(false);
    expect(practiceFeedCommandV1.safeParse({ ...command(), expectedRevision: -1 }).success).toBe(false);
    expect(practiceFeedCommandV1.safeParse({ ...command(), action: "advance", movement: "receipt-384", step: "settled" }).success).toBe(true);
  });
});

describe("practice feed HTTP error and cookie contract", () => {
  it("gives exact statuses for known typed errors and redacts internal failures", () => {
    expect(practiceFeedHttpError({ code: "UNAUTHENTICATED" })).toEqual({ status: 401, body: { version: "practice-feed-error.v1", code: "UNAUTHENTICATED" } });
    expect(practiceFeedHttpError({ code: "PRACTICE_FEED_STALE_REVISION" }).status).toBe(409);
    expect(practiceFeedHttpError({ code: "PRACTICE_FEED_MOVEMENT_NOT_SETTLED" }).status).toBe(409);
    expect(practiceFeedHttpError({ code: "PRACTICE_FEED_RECEIPT_MISMATCH" }).status).toBe(409);
    expect(practiceFeedHttpError({ code: "PRACTICE_FEED_FORBIDDEN" }).status).toBe(403);
    expect(practiceFeedHttpError({ code: "SYNTHETIC_ONLY" }).status).toBe(403);
    expect(practiceFeedHttpError({ code: "INVALID_COMMAND" }).status).toBe(400);
    expect(practiceFeedHttpError(new Error("private connection string"))).toEqual({ status: 503, body: { version: "practice-feed-error.v1", code: "DATABASE_UNAVAILABLE" } });
    expect(practiceFeedHttpError({ code: "42P01", message: "relation detail" }).status).toBe(503);
  });
  it("refuses duplicate HTTP query fields instead of silently selecting one", () => {
    expect(practiceFeedHttpQuery(new URLSearchParams("limit=1&cursor=0"))).toEqual({ version: "practice-feed-query.v1", limit: "1", cursor: "0" });
    expect(() => practiceFeedHttpQuery(new URLSearchParams("limit=1&limit=2"))).toThrow("INVALID_QUERY");
  });
  it("reads one exact cookie and rejects ambiguous session cookies", () => {
    expect(practiceFeedSession(`another=value; jg_session=${sessionId}; theme=dark`)).toBe(sessionId);
    expect(practiceFeedSession(`jg_session=${sessionId}; jg_session=${randomUUID()}`)).toBeUndefined();
    expect(practiceFeedSession("not_jg_session=one")).toBeUndefined();
    expect(practiceFeedSession(undefined)).toBeUndefined();
  });
});
