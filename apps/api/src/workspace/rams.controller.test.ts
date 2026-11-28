import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
const { read, command, identitySession, authenticate, findMembership, query } = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), identitySession: vi.fn(), authenticate: vi.fn(), findMembership: vi.fn(), query: vi.fn() }));
vi.mock("./rams.application.js", () => ({ RamsApplication: class { read = read; command = command; },
  RamsError: class extends Error { constructor(readonly code: string) { super(code); } } }));
vi.mock("@jobguard/db", () => ({ WorkPlanError: class extends Error { constructor(readonly code: string) { super(code); } }, verifiedTenantContextFromMembership: (m: {tenantId: string}) => ({tenantId: m.tenantId}) }));
vi.mock("../practice-access.js", () => ({ practiceCookie: () => "fictional-session" }));
vi.mock("../auth/index.js", async () => ({ ...await import("../auth/principal-bridge.js"), ...await import("../auth/auth-provider.js"),
  IDENTITY_APPLICATION: "IDENTITY_APPLICATION", cookieToken: (request: {headers: {cookie?: string}}) => request.headers.cookie?.split("; ").find(part => part.startsWith("jobguard_session="))?.slice("jobguard_session=".length),
}));
import type { IdentityApplication } from "../auth/index.js";
import { RamsController } from "./rams.controller.js";
import { RamsError } from "./rams.application.js";
const csrfToken = "c".repeat(32);
const membership = { id: "11111111-1111-4111-8111-111111111112", tenantId: "11111111-1111-4111-8111-111111111111", identityUserId: "11111111-1111-4111-8111-111111111113", role: "owner" };
const request = { headers: { cookie: `jobguard_session=${"s".repeat(32)}; jg_session=fictional-session`, origin: "https://fictional.invalid", "x-csrf-token": csrfToken } };
let controller: RamsController;
beforeEach(() => {
  vi.clearAllMocks(); controller = new RamsController({ query } as unknown as Pool, () => ({ allowedOrigin: process.env.AUTH_ALLOWED_ORIGIN,
    session: identitySession, provider: { authenticate, findMembership },
  }) as unknown as IdentityApplication);
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.stubEnv("AUTH_ALLOWED_ORIGIN", request.headers.origin);
  identitySession.mockResolvedValue({ memberships: [membership] });
  authenticate.mockResolvedValue({ csrfToken, sessionCredential: "a".repeat(64) });
  findMembership.mockResolvedValue(membership);
  query.mockResolvedValue({ rows: [{ linked: false }] });
});
afterEach(() => vi.unstubAllEnvs());
describe("Q06 standalone RAMS adapter uses the shared application", () => {
  it("returns persisted reads and passes the exact command", async () => {
    read.mockResolvedValue({ version: "rams-screen.v1", drafts: [] }); command.mockResolvedValue({ revision: 1 });
    expect(await controller.read(request, "job")).toEqual({ version: "rams-screen.v1", drafts: [] });
    expect(await controller.command(request, "job", { action: "generate" })).toEqual({ revision: 1 });
    expect(command).toHaveBeenCalledWith("job", { action: "generate" });
  });
  it("refuses a foreign or missing write origin", async () => {
    for (const headers of [{ origin: "https://other.invalid" }, {}]) {
      await expect(controller.command({ headers }, "job", {})).rejects.toMatchObject({ status: 403 });
    }
    expect(command).not.toHaveBeenCalled();
  });
  it("refuses forged forwarded headers and absent origin configuration", async () => {
    await expect(controller.command({ headers: { ...request.headers, origin: "https://foreign.invalid", "x-forwarded-host": "fictional.invalid", "x-forwarded-proto": "https" } }, "job", {})).rejects.toMatchObject({ status: 403 });
    vi.stubEnv("AUTH_ALLOWED_ORIGIN", undefined);
    await expect(controller.command(request, "job", {})).rejects.toMatchObject({ status: 403 });
    expect(command).not.toHaveBeenCalled();
  });
  it("requires the current identity session CSRF token", async () => {
    for (const token of [undefined, "wrong".repeat(8)]) {
      await expect(controller.command({ headers: { ...request.headers, "x-csrf-token": token } }, "job", {})).rejects.toMatchObject({ status: 403 });
    }
    expect(command).not.toHaveBeenCalled();
  });
  it("refuses flag-off and non-synthetic reads before touching the application", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
    await expect(controller.read(request, "job")).rejects.toMatchObject({ status: 404 });
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "production_billing");
    await expect(controller.read(request, "job")).rejects.toMatchObject({ status: 404 });
    expect(read).not.toHaveBeenCalled();
  });
  it("maps the shared stale-revision refusal to HTTP 409", async () => {
    command.mockRejectedValue(new RamsError("RAMS_VERSION_CONFLICT"));
    await expect(controller.command(request, "job", {})).rejects.toMatchObject({ status: 409 });
  });
  it("refuses a linked practice session, whose browser pairing only the web route can check", async () => {
    query.mockResolvedValue({ rows: [{ linked: true }] });
    await expect(controller.read(request, "job")).rejects.toMatchObject({ status: 403 });
    await expect(controller.command(request, "job", { action: "generate" })).rejects.toMatchObject({ status: 403 });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("app.is_linked_practice_session"),
      [expect.stringMatching(/^[a-f0-9]{64}$/u)]);
    query.mockResolvedValue({ rows: [] });
    await expect(controller.read(request, "job")).rejects.toMatchObject({ status: 403 });
    expect(read).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled();
  });
});
