import { randomUUID } from "node:crypto";
import { EnterpriseIdentityRepository, IdentityRepository, SsoRequiredRepository } from "@jobguard/db";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IdentityApplication } from "../identity.application.js";
import { IdentityController } from "../identity.controller.js";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";

const origin = "https://jobguard.invalid";
const address = "owner@fixture.invalid", unknown = "unknown@fixture.invalid";
const tenant = randomUUID(), user = randomUUID(), connection = randomUUID(), invitation = randomUUID();
type Purpose = "signin" | "signup" | "invitation";

function fixture(purpose: Purpose, failure?: { sql: string; error: Error }) {
  const statements: string[] = [];
  const query = vi.fn(async (sql: string) => {
    statements.push(sql);
    if (failure && sql.includes(failure.sql)) throw failure.error;
    if (sql.includes("provision_verified_challenge")) return { rows: [{ user_id: user }] };
    if (sql.includes("sso_code_signin_allowed")) return { rows: [{ allowed: false, connections: [connection] }] };
    if (sql.includes("sso_invitation_accept_allowed")) return { rows: [{ allowed: false, connection_id: connection }] };
    if (sql.includes("sso_invite_member")) return { rows: [{ id: null, connection_id: connection }] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.includes("pg_advisory") || sql.startsWith("UPDATE identity.challenge")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const client = { query, release: vi.fn() };
  const pool = { query, connect: async () => client } as unknown as Pool;
  const repository = new IdentityRepository(pool);
  const provider = new PersistedAuthProvider(repository, "s".repeat(40), undefined, "synthetic_demo", () => 1_000_000);
  const id = randomUUID();
  vi.spyOn(repository, "latest").mockImplementation(async (_client, email) => email === unknown ? undefined : {
    id, email, purpose, invitation_id: purpose === "invitation" ? invitation : null,
    digest: provider.digest(`${id}:12345678`), attempts: 0, consumed_at: null,
    requested_at: new Date(999_000), expires_at: new Date(1_100_000),
  });
  const app = new IdentityApplication(provider, origin);
  return { statements, provider, app };
}

// Exercise the real HTTP mapper/controller without opening a socket. Retain the server error separately.
async function answer(work: () => Promise<unknown>) {
  let error: Error | undefined;
  const result = await work().catch((caught: Error) => { error = caught; });
  expect(result).toBeUndefined();
  expect(error).toBeInstanceOf(Error);
  const controller = new IdentityController(() => ({ verify: async () => { throw error; } }) as unknown as IdentityApplication);
  const cookie = vi.fn();
  const http = await controller.verify({}, { headers: { origin } }, { cookie }).catch(e => e);
  expect(cookie).not.toHaveBeenCalled();
  return { error: error!, public: { status: http.getStatus(), name: error!.name, body: http.getResponse() } };
}

function verification(f: ReturnType<typeof fixture>, purpose: Purpose, email = address) {
  return f.app.verify({ version: "identity-verify.v1", email, purpose, code: "12345678", ...(purpose === "invitation" ? { invitationId: invitation } : {}) }, origin);
}

function noAuthorityCreated(f: ReturnType<typeof fixture>, purpose: Purpose) {
  expect(f.statements.some(sql => /INSERT INTO identity\.(?:session|membership_locator)|INSERT INTO app\.membership|'session\.issued'|UPDATE identity\.invitation/u.test(sql))).toBe(false);
  expect(f.statements).toContain("COMMIT");
  expect(f.statements.filter(sql => sql.startsWith("UPDATE identity.challenge SET consumed_at="))).toHaveLength(1);
  if (purpose === "invitation") {
    expect(f.statements).toContain("UPDATE identity.challenge SET consumed_at=$2 WHERE id=$1");
    expect(f.statements.some(sql => sql.includes("verified=true") || sql.includes("provision_verified_challenge"))).toBe(false);
  } else {
    expect(f.statements).toContain("UPDATE identity.challenge SET consumed_at=$2,verified=true WHERE id=$1");
    expect(f.statements.filter(sql => sql.includes("provision_verified_challenge"))).toHaveLength(1);
  }
}

afterEach(() => vi.restoreAllMocks());
describe("ENT-10d refusal audit failures do not disclose SSO requirements", () => {
  for (const purpose of ["signin", "signup", "invitation"] as const) {
    it.each(["reject", "throw"] as const)(`[S1/S7] ${purpose}: audit %s keeps the unknown-address status, error name and body, with server cause`, async mode => {
      const failure = new Error("Refusal audit unavailable");
      const audit = vi.spyOn(EnterpriseIdentityRepository.prototype, "refusal");
      if (mode === "reject") audit.mockRejectedValue(failure);
      else audit.mockImplementation(() => { throw failure; });
      const f = fixture(purpose);
      const baseline = await answer(() => verification(f, purpose, unknown));
      expect(audit).not.toHaveBeenCalled();
      const refused = await answer(() => verification(f, purpose));
      expect(refused.public).toEqual(baseline.public);
      expect(refused.public).toEqual({ status: 400, name: "AuthError", body: { code: "INVALID_CODE" } });
      expect(refused.error.cause).toBe(failure);
      expect(audit).toHaveBeenCalledExactlyOnceWith(connection, purpose === "invitation" ? "SSO_REQUIRED_INVITE_CLOSED" : "SSO_REQUIRED_CODE_SIGNIN");
      noAuthorityCreated(f, purpose);
    });
    it(`[S1/S7] ${purpose}: working refusal audit is written exactly once`, async () => {
      const audit = vi.spyOn(EnterpriseIdentityRepository.prototype, "refusal").mockResolvedValue(undefined);
      const f = fixture(purpose), refused = await answer(() => verification(f, purpose));
      expect(refused.public).toEqual({ status: 400, name: "AuthError", body: { code: "INVALID_CODE" } });
      expect(refused.error.cause).toBeUndefined();
      expect(audit).toHaveBeenCalledExactlyOnceWith(connection, purpose === "invitation" ? "SSO_REQUIRED_INVITE_CLOSED" : "SSO_REQUIRED_CODE_SIGNIN");
      noAuthorityCreated(f, purpose);
    });
  }
  it("[S7] invitation creation retains TENANT_FORBIDDEN and server cause when its refusal audit fails", async () => {
    const failure = new Error("Invitation refusal audit unavailable");
    const audit = vi.spyOn(EnterpriseIdentityRepository.prototype, "refusal").mockRejectedValue(failure);
    const f = fixture("invitation");
    // The signed-in bound administrator passed the context boundary before SQL closes invitations.
    vi.spyOn(f.app, "context").mockResolvedValue({} as Awaited<ReturnType<IdentityApplication["context"]>>);
    const error = await f.app.invite({ version: "identity-invitation.v1", requested_tenant_id: tenant, email: address, role: "finance" }, { sessionToken: randomUUID(), origin }).catch(e => e);
    const controller = new IdentityController(() => ({ invite: async () => { throw error; } }) as unknown as IdentityApplication);
    const http = await controller.invite({}, { headers: { origin } }).catch(e => e);
    expect(http.getStatus()).toBe(403);
    expect(http.getResponse()).toEqual({ code: "TENANT_FORBIDDEN" });
    expect(error).toMatchObject({ name: "AuthError", code: "TENANT_FORBIDDEN", cause: failure });
    expect(audit).toHaveBeenCalledExactlyOnceWith(connection, "SSO_REQUIRED_INVITE_CLOSED");
    expect(f.statements).toEqual(["SELECT * FROM identity.sso_invite_member($1,$2,$3,$4)"]);
  });
  it.each([
    ["signin", "SET consumed_at="], ["invitation", "SET consumed_at="],
    ["signin", "sso_code_signin_allowed"], ["invitation", "sso_invitation_accept_allowed"],
    ["signin", "provision_verified_challenge"], ["signin", "COMMIT"],
  ] as const)("[S1/S7] %s failure in %s still escapes; only refusal-audit failures are caught", async (purpose, sql) => {
    const failure = new Error("Other database statement unavailable");
    const audit = vi.spyOn(EnterpriseIdentityRepository.prototype, "refusal").mockResolvedValue(undefined);
    const f = fixture(purpose, { sql, error: failure });
    await expect(verification(f, purpose)).rejects.toBe(failure);
    expect(f.statements).toContain("ROLLBACK");
    expect(audit).not.toHaveBeenCalled();
  });
  it("[S10] emergency SQL parameters omit mailbox address and code", async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes("sso_emergency_use") ? [{ result: { used: false, cause: "EMERGENCY_APPROVER_RULE_UNSET" } }] : [] }));
    const repository = new SsoRequiredRepository({ connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool);
    const input = { version: "sso-emergency.v1", requested_tenant_id: tenant, email: address, code: "12345678", reason: "Synthetic emergency parameter test reason" };
    await repository.emergency(user, input);
    const parameters = query.mock.calls.find(([sql]) => sql.includes("sso_emergency_use")) as unknown as [string, unknown[]];
    expect(parameters[1][0]).toBe(user);
    expect(JSON.parse(parameters[1][1] as string)).toEqual({ version: input.version, requested_tenant_id: tenant, reason: input.reason });
    expect(JSON.stringify(parameters[1])).not.toContain(input.email);
    expect(JSON.stringify(parameters[1])).not.toContain(input.code);
  });
});
