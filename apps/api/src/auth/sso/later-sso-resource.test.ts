import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnterpriseIdentityRepository, IdentityRepository } from "@jobguard/db";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { SsoApplication } from "./sso.application.js";
import { syntheticSsoMetadata } from "./sso.contracts.js";
import { SamlAdapter } from "./saml.js";

const origin = "https://jobguard.invalid";
// Only adapter behavior is replaced: these tests perform no signature validation or provider calls.
function fixture() {
  const tenantId = randomUUID(), connectionId = randomUUID(), userId = randomUUID(), sessionId = randomUUID(), membershipId = randomUUID();
  const sessionToken = randomUUID(), csrfToken = randomUUID();
  const metadata = syntheticSsoMetadata(connectionId, tenantId, "x".repeat(120), origin);
  let active = 0, peak = 0, revoked = false, membershipRevoked = false, scope: Record<string, unknown> | null = null;
  let beforeWrite: (() => void) | undefined;
  let dbTime = Date.parse("2026-10-16T12:00:00Z");
  const transactionQueries: string[] = [];
  const session = () => ({ id: sessionId, user_id: userId, csrf_token: csrfToken });
  const membership = () => ({ id: membershipId, tenant_id: tenantId, identity_user_id: userId, role: "owner", email: "owner@fixture.invalid", name: "Fictional contractor" });
  // A bounded fake pool refuses nested acquisition at capacity, turning the old deadlock into a deterministic failure.
  const acquire = () => {
    if (active === 4) throw new Error("four-client pool exhausted");
    active++; peak = Math.max(peak, active);
  };
  const execute = async (sql: string, parameters: unknown[] = [], inTransaction = false) => {
    await Promise.resolve();
    if (inTransaction) transactionQueries.push(sql);
    if (sql.includes("sso_load_connection")) return { rows: [{ metadata }] };
    if (sql.includes("sso_session_scope")) return { rows: [{ scope }] };
    if (sql.includes("sso_session_memberships")) return { rows: revoked || membershipRevoked ? [] : [membership()] };
    if (sql.includes("FROM identity.session")) return { rows: revoked ? [] : [session()] };
    if (sql.includes("expires_at") && sql.includes("clock_timestamp")) return { rows: [{ expires_at: new Date(dbTime + Number(parameters[0]) * 1000) }] };
    return { rows: [] };
  };
  const pool = {
    query: async (sql: string, parameters?: unknown[]) => {
      acquire();
      try { return await execute(sql, parameters); } finally { active--; }
    },
    connect: async () => {
      beforeWrite?.();
      acquire();
      return { query: (sql: string, parameters?: unknown[]) => execute(sql, parameters, true), release: () => { active--; } };
    },
  } as unknown as Pool;
  const repository = new EnterpriseIdentityRepository(pool), base = new PersistedAuthProvider(new IdentityRepository(pool), "s".repeat(40));
  const audit = vi.spyOn(repository, "audit").mockResolvedValue(undefined);
  const refusal = vi.spyOn(repository, "refusal").mockResolvedValue(undefined);
  const saved: Array<{ linkSessionId: string | null }> = [];
  vi.spyOn(repository, "cache").mockImplementation((_client, _connection, _state, linkSessionId = null) => ({
    saveAsync: async (_key, value) => { saved.push({ linkSessionId }); return { value, createdAt: dbTime }; },
    getAsync: async () => null, removeAsync: async () => null,
  }));
  vi.spyOn(SamlAdapter.prototype, "start").mockImplementation(async function (this: SamlAdapter) {
    // Exercise the actual tracking-cache wrapper passed to the adapter constructor.
    const adapter = this as unknown as { saml: { options: { cacheProvider: { saveAsync(key: string, value: string): Promise<unknown> } } } };
    await adapter.saml.options.cacheProvider.saveAsync(randomUUID(), "synthetic-request");
    return `${origin}/synthetic-request`;
  });
  vi.spyOn(SamlAdapter.prototype, "validate").mockResolvedValue({ assertionId: randomUUID(), requestId: randomUUID(), subject: "fictional-owner", email: "owner@fixture.invalid", groups: ["admin"] });
  const complete = vi.spyOn(repository, "complete").mockResolvedValue({ tenantId, userId, membershipId });
  const app = new SsoApplication(base, repository, origin);
  return { app, repository, metadata, sessionId, userId, membershipId, tenantId, connectionId, complete, audit, refusal, saved, transactionQueries,
    credentials: { sessionToken, csrfToken, origin, tenantHeader: tenantId },
    peak: () => peak, active: () => active, dbTime: () => dbTime,
    changeBeforeWrite: (kind: string) => { beforeWrite = () => {
      if (kind === "session") revoked = true;
      if (kind === "membership") membershipRevoked = true;
      if (kind === "bound tenant") scope = { tenantId: randomUUID(), membershipId };
      if (kind === "bound membership") scope = { tenantId, membershipId: randomUUID() };
      if (kind === "revoked binding") scope = { revoked: true };
      if (kind === "connection") metadata.tenantId = randomUUID();
    }; },
  };
}
afterEach(() => vi.restoreAllMocks());

describe("LATER-B28 SSO application resource boundary", () => {
  it("FL52 36 hyphens preserves INVALID_SSO_INPUT through the actual refusal repository", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const connect = vi.fn(async () => { throw new Error("invalid UUID input"); });
    const repo = new EnterpriseIdentityRepository({ query, connect } as unknown as Pool);
    const app = new SsoApplication(new PersistedAuthProvider(new IdentityRepository(repo.pool), "s".repeat(40)), repo, origin);
    await expect(app.start("-".repeat(36), {}, {})).rejects.toMatchObject({ code: "INVALID_SSO_INPUT" });
    expect(query).toHaveBeenCalledOnce(); expect(connect).not.toHaveBeenCalled();
  });
  it.each([[-3_600_000, 60], [3_600_000, 60], [-3_600_000, 900], [3_600_000, 900]])("FL63 expiry uses database clock and remains within the existing lifetime: skew %i, limit %i", async (skew, limit) => {
    const f = fixture();
    vi.spyOn(Date, "now").mockReturnValue(f.dbTime() + skew);
    f.metadata.sessionLimitSeconds = limit!;
    const relayState = "s".repeat(43);
    await expect(f.app.callback(f.connectionId, { version: "sso-callback.v1", SAMLResponse: "YQ==", relayState }, relayState)).resolves.toMatchObject({ tenantId: f.tenantId });
    const expiry = f.complete.mock.calls[0]![3].expiresAt;
    expect(expiry.getTime()).toBe(f.dbTime() + limit! * 1000);
    expect(f.transactionQueries.some(sql => sql.includes("clock_timestamp"))).toBe(true);
  });
  it("FL64 four concurrent link starts do not exhaust the four-client pool", async () => {
    const f = fixture();
    const results = await Promise.all(Array.from({ length: 4 }, () => f.app.start(f.connectionId, { version: "sso-start.v1", action: "signin", linkExisting: true }, f.credentials)));
    expect(results).toHaveLength(4); expect(f.saved).toHaveLength(4);
    expect(f.saved.every(item => item.linkSessionId === f.sessionId)).toBe(true);
    expect(f.peak()).toBeLessThanOrEqual(4); expect(f.active()).toBe(0);
  });
  it.each(["session", "membership", "bound tenant", "bound membership", "revoked binding", "connection"])("FL64 revocation during the authentication/write gap refuses before caching or audit: %s", async kind => {
    const f = fixture();
    vi.spyOn(f.app.provider, "authenticate").mockImplementation(async () => {
      f.changeBeforeWrite(kind);
      return { sessionId: f.sessionId, identityUserId: f.userId, csrfToken: f.credentials.csrfToken };
    });
    await expect(f.app.start(f.connectionId, { version: "sso-start.v1", action: "signin", linkExisting: true }, f.credentials)).rejects.toHaveProperty("code", "LINK_FORBIDDEN");
    expect(f.saved).toHaveLength(0); expect(f.audit).not.toHaveBeenCalled(); expect(f.active()).toBe(0);
  });
  it("FL64 linking retains origin and CSRF checks", async () => {
    for (const overrides of [{ origin: "https://elsewhere.invalid" }, { csrfToken: randomUUID() }, { sessionToken: undefined }]) {
      const f = fixture();
      await expect(f.app.start(f.connectionId, { version: "sso-start.v1", action: "signin", linkExisting: true }, { ...f.credentials, ...overrides })).rejects.toHaveProperty("code");
      expect(f.saved).toHaveLength(0);
    }
  });
  it("FL64 ordinary sign-in still works without link credentials", async () => {
    const f = fixture();
    await f.app.start(f.connectionId, { version: "sso-start.v1", action: "signin" }, { origin });
    expect(f.saved).toEqual([{ linkSessionId: null }]);
  });
});
