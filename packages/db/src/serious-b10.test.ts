import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { ActionExecutor, type OutboundAdapter } from "./outbox.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
import { outboundWorkerPool } from "./worker-pool.js";

vi.mock("./worker-pool.js", () => ({ outboundWorkerPool: vi.fn() }));

const actionId = "98000000-0000-4000-8000-000000000001";
const context = verifiedTenantContextForQueuedJob("91000000-0000-4000-8000-000000000001");
const claimSql = "SELECT app.claim_worker_action($1::uuid,$2::text[]) AS claim";

function harness(options: { cancelled?: boolean; visible?: boolean; databaseFailure?: boolean; auditFailure?: boolean } = {}) {
  const statements: string[] = [];
  // Model the audit sealed inside claim_worker_action, not a JavaScript audit write.
  // Actual SQL atomicity and audit contents require the separate PostgreSQL proof.
  const sealAudit = vi.fn(async (_event: unknown, _trust: string) => {
    if (options.auditFailure) throw new Error("synthetic audit unavailable");
  });
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    statements.push(sql);
    if (sql === "SELECT outbound_control.claims_enabled() AS enabled") return { rows: [{ enabled: true }] };
    if (sql === claimSql) {
      if (options.databaseFailure) throw new Error("synthetic authority lookup unavailable");
      if (!options.cancelled) return { rows: [{ claim: null }] };
      await sealAudit({
        version: "audit.v1", actorRef: "system:outbox", eventType: "outbox.authorization_revoked",
        subjectType: "outbox_action", subjectRef: actionId,
        payload: { references: { authorizingMembership: "synthetic:author", authorization: "synthetic:authorization",
          executingWorker: "synthetic:worker", outcome: "cancelled", code: "AUTHORIZATION_REVOKED" },
        classifications: { outcome: "operational" } },
      }, "checked_operation");
      return { rows: [{ claim: { refused: true, code: "AUTHORIZATION_REVOKED" } }] };
    }
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    throw new Error(`Unexpected worker database operation: ${sql}`);
  });
  const release = vi.fn();
  const workerPool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
  vi.mocked(outboundWorkerPool).mockClear().mockResolvedValue(workerPool);
  const webQuery = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql === "SELECT id FROM app.action_outbox WHERE tenant_id=$1 AND id=$2") {
      return { rows: [], rowCount: options.visible === false ? 0 : 1 };
    }
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.startsWith("SELECT set_config")) return { rows: [] };
    throw new Error(`Unexpected web database operation: ${sql}`);
  });
  const webRelease = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query: webQuery, release: webRelease })) } as unknown as Pool;
  const adapter: OutboundAdapter = {
    name: "fake_capture", supportsProviderDeduplication: false,
    deliver: vi.fn<OutboundAdapter["deliver"]>(async () => ({ kind: "succeeded", providerReference: "synthetic:unexpected" })),
    reconcile: vi.fn<OutboundAdapter["reconcile"]>(async () => "unknown"),
  };
  const execute = () => new ActionExecutor(pool, new Map([[adapter.name, adapter]]), { emit: vi.fn() }).execute(context, actionId);
  return { query, statements, release, webQuery, webRelease, sealAudit, adapter, execute };
}

function expectNoDelivery(h: ReturnType<typeof harness>) {
  // Exact protocol excludes direct writes, attempt creation and completion without authority.
  expect(h.statements).toEqual([
    "BEGIN", "SELECT outbound_control.claims_enabled() AS enabled", claimSql, h.statements.at(-1),
  ]);
  expect(h.query).toHaveBeenCalledWith(claimSql, [actionId, ["fake_capture"]]);
  expect(h.adapter.deliver).not.toHaveBeenCalled();
  expect(h.adapter.reconcile).not.toHaveBeenCalled();
  expect(h.release).toHaveBeenCalledOnce();
  expect(h.webRelease).toHaveBeenCalledOnce();
}

describe("SERIOUS-B10 refusal orchestration (mocked database; PostgreSQL proof is separate)", () => {
  it("returns a terminal typed refusal and seals its audit without a delivery attempt", async () => {
    const h = harness({ cancelled: true });
    await expect(h.execute()).resolves.toEqual({ kind: "cancelled", code: "AUTHORIZATION_REVOKED" });
    expect(h.sealAudit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      actorRef: "system:outbox", eventType: "outbox.authorization_revoked", subjectRef: actionId,
      payload: { references: { authorizingMembership: "synthetic:author", authorization: "synthetic:authorization",
        executingWorker: "synthetic:worker", outcome: "cancelled", code: "AUTHORIZATION_REVOKED" },
      classifications: { outcome: "operational" } },
    }), "checked_operation");
    expect(h.sealAudit.mock.invocationCallOrder[0]).toBeLessThan(h.query.mock.invocationCallOrder.at(-1)!);
    expect(h.statements.at(-1)).toBe("COMMIT");
    expectNoDelivery(h);
  });

  it("does not claim that missing or invisible work was cancelled", async () => {
    const h = harness();
    await expect(h.execute()).resolves.toBeUndefined();
    expect(h.sealAudit).not.toHaveBeenCalled();
    expect(h.statements.at(-1)).toBe("COMMIT");
    expectNoDelivery(h);

    const invisible = harness({ visible: false });
    await expect(invisible.execute()).resolves.toBeUndefined();
    expect(invisible.webQuery).toHaveBeenCalledWith(
      "SELECT id FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [context.tenantId, actionId],
    );
    expect(outboundWorkerPool).not.toHaveBeenCalled();
    expect(invisible.query).not.toHaveBeenCalled();
    expect(invisible.sealAudit).not.toHaveBeenCalled();
    expect(invisible.adapter.deliver).not.toHaveBeenCalled();
    expect(invisible.webRelease).toHaveBeenCalledOnce();
  });

  it("fails closed on an unavailable authority read", async () => {
    const h = harness({ databaseFailure: true });
    await expect(h.execute()).rejects.toThrow("synthetic authority lookup unavailable");
    expect(h.statements.at(-1)).toBe("ROLLBACK");
    expect(h.statements).not.toContain("COMMIT");
    expect(h.sealAudit).not.toHaveBeenCalled();
    expectNoDelivery(h);
  });

  it("rolls cancellation back if its audit cannot be persisted", async () => {
    const h = harness({ cancelled: true, auditFailure: true });
    await expect(h.execute()).rejects.toThrow("synthetic audit unavailable");
    expect(h.sealAudit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ eventType: "outbox.authorization_revoked", subjectRef: actionId }), "checked_operation");
    expect(h.statements.at(-1)).toBe("ROLLBACK");
    expect(h.statements).not.toContain("COMMIT");
    expectNoDelivery(h);
  });
});
