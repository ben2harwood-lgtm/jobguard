import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), read: vi.fn(), view: vi.fn(), pool: {}, token: "00000000-0000-4000-8000-000000000001" as string | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.token ? { value: mocks.token } : undefined }) }));
vi.mock("@jobguard/db", async original => ({ ...await original<typeof import("@jobguard/db")>(),
  authorizePracticeJob: mocks.authorize,
  InboxMetricsRepository: class { read = mocks.read; }, InboxRelevanceRepository: class { view = mocks.view; },
}));
vi.mock("../../../../lib/synthetic-server", async original => ({ ...await original<typeof import("../../../../lib/synthetic-server")>(), syntheticPool: () => mocks.pool }));
import { PracticeAccessError } from "@jobguard/db";
import { GET } from "./route";
const jobId = "00000000-0000-4000-8000-000000000002";
const context = { tenantId: "verified-company" };
const metric = { ruleId: "proof", ruleVersion: "v1", findings: 2, decisions: 1, convertedFindings: 2,
  findingToDecisionRate: 1, coalescedCount: 1, confirmed: 0, dismissed: 0, reasons: { duplicate: 0 },
  meanTimeToDecisionMs: null, laterOutcomes: { useful: 0, no_issue: 0, cancelled: 0, reversed: 0 },
  message: "PRIVATE MESSAGE", recipient: "PRIVATE RECIPIENT", customerName: "PRIVATE CUSTOMER", signalToNoise: { confirmedShare: null } };
const call = (id = jobId) => GET(new Request(`http://localhost/api/jobs/${id}/inbox-metrics?tenantId=forged&role=owner&advisoryBudget=0`, {
  headers: { "x-tenant-id": "forged" },
}), { params: Promise.resolve({ id }) });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  mocks.token = "00000000-0000-4000-8000-000000000001";
  mocks.authorize.mockResolvedValue({ context, membershipId: "verified-member", digest: "verified-digest" });
  mocks.read.mockResolvedValue({ asOf: "2026-11-02T00:00:00Z", byRule: [metric], ingestion: { accepted: 99 } });
  mocks.view.mockResolvedValue({ mandatory: [
    { ruleId: "proof", ruleRevision: "v1", title: "PRIVATE MESSAGE", recipient: "PRIVATE RECIPIENT" },
    { ruleId: "proof", ruleRevision: "v1" }, { ruleId: "approval", ruleRevision: "v2" },
  ], advisory: [], advisoryBudget: 0 });
});
afterEach(() => vi.unstubAllEnvs());
it("derives one tenant/job from persisted ownership, excludes private fields and keeps mandatory counts outside the cap", async () => {
  const response = await call(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(mocks.pool, mocks.token, jobId);
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith(context, { version: "inbox-metrics.v1", environment: "synthetic_demo", jobId, asOf: expect.any(String) });
  expect(mocks.view).toHaveBeenCalledExactlyOnceWith(context, jobId, "verified-member", "verified-digest");
  const body = await response.json();
  expect(body.mandatoryBlockers).toEqual([{ ruleId: "approval", ruleVersion: "v2", count: 1 }, { ruleId: "proof", ruleVersion: "v1", count: 2 }]);
  expect(body.byRule[0]).toMatchObject({ coalescedCount: 1, duplicateCount: 0, meanTimeToDecisionMs: null, laterOutcomes: { unknown: 1, recorded: null } });
  expect(JSON.stringify(body)).not.toMatch(/PRIVATE|recipient|customerName|message|signalToNoise|ingestion|tenantId|membershipId|digest/u);
});
it.each(["UNAUTHENTICATED", "NOT_FOUND"] as const)("refuses %s before any data read, including same-company foreign ownership", async code => {
  mocks.authorize.mockRejectedValue(new PracticeAccessError(code));
  const response = await call(); expect(response.status).toBe(code === "NOT_FOUND" ? 404 : 401);
  expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.json()).toEqual({ code });
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.view).not.toHaveBeenCalled();
});
it("checks ownership again for every request and never reuses another owner's context", async () => {
  expect((await call()).status).toBe(200);
  mocks.authorize.mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
  expect((await call("00000000-0000-4000-8000-000000000003")).status).toBe(404);
  expect(mocks.read).toHaveBeenCalledTimes(1);
});
it("fails closed outside the dark environment or without a session", async () => {
  vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge"); expect((await call()).status).toBe(403);
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); mocks.token = undefined; expect((await call()).status).toBe(401);
  mocks.token = "invalid"; expect((await call()).status).toBe(401); expect(mocks.authorize).not.toHaveBeenCalled();
});
it("returns honest empty metrics and generic infrastructure errors with no cached or partial success", async () => {
  mocks.read.mockResolvedValue({ asOf: "2026-11-02T00:00:00Z", byRule: [] });
  expect((await (await call()).json()).byRule).toEqual([]);
  mocks.view.mockRejectedValue(new Error("PRIVATE MESSAGE shadow count 9"));
  const response = await call(); expect(response.status).toBe(503); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ code: "INBOX_METRICS_UNAVAILABLE" });
});
