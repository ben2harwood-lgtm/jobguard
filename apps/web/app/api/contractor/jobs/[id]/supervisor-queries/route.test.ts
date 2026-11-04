import { afterEach, expect, it, vi } from "vitest";
const run = vi.hoisted(() => vi.fn());
const pool = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "11111111-1111-4111-8111-111111111111" }) }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ syntheticPool: pool }));
vi.mock("@jobguard/api/workspace", async original => ({ ...await original<typeof import("@jobguard/api/workspace")>(), SiteExtraApplication: class { supervisorQueries = run; } }));
import { GET, POST } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const body = { version: "record-site-supervisor-query.v1", commandId: id, orderLineScopeItemId: id, sorCode: "FIT-LOCK", quantity: "1", expectedOrderRevisionId: id };
const context = { params: Promise.resolve({ id }) };
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
const request = (raw: unknown, origin = "http://localhost:3000") => new Request(`http://localhost:3000/api/contractor/jobs/${id}/supervisor-queries`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(raw) });
it("refuses an untrusted origin before parsing or constructing an application", async () => {
 const response = await POST(request(body, "https://evil.invalid"), context);
 expect(response.status).toBe(403); expect(run).not.toHaveBeenCalled(); expect(pool).not.toHaveBeenCalled();
});
it("refuses a raw price before any database call", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const response = await POST(request({ ...body, amount: 100 }), context);
 expect(response.status).toBe(400); expect(run).not.toHaveBeenCalled(); expect(pool).not.toHaveBeenCalled();
});
it("binds only the cookie principal, path and strict body and keeps reads/writes uncached", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); run.mockResolvedValue({ stored: true });
 const response = await POST(request(body), context);
 expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
 expect(run).toHaveBeenLastCalledWith({ version: "contractor-principal.v1", sessionId: id }, id, body);
 const read = await GET(new Request("http://localhost:3000"), context);
 expect(read.status).toBe(200); expect(read.headers.get("cache-control")).toBe("no-store");
 expect(run).toHaveBeenLastCalledWith({ version: "contractor-principal.v1", sessionId: id }, id, undefined);
});

it("refuses non-synthetic reads and writes before constructing the application", async () => {
 vi.stubEnv("JOBGUARD_ENV", "production_billing");
 expect((await POST(request(body), context)).status).toBe(403);
 expect((await GET(new Request("http://localhost:3000"), context)).status).toBe(403);
 expect(pool).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
});
