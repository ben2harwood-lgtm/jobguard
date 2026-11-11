import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { withTenant } from "../src/tenant-context.js";
import { bindTestTenantContext, needsTestRequestBinding, testBoundTenantContext, testTenantContext } from "./tenant-context-test-utils.js";

function fixture() {
  const tenant = randomUUID(), member = randomUUID(), user = randomUUID();
  const sessions = new Set<string>();
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("to_regprocedure")) return { rows: [{ installed: "app.bind_request(text,text,uuid)" }] };
    if (sql.startsWith("SELECT id FROM app.membership")) return { rows: [{ id: member }] };
    if (sql.startsWith("SELECT identity_user_id")) return { rows: [{ identity_user_id: user }] };
    if (sql.startsWith("SELECT 1 FROM identity.session")) return { rows: sessions.has(values![0] as string) ? [{}] : [] };
    if (sql.startsWith("INSERT INTO identity.session")) sessions.add(values![2] as string);
    if (sql.includes("app.current_actor()")) return { rows: [{ actor: member, tenant }] };
    return { rows: [] };
  });
  const pool = { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  return { tenant, member, user, query, pool };
}

it("provisions once per tenant/membership and uses production binding before business SQL", async () => {
  const f = fixture(), scope = {}, context = testTenantContext(f.tenant, { membershipId: f.member });
  const bound = await bindTestTenantContext(f.pool, context, scope);
  expect(await bindTestTenantContext(f.pool, context, scope)).toBe(bound);
  await testBoundTenantContext(f.pool, f.tenant, f.member);
  expect(f.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO identity.session"))).toHaveLength(1);
  for (const [sql] of f.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO identity."))) {
    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(sql).not.toContain("DO UPDATE");
  }
  f.query.mockClear();
  await withTenant(f.pool, bound, db => db.$client.query("SELECT 'business'"));
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
    "BEGIN", "SELECT app.bind_request($1, $2, $3)", "SELECT app.current_actor() actor, app.current_tenant() tenant",
    "SELECT set_config('app.tenant_id', $1, true)", "SELECT 'business'", "COMMIT",
  ]);
});

it("does not refresh persisted credentials, so production expiry/revocation refusals survive", async () => {
  const f = fixture();
  await testBoundTenantContext(f.pool, f.tenant, f.member);
  f.query.mockClear();
  const bound = await testBoundTenantContext(f.pool, f.tenant, f.member);
  expect(f.query.mock.calls.some(([sql]) => /INSERT|UPDATE/u.test(sql))).toBe(false);
  f.query.mockImplementation(async sql => {
    if (sql.includes("app.bind_request")) throw Object.assign(new Error("REQUEST_BINDING_REFUSED"), { code: "42501" });
    return { rows: [] };
  });
  const work = vi.fn();
  await expect(withTenant(f.pool, bound, work)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(work).not.toHaveBeenCalled();
  expect(f.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});

it("keeps explicit unbound attacks and explicit session contexts out of automatic provisioning", async () => {
  const f = fixture(), attack = testTenantContext(f.tenant, { bindRequest: false });
  expect(needsTestRequestBinding(attack)).toBe(false);
  expect(await bindTestTenantContext(f.pool, attack)).toBe(attack);
  expect(f.query).not.toHaveBeenCalled();
  const bound = await testBoundTenantContext(f.pool, f.tenant, f.member);
  expect(needsTestRequestBinding(bound)).toBe(false);
  f.query.mockClear();
  expect(await bindTestTenantContext(f.pool, bound)).toBe(bound);
  expect(f.query).not.toHaveBeenCalled();
});

it("leaves predecessor schemas and missing/foreign memberships unchanged", async () => {
  const f = fixture(), context = testTenantContext(f.tenant);
  f.query.mockResolvedValue({ rows: [{ installed: null }] } as never);
  expect(await bindTestTenantContext(f.pool, context)).toBe(context);
  expect(f.query).toHaveBeenCalledOnce();
  f.query.mockImplementation(async sql => ({ rows: sql.includes("to_regprocedure") ? [{ installed: "present" }] : [] }) as never);
  expect(await bindTestTenantContext(f.pool, context)).toBe(context);
  expect(f.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
});

it("pins a resolved actor per database and never switches to a different owner after revocation", async () => {
  const f = fixture(), context = testTenantContext(f.tenant), scope = {};
  const original = await bindTestTenantContext(f.pool, context, scope);
  f.query.mockClear();
  expect(await bindTestTenantContext(f.pool, context, scope)).toBe(original);
  expect(f.query).not.toHaveBeenCalled();
  await bindTestTenantContext(f.pool, context, {});
  expect(f.query).toHaveBeenCalled();
});
