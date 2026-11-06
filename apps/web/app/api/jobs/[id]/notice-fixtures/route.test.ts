import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NoticeFixtureApplication } from "../../../../../../api/src/notice-fixture.application.js";
const state = vi.hoisted(() => ({ credentials: {} as Record<string, string>, read: vi.fn(), command: vi.fn(), authenticate: vi.fn(), findMembership: vi.fn() }));
const tenant = "00000000-0000-4000-8000-000000000001", job = "00000000-0000-4000-8000-000000000002";
vi.mock("@jobguard/api/workspace", async () => import("../../../../../../api/src/notice-fixture.application.js"));
vi.mock("../../../../lib/identity-server", () => ({ identityCredentials: async () => state.credentials,
  identityApplication: () => ({ allowedOrigin: "https://company.invalid" }) }));
vi.mock("../../../../lib/notice-fixture-server", () => ({ noticeFixtureApplication: () => new NoticeFixtureApplication({
  allowedOrigin: "https://company.invalid", provider: { authenticate: state.authenticate, findMembership: state.findMembership, digest: () => "a".repeat(64) },
} as never, { read: state.read, command: state.command }) }));
import { GET, POST } from "./route";
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  state.credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: tenant, origin: "https://company.invalid" };
  state.authenticate.mockImplementation(async (token: string) => token === "s".repeat(32) ? Object.defineProperty(
    { identityUserId: tenant, sessionId: tenant, csrfToken: "c".repeat(24) },
    "sessionCredential", { value: "a".repeat(64) }) : undefined);
  state.findMembership.mockImplementation(async (_: unknown, id: string) => id === tenant ? { id: tenant, tenantId: tenant, identityUserId: tenant, role: "owner", email: "owner@fictional.invalid" } : undefined);
  state.read.mockResolvedValue({ preview: null, decisions: [], records: [] }); state.command.mockResolvedValue({ kind: "revision" });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
const request = (origin?: string) => new Request(`https://company.invalid/api/jobs/${job}/notice-fixtures`, { headers: origin ? { origin } : {} });
const params = () => ({ params: Promise.resolve({ id: job }) });
const get = () => GET(request(), params());
const post = (raw: unknown = { jobId: job }) => POST(new Request(request(), { method: "POST", body: JSON.stringify(raw) }), params());
it.each([undefined, "expired-session".padEnd(32, "x"), "practice-session".padEnd(32, "x")])("refuses absent, expired, revoked or practice-only sessions %s", async token => {
  if (token) state.credentials.sessionToken = token; else delete state.credentials.sessionToken;
  expect((await get()).status).toBe(401); expect((await post()).status).toBe(401);
  expect(state.read).not.toHaveBeenCalled(); expect(state.command).not.toHaveBeenCalled();
});
it("requires trusted POST origin, CSRF and verified membership on each operation", async () => {
  for (const [key, value] of [["csrfToken", "x".repeat(24)], ["tenantHeader", job], ["origin", "https://foreign.invalid"]]) {
    const previous = state.credentials[key!]; state.credentials[key!] = value!;
    if (key !== "origin") expect((await get()).status).toBe(403);
    expect((await post()).status).toBe(403); state.credentials[key!] = previous!;
  }
  delete state.credentials.origin; expect((await post()).status).toBe(403);
  expect((await GET(request("https://foreign.invalid"), params())).status).toBe(403);
  expect(state.read).not.toHaveBeenCalled(); expect(state.command).not.toHaveBeenCalled();
});
it("binds job and session, sends no-store on success and refusal, and never changes the body", async () => {
  const read = await get(); expect(read.status).toBe(200); expect(read.headers.get("Cache-Control")).toBe("no-store");
  expect(state.read).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), job, job);
  const raw = { jobId: job, commandId: tenant }; expect((await post(raw)).status).toBe(201);
  expect(state.command).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), { kind: "human", sessionDigest: "a".repeat(64) }, raw);
  const refused = await post({ jobId: tenant }); expect(refused.status).toBe(400); expect(refused.headers.get("Cache-Control")).toBe("no-store");
});
it("hides other environments and unexpected details", async () => {
  vi.stubEnv("JOBGUARD_ENV", "production"); expect((await get()).status).toBe(404); expect((await post()).status).toBe(404);
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); state.read.mockRejectedValue(new Error("private tenant facts"));
  const response = await get(); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("private tenant facts");
});
