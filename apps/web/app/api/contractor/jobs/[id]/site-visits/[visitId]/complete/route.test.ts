import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteVisitError, completeSiteVisitV1, siteVisitErrorCodes, siteVisitHttpStatus } from "@jobguard/core";
const { completeVisit, workspace } = vi.hoisted(() => { const completeVisit = vi.fn(); return { completeVisit, workspace: vi.fn<() => Promise<{ siteExtras: { completeVisit: (jobId: string, visitId: string, raw: unknown) => Promise<unknown> } }>>(async () => ({ siteExtras: { completeVisit } })) }; });
vi.mock("server-only", () => ({}));
vi.mock("../../../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { POST } from "./route";
const job = "00000000-0000-4000-8000-000000000001", visit = "00000000-0000-4000-8000-000000000002";
const raw = (closeoutAnswer: unknown = "yes") => ({ version: "complete-site-visit.v1", commandId: crypto.randomUUID(), closeoutAnswer });
const post = (body: string, origin: string | undefined = "https://app.fictional.invalid", headers: Record<string, string> = {}, query = "") => POST(new Request(`https://app.fictional.invalid/api/contractor/jobs/ignored/site-visits/ignored/complete${query}`, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...headers }, body }), { params: Promise.resolve({ id: job, visitId: visit }) });
const stored = () => ({ version: "site-visit-completed.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job, visitId: visit, completedAt: "2026-10-13T09:30:00.000000Z", closeoutAnswer: "yes" });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_URL", "app.fictional.invalid"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", ""); completeVisit.mockReset(); workspace.mockClear(); completeVisit.mockResolvedValue(stored()); });
afterEach(() => vi.unstubAllEnvs());
describe("ENT-3b thin Next adapter: complete a visit", () => {
 it("[B17] passes only the parsed body and the two path IDs, ignoring tenant, member and role in headers and query", async () => {
  const body = raw("no"); const response = await post(JSON.stringify(body), "https://app.fictional.invalid", { "x-tenant-id": crypto.randomUUID(), role: "owner" }, `?tenantId=${crypto.randomUUID()}&membershipId=${crypto.randomUUID()}&role=owner`);
  expect(completeVisit).toHaveBeenCalledExactlyOnceWith(job, visit, completeSiteVisitV1.parse(body)); expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
 });
 it.each(["tenantId", "membershipId", "role", "jobId", "visitId", "completedAt", "serverRecordedAt", "questionVersion"])("[B17] refuses body authority field %s before the service", async field => {
  const response = await post(JSON.stringify({ ...raw(), [field]: "tampered" })); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "INVALID_COMMAND" }); expect(completeVisit).not.toHaveBeenCalled();
 });
 it.each([["missing"], ["null"]])("[B6] a body with the answer %s is CLOSEOUT_ANSWER_REQUIRED (400) and the service is never called", async kind => {
  const body = raw(); if (kind === "missing") delete (body as Record<string, unknown>).closeoutAnswer; else (body as Record<string, unknown>).closeoutAnswer = null;
  const response = await post(JSON.stringify(body)); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "CLOSEOUT_ANSWER_REQUIRED" }); expect(workspace).not.toHaveBeenCalled(); expect(completeVisit).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
 });
 it.each(["", "maybe", true, "Yes", " yes", 1])("[B6] an invalid answer %j is INVALID_COMMAND and the service is never called", async answer => {
  const response = await post(JSON.stringify(raw(answer))); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "INVALID_COMMAND" }); expect(completeVisit).not.toHaveBeenCalled();
 });
 it.each(["https://foreign.invalid", "null", "missing"])("[B18] refuses Origin %s before composition", async origin => {
  const request = new Request("https://app.fictional.invalid/api/contractor/jobs/ignored/site-visits/ignored/complete", { method: "POST", body: "{}", headers: origin === "missing" ? {} : { origin } }); const response = await POST(request, { params: Promise.resolve({ id: job, visitId: visit }) });
  expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "ORIGIN_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
 });
 it.each(["pilot_no_charge", "production_billing", ""])("[B18] refuses mode %j before composition or the database", async mode => { vi.stubEnv("JOBGUARD_ENV", mode); const response = await post(JSON.stringify(raw())); expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "MODE_FORBIDDEN" }); expect(workspace).not.toHaveBeenCalled(); });
 it("[B18] malformed JSON is INVALID_COMMAND and does not call the service", async () => { const response = await post("{invalid"); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "INVALID_COMMAND" }); expect(workspace).not.toHaveBeenCalled(); });
 it.each(siteVisitErrorCodes)("[B18] %s answers its one status with a code-only body and no-store", async code => { completeVisit.mockRejectedValue(new SiteVisitError(code)); const response = await post(JSON.stringify(raw())); expect(response.status).toBe(siteVisitHttpStatus(code)); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code }); expect(response.headers.get("cache-control")).toBe("no-store"); });
 it("[B18] removes unexpected PostgreSQL detail", async () => { completeVisit.mockRejectedValue(new Error("PostgreSQL detail and a Fictional resident")); const response = await post(JSON.stringify(raw())); expect(response.status).toBe(503); expect(await response.json()).toEqual({ version: "site-visit-error.v1", code: "SITE_VISIT_UNAVAILABLE" }); });
 it("[B9] success and an identical replay answer 201 with the same stored result", async () => {
  const request = JSON.stringify(raw()); const first = await post(request), replay = await post(request);
  expect(first.status).toBe(201); expect(replay.status).toBe(201); expect(await first.json()).toEqual(stored()); expect(await replay.json()).toEqual(stored());
 });
});
