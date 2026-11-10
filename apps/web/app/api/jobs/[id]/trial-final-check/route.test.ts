import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ context: vi.fn(), call: vi.fn() }));
vi.mock("../../../../lib/identity-server", () => ({ identityApplication: () => ({ context: state.context }), identityCredentials: async () => ({ sessionToken: "company", csrfToken: "csrf" }) }));
vi.mock("../../../../lib/synthetic-server", () => ({ syntheticPool: () => ({}) }));
vi.mock("@jobguard/db", async original => {
 const actual = await original<typeof import("@jobguard/db")>();
 return { ...actual, CompanyFinalCheckRepository: class {
  read = state.call; acceptTerms = state.call; disposition = state.call; lock = state.call; requestRun = state.call; reveal = state.call;
 } };
});
import { CompanyFinalCheckError } from "@jobguard/db";
import { POST } from "./route";
const jobId = "11111111-1111-4111-8111-111111111111";
const send = (body: unknown) => POST(new Request(`http://localhost/api/jobs/${jobId}/trial-final-check`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: jobId }) });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); state.context.mockReset().mockResolvedValue({ tenantId: "verified" }); state.call.mockReset().mockResolvedValue({ state: "unlocked", items: [] }); });
it("forwards whole freshly resolved context only to the six company routines", async () => {
 for (const action of ["read", "acceptTerms", "disposition", "lock", "requestRun", "reveal"]) {
  const response = await send({ action, input: { version: "company-final-check.v1", jobId } });
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
 }
 expect(state.context).toHaveBeenCalledTimes(6);
 expect(state.call).toHaveBeenCalledWith({ tenantId: "verified" }, { version: "company-final-check.v1", jobId });
});
it("refuses production, unknown actions, extra envelope authority and absent company sessions", async () => {
 vi.stubEnv("JOBGUARD_ENV", "production"); expect((await send({ action: "read", input: { jobId } })).status).toBe(403); expect(state.context).not.toHaveBeenCalled();
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 for (const body of [{ action: "assemble", input: { jobId } }, { action: "read", input: { jobId }, tenantId: "forged" }]) expect((await send(body)).status).toBe(400);
 expect(state.call).not.toHaveBeenCalled();
 state.context.mockRejectedValue(new Error("hidden source")); expect((await send({ action: "read", input: { jobId } })).ok).toBe(false);
 expect(state.call).not.toHaveBeenCalled();
});
it("redacts foreign jobs and removed members identically and never caches refusals", async () => {
 state.call.mockRejectedValue(new CompanyFinalCheckError("COMPANY_FINAL_CHECK_FORBIDDEN"));
 for (const action of ["read", "lock", "reveal"]) {
  const response = await send({ action, input: { jobId } }); expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: "COMPANY_FINAL_CHECK_FORBIDDEN" }); expect(response.headers.get("cache-control")).toBe("no-store");
 }
 state.call.mockRejectedValue(new Error("foreign hidden signal"));
 const response = await send({ action: "reveal", input: { jobId } }); expect(response.status).toBe(503);
 expect(JSON.stringify(await response.json())).not.toContain("hidden");
});

it("rejects body job IDs that differ from the route before calling a company routine", async () => {
 const response = await send({ action: "lock", input: { jobId: "22222222-2222-4222-8222-222222222222" } });
 expect(response.status).toBe(400);
 expect(await response.json()).toEqual({ code: "INVALID_COMPANY_FINAL_CHECK_INPUT" });
 expect(state.call).not.toHaveBeenCalled();
});
