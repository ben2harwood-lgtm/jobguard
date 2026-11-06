import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
const stub = vi.hoisted(() => ({ request: vi.fn(async (_raw: unknown, _ip: string, _origin: string | undefined) => ({ accepted: true })) }));
vi.mock("@jobguard/api/identity", () => ({
  createIdentityApplication: () => ({ request: stub.request }),
  identityStatus: () => ({ code: "RATE_LIMITED", status: 429 }),
}));
import { POST } from "./route";
const body = { version: "identity-request.v1", email: "builder@practice.invalid", purpose: "signin" };
async function request(headers: Record<string, string> = {}, purpose = "signin") {
  return POST(new Request("https://jobguard.invalid/api/auth/request", {
    method: "POST", headers: { origin: "https://jobguard.invalid", ...headers },
    body: JSON.stringify({ ...body, purpose }),
  }));
}
afterEach(() => {
  vi.unstubAllEnvs(); stub.request.mockClear();
  delete (globalThis as { __jobguardIdentityApplication?: unknown }).__jobguardIdentityApplication;
});
it.each(["signin", "signup", "invitation"])("passes the Workers address for %s without changing the request", async purpose => {
  vi.stubEnv("JOBGUARD_HOSTING", "cloudflare");
  await request({ "cf-connecting-ip": "192.0.2.1" }, purpose);
  await request({ "cf-connecting-ip": "192.0.2.2" }, purpose);
  expect(stub.request).toHaveBeenNthCalledWith(1, { ...body, purpose }, "192.0.2.1", "https://jobguard.invalid");
  expect(stub.request).toHaveBeenNthCalledWith(2, { ...body, purpose }, "192.0.2.2", "https://jobguard.invalid");
});
it.each(["", "vercel"])("ignores even CF headers outside the Workers deployment (%s)", async hosting => {
  vi.stubEnv("JOBGUARD_HOSTING", hosting);
  await request({ "cf-connecting-ip": "192.0.2.1", "x-forwarded-for": "192.0.2.2" });
  expect(stub.request).toHaveBeenCalledWith(body, "web-bootstrap", "https://jobguard.invalid");
});
it.each([undefined, "", "invented", "192.0.2.1, 192.0.2.2"])("keeps the shared fallback with missing/invalid trusted address %s", async address => {
  vi.stubEnv("JOBGUARD_HOSTING", "cloudflare");
  await request({ ...(address === undefined ? {} : { "cf-connecting-ip": address }), "x-forwarded-for": "192.0.2.99" });
  expect(stub.request).toHaveBeenCalledWith(body, "web-bootstrap", "https://jobguard.invalid");
});
it("ignores spoofed forwarded addresses and canonicalizes IPv6 bucket spelling", async () => {
  vi.stubEnv("JOBGUARD_HOSTING", "cloudflare");
  for (const address of ["2001:0DB8:0:0:0:0:0:1", "2001:db8::1"]) {
    await request({ "cf-connecting-ip": address, "x-forwarded-for": crypto.randomUUID() });
  }
  for (const call of stub.request.mock.calls) expect(call[1]).toBe("2001:db8::1");
});
it("preserves typed rate refusals and no-store responses", async () => {
  stub.request.mockRejectedValueOnce(new Error("RATE_LIMITED"));
  const response = await request();
  expect(response.status).toBe(429);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ code: "RATE_LIMITED" });
});
