import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { FakeTrueLayerAisAdapter, SyntheticAisTokenVault } from "@jobguard/db";
import { PracticeBankApplication, practiceBankFailure } from "./practice-bank.application.js";
const tenant = "00000000-0000-4000-8000-000000000001", connectionId = "00000000-0000-4000-8000-000000000002";
const credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: tenant, origin: "https://company.invalid" };
function fixture() {
  let current: null | { connectionId: string; status: "awaiting_consent" | "linked" | "token_revoked" } = null;
  const repository = { movements: vi.fn(async () => ({ version: "ais-practice-view.v1" as const, connection: current, movements: [] })),
    start: vi.fn(async (_c, _d, input) => { current = { connectionId: input.connectionId, status: "awaiting_consent" }; return { version: "ais-consent.v1" as const, connectionId: input.connectionId, state: connectionId as `${string}-${string}-${string}-${string}-${string}`, environment: "synthetic_demo" as const }; }),
    callback: vi.fn(async () => { current = { connectionId: current!.connectionId, status: "linked" }; return {} as never; }),
    pull: vi.fn(), stop: vi.fn(async (_c, _d, id) => { current = { connectionId: id, status: "token_revoked" }; return {} as never; }) };
  const identity = { allowedOrigin: credentials.origin, provider: { digest: () => "a".repeat(64),
    authenticate: vi.fn(async (token: string) => token === credentials.sessionToken ? Object.defineProperty({ identityUserId: tenant, sessionId: tenant, csrfToken: credentials.csrfToken }, "sessionCredential", { value: "a".repeat(64), enumerable: false }) : undefined),
    findMembership: vi.fn(async (_p, id: string) => id === tenant ? { id: tenant, tenantId: tenant, identityUserId: tenant, role: "owner", email: "fictional@company.invalid" } : undefined) } };
  const memory = { pending: new Map(), adapter: new FakeTrueLayerAisAdapter(), vault: new SyntheticAisTokenVault(), pages: new Map() };
  const app = new PracticeBankApplication(identity as never, repository, memory);
  return { app, repository, memory, identity };
}
const command = (operation: string, id?: string) => ({ version: "ais-practice-command.v1", operation, ...(id ? { connectionId: id } : {}) });
beforeEach(() => vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"));
afterEach(() => vi.unstubAllEnvs());
it("refuses unauthenticated, revoked membership, wrong tenant, CSRF and origin before repository access", async () => {
  for (const change of [{ sessionToken: undefined }, { sessionToken: "x".repeat(32) }, { tenantHeader: connectionId }, { csrfToken: "x".repeat(24) }, { origin: undefined }, { origin: "https://foreign.invalid" }]) {
    const s = fixture();
    await expect(s.app.read({ ...credentials, ...change })).rejects.toThrow();
    await expect(s.app.command({ ...credentials, ...change }, command("start"))).rejects.toThrow();
    expect(s.repository.movements).not.toHaveBeenCalled(); expect(s.repository.start).not.toHaveBeenCalled();
  }
  const s = fixture(); s.identity.provider.findMembership.mockResolvedValue(undefined);
  await expect(s.app.command(credentials, command("start"))).rejects.toThrow();
});
it("keeps consent server-side, passes verified context and digest, and consumes approval once", async () => {
  const s = fixture(); const view = await s.app.command(credentials, command("start")); const id = view.connection!.connectionId;
  expect(JSON.stringify(view)).not.toMatch(/state|code|token|fake_/u);
  await s.app.command(credentials, command("approve-fake-consent", id));
  expect(s.repository.callback).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), "a".repeat(64), id,
    expect.objectContaining({ version: "ais-callback.v1", state: connectionId, code: expect.stringMatching(/^fake_/u) }));
  await expect(s.app.command(credentials, command("approve-fake-consent", id))).rejects.toThrow("AIS_CALLBACK_INVALID");
  expect(s.repository.callback).toHaveBeenCalledTimes(1);
});
it("refuses swapped, session-swapped or restart-lost consent and unknown fields", async () => {
  const s = fixture(); const view = await s.app.command(credentials, command("start"));
  await expect(s.app.command(credentials, command("approve-fake-consent", connectionId))).rejects.toThrow("AIS_CALLBACK_INVALID");
  s.memory.pending.get(view.connection!.connectionId)!.digest = "b".repeat(64);
  await expect(s.app.command(credentials, command("approve-fake-consent", view.connection!.connectionId))).rejects.toThrow("AIS_CALLBACK_INVALID");
  s.memory.pending.clear();
  await expect(s.app.command(credentials, command("approve-fake-consent", view.connection!.connectionId))).rejects.toThrow("AIS_CALLBACK_INVALID");
  for (const extra of [{ state: connectionId }, { code: "fake_forged" }, { tenantId: tenant }, { landed: true }])
    await expect(s.app.command(credentials, { ...command("start"), ...extra })).rejects.toThrow("AIS_INVALID");
  expect(s.repository.callback).not.toHaveBeenCalled();
});
it("token loss records token_revoked, without exchanging a code or pulling", async () => {
  const s = fixture(); const v = await s.app.command(credentials, command("start"));
  await s.app.command(credentials, command("approve-fake-consent", v.connection!.connectionId));
  expect((await s.app.read(credentials)).connection?.status).toBe("token_revoked");
  expect(s.repository.stop).toHaveBeenCalledWith(expect.objectContaining({ tenantId: tenant }), "a".repeat(64), v.connection!.connectionId, "token_revoked");
  expect(s.repository.pull).not.toHaveBeenCalled(); expect(s.repository.callback).toHaveBeenCalledTimes(1);
});
it("keeps production dark and redacts arbitrary exceptions", async () => {
  const s = fixture(); vi.stubEnv("JOBGUARD_ENV", "production");
  await expect(s.app.read(credentials)).rejects.toThrow("AIS_DARK_ONLY");
  await expect(s.app.command(credentials, command("start"))).rejects.toThrow("AIS_DARK_ONLY");
  expect(s.repository.start).not.toHaveBeenCalled();
  expect(JSON.stringify(practiceBankFailure(new Error("fake_token_private state code bank balance")))).not.toMatch(/private|balance/u);
});
