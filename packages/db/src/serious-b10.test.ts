import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { appendAuditBatch } from "./audit.js";
import { ActionExecutor, type OutboundAdapter } from "./outbox.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

vi.mock("./audit.js", () => ({ appendAuditBatch: vi.fn() }));

const actionId = "98000000-0000-4000-8000-000000000001";
const context = verifiedTenantContextForQueuedJob("91000000-0000-4000-8000-000000000001");

function harness(options: { cancelled?: boolean; databaseFailure?: boolean } = {}) {
  const statements: string[] = [];
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    statements.push(sql);
    if (sql.startsWith("SELECT o.*,a.actor_membership_id AS authorization_actor FROM app.action_outbox")) {
      if (options.databaseFailure) throw new Error("synthetic authority lookup unavailable");
      return { rows: [] };
    }
    if (sql.includes("UPDATE app.action_outbox o SET status='cancelled'")) {
      return { rows: options.cancelled ? [{ id: actionId }] : [] };
    }
    if (sql.startsWith("SELECT pg_advisory_xact_lock(")) return { rows: [] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.startsWith("SELECT set_config")) return { rows: [] };
    throw new Error(`Unexpected database operation: ${sql}`);
  });
  const release = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
  const adapter: OutboundAdapter = {
    name: "fake_capture", supportsProviderDeduplication: false,
    deliver: vi.fn<OutboundAdapter["deliver"]>(async () => ({ kind: "succeeded", providerReference: "synthetic:unexpected" })),
    reconcile: vi.fn<OutboundAdapter["reconcile"]>(async () => "unknown"),
  };
  const execute = () => new ActionExecutor(pool, new Map([[adapter.name, adapter]]), { emit: vi.fn() }).execute(context, actionId);
  return { query, statements, release, adapter, execute };
}

describe("SERIOUS-B10 refusal orchestration (mocked database; PostgreSQL proof is separate)", () => {
  it("returns a terminal typed refusal and appends its audit without a delivery attempt", async () => {
    vi.mocked(appendAuditBatch).mockResolvedValue([]);
    const h = harness({ cancelled: true });
    await expect(h.execute()).resolves.toEqual({ kind: "cancelled", code: "AUTHORIZATION_REVOKED" });
    expect(appendAuditBatch).toHaveBeenLastCalledWith(expect.anything(), [expect.objectContaining({
      actorRef: "system:outbox", eventType: "outbox.authorization_revoked", subjectRef: actionId,
      payload: { references: { outcome: "cancelled", code: "AUTHORIZATION_REVOKED" }, classifications: { action: "security" } },
    })]);
    expect(h.statements.at(-1)).toBe("COMMIT");
    expect(h.statements.some(sql => sql.includes("INSERT INTO app.action_attempt"))).toBe(false);
    expect(h.adapter.deliver).not.toHaveBeenCalled();
    expect(h.adapter.reconcile).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("does not claim that missing or invisible work was cancelled", async () => {
    vi.mocked(appendAuditBatch).mockClear();
    const h = harness();
    await expect(h.execute()).resolves.toBeUndefined();
    expect(appendAuditBatch).not.toHaveBeenCalled();
    expect(h.adapter.deliver).not.toHaveBeenCalled();
  });

  it("fails closed on an unavailable authority read", async () => {
    const h = harness({ databaseFailure: true });
    await expect(h.execute()).rejects.toThrow("synthetic authority lookup unavailable");
    expect(h.statements.at(-1)).toBe("ROLLBACK");
    expect(h.adapter.deliver).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });

  it("rolls cancellation back if its audit cannot be persisted", async () => {
    vi.mocked(appendAuditBatch).mockRejectedValueOnce(new Error("synthetic audit unavailable"));
    const h = harness({ cancelled: true });
    await expect(h.execute()).rejects.toThrow("synthetic audit unavailable");
    expect(h.statements.at(-1)).toBe("ROLLBACK");
    expect(h.statements).not.toContain("COMMIT");
    expect(h.adapter.deliver).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledOnce();
  });
});
