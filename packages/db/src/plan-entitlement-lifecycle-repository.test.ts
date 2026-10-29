import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PlanEntitlementLifecycleRepository } from "./plan-entitlement-lifecycle-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const tenant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", job = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const facts = { version: "plan-entitlement-facts.v1", track: "small_builder", plan: "Solo", catalogueVersion: "subscription_pricing_policy_v4" };
function fixture() {
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [{ facts }] }));
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { query, release, connect, repository: new PlanEntitlementLifecycleRepository({ connect } as unknown as Pool) };
}
describe("MON-8 persisted lifecycle repository (unit evidence)", () => {
  it("consumes current facts before commit and rereads without caching", async () => {
    const f = fixture(), context = verifiedTenantContextForQueuedJob(tenant), seen: string[] = [];
    for (const plan of ["Solo", "Builder", "Solo"]) {
      f.query.mockImplementation(async sql => {
        seen.push(sql);
        return { rows: [{ facts: { ...facts, plan } }] };
      });
      expect(await f.repository.withCurrentAuthority(context, "a".repeat(64), job, current => {
        expect(seen.at(-1)).toBe("SELECT app.mon8_subscription_context($1,$2,$3) facts");
        return current;
      })).toEqual({ ...facts, plan });
    }
    expect(f.query).toHaveBeenCalledWith("SELECT app.mon8_subscription_context($1,$2,$3) facts", [tenant, "a".repeat(64), job]);
    expect(f.release).toHaveBeenCalledTimes(3);
  });
  it("callback or malformed/hidden authority failures roll back and release", async () => {
    const f = fixture(), context = verifiedTenantContextForQueuedJob(tenant);
    await expect(f.repository.withCurrentAuthority(context, "a".repeat(64), undefined, () => { throw new Error("private callback"); })).rejects.toThrow("ENTITLEMENT_UNAVAILABLE");
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
    expect(f.query).not.toHaveBeenCalledWith("COMMIT");
    f.query.mockResolvedValue({ rows: [{ facts: { ...facts, hiddenSignals: 1 } as typeof facts }] });
    await expect(f.repository.withCurrentAuthority(context, "a".repeat(64), undefined, value => value)).rejects.toThrow("INVALID_ENTITLEMENT_INPUT");
    expect(f.release).toHaveBeenCalledTimes(2);
  });
  it("invalid identifiers never acquire a connection", async () => {
    const f = fixture(), context = verifiedTenantContextForQueuedJob(tenant);
    for (const [digest, jobId] of [["bad", undefined], ["a".repeat(64), "bad"]])
      await expect(f.repository.withCurrentAuthority(context, digest!, jobId, value => value)).rejects.toThrow("INVALID_ENTITLEMENT_INPUT");
    expect(f.connect).not.toHaveBeenCalled();
  });
});
