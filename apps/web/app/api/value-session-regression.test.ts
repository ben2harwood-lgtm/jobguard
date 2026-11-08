import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ job: vi.fn(), business: vi.fn(), credentials: vi.fn(),
 effects: [] as (() => unknown)[], set: vi.fn() }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
 useState: (value: unknown) => [value, f.set], useEffect: (effect: () => unknown) => { f.effects.push(effect); } }));
vi.mock("../lib/workspace-server", () => ({ workspaceApplication: async () => ({ valueV3: { readJob: f.job }, businessValue: { readBusiness: f.business } }) }));
vi.mock("../lib/identity-server", () => ({ identityApplication: () => ({ allowedOrigin: "https://fictional.invalid", provider: {} }), identityCredentials: f.credentials }));
vi.mock("../lib/synthetic-server", () => ({ syntheticPool: () => ({}) }));
import { CompanyValueApplication } from "@jobguard/api/workspace";
import { GET as jobGET } from "./jobs/[id]/value/v3/route";
import { GET as businessGET } from "./value/route";
import { JobMappedValue } from "../ui/mapped-value-receipt";
import { BusinessValueV3 } from "../ui/business-value-v3";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubGlobal("React", React);
 vi.stubGlobal("window", { location: { search: "" } });
 f.effects.length = 0; f.set.mockReset();
 f.job.mockReset().mockResolvedValue({ jobId: id, status: "incomplete", receipt: null });
 f.business.mockReset().mockResolvedValue({ state: "unavailable", code: "BUSINESS_VALUE_BINDING_HELD" });
 f.credentials.mockReset().mockResolvedValue({ sessionToken: "company" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
for (const kind of ["job", "business"] as const) {
 describe(`${kind} value session precedence`, () => {
  const read = (cookie: string) => {
   const request = new Request(`https://fictional.invalid/api/value`, { headers: { cookie } });
   return kind === "job" ? jobGET(request, { params: Promise.resolve({ id }) }) : businessGET(request);
  };
  it.each(["jobguard_session=company; jg_session=practice", "jg_session=practice; jobguard_session=company", "jg_session=practice"])("keeps practice authority for %s", async cookie => {
   const company = vi.spyOn(CompanyValueApplication.prototype, kind === "job" ? "readJob" : "readBusiness");
   await read(cookie);
   expect(kind === "job" ? f.job : f.business).toHaveBeenCalledTimes(1);
   expect(company).not.toHaveBeenCalled(); expect(f.credentials).not.toHaveBeenCalled();
  });
  it("uses company authority for company-only cookies", async () => {
   const company = vi.spyOn(CompanyValueApplication.prototype, kind === "job" ? "readJob" : "readBusiness").mockResolvedValue({} as never);
   await read("jobguard_session=company");
   expect(company).toHaveBeenCalledTimes(1);
   expect(company.mock.calls[0]?.[0]).toEqual({ sessionToken: "company", origin: "https://fictional.invalid" });
   expect(f.job).not.toHaveBeenCalled(); expect(f.business).not.toHaveBeenCalled();
  });
 });
}
for (const kind of ["job", "business"] as const) {
 const mount = () => { if (kind === "job") JobMappedValue({ jobId: id }); else BusinessValueV3(); f.effects[0]!(); };
 it(`${kind} company-only fetch binds session token and tenant`, async () => {
  const fetch = vi.fn(async (url: string) => url === "/api/session" ? new Response("{}", { status: 401 })
   : url === "/api/auth/session" ? Response.json({ csrfToken: "fictional-token", memberships: [{ tenantId: "fictional-tenant" }] })
   : Response.json({ state: "unavailable", code: "BUSINESS_VALUE_UNAVAILABLE" }));
  vi.stubGlobal("fetch", fetch); mount();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(fetch.mock.calls[1]?.[0]).toBe("/api/auth/session");
  expect(fetch).toHaveBeenLastCalledWith(kind === "job" ? `/api/jobs/${id}/value/v3` : "/api/value", expect.objectContaining({
   credentials: "same-origin", cache: "no-store", headers: { "x-csrf-token": "fictional-token", "x-tenant-id": "fictional-tenant" } }));
 });
 it.each(["refused", "missing-token", "missing-tenant", "network"])(`${kind} sends no value request after session failure: %s`, async failure => {
  const fetch = vi.fn(async (url: string) => {
   if (url === "/api/session") return new Response("{}", { status: 401 });
   if (failure === "network") throw new Error("Unavailable");
   return Response.json({ ...(failure !== "missing-token" ? { csrfToken: "token" } : {}),
    memberships: failure === "missing-tenant" ? [] : [{ tenantId: "tenant" }] }, { status: failure === "refused" ? 401 : 200 });
  });
  vi.stubGlobal("fetch", fetch); mount();
  await vi.waitFor(() => expect(f.set).toHaveBeenCalledWith(expect.stringContaining("unavailable")));
  expect(fetch.mock.calls.map(call => call[0])).toEqual(["/api/session", "/api/auth/session"]);
 });
 it(`${kind} practice reads retain their own authority`, async () => {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ state: "unavailable" }));
  vi.stubGlobal("fetch", fetch); mount();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[0]).toEqual(["/api/session", expect.anything()]);
 });
}
