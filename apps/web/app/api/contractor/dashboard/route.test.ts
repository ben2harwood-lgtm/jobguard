import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BaselineError, EnterpriseDashboardError } from "@jobguard/core";
const mocks = vi.hoisted(() => ({ read: vi.fn(), billing: vi.fn(), store: vi.fn(), baseline: vi.fn(), pool: vi.fn(() => ({})), token: "00000000-0000-4000-8000-000000000001" as string | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.token ? { value: mocks.token } : undefined }) }));
vi.mock("../../../lib/synthetic-server", () => ({ syntheticPool: mocks.pool }));
vi.mock("@jobguard/api/workspace", () => ({
  EnterpriseDashboardApplication: class { read = mocks.read; readBilling = mocks.billing; },
  EnterpriseBaselineApplication: class { import = mocks.store; read = mocks.baseline; },
}));
import { POST } from "./route";
import { POST as store } from "../baseline/route";
import { POST as compare } from "../baseline/compare/route";
const query = { version: "enterprise-dashboard-query.v1", from: "2026-01-01T00:00:00Z", until: "2027-01-01T00:00:00Z", dimension: "team", filters: {}, offset: 0, limit: 20 };
const input = { version: "enterprise-dashboard-request.v1", resource: "activity", query };
const request = (body: unknown = input, origin: string | null = "http://localhost:3000") => new Request("http://localhost:3000/api/contractor/dashboard?tenantId=foreign&role=owner", { method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": "application/json", "x-tenant-id": "foreign" }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); mocks.token = "00000000-0000-4000-8000-000000000001"; mocks.read.mockResolvedValue({ report: "scoped", signals: [] }); mocks.billing.mockResolvedValue({ contributions: [] }); mocks.store.mockResolvedValue({ batchId: "stored", replayed: true }); mocks.baseline.mockResolvedValue({ content: "method and hashes" }); });
afterEach(() => vi.unstubAllEnvs());
it("passes only the company cookie principal and validated query; no-store on repeated reads", async () => {
  for (let n = 0; n < 2; n++) { const r = await POST(request()); expect(r.status).toBe(200); expect(r.headers.get("cache-control")).toBe("no-store"); }
  expect(mocks.read).toHaveBeenCalledTimes(2);
  expect(mocks.read).toHaveBeenLastCalledWith({ sessionId: mocks.token }, query);
  const r = await POST(request({ ...input, resource: "billing" })); expect(r.status).toBe(200);
  expect(mocks.billing).toHaveBeenCalledExactlyOnceWith({ sessionId: mocks.token }, query);
});
it.each([null, "https://foreign.invalid"])("all adapters reject missing/foreign CSRF origin %s before composition", async origin => {
  for (const route of [POST, store, compare]) { const r = await route(request(input, origin)); expect(r.status).toBe(404); expect(r.headers.get("cache-control")).toBe("no-store"); }
  expect(mocks.pool).not.toHaveBeenCalled();
});
it.each(["production_billing", "pilot_no_charge", ""])("mode %s fails closed before composition", async mode => {
  vi.stubEnv("JOBGUARD_ENV", mode);
  for (const route of [POST, store, compare]) expect((await route(request())).status).toBe(403);
  expect(mocks.pool).not.toHaveBeenCalled();
});
it("refuses missing session, malformed JSON, forged authority, money and revision inputs", async () => {
  mocks.token = undefined; expect((await POST(request())).status).toBe(404); expect(mocks.pool).not.toHaveBeenCalled();
  mocks.token = "00000000-0000-4000-8000-000000000001";
  for (const body of [{ ...input, tenantId: "foreign" }, { ...input, query: { ...query, amount: 999999, revisionId: "locked-bill" } }, { ...input, resource: "fees" }, { ...input, query: { ...query, limit: 201 } }]) expect((await POST(request(body))).status).toBe(422);
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.billing).not.toHaveBeenCalled();
  const malformed = new Request(request().url, { method: "POST", headers: { origin: "http://localhost:3000" }, body: "{" });
  expect((await POST(malformed)).status).toBe(422);
});
it("forwards original baseline command unchanged so durable replay/conflict and full batch scope remain authoritative", async () => {
  const command = { version: "baseline-store.v1", format: "json", content: "synthetic", teamBindings: [] };
  for (let n = 0; n < 2; n++) expect(await (await store(request(command))).json()).toEqual({ batchId: "stored", replayed: true });
  expect(mocks.store).toHaveBeenLastCalledWith({ sessionId: mocks.token }, command);
  mocks.store.mockRejectedValue(new BaselineError("BASELINE_CONFLICT")); expect((await store(request(command))).status).toBe(409);
  const read = { version: "baseline-read.v1", batchId: "foreign" }; mocks.baseline.mockRejectedValue(new EnterpriseDashboardError("NOT_FOUND"));
  expect((await compare(request(read))).status).toBe(404); expect(mocks.baseline).toHaveBeenCalledWith({ sessionId: mocks.token }, read);
});
it("erases database/shadow detail and distinguishes current scope refusal from infrastructure failure", async () => {
  mocks.read.mockRejectedValue(new Error("hidden signal count=9 tenant=secret"));
  const r = await POST(request()); expect(r.status).toBe(503); expect(await r.json()).toEqual({ version: "enterprise-dashboard-error.v1", code: "DASHBOARD_UNAVAILABLE" });
  mocks.billing.mockRejectedValue(new EnterpriseDashboardError("NOT_FOUND")); const denied = await POST(request({ ...input, resource: "billing" }));
  expect(denied.status).toBe(404); expect(denied.headers.get("cache-control")).toBe("no-store");
});
