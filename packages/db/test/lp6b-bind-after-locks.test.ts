import { expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { bindAfterLocks, withTenant, verifiedTenantContextFromMembership, InvalidTenantContextError, type TenantTransaction } from "../src/tenant-context.js";

const tenantId = "10000000-0000-4000-8000-000000000001";
const membershipId = "10000000-0000-4000-8000-000000000002";
const identityUserId = "10000000-0000-4000-8000-000000000003";
function context() {
  return verifiedTenantContextFromMembership({ tenantId, membershipId, identityUserId } as Parameters<typeof verifiedTenantContextFromMembership>[0],
    { kind: "practice", credential: "a".repeat(64) });
}
function pool(failure?: string) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (failure && sql === "SELECT app.bind_request($1, $2, $3)") throw Object.assign(new Error("private SQL detail"), { code: failure });
    return { rows: sql === "SELECT app.current_actor() actor, app.current_tenant() tenant" ? [{ actor: membershipId, tenant: tenantId }] : [] };
  });
  const release = vi.fn();
  return { pool: { connect: async () => ({ query, release }) } as unknown as Pool, query, release };
}
it("binds after the approval locks with the same actor check, then expires the helper capability", async () => {
  const f = pool(), ctx = context(); let saved: TenantTransaction;
  await withTenant(f.pool, ctx, async db => {
    saved = db;
    await db.$client.query("SELECT case_lock");
    await bindAfterLocks(db, ctx);
    await db.$client.query("SELECT approved_work");
  }, "evidence-pack-approval");
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([
    "BEGIN", "SELECT set_config('app.tenant_id', $1, true)", "SELECT case_lock",
    "SELECT app.bind_request($1, $2, $3)", "SELECT app.current_actor() actor, app.current_tenant() tenant",
    "SELECT approved_work", "COMMIT",
  ]);
  expect(f.query.mock.calls[3]![1]).toEqual(["practice", "a".repeat(64), tenantId]);
  await expect(bindAfterLocks(saved!, ctx)).rejects.toBeInstanceOf(InvalidTenantContextError);
  expect(f.release).toHaveBeenCalledTimes(1);
});
it("cannot commit an approval callback that omitted the late bind", async () => {
  const f = pool();
  await expect(withTenant(f.pool, context(), async db => db.$client.query("SELECT case_lock"), "evidence-pack-approval"))
    .rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "SELECT set_config('app.tenant_id', $1, true)", "SELECT case_lock", "ROLLBACK"]);
  expect(f.release).toHaveBeenCalledTimes(1);
});
it("rejects a substituted genuine context before binding and rolls back", async () => {
  const f = pool(), ctx = context(), other = context();
  await expect(withTenant(f.pool, ctx, db => bindAfterLocks(db, other), "evidence-pack-approval")).rejects.toBeInstanceOf(InvalidTenantContextError);
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "SELECT set_config('app.tenant_id', $1, true)", "ROLLBACK"]);
});
it.each(["42501", "40P01"])("rolls back a late %s before further work and preserves deadlock failure", async code => {
  const f = pool(code), after = vi.fn();
  const ctx = context();
  await expect(withTenant(f.pool, ctx, async db => { await bindAfterLocks(db, ctx); after(); }, "evidence-pack-approval"))
    .rejects.toMatchObject({ code: code === "42501" ? "FORBIDDEN" : "40P01" });
  expect(after).not.toHaveBeenCalled();
  expect(f.query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(0);
  expect(f.query.mock.calls.filter(([sql]) => sql === "ROLLBACK")).toHaveLength(1);
});
it("does not allow the late helper on ordinary bound transactions", async () => {
  const f = pool(), ctx = context();
  await expect(withTenant(f.pool, ctx, db => bindAfterLocks(db, ctx))).rejects.toBeInstanceOf(InvalidTenantContextError);
  expect(f.query.mock.calls.slice(0, 3).map(([sql]) => sql)).toEqual([
    "BEGIN", "SELECT app.bind_request($1, $2, $3)", "SELECT app.current_actor() actor, app.current_tenant() tenant",
  ]);
  expect(f.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
});
