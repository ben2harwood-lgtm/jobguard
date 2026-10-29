import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ readJob: vi.fn(), workspace: vi.fn() }));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: f.workspace }));
import { GET } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 f.workspace.mockReset().mockResolvedValue({ valueV3: { readJob: f.readJob } });
 f.readJob.mockReset().mockResolvedValue({ version: "job-value.v3", status: "incomplete", jobId: id, receipt: null });
});
afterEach(() => vi.unstubAllEnvs());
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
