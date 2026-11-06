import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PracticeBankApplication } from "../../../../api/src/practice-bank.application.js";
import { FakeTrueLayerAisAdapter, SyntheticAisTokenVault } from "@jobguard/db";
const s = vi.hoisted(() => ({ credentials: {} as Record<string, string>, movements: vi.fn(), start: vi.fn(), stop: vi.fn(), pull: vi.fn() }));
vi.mock("@jobguard/api/workspace", async () => import("../../../../api/src/practice-bank.application.js"));
vi.mock("../../lib/identity-server", () => ({ identityCredentials: async () => s.credentials, identityApplication: () => ({ allowedOrigin: "https://company.invalid" }) }));
vi.mock("../../lib/practice-bank-server", () => ({ practiceBankApplication: () => new PracticeBankApplication({
  allowedOrigin: "https://company.invalid", provider: { digest: () => "a".repeat(64),
    authenticate: async (token: string) => token === "s".repeat(32) ? Object.defineProperty({
      identityUserId: "00000000-0000-4000-8000-000000000001",
      sessionId: "00000000-0000-4000-8000-000000000001", csrfToken: "c".repeat(24),
    }, "sessionCredential", { value: "a".repeat(64) }) : undefined,
    findMembership: async (_p: unknown, id: string) => id === "00000000-0000-4000-8000-000000000001" ? { id, tenantId: id, identityUserId: id, role: "owner", email: "fictional@company.invalid" } : undefined },
} as never, { movements: s.movements, start: s.start, stop: s.stop, pull: s.pull } as never,
{ pending: new Map(), adapter: new FakeTrueLayerAisAdapter(), vault: new SyntheticAisTokenVault(), pages: new Map() }) }));
import { GET, POST } from "./route";
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  s.credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: "00000000-0000-4000-8000-000000000001" };
  s.movements.mockResolvedValue({ version: "ais-practice-view.v1", connection: null, movements: [] });
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });
const url = "https://company.invalid/api/practice-bank";
const post = (origin?: string, body: unknown = { version: "ais-practice-command.v1", operation: "start" }) => POST(new Request(url, { method: "POST", headers: origin ? { origin } : {}, body: JSON.stringify(body) }));
it("session-only no-store read, rejecting foreign origin and tenant", async () => {
  const response = await GET(new Request(url)); expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect((await GET(new Request(url, { headers: { origin: "https://foreign.invalid" } }))).status).toBe(403);
  s.credentials.tenantHeader = "00000000-0000-4000-8000-000000000002";
  expect((await GET(new Request(url))).status).toBe(403);
});
it("POST requires actual trusted browser origin, CSRF and normal session", async () => {
  expect((await post()).status).toBe(403); expect((await post("https://foreign.invalid")).status).toBe(403);
  s.credentials.csrfToken = "x".repeat(24); expect((await post("https://company.invalid")).status).toBe(403);
  delete s.credentials.sessionToken; expect((await GET(new Request(url))).status).toBe(401);
  expect((await post("https://company.invalid")).status).toBe(401); expect(s.start).not.toHaveBeenCalled();
});
it("rejects malformed and extra authority inputs, production and secret errors", async () => {
  expect((await post("https://company.invalid", { version: "ais-practice-command.v1", operation: "start", code: "fake_forged" })).status).toBe(400);
  vi.stubEnv("JOBGUARD_ENV", "production"); expect((await GET(new Request(url))).status).toBe(403);
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); s.movements.mockRejectedValue(new Error("secret provider token code state"));
  const response = await GET(new Request(url)); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("secret");
});

it("origin-less GETs leave a linked connection unchanged when this process has no credentials", async () => {
  s.movements.mockResolvedValue({ version: "ais-practice-view.v1", connection: { connectionId: "00000000-0000-4000-8000-000000000002", status: "linked" },
    movements: [{ movementRef: "fake_cash", status: "settled", pence: 32000, currency: "GBP", bookedOn: "2026-10-02" }] });
  for (let i = 0; i < 2; i++) {
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ connection: { status: "linked" }, credentialsUnavailable: true, movements: [{ movementRef: "fake_cash" }] });
    expect(JSON.stringify(body)).not.toMatch(/token|code|stateHash/u);
  }
  expect(s.stop).not.toHaveBeenCalled(); expect(s.pull).not.toHaveBeenCalled(); expect(s.start).not.toHaveBeenCalled();
});
it("a missing-token pull still requires POST origin, CSRF and session before repository access", async () => {
  const body = { version: "ais-practice-command.v1", operation: "pull", connectionId: "00000000-0000-4000-8000-000000000002" };
  expect((await post(undefined, body)).status).toBe(403);
  expect((await post("https://foreign.invalid", body)).status).toBe(403);
  s.credentials.csrfToken = "x".repeat(24);
  expect((await post("https://company.invalid", body)).status).toBe(403);
  s.credentials.csrfToken = "c".repeat(24); s.credentials.sessionToken = "x".repeat(32);
  expect((await post("https://company.invalid", body)).status).toBe(401);
  expect(s.movements).not.toHaveBeenCalled(); expect(s.stop).not.toHaveBeenCalled(); expect(s.pull).not.toHaveBeenCalled();
});
