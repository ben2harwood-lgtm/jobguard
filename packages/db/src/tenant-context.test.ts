import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import * as tenantContext from "./tenant-context.js";
import type { VerifiedTenantContext } from "./tenant-context.js";

const TENANT = "10000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
function genuineContext() {
  return tenantContext.verifiedTenantContextFromMembership({
    identityUserId: "30000000-0000-4000-8000-000000000003",
    membershipId: "40000000-0000-4000-8000-000000000004",
    tenantId: TENANT,
  } as tenantContext.AuthenticatedMembership);
}
function fakePool() {
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [] }));
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return { pool: { connect } as unknown as Pool, connect, query, release };
}

describe("stamped tenant context boundary", () => {
  const forgeries: Array<[string, (ctx: VerifiedTenantContext) => unknown]> = [
    ["object literal cast", () => ({ tenantId: TENANT } as VerifiedTenantContext)],
    ["spread copy", ctx => ({ ...ctx })],
    ["spread with another tenant", ctx => ({ ...ctx, tenantId: OTHER })],
    ["structured clone", ctx => structuredClone(ctx)],
    ["Object.assign copy", ctx => Object.assign({}, ctx)],
    ["Object.assign changed clone", ctx => Object.assign(structuredClone(ctx), { tenantId: OTHER })],
    ["prototype inheritance", ctx => Object.create(ctx)],
    ["proxy", ctx => new Proxy(ctx, {})],
    ["tenantId getter", () => ({ get tenantId() { throw new Error("Getter must not run"); } })],
    ["JSON round trip", ctx => JSON.parse(JSON.stringify(ctx))],
    ["null", () => null],
    ["undefined", () => undefined],
  ];
  it.each(forgeries)("refuses %s before connecting", async (_name, forge) => {
    const { pool, connect } = fakePool();
    const work = vi.fn(async () => undefined);
    await expect(tenantContext.withTenant(pool, forge(genuineContext()) as VerifiedTenantContext, work))
      .rejects.toBeInstanceOf(tenantContext.InvalidTenantContextError);
    expect(connect).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  // These containers preserve object identity: the stamp stays valid for its own tenant.
  it.each(["direct", "Promise.resolve", "array", "closure"])("accepts the same stamped object through %s", async route => {
    const ctx = genuineContext();
    const context = route === "Promise.resolve" ? await Promise.resolve(ctx)
      : route === "array" ? [ctx][0]!
      : route === "closure" ? (() => ctx)() : ctx;
    const { pool, connect, query, release } = fakePool();
    expect(context).toBe(ctx);
    expect(Object.isFrozen(context)).toBe(true);
    await expect(tenantContext.withTenant(pool, context, async () => "done")).resolves.toBe("done");
    expect(connect).toHaveBeenCalledOnce();
    expect(query.mock.calls).toEqual([
      ["BEGIN"], ["SELECT set_config('app.tenant_id', $1, true)", [TENANT]], ["COMMIT"],
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it("exports only two stamped constructors and no arbitrary-object registrar", () => {
    expect(Object.keys(tenantContext).sort()).toEqual([
      "InvalidTenantContextError", "verifiedTenantContextForQueuedJob",
      "verifiedTenantContextFromMembership", "withTenant",
    ]);
  });

  // Namespace lookup lets this test execute red against main before the constructor exists.
  const queuedContext = (tenantId: string) => (tenantContext as unknown as {
    verifiedTenantContextForQueuedJob: (id: string) => VerifiedTenantContext;
  }).verifiedTenantContextForQueuedJob(tenantId);
  it.each(["", "not-a-uuid", "10000000-0000-4000-0000-000000000001"])("rejects invalid queued-job tenant %s", tenantId => {
    expect(() => queuedContext(tenantId)).toThrow(tenantContext.InvalidTenantContextError);
  });
  it("stamps and freezes a UUID-validated queued-job context", async () => {
    const ctx = queuedContext(TENANT);
    const { pool, query } = fakePool();
    expect(Object.isFrozen(ctx)).toBe(true);
    await tenantContext.withTenant(pool, ctx, async () => undefined);
    expect(query).toHaveBeenCalledWith("SELECT set_config('app.tenant_id', $1, true)", [TENANT]);
  });
});
