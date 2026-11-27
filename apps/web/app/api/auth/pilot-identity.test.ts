import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { pilotApprovalFixture } from "../../../../../packages/config/src/policy-gates.pilot-test-fixture.js";
import { pilotSessionCookie } from "../../../../../packages/config/src/pilot-resources.js";
import { POST as requestCode } from "./request/route";
import { POST as verify } from "./verify/route";
import { GET as session } from "./session/route";
import { POST as invite } from "./invitations/route";
import { POST as signout } from "./signout/route";

const state = vi.hoisted(() => ({
  application: vi.fn(), request: vi.fn(), verify: vi.fn(), invite: vi.fn(), session: vi.fn(), signout: vi.fn(),
  connection: vi.fn(), end: vi.fn(), practice: vi.fn(), resources: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/identity-server", async original => ({
  ...await original<typeof import("../../lib/identity-server")>(),
  pilotIdentityApplication: state.application, identityApplication: state.practice,
}));
vi.mock("@jobguard/db", async original => ({
  ...await original<typeof import("@jobguard/db")>(), assertPilotConnection: state.connection,
}));
vi.mock("@jobguard/api/identity", async original => ({
  ...await original<typeof import("@jobguard/api/identity")>(), requirePilotResources: state.resources,
}));

const origin = "https://pilot-auth.invalid", token = "f".repeat(43), csrfToken = "c".repeat(32);
const body = { version: "identity-request.v1", purpose: "signin", email: "builder@fictional.invalid" };
const pool = { end: state.end };
function http(path: string, headers: Record<string, string> = {}, method = "POST", urlOrigin = origin) {
  return new Request(`${urlOrigin}/api/auth/${path}`, {
    method, headers: { origin, ...headers }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  for (const [key, value] of Object.entries(pilotApprovalFixture().env)) vi.stubEnv(key, value);
  vi.stubEnv("JOBGUARD_HOSTING", "");
  state.resources.mockReturnValue({ webOrigin: origin, identity: "fictional-target" });
  state.application.mockReturnValue({
    environment: "pilot_no_charge", provider: { repository: { pool } },
    request: state.request, verify: state.verify, invite: state.invite, session: state.session, signout: state.signout,
  });
  state.request.mockResolvedValue({ accepted: true });
  state.verify.mockResolvedValue({ sessionToken: token, csrfToken });
  state.session.mockResolvedValue({ environment: "pilot_no_charge" });
  state.invite.mockResolvedValue({ id: "fictional-invitation" });
  state.signout.mockResolvedValue({ environment: "pilot_no_charge" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("uses only the host-scoped pilot cookie and never serializes the bearer in JSON", async () => {
  const verified = await verify(http("verify", { cookie: `${pilotSessionCookie}=${token}`, "x-csrf-token": csrfToken }));
  expect(state.verify).toHaveBeenCalledWith(body, origin, expect.objectContaining({ sessionToken: token, csrfToken }));
  expect(verified.headers.get("cache-control")).toBe("no-store");
  expect(await verified.json()).toEqual({ version: "identity-verified.v1", environment: "pilot_no_charge", csrfToken });
  const cookie = verified.headers.get("set-cookie")!;
  for (const value of [`${pilotSessionCookie}=${token}`, "Secure", "HttpOnly", "Path=/", "SameSite=strict", "Max-Age=86400"]) {
    expect(cookie).toContain(value);
  }
  expect(cookie).not.toMatch(/domain=/iu);
  const headers = { cookie: `${pilotSessionCookie}=${token}`, "x-csrf-token": csrfToken };
  await session(http("session", headers, "GET"));
  expect(state.session).toHaveBeenCalledWith(token);
  await invite(http("invitations", { ...headers, "x-tenant-id": "selected-tenant" }));
  expect(state.invite).toHaveBeenCalledWith(body, expect.objectContaining({ sessionToken: token, csrfToken, tenantHeader: "selected-tenant" }));
  const signedOut = await signout(http("signout", headers));
  expect(state.signout).toHaveBeenCalledWith(expect.objectContaining({ sessionToken: token, origin, csrfToken }));
  expect(signedOut.headers.getSetCookie()).toEqual([expect.stringContaining(`${pilotSessionCookie}=;`)]);
  expect(signedOut.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(state.connection).toHaveBeenCalledWith(pool, "fictional-target");
  expect(state.practice).not.toHaveBeenCalled();
});

it("refuses wrong origin, host, practice cookies and closed G1 before opening storage", async () => {
  expect((await verify(http("verify", { origin: "https://untrusted.invalid" }))).status).toBe(403);
  expect((await session(http("session", {}, "GET", "https://untrusted.invalid"))).status).toBe(403);
  expect((await session(http("session", { cookie: `jobguard_session=${token}` }, "GET"))).status).toBe(401);
  expect((await verify(http("verify", { cookie: `jg_session=fake; ${pilotSessionCookie}=${token}` }))).status).toBe(401);
  vi.stubEnv("JOBGUARD_PILOT_21_APPROVAL", undefined);
  const response = await requestCode(http("request"));
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ code: "PILOT_G1_CLOSED" });
  expect(state.application).not.toHaveBeenCalled();
  expect(state.practice).not.toHaveBeenCalled();
});

it("uses only the deployment-selected edge header and closes the Worker connection", async () => {
  const headers = { "cf-connecting-ip": "2001:0DB8:0:0:0:0:0:1", "x-forwarded-for": "192.0.2.3" };
  await requestCode(http("request", headers));
  expect(state.request).toHaveBeenLastCalledWith(body, "web-bootstrap", origin, expect.any(Object));
  vi.stubEnv("JOBGUARD_HOSTING", "cloudflare");
  await requestCode(http("request", headers));
  expect(state.request).toHaveBeenLastCalledWith(body, "2001:db8::1", origin, expect.any(Object));
  await requestCode(http("request", { "x-forwarded-for": "192.0.2.3" }));
  expect(state.request).toHaveBeenLastCalledWith(body, "web-bootstrap", origin, expect.any(Object));
  expect(state.end).toHaveBeenCalledTimes(2);
});
