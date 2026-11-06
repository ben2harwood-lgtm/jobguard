import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { practiceFirmName } from "../../lib/contracts";
const stub = vi.hoisted(() => ({ start: vi.fn(), pool: vi.fn(() => ({})) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "browser-session" }) }) }));
vi.mock("../../lib/synthetic-server", () => ({ syntheticPool: stub.pool, practiceFailure: () => null }));
vi.mock("@jobguard/db", async importOriginal => ({ ...await importOriginal<typeof import("@jobguard/db")>(), startBlankPracticeCompany: stub.start }));
import { POST } from "./route";
const request = (origin = "http://127.0.0.1:3000", body: unknown = { version: "blank-practice-company.v1", action: "start" }) => new Request("http://localhost:3000/api/practice-company", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ["VERCEL", "CF_PAGES", "CF_PAGES_URL", "JOBGUARD_HOSTING", "JOBGUARD_ALLOWED_ORIGINS", "VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) vi.stubEnv(key, "");
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  stub.start.mockResolvedValue("replacement-session");
});
afterEach(() => vi.unstubAllEnvs());
it.each(["start", "reset"])("accepts loopback Origin under next start for %s", async action => {
  const body = { version: "blank-practice-company.v1", action };
  const response = await POST(request(undefined, body));
  expect(response.status).toBe(200);
  expect(stub.start).toHaveBeenCalledWith({}, body, "browser-session");
  expect(response.headers.get("set-cookie")).toContain("jg_session=replacement-session");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("accepts a configured public origin even when request.url is internal", async () => {
  vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://practice.example.org");
  expect((await POST(request("https://practice.example.org"))).status).toBe(200);
});
it("refuses foreign origins and malformed commands before touching the database", async () => {
  expect((await POST(request("https://other.invalid"))).status).toBe(403);
  expect((await POST(request(undefined, { version: "blank-practice-company.v1", action: "reset", tenantId: "other" }))).status).toBe(400);
  expect(stub.pool).not.toHaveBeenCalled();
  expect(stub.start).not.toHaveBeenCalled();
});
it.each(["production", "", "pilot_no_charge"])("refuses mode %s before touching the database", async mode => {
  vi.stubEnv("JOBGUARD_ENV", mode);
  expect((await POST(request())).status).toBe(401);
  expect(stub.pool).not.toHaveBeenCalled();
});
it("bounds display-only tester names and falls back for missing or ambiguous names", () => {
  expect(practiceFirmName(" Tommy ")).toBe("Tommy's practice firm");
  for (const name of [undefined, " ", "x".repeat(41), ["Tommy", "Sam"]]) expect(practiceFirmName(name)).toBe("Builder's practice firm");
});
