import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ readJob: vi.fn(), workspace: vi.fn() }));
vi.mock("../../../../../lib/identity-server",()=>({identityApplication:()=>({allowedOrigin:"https://synthetic.invalid",provider:{}}),identityCredentials:async()=>({sessionToken:"company-cookie"})}));
vi.mock("../../../../../lib/synthetic-server",()=>({syntheticPool:()=>({})}));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: f.workspace }));
import { GET } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 f.workspace.mockReset().mockResolvedValue({ valueV3: { readJob: f.readJob } });
 f.readJob.mockReset().mockResolvedValue({ version: "job-value.v3", status: "incomplete", jobId: id, receipt: null });
});
afterEach(() => {vi.unstubAllEnvs();vi.restoreAllMocks();});
const read = (query = "") => GET(new Request(`https://synthetic.invalid/api/jobs/${id}/value/v3${query}`), { params: Promise.resolve({ id }) });
it("composes the request-scoped job service with private responses on repeated reads", async () => {
 for (let n = 0; n < 2; n++) {
  const result = await read();
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("private, no-store");
  expect(result.headers.get("vary")).toBe("Cookie");
  expect(await result.json()).toMatchObject({ jobId: id, receipt: null });
 }
 expect(f.workspace).toHaveBeenCalledTimes(2);
 expect(f.readJob).toHaveBeenLastCalledWith(id, {});
});
it.each([["UNAUTHENTICATED", 401], ["NOT_FOUND", 404], ["VALUE_V3_QUERY_UNBOUND", 400], ["VALUE_V3_SOURCE_REJECTED", 503], ["secret SQL", 503]] as const)("sanitizes %s with no cache", async (code, status) => {
 f.readJob.mockRejectedValue(Object.assign(new Error("private SQL and tenant"), { code }));
 const result = await read("?fee=100");
 expect(result.status).toBe(status);
 expect(result.headers.get("cache-control")).toBe("private, no-store");
 expect(await result.json()).toEqual({ version: "job-value-error.v3", status: "incomplete", code: code === "secret SQL" ? "VALUE_V3_UNAVAILABLE" : code });
});
it("refuses production before constructing an application", async () => {
 vi.stubEnv("JOBGUARD_ENV", "production");
 expect((await read()).status).toBe(403);
 expect(f.workspace).not.toHaveBeenCalled();
});

it("preserves repeated window selectors for the shared strict validator",async()=>{
 await read("?from=2026-10-01T00:00:00Z&from=2026-10-02T00:00:00Z&toExclusive=2026-11-01T00:00:00Z");
 expect(f.readJob).toHaveBeenCalledWith(id,{from:["2026-10-01T00:00:00Z","2026-10-02T00:00:00Z"],toExclusive:"2026-11-01T00:00:00Z"});
});

it("a company job link uses company credentials and keeps practice data out of its read",async()=>{
 const {CompanyValueApplication,heldJobValueV3}=await import("@jobguard/api/workspace");
 const company=vi.spyOn(CompanyValueApplication.prototype,"readJob").mockResolvedValue(heldJobValueV3(id));
 const response=await GET(new Request(`https://synthetic.invalid/api/jobs/${id}/value/v3`,{headers:{cookie:"jobguard_session=company-cookie; jg_session=practice"}}),{params:Promise.resolve({id})});
 expect(response.status).toBe(200);expect(company).toHaveBeenCalledWith({sessionToken:"company-cookie",origin:"https://synthetic.invalid"},id,{});expect(f.workspace).not.toHaveBeenCalled();
});
