import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AuthError } from "@jobguard/api/identity";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ cookies: vi.fn(), session: vi.fn(), authenticate: vi.fn(),
  findMembership: vi.fn(), execute: vi.fn(), workspace: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("../../../../lib/identity-server", async importOriginal => ({
  ...await importOriginal<typeof import("../../../../lib/identity-server")>(),
  identityApplication: () => ({ allowedOrigin: process.env.AUTH_ALLOWED_ORIGIN,
    session: mocks.session, provider: { authenticate: mocks.authenticate, findMembership: mocks.findMembership } }),
}));
vi.mock("../../../../lib/workspace-server", () => ({ workspaceApplication: mocks.workspace }));
import { POST } from "./route";

const id = "10000000-0000-4000-8000-000000000001";
const origin = "https://phone.jobguard-v2.invalid";
const token = "s".repeat(32), csrf = "c".repeat(24);
const command = { version: "v2-stock-command.v1", action: "record_receipt",
  commandId: "10000000-0000-4000-8000-000000000002", deliveryId: id, expectedVersion: 1, packsReceived: "3" };
const post = (headers: Record<string, string> = {}, url = `http://127.0.0.1:3000/api/jobs/${id}/stock`) =>
  POST(new Request(url, { method: "POST", headers: { "x-csrf-token": csrf, ...headers },
    body: JSON.stringify(command) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("AUTH_ALLOWED_ORIGIN", origin);
  mocks.cookies.mockResolvedValue({ get: (name: string) => name === "jobguard_session" ? { value: token } : undefined });
  mocks.session.mockResolvedValue({ memberships: [{ id, tenantId: id, role: "owner" }], csrfToken: csrf });
  mocks.authenticate.mockResolvedValue(Object.defineProperty({ identityUserId: id, sessionId: id, csrfToken: csrf },
    "sessionCredential", { value: "a".repeat(64) }));
  mocks.findMembership.mockResolvedValue({ id, identityUserId: id, tenantId: id, role: "owner" });
  mocks.workspace.mockResolvedValue({ stock: { execute: mocks.execute } });
  mocks.execute.mockResolvedValue({ deliveryId: id, packsReceived: "3" });
});
afterEach(() => vi.unstubAllEnvs());

it("accepts the configured browser origin through an internal HTTP request URL", async () => {
  const response = await post({ origin });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.authenticate).toHaveBeenCalledWith(token);
  expect(mocks.findMembership).toHaveBeenCalledWith(expect.anything(), id);
  expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(id, command);
});

it("refuses foreign and missing origins before executing stock commands", async () => {
  for (const headers of [{ origin: "https://foreign.invalid" }, {}]) {
    expect((await post(headers)).status).toBe(403);
  }
  expect(mocks.workspace).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("does not trust forged forwarded host or protocol headers", async () => {
  for (const headers of [{ origin: "https://foreign.invalid" }, {}]) {
    expect((await post({ ...headers, "x-forwarded-host": "phone.jobguard-v2.invalid",
      "x-forwarded-proto": "https" })).status).toBe(403);
  }
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("refuses missing AUTH_ALLOWED_ORIGIN even when Origin matches the request URL", async () => {
  vi.stubEnv("AUTH_ALLOWED_ORIGIN", undefined);
  expect((await post({ origin: "http://127.0.0.1:3000" })).status).toBe(403);
  expect(mocks.workspace).not.toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("refuses missing or incorrect CSRF tokens", async () => {
  for (const csrfToken of ["", "x".repeat(24)]) {
    expect((await post({ origin, "x-csrf-token": csrfToken })).status).toBe(403);
  }
  expect(mocks.execute).not.toHaveBeenCalled();
});

it("refuses a signed-out identity before opening the stock application", async () => {
  mocks.session.mockRejectedValue(new AuthError("UNAUTHENTICATED"));
  expect((await post({ origin })).status).toBe(401);
  expect(mocks.workspace).not.toHaveBeenCalled();
});

it("refuses ambiguous or revoked tenant membership", async () => {
  for (const memberships of [[], [{ tenantId: id }, { tenantId: id }]]) {
    mocks.session.mockResolvedValue({ memberships });
    expect((await post({ origin })).status).toBe(403);
  }
  mocks.session.mockResolvedValue({ memberships: [{ tenantId: id }] });
  mocks.findMembership.mockResolvedValue(undefined);
  expect((await post({ origin })).status).toBe(403);
  expect(mocks.workspace).not.toHaveBeenCalled();
});
