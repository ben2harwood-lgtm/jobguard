// Repository control-flow tests with a fake connection. PostgreSQL guarantees are
// exercised separately by inbox-metrics.integration.test.ts in CI.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { InboxMetricsRepository } from "../src/inbox-metrics-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
vi.mock("../src/audit.js", () => ({ appendAuditBatch: vi.fn(async () => [{ id: randomUUID() }]) }));
const tenantId = randomUUID(), jobId = randomUUID();
const context = testTenantContext(tenantId);
const event = { tenantId, jobId, eventId: randomUUID(), commandId: randomUUID(), kind: "finding",
  findingId: randomUUID(), ruleId: "proof", ruleVersion: "v1", occurredAt: "2026-01-01T00:00:00Z" };
const envelope = (body: unknown = event) => ({ version: "inbox-metric-record.v1", environment: "synthetic_demo",
  jobId, receiptId: randomUUID(), event: body });
function fixture(options: { database?: string; stored?: unknown[]; prior?: unknown; duplicate?: unknown[]; insertFails?: boolean } = {}) {
  const query = vi.fn(async (sql: string, args?: unknown[]) => {
    if (sql.includes("current_database()")) return { rows: [{ name: options.database ?? "jobguard_synthetic_demo" }] };
    if (sql.includes("receipt_id=$2")) return { rows: options.prior ? [options.prior] : [] };
    if (sql.includes("SELECT 1 FROM app.job")) return { rows: [{}], rowCount: 1 };
    if (sql.includes("event_id=$2 OR command_id=$3")) return { rows: options.duplicate ?? [] };
    if (sql.startsWith("SELECT event FROM")) return { rows: (options.stored ?? []).map(event => ({ event })) };
    if (sql.startsWith("INSERT INTO") && options.insertFails) throw new Error("storage unavailable");
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn();
  const pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
  return { repo: new InboxMetricsRepository(pool), query, pool };
}
const insert = (query: ReturnType<typeof fixture>["query"]) => query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO"))?.[1];
describe("M2-7 store boundary and ingestion outcomes", () => {
  it("refuses live envelopes and unverified context before opening a connection", async () => {
    const f = fixture();
    await expect(f.repo.record(context, { ...envelope(), environment: "production" })).rejects.toThrow("INVALID_METRICS_INPUT");
    await expect(f.repo.record({ tenantId } as typeof context, envelope())).rejects.toThrow("verified tenant context");
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("refuses a non-synthetic database and rolls back", async () => {
    const f = fixture({ database: "production" });
    await expect(f.repo.record(context, envelope())).rejects.toThrow("INVALID_METRICS_INPUT");
    expect(insert(f.query)).toBeUndefined();
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("records malformed input as rejected without retaining its private fields", async () => {
    const f = fixture();
    expect(await f.repo.record(context, envelope({ ...event, secret: "private@example.invalid" }))).toMatchObject({ status: "rejected", rejection: "INVALID_METRICS_INPUT" });
    const args = insert(f.query)!;
    expect(args.slice(4, 8)).toEqual([null, null, null, "INVALID_METRICS_INPUT"]);
    expect(JSON.stringify(args)).not.toContain("private@example.invalid");
    expect(f.query).toHaveBeenCalledWith("COMMIT");
  });
  it("rejects missing/cross-rule references rather than counting a success", async () => {
    const f = fixture();
    const { findingId: _, ...common } = event;
    expect(await f.repo.record(context, envelope({ ...common, kind: "decision", decisionId: randomUUID(), findingIds: [randomUUID()] }))).toMatchObject({ status: "rejected", rejection: "INVALID_METRICS_REFERENCE" });
    expect(insert(f.query)?.[6]).toBeNull();
  });
  it("accepts valid metadata, dedupes normalized stored events and rejects conflicting identities", async () => {
    const fresh = fixture();
    expect(await fresh.repo.record(context, envelope())).toMatchObject({ status: "accepted", replay: false });
    expect(JSON.parse(insert(fresh.query)![6] as string)).toEqual(event);
    const replay = fixture({ duplicate: [{ event: Object.fromEntries(Object.entries(event).reverse()) }] });
    expect(await replay.repo.record(context, envelope())).toMatchObject({ status: "accepted", replay: true });
    expect(insert(replay.query)).toBeUndefined();
    const conflict = fixture({ duplicate: [{ event: { ...event, ruleVersion: "v2" } }] });
    expect(await conflict.repo.record(context, envelope())).toMatchObject({ status: "rejected", rejection: "IDEMPOTENCY_CONFLICT" });
  });
  it("normalizes verified UUID context before tenant comparison and serialization", async () => {
    const f = fixture();
    const upper = testTenantContext(tenantId.toUpperCase());
    expect(await f.repo.record(upper, envelope())).toMatchObject({ status: "accepted" });
    expect(f.query).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(hashtextextended($1,487))", [tenantId]);
  });
  it("never returns success when the durable insert fails", async () => {
    const f = fixture({ insertFails: true });
    await expect(f.repo.record(context, envelope())).rejects.toThrow("storage unavailable");
    expect(f.query).toHaveBeenCalledWith("ROLLBACK");
    expect(f.query).not.toHaveBeenCalledWith("COMMIT");
  });
});
