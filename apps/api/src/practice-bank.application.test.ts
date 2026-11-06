import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { DarkAisRepository, FakeTrueLayerAisAdapter, SyntheticAisTokenVault } from "@jobguard/db";
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
it("token loss leaves repeated reads linked and read-only, without exchanging a code or pulling", async () => {
  const s = fixture(); const v = await s.app.command(credentials, command("start"));
  const id = v.connection!.connectionId;
  await s.app.command(credentials, command("approve-fake-consent", id));
  const movements = [{ movementRef: "fake_cash", status: "settled" as const, pence: 32000, currency: "GBP" as const, bookedOn: "2026-10-02" }];
  const read = s.repository.movements.getMockImplementation()!;
  s.repository.movements.mockImplementation(async () => ({ ...await read(), movements }) as never);
  for (const method of Object.values(s.repository)) method.mockClear();
  const views = await Promise.all([s.app.read(credentials), s.app.read(credentials)]);
  views.push(await s.app.read(credentials));
  for (const view of views) {
    expect(view).toEqual({ version: "ais-practice-view.v1", connection: { connectionId: id, status: "linked" }, movements, credentialsUnavailable: true });
    expect(JSON.stringify(view)).not.toMatch(/token|code|stateHash/u);
  }
  expect(s.repository.movements).toHaveBeenCalledTimes(3);
  for (const [name, method] of Object.entries(s.repository)) if (name !== "movements") expect(method).not.toHaveBeenCalled();
});
it("reports available credentials and no connection without a reconnect warning", async () => {
  const s = fixture();
  expect(await s.app.read(credentials)).toEqual({ version: "ais-practice-view.v1", connection: null, movements: [], credentialsUnavailable: false });
  const v = await s.app.command(credentials, command("start"));
  await s.app.command(credentials, command("approve-fake-consent", v.connection!.connectionId));
  await s.memory.vault.put(v.connection!.connectionId, "fake_token_private");
  expect(await s.app.read(credentials)).toMatchObject({ connection: { status: "linked" }, credentialsUnavailable: false });
  expect(s.repository.stop).not.toHaveBeenCalled();
});
it("keeps production dark and redacts arbitrary exceptions", async () => {
  const s = fixture(); vi.stubEnv("JOBGUARD_ENV", "production");
  await expect(s.app.read(credentials)).rejects.toThrow("AIS_DARK_ONLY");
  await expect(s.app.command(credentials, command("start"))).rejects.toThrow("AIS_DARK_ONLY");
  expect(s.repository.start).not.toHaveBeenCalled();
  expect(JSON.stringify(practiceBankFailure(new Error("fake_token_private state code bank balance")))).not.toMatch(/private|balance/u);
});

// Scripted SQL exercises the real repository pull path; CI proves PostgreSQL authority.
function linkedFixture(role = "owner") {
  const s = fixture(); let status = "linked";
  const operations: string[] = [];
  const client = { release: vi.fn(), query: vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("ais_movement_read")) return { rows: [{ result: { version: "ais-practice-view.v1", connection: values[0] === tenant ? { connectionId, status } : null, movements: [] } }] };
    if (!sql.includes("app.dark_ais")) return { rows: [] };
    if (values[0] !== tenant || values[2] !== connectionId) throw new Error("AIS_NOT_FOUND");
    if (!["owner", "admin"].includes(role)) throw new Error("AIS_FORBIDDEN");
    const op = values[3] as string; operations.push(op);
    if (op === "token_revoked") status = "token_revoked";
    return { rows: [{ result: { connectionId, stateHash: "a".repeat(64), accountRef: "fake_account", status, changed: op !== "inspect", actor: tenant } }] };
  }) };
  const repository = new DarkAisRepository({ connect: async () => client } as unknown as Pool, s.memory.adapter, s.memory.vault, "synthetic_demo");
  const stop = vi.spyOn(repository, "stop"), exchange = vi.spyOn(s.memory.adapter, "exchange"), pull = vi.spyOn(s.memory.adapter, "pull");
  return { ...s, app: new PracticeBankApplication(s.identity as never, repository, s.memory), client, stop, exchange, pull, operations };
}
it("POST pull records missing credentials once; replays exchange no code and pull no movements", async () => {
  const s = linkedFixture();
  await expect(s.app.command(credentials, command("pull", connectionId))).rejects.toThrow("AIS_TOKEN_REVOKED");
  for (let i = 0; i < 2; i++) await expect(s.app.command(credentials, command("pull", connectionId))).rejects.toThrow("AIS_INACTIVE");
  expect(s.stop).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tenantId: tenant }), "a".repeat(64), connectionId, "token_revoked");
  expect(s.operations.filter(op => op === "token_revoked")).toHaveLength(1);
  expect(s.exchange).not.toHaveBeenCalled(); expect(s.pull).not.toHaveBeenCalled();
});
it("bad session, CSRF, origin or membership cannot turn a pull into a write", async () => {
  for (const change of [{ sessionToken: "x".repeat(32) }, { csrfToken: "x".repeat(24) }, { origin: undefined }, { origin: "https://foreign.invalid" }, { tenantHeader: connectionId }]) {
    const s = linkedFixture();
    await expect(s.app.command({ ...credentials, ...change }, command("pull", connectionId))).rejects.toThrow();
    expect(s.client.query).not.toHaveBeenCalled(); expect(s.stop).not.toHaveBeenCalled();
    expect(s.exchange).not.toHaveBeenCalled(); expect(s.pull).not.toHaveBeenCalled();
  }
});
it("repository authority rejects a wrong role or another connection before token loss can write", async () => {
  for (const [role, id] of [["member", connectionId], ["owner", tenant]] as const) {
    const s = linkedFixture(role);
    await expect(s.app.command(credentials, command("pull", id))).rejects.toThrow();
    expect(s.stop).not.toHaveBeenCalled(); expect(s.exchange).not.toHaveBeenCalled(); expect(s.pull).not.toHaveBeenCalled();
    expect(s.operations).toEqual([]);
  }
});

it("passes another company's verified session to its own empty view and cannot stop this connection", async () => {
  const s = linkedFixture(), other = "00000000-0000-4000-8000-000000000003";
  s.identity.provider.authenticate.mockResolvedValue({ identityUserId: other, sessionId: other, csrfToken: credentials.csrfToken });
  s.identity.provider.findMembership.mockResolvedValue({ id: other, tenantId: other, identityUserId: other, role: "owner", email: "other@company.invalid" });
  const request = { ...credentials, sessionToken: "o".repeat(32), tenantHeader: other };
  expect(await s.app.read(request)).toEqual({ version: "ais-practice-view.v1", connection: null, movements: [], credentialsUnavailable: false });
  await expect(s.app.command(request, command("pull", connectionId))).rejects.toThrow("AIS_NOT_FOUND");
  expect(s.client.query).toHaveBeenCalledWith("SELECT app.ais_movement_read($1,$2,$3) AS result", [other, "a".repeat(64), null]);
  expect(s.stop).not.toHaveBeenCalled(); expect(s.exchange).not.toHaveBeenCalled(); expect(s.pull).not.toHaveBeenCalled();
});
