import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionExecutor, reconcileOutbox, type OutboundAdapter } from "./outbox.js";
import { verifiedTenantContextForQueuedJob, verifiedTenantContextFromMembership, type AuthenticatedMembership } from "./tenant-context.js";

const worker = vi.hoisted(() => ({ pool: {}, execute: vi.fn(), reconcile: vi.fn(), configure: vi.fn() }));
vi.mock("./worker-pool.js", () => ({ outboundWorkerPool: worker.configure }));
vi.mock("./worker-action-executor.js", () => ({
  WorkerActionExecutor: class { execute = worker.execute; },
  reconcileWorkerAction: worker.reconcile,
}));
const tenant = "98000000-0000-4000-8000-000000000010";
const id = "98000000-0000-4000-8000-000000000011";
const context = verifiedTenantContextForQueuedJob(tenant);
const membershipId = "98000000-0000-4000-8000-000000000012";
const request = verifiedTenantContextFromMembership({ tenantId: tenant, membershipId,
  identityUserId: "98000000-0000-4000-8000-000000000013" } as AuthenticatedMembership,
{ kind: "real", credential: "a".repeat(64) });
const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false,
  deliver: vi.fn(), reconcile: vi.fn() };
function fixture(visible: boolean) {
  const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT app.current_actor") ? [{ actor: membershipId, tenant }] : [],
    rowCount: sql.startsWith("SELECT id") && visible ? 1 : 0 }));
  const release = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
  return { pool, query, release, executor: new ActionExecutor(pool, new Map([[adapter.name, adapter]]), { emit: vi.fn() }) };
}
beforeEach(() => {
  vi.clearAllMocks();
  worker.configure.mockResolvedValue(worker.pool);
  worker.reconcile.mockResolvedValue("succeeded");
});

describe("tenant-scoped compatibility entry points", () => {
  it("checks the caller's tenant before delegating execution by action ID", async () => {
    const f = fixture(true), guard = vi.fn();
    await f.executor.execute(context, id, guard);
    expect(f.query).toHaveBeenCalledWith("SELECT id FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [tenant, id]);
    expect(f.query).toHaveBeenCalledWith("COMMIT");
    expect(f.release).toHaveBeenCalledOnce();
    expect(worker.execute).toHaveBeenCalledWith(id, guard);
    expect(f.query.mock.calls.some(([sql]) => /UPDATE|INSERT|FOR UPDATE/u.test(sql))).toBe(false);
  });
  it("does not give worker credentials an action hidden from the bound request", async () => {
    const f = fixture(false);
    await f.executor.execute(request, id);
    expect(worker.configure).not.toHaveBeenCalled();
    expect(worker.execute).not.toHaveBeenCalled();
  });
  it("keeps reconciliation under the same tenant visibility check", async () => {
    const f = fixture(false);
    await expect(reconcileOutbox(f.pool, request, id, adapter)).rejects.toThrow("NOT_RECONCILABLE");
    expect(worker.reconcile).not.toHaveBeenCalled();
    expect(worker.configure).not.toHaveBeenCalled();
  });
  it("delegates a visible reconciliation to the separate worker pool", async () => {
    const f = fixture(true);
    expect(await reconcileOutbox(f.pool, context, id, adapter)).toBe("succeeded");
    expect(worker.reconcile).toHaveBeenCalledWith(worker.pool, id, adapter);
  });
  it("passes the queued tenant to the worker when the web role has no bound read", async () => {
    const f = fixture(false);
    await f.executor.execute(context, id);
    expect(worker.execute).toHaveBeenCalledExactlyOnceWith(id, undefined, tenant);
    expect(await reconcileOutbox(f.pool, context, id, adapter)).toBe("succeeded");
    expect(worker.reconcile).toHaveBeenCalledExactlyOnceWith(worker.pool, id, adapter, tenant);
  });
  it("rejects a fabricated context before opening either pool", async () => {
    const f = fixture(true);
    await expect(f.executor.execute({ tenantId: tenant } as typeof context, id)).rejects.toThrow("verified tenant context");
    expect(f.pool.connect).not.toHaveBeenCalled();
    expect(worker.configure).not.toHaveBeenCalled();
  });
});
