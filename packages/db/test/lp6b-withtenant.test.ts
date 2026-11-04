import { RequestBindingRefusedError } from "../src/request-binding-error.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { InvalidTenantContextError, verifiedTenantContextFromMembership, verifiedTenantContextForQueuedJob, withTenant, type AuthenticatedMembership } from "../src/tenant-context.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
import { resolveVerifiedTenantContext } from "../../../apps/api/src/auth/principal-bridge.js";
import type { AuthProvider } from "../../../apps/api/src/auth/auth-provider.js";

const member = () => ({ tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() }) as AuthenticatedMembership;
const credential = "a".repeat(64);
function connection(m = member()) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => ({ rows: sql.includes("current_actor()") ? [{ actor: m.membershipId, tenant: m.tenantId }] : [] }));
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { pool: { connect } as unknown as Pool, query, release, connect };
}
afterEach(() => vi.unstubAllEnvs());

it("binds credentials before business work and keeps the immutable reference out of serialization", async () => {
  const m = member(), c = connection(m), reference = { kind: "real" as const, credential };
  const context = verifiedTenantContextFromMembership(m, reference);
  reference.credential = "b".repeat(64);
  expect(JSON.stringify(context)).toBe(JSON.stringify({ tenantId: m.tenantId }));
  await withTenant(c.pool, context, async () => { expect(c.query.mock.calls.map(call => call[0])).toEqual([
    "BEGIN", "SELECT app.bind_request($1, $2, $3)", "SELECT app.current_actor() actor, app.current_tenant() tenant", "SELECT set_config('app.tenant_id', $1, true)",
  ]); });
  expect(c.query.mock.calls[1]?.[1]).toEqual(["real", credential, m.tenantId]);
  expect(c.query.mock.calls.at(-1)?.[0]).toBe("COMMIT"); expect(c.release).toHaveBeenCalledOnce();
});

it.each([undefined, null, {}, Object.freeze({ tenantId: randomUUID() })])("rejects forged/missing context before pool access: %s", async value => {
  const c = connection();
  await expect(Reflect.apply(withTenant, undefined, [c.pool, value, vi.fn()])).rejects.toBeInstanceOf(InvalidTenantContextError);
  expect(c.connect).not.toHaveBeenCalled();
});

it.each([{ kind: "real", credential: "" }, { kind: "other", credential }, null, { kind: "practice", credential: randomUUID() }])("rejects malformed session references without downgrading: %s", reference => {
  expect(() => Reflect.apply(verifiedTenantContextFromMembership, undefined, [member(), reference])).toThrow(InvalidTenantContextError);
});

it("rolls back and skips business work when revocation is discovered at bind", async () => {
  const m = member(), c = connection(m), work = vi.fn(), error = new Error("REQUEST_BINDING_REFUSED");
  c.query.mockImplementation(async sql => { if (sql.includes("bind_request")) throw error; return { rows: [] }; });
  await expect(withTenant(c.pool, verifiedTenantContextFromMembership(m, { kind: "real", credential }), work)).rejects.toBe(error);
  expect(work).not.toHaveBeenCalled(); expect(c.query.mock.calls.map(call => call[0])).toEqual(["BEGIN", "SELECT app.bind_request($1, $2, $3)", "ROLLBACK"]);
  expect(c.release).toHaveBeenCalledOnce();
});

it.each(["actor", "tenant"])("refuses a mismatched database-derived %s before callback", async key => {
  const m = member(), c = connection(m), work = vi.fn();
  c.query.mockImplementation(async sql => ({ rows: sql.includes("current_actor()") ? [{ actor: m.membershipId, tenant: m.tenantId, [key]: randomUUID() }] : [] }));
  await expect(withTenant(c.pool, verifiedTenantContextFromMembership(m, { kind: "real", credential }), work)).rejects.toBeInstanceOf(RequestBindingRefusedError);
  expect(work).not.toHaveBeenCalled(); expect(c.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});

it("retains explicitly dark membership and queued-worker compatibility without inventing a credential", async () => {
  const m = member(), c = connection(m);
  for (const context of [verifiedTenantContextFromMembership(m), verifiedTenantContextForQueuedJob(m.tenantId)]) {
    await withTenant(c.pool, context, async () => undefined);
  }
  expect(c.query.mock.calls.some(call => call[0].includes("bind_request"))).toBe(false);
});

it("carries only the authenticated principal credential and verified membership through the real bridge", async () => {
  const m = member(), c = connection(m), principal = { identityUserId: m.identityUserId, sessionId: randomUUID(), csrfToken: "c".repeat(24), sessionCredential: credential };
  const provider = { authenticate: vi.fn(async () => principal), findMembership: vi.fn(async () => ({ id: m.membershipId, ...m, role: "owner", email: "fictional@example.invalid" })) } as unknown as AuthProvider;
  const context = await resolveVerifiedTenantContext(provider, { sessionToken: "t".repeat(32), requestedTenantId: m.tenantId, origin: "https://fictional.invalid", csrfToken: principal.csrfToken }, "https://fictional.invalid");
  await withTenant(c.pool, context, async () => undefined);
  expect(c.query.mock.calls[1]?.[1]).toEqual(["real", credential, m.tenantId]);
  delete (principal as { sessionCredential?: string }).sessionCredential;
  await expect(resolveVerifiedTenantContext(provider, { sessionToken: "t".repeat(32), origin: "https://fictional.invalid" }, "https://fictional.invalid")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});

it("passes the practice credential that actually authenticated, with no request-selected actor", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const m = member(), c = connection(m), token = randomUUID();
  const lookup = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [{ tenant_id: m.tenantId, membership_id: m.membershipId, identity_user_id: m.identityUserId }] }));
  const auth = await authenticatePracticeSession({ query: lookup } as unknown as Pool, token);
  await withTenant(c.pool, auth.context, async () => undefined);
  expect(c.query.mock.calls[1]?.[1]).toEqual(["practice", lookup.mock.calls[0]?.[1]?.[0], m.tenantId]);
});

it("sanitizes expiry/refusal discovered at the derived-authority lookup before any callback", async () => {
  const m = member(), c = connection(m), work = vi.fn();
  c.query.mockImplementation(async sql => {
    if (sql.includes("current_actor()")) throw Object.assign(new Error("REQUEST_BINDING_REFUSED"), { code: "42501" });
    return { rows: [] };
  });
  await expect(withTenant(c.pool, verifiedTenantContextFromMembership(m, { kind: "real", credential }), work))
    .rejects.toBeInstanceOf(RequestBindingRefusedError);
  expect(work).not.toHaveBeenCalled();
  expect(c.query.mock.calls.map(call => call[0])).toEqual([
    "BEGIN", "SELECT app.bind_request($1, $2, $3)", "SELECT app.current_actor() actor, app.current_tenant() tenant", "ROLLBACK",
  ]);
  expect(c.release).toHaveBeenCalledOnce();
});
