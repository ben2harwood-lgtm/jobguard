import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { DunningApplication } from "../../../../../../api/src/dunning.application.js";
const state = vi.hoisted(() => ({ credentials: {} as Record<string, string>, read: vi.fn(), command: vi.fn(), authenticate: vi.fn(), findMembership: vi.fn() }));
const tenant = "00000000-0000-4000-8000-000000000001";
const job = "00000000-0000-4000-8000-000000000002";
vi.mock("@jobguard/api/workspace", async () => import("../../../../../../api/src/dunning.application.js"));
vi.mock("../../../../lib/identity-server", () => ({ identityCredentials: async () => state.credentials,
  identityApplication: () => ({ allowedOrigin: "https://company.invalid" }) }));
vi.mock("../../../../lib/dunning-server", () => ({ dunningApplication: () => new DunningApplication({
  allowedOrigin: "https://company.invalid", provider: { authenticate: state.authenticate, findMembership: state.findMembership, digest: () => "a".repeat(64) },
} as never, { read: state.read, command: state.command }) }));
import { GET } from "./route";
import { POST } from "./[operation]/route";
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  state.credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: tenant, origin: "https://company.invalid" };
  state.authenticate.mockImplementation(async (token: string) => token === "s".repeat(32) ? { identityUserId: tenant, sessionId: tenant, sessionCredential: "a".repeat(64), csrfToken: "c".repeat(24) } : undefined);
  state.findMembership.mockImplementation(async (_: unknown, id: string) => id === tenant ? { id: tenant, tenantId: tenant, identityUserId: tenant, role: "owner", email: "owner@fictional.invalid" } : undefined);
  state.read.mockResolvedValue({ invoices: [], skippedCount: 0, skipped: [] });
  state.command.mockResolvedValue({ executable: false, status: "pending" });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
const request = () => new Request("https://company.invalid/api/jobs/" + job + "/dunning");
const get = () => GET(request(), { params: Promise.resolve({ id: job }) });
const post = (operation = "request") => POST(new Request(request(), { method: "POST", body: "{}" }), { params: Promise.resolve({ id: job, operation }) });
it.each([undefined, "expired-session".padEnd(32, "x"), "practice-session".padEnd(32, "x")])("refuses missing, expired and practice sessions %s", async token => {
  if (token) state.credentials.sessionToken = token; else delete state.credentials.sessionToken;
  expect((await get()).status).toBe(401); expect((await post()).status).toBe(401);
  expect(state.read).not.toHaveBeenCalled(); expect(state.command).not.toHaveBeenCalled();
});
it("refuses wrong CSRF, tenant and origin for reads and approvals", async () => {
  for (const [key, value] of [["csrfToken", "x".repeat(24)], ["tenantHeader", job], ["origin", "https://foreign.invalid"]]) {
    const previous = state.credentials[key!]; state.credentials[key!] = value!;
    // GET derives its origin from the actual request header; POST requires supplied Origin.
    if (key !== "origin") expect((await get()).status).toBe(403);
    expect((await post("approve")).status).toBe(403);
    state.credentials[key!] = previous!;
  }
  expect(state.command).not.toHaveBeenCalled(); expect(state.read).not.toHaveBeenCalled();
  expect((await GET(new Request(request(), { headers: { origin: "https://foreign.invalid" } }), { params: Promise.resolve({ id: job }) })).status).toBe(403);
});
it("uses verified context and session digest, never caches, and rechecks membership", async () => {
  const response = await get(); expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(state.read).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), "a".repeat(64), expect.objectContaining({ jobId: job }));
  expect((await post()).status).toBe(201);
  state.findMembership.mockResolvedValue(undefined);
  expect((await post("approve")).status).toBe(403); expect(state.command).toHaveBeenCalledTimes(1);
});
it("rejects sending, production and unexpected errors without disclosing data", async () => {
  expect((await post("send")).status).toBe(400); expect(state.command).not.toHaveBeenCalled();
  vi.stubEnv("JOBGUARD_ENV", "production"); expect((await get()).status).toBe(403); expect((await post()).status).toBe(403);
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); state.read.mockRejectedValue(new Error("private invoice"));
  const response = await get(); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ version: "dunning-error.v1", code: "DUNNING_UNAVAILABLE" });
});
