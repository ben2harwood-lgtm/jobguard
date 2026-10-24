import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ cookie: vi.fn(), authenticate: vi.fn(), pool: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: f.cookie }) }));
vi.mock("@jobguard/db", () => ({ authenticatePracticeSession: f.authenticate }));
vi.mock("../../lib/synthetic-server", () => ({ syntheticPool: f.pool }));
import * as route from "./route";

beforeEach(() => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 f.cookie.mockReturnValue({ value: "current-cookie" });
 f.authenticate.mockReset().mockResolvedValue({ context: { tenantId: "not-company-authority" } });
 f.pool.mockReset().mockReturnValue({});
});
afterEach(() => vi.unstubAllEnvs());
const read = (query = "") => route.GET(new Request(`https://fictional.invalid/api/value${query}`));
it("CH9-B01/B02/B06/B07 Next cannot turn held company/source authority into an empty successful aggregate", async () => {
 for (let n = 0; n < 2; n++) {
  const response = await read();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ version: "business-value-result.v1", state: "unavailable", code: "BUSINESS_VALUE_BINDING_HELD" });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
 }
 expect(f.authenticate).toHaveBeenCalledTimes(2);
 expect(f.authenticate).toHaveBeenCalledWith({}, "current-cookie");
 expect("POST" in route).toBe(false);
});
it.each(["?periodId=foreign", "?from=2026-10-01T00:00:00Z&toExclusive=2026-11-01T00:00:00Z"])("CH9-B03/B04 period/time selections stay unavailable: %s", async query => {
 const response = await read(query);
 expect(response.status).toBe(503);
 expect((await response.json()).code).toBe("BUSINESS_VALUE_SELECTION_HELD");
});
it.each(["?tenantId=foreign", "?periodId=a&periodId=b", "?count=0", "?fee=0", "?from=bad", "?from=2026-10-01T00:00:00Z", "?trial=true"])("CH9-B07 rejects forged, repeated and unsupported selectors: %s", async query => {
 const response = await read(query);
 expect(response.status).toBe(400);
 expect((await response.json()).code).toBe("INVALID_BUSINESS_VALUE_SELECTION");
});
it("CH9-B08 refuses real mode before opening a database", async () => {
 vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
 const response = await read("?tenantId=foreign");
 expect(response.status).toBe(403);
 expect((await response.json()).code).toBe("SYNTHETIC_MODE_REQUIRED");
 expect(f.pool).not.toHaveBeenCalled(); expect(f.authenticate).not.toHaveBeenCalled();
});
it("CH9-B01/B09 session refusal wins over informative query errors and is not cached", async () => {
 f.authenticate.mockRejectedValue(Object.assign(new Error("secret"), { code: "UNAUTHENTICATED" }));
 const response = await read("?tenantId=foreign");
 expect(response.status).toBe(401);
 expect(await response.json()).toEqual({ version: "business-value-result.v1", state: "unavailable", code: "UNAUTHENTICATED" });
 expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("database errors are redacted", async () => {
 f.pool.mockImplementation(() => { throw new Error("password=fictional-secret"); });
 const response = await read(); expect(response.status).toBe(503);
 expect((await response.json()).code).toBe("BUSINESS_VALUE_UNAVAILABLE");
});
