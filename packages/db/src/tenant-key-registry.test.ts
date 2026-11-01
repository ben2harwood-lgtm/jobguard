import { describe, expect, it, vi, afterEach } from "vitest";
import type { Pool } from "pg";
import { SyntheticTenantKeyRegistry, TenantKeyRegistryError } from "./tenant-key-registry.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const context = verifiedTenantContextForQueuedJob("10000000-0000-4000-8000-000000000001");
afterEach(() => vi.unstubAllEnvs());
describe("dark key registry admission", () => {
  it("defaults off and refuses production before acquiring any connection", async () => {
    const connect = vi.fn(), pool = { connect } as unknown as Pool;
    await expect(new SyntheticTenantKeyRegistry(pool).rotate(context, {})).rejects.toThrow(TenantKeyRegistryError);
    vi.stubEnv("NODE_ENV", "production");
    const registry = new SyntheticTenantKeyRegistry(pool, true);
    await expect(registry.rotate(context, {})).rejects.toThrow(TenantKeyRegistryError);
    await expect(registry.revoke(context, {})).rejects.toThrow(TenantKeyRegistryError);
    await expect(registry.withKey(context, {}, () => true)).rejects.toThrow(TenantKeyRegistryError);
    expect(connect).not.toHaveBeenCalled();
  });
  it("rejects copied or payload-created contexts before any database access", async () => {
    const connect = vi.fn(), registry = new SyntheticTenantKeyRegistry({ connect } as unknown as Pool, true);
    await expect(registry.rotate({ ...context }, {})).rejects.toThrow(TenantKeyRegistryError);
    expect(connect).not.toHaveBeenCalled();
  });
});
