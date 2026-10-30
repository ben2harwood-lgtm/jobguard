import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { ActionExecutor, operateOutbox, reconcileOutbox, type FakeDeliveryResult, type OutboundAdapter } from "./outbox.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

// Transaction protocol double; PostgreSQL predicates and concurrency are covered separately.
function fixture(status = "pending", result: FakeDeliveryResult = { kind: "succeeded", providerReference: "synthetic" }) {
  const tenant = randomUUID(), id = randomUUID();
  const context = verifiedTenantContextForQueuedJob(tenant);
  const row = { id, status, adapter: "fake_capture", authorization_id: randomUUID(),
    provider_effect_key: "synthetic", action_type: "send_quote", recipient: null,
    content_hash: "a".repeat(64), immutable_content: "synthetic", aggregate_revision: 1,
    amount_pence: null, currency: null, policy_version: "synthetic.v1",
    authorization_expires_at: new Date("2099-01-01"), created_at: new Date(),
    next_attempt_at: new Date(0), claimed_at: new Date(0), updated_at: new Date(0) };
  let audit: unknown[][] = [], snapshot: { row: typeof row; audit: unknown[][] };
  let inTransaction = false, failAudit = false, claimsEnabled = true;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql === "BEGIN") { snapshot = { row: { ...row }, audit: [...audit] }; inTransaction = true; }
    if (sql === "COMMIT") inTransaction = false;
    if (sql === "ROLLBACK") { Object.assign(row, snapshot.row); audit = snapshot.audit; inTransaction = false; }
    if (sql === "SELECT outbound_control.claims_enabled() AS enabled") return { rows: [{ enabled: claimsEnabled }] };
    if (sql.startsWith("SELECT o.*")) {
      const dueGuard = sql.includes("o.next_attempt_at<=clock_timestamp()");
      return { rows: dueGuard && row.status !== "executing" && row.next_attempt_at.getTime() > Date.now() ? [] : [{ ...row }], rowCount: 1 };
    }
    if (sql.startsWith("SELECT status") || sql.startsWith("SELECT provider_effect_key")) return { rows: [{ ...row }], rowCount: 1 };
    if (sql.startsWith("SELECT count(*)")) return { rows: [{ n: 0 }], rowCount: 1 };
    if (sql.startsWith("SELECT pg_advisory_xact_lock(")) return { rows: [], rowCount: 1 };
    if (sql.startsWith("SELECT nullif")) return { rows: [{ tenant_id: tenant }], rowCount: 1 };
    if (sql.includes("app.lock_audit_head")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("SELECT clock_timestamp")) return { rows: [{ occurred_at: new Date() }], rowCount: 1 };
    if (sql.includes("app.advance_audit_head")) return { rows: [], rowCount: 1 };
    if (sql.startsWith("INSERT INTO app.audit_event")) { if (failAudit) throw new Error("synthetic audit failure"); audit.push(values); }
    if (sql.startsWith("UPDATE app.action_outbox")) {
      if (sql.includes("AND status='outcome_unknown'") && row.status !== "outcome_unknown") return { rows: [], rowCount: 0 };
      row.status = sql.includes("SET status=$2") ? String(values[1]) : /SET status='([^']+)'/u.exec(sql)![1]!;
    }
    if (/^(BEGIN|COMMIT|ROLLBACK|UPDATE |INSERT |SELECT set_config)/u.test(sql)) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const pool = { connect: async () => ({ query, release: () => undefined }) } as unknown as Pool;
  const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false,
    deliver: vi.fn(async () => { expect(inTransaction).toBe(false); return result; }),
    reconcile: vi.fn(async () => { expect(inTransaction).toBe(false); return "not_found" as const; }) };
  return { row, context, id, pool, adapter, query, audit: () => audit,
    failAudit: () => { failAudit = true; },
    pause: () => { claimsEnabled = false; },
    execute: () => new ActionExecutor(pool, new Map([[adapter.name, adapter]]), { emit: () => undefined }).execute(context, id) };
}

describe("LATER-B9 synthetic outcome protocol", () => {
  it.each(["pending", "retryable"])("M0-13a pause preserves %s work and creates no attempt or audit write", async status => {
    const f = fixture(status); const before = { ...f.row }; f.pause();
    await f.execute(); await f.execute();
    expect(f.row).toEqual(before); expect(f.audit()).toHaveLength(0);
    expect(f.adapter.deliver).not.toHaveBeenCalled();
    expect(f.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE)/u.test(sql))).toBe(false);
  });
  it("L019 safeRetry boolean cannot release outcome_unknown", async () => {
    const f = fixture("outcome_unknown");
    await expect(operateOutbox(f.pool, f.context, f.id, "retry", true)).rejects.toThrow("UNSAFE_OUTBOX_COMMAND");
    expect(f.row.status).toBe("outcome_unknown"); expect(f.audit()).toHaveLength(0);
  });
  it("L027 future next_attempt_at prevents claim", async () => {
    const f = fixture("retryable"); f.row.next_attempt_at = new Date("2099-01-01");
    await f.execute(); expect(f.adapter.deliver).not.toHaveBeenCalled(); expect(f.audit()).toHaveLength(0);
  });
  it.each<FakeDeliveryResult>([{ kind: "succeeded", providerReference: "synthetic" }, { kind: "retryable", code: "temporary" }, { kind: "outcome_unknown", code: "timeout" }])("L020 each committed outcome has one audit event: $kind", async result => {
    const f = fixture("pending", result); await f.execute();
    expect(f.row.status).toBe(result.kind); expect(f.audit()).toHaveLength(1);
    expect(f.audit()[0]![5]).toBe(`outbox.${result.kind}`);
  });
  it("L020 expired authorization refusal has one audit event", async () => {
    const f = fixture(); f.row.authorization_expires_at = new Date(0); await f.execute();
    expect(f.row.status).toBe("cancelled"); expect(f.audit()).toHaveLength(1); expect(f.adapter.deliver).not.toHaveBeenCalled();
  });
  it("L020 stale claim becomes unknown with one audit event", async () => {
    const f = fixture("executing"); await f.execute(); expect(f.row.status).toBe("outcome_unknown"); expect(f.audit()).toHaveLength(1);
  });
  it("L020 audit failure rolls back outcome", async () => {
    const f = fixture(); f.failAudit(); await expect(f.execute()).rejects.toThrow("synthetic audit failure");
    expect(f.row.status).toBe("executing"); expect(f.audit()).toHaveLength(0);
  });
  it.each(["retry", "cancel"] as const)("L020 operator %s commits one audit event", async command => {
    const f = fixture("retryable"); await operateOutbox(f.pool, f.context, f.id, command); expect(f.audit()).toHaveLength(1);
  });
  it("L019 L020 durable reconciliation permits retry and records provider evidence once", async () => {
    const f = fixture("outcome_unknown"); await reconcileOutbox(f.pool, f.context, f.id, f.adapter);
    expect(f.row.status).toBe("retryable"); expect(f.audit()).toHaveLength(1);
    expect(JSON.parse(String(f.audit()[0]![9])).references.reconciliation).toBe("not_found");
    await expect(reconcileOutbox(f.pool, f.context, f.id, f.adapter)).rejects.toThrow("NOT_RECONCILABLE");
    expect(f.audit()).toHaveLength(1);
  });
  it("L019 mismatched adapter cannot establish reconciliation evidence", async () => {
    const f = fixture("outcome_unknown");
    await expect(reconcileOutbox(f.pool, f.context, f.id, { ...f.adapter, name: "fake_other" })).rejects.toThrow("NOT_RECONCILABLE");
    expect(f.adapter.reconcile).not.toHaveBeenCalled();
  });
});
