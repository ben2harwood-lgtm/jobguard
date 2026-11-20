import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const pools = vi.hoisted(() => ({ synthetic: vi.fn(), identity: vi.fn() }));
vi.mock("../../../lib/synthetic-server", () => ({ closeSyntheticPool: pools.synthetic }));
vi.mock("../../../lib/identity-server", () => ({ closeIdentityApplication: pools.identity }));
import { POST } from "./route";

const token = "fictional-drain-token";
const post = (authorization?: string) => POST(new NextRequest("https://practice.invalid/api/test-support/drain", {
  method: "POST",
  headers: authorization === undefined ? {} : { authorization },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.stubEnv("JOBGUARD_E2E_SHUTDOWN_TOKEN", token);
  pools.synthetic.mockResolvedValue(undefined);
  pools.identity.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

async function expectNotFound(authorization?: string) {
  const response = await post(authorization);
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ code: "NOT_FOUND" });
  expect(pools.synthetic).not.toHaveBeenCalled();
  expect(pools.identity).not.toHaveBeenCalled();
}

it.each([undefined, "production", "production_billing", "pilot_no_charge", "provider_sandbox", ""])(
  "refuses the correct token in environment %s without closing pools", async environment => {
    vi.stubEnv("JOBGUARD_ENV", environment);
    await expectNotFound(`Bearer ${token}`);
  },
);

it.each([undefined, `Bearer ${"x".repeat(token.length)}`, `Bearer ${token}x`, `Bearer ${token.slice(1)}`, token])(
  "refuses missing, incorrect or wrong-length authorization %s in synthetic_demo", async authorization => {
    await expectNotFound(authorization);
  },
);

it.each([undefined, ""])("refuses an unconfigured token %s in synthetic_demo", async expected => {
  vi.stubEnv("JOBGUARD_E2E_SHUTDOWN_TOKEN", expected);
  await expectNotFound(`Bearer ${token}`);
});

it("closes both pools and returns an empty 204 for the correct synthetic_demo token", async () => {
  const response = await post(`Bearer ${token}`);
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(pools.synthetic).toHaveBeenCalledExactlyOnceWith();
  expect(pools.identity).toHaveBeenCalledExactlyOnceWith();
});
