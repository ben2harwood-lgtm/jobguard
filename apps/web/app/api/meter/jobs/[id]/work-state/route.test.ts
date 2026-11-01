import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MeterWorkStateApplication } from "../../../../../../../api/src/meter-today.application.js";

const state = vi.hoisted(() => ({ command: vi.fn(), authenticate: vi.fn(), findMembership: vi.fn() }));
const tenant = "00000000-0000-4000-8000-000000000001";
const origin = "https://company.invalid";
vi.mock("@jobguard/api/workspace", async () => ({
  ...await import("../../../../../../../api/src/meter-today.application.js"),
  jobWorkStateFailure: () => null,
}));
vi.mock("../../../../../lib/identity-server", () => ({
  identityCredentials: async (request: Request) => ({
    sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: tenant,
    origin: request.headers.get("origin") ?? undefined,
  }),
  identityApplication: () => ({ allowedOrigin: origin }),
}));
vi.mock("../../../../../lib/meter-server", () => ({
  meterWorkApplication: () => new MeterWorkStateApplication({
    allowedOrigin: origin, provider: { authenticate: state.authenticate, findMembership: state.findMembership },
  } as never, { command: state.command }),
}));
import { POST } from "./route";

const params = { params: Promise.resolve({ id: tenant }) };
const body = { version: "job-work-state-command.v1", commandId: tenant, expectedRevision: 0, action: "finish" };
const request = (value?: string) => new Request(`${origin}/api/meter/jobs/${tenant}/work-state`, {
  method: "POST", headers: value === undefined ? {} : { origin: value }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  state.authenticate.mockResolvedValue({ identityUserId: tenant, sessionId: tenant, csrfToken: "c".repeat(24) });
  state.findMembership.mockResolvedValue({ id: tenant, identityUserId: tenant, tenantId: tenant, role: "owner" });
  state.command.mockResolvedValue({ saved: true });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

it.each([undefined, "https://foreign.invalid", "null"])("refuses Origin %s before authentication or a work-state write", async value => {
  const response = await POST(request(value), params);
  expect(response.status).toBe(403);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ version: "meter-today-error.v1", code: "ORIGIN_FORBIDDEN" });
  expect(state.authenticate).not.toHaveBeenCalled();
  expect(state.command).not.toHaveBeenCalled();
});

it("accepts a matching Origin and forwards the verified command", async () => {
  const response = await POST(request(origin), params);
  expect(response.status).toBe(201);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ saved: true });
  expect(state.command).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), tenant, tenant, body);
});
