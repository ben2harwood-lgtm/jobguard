import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), factory: vi.fn() }));
vi.mock("../../../lib/pay-now-attempt-server", () => ({ payNowAttemptApplication: m.factory }));
vi.mock("@jobguard/api/identity", () => import("../../../../../api/src/auth/customer-signin.js"));
import { GET } from "./route";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); m.factory.mockReturnValue({ customerPractice: m.read }); m.read.mockResolvedValue({ invoiceNumber: "TEST-1", amountDue: { pence: 1, currency: "GBP" }, options: [] }); });
afterEach(() => vi.unstubAllEnvs());
it("is a no-store GET passing only session headers to the server", async () => {
  const response = await GET(new Request("https://practice.invalid/api/customer-portal/practice-pay-now", { headers: { cookie: "jobguard_customer=session" } }));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(m.read).toHaveBeenCalledWith({ headers: { cookie: "jobguard_customer=session" } });
  expect(await response.json()).toEqual({ invoiceNumber: "TEST-1", amountDue: { pence: 1, currency: "GBP" }, options: [] });
});
it.each(["invoiceId", "tenantId", "jobId", "customerId"])("rejects a supplied %s without reading anything", async key => {
  const response = await GET(new Request(`https://practice.invalid/?${key}=foreign`));
  expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: "CUSTOMER_REFUSED" });
  expect(m.factory).not.toHaveBeenCalled();
});
it("rejects tenant headers without reading anything", async () => {
  expect((await GET(new Request("https://practice.invalid/", { headers: { "x-tenant-id": "foreign" } }))).status).toBe(401);
  expect(m.factory).not.toHaveBeenCalled();
});
it.each(["production", "pilot_no_charge", ""])("keeps %s dark before constructing the service", async mode => {
  vi.stubEnv("JOBGUARD_ENV", mode);
  expect((await GET(new Request("https://practice.invalid/"))).status).toBe(404);
  expect(m.factory).not.toHaveBeenCalled();
});
