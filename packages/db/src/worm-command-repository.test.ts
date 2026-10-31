import { randomUUID } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Pool } from "pg";
import { WormBoundaryError, type WormStorage, type TimestampResult } from "@jobguard/storage";
import { WormCommandRepository, wormCommandV1, type WormReceipt } from "./worm-command-repository.js";
import type { VerifiedTenantContext } from "./tenant-context.js";

const fake = vi.hoisted(() => ({ query: vi.fn(), audit: vi.fn(), transactions: 0, pools: [] as unknown[] }));
vi.mock("./tenant-context.js", () => ({ withTenant: async (_p: unknown, _c: unknown, fn: (db: unknown) => unknown) => {
  fake.pools.push(_p);
  fake.transactions++;
  try { return await fn({ $client: { query: fake.query } }); } finally { fake.transactions--; }
} }));
vi.mock("./audit.js", () => ({ appendAuditBatch: (...args: unknown[]) => fake.audit(...args) }));
const context = { tenantId: randomUUID() } as VerifiedTenantContext;
const command = () => ({ version: "worm.command.v1" as const, policyVersion: "synthetic_d07_v1" as const,
  commandId: randomUUID(), idempotencyKey: randomUUID(), actorMembershipId: randomUUID(),
  jobId: randomUUID(), evidenceId: randomUUID(), action: "apply_hold" as const });
const pool = {} as Pool;
const executorPool = {} as Pool;
const operatorPool = {} as Pool;
const repo = () => new WormCommandRepository(pool, true, executorPool);
let row: WormReceipt;
let attempts: number;
let storage: WormStorage;
beforeEach(() => {
  fake.pools = [];
  fake.query.mockReset(); fake.audit.mockReset(); attempts = 0;
  const c = command();
  row = { id: c.commandId, tenant_id: context.tenantId, actor_id: c.actorMembershipId, evidence_id: c.evidenceId,
    action: c.action, payload: c, object_key: `synthetic/tenants/${context.tenantId}/one`,
    object_version_id: "immutable-v1", imprint: "a".repeat(64), attempts: 0, status: "queued", result: null };
  fake.query.mockImplementation(async (sql: string, values: unknown[]) => {
    if (sql.includes("session_user")) return { rows: [{ operator_ref: "synthetic_operator" }] };
    if (sql.includes("worm_reconcile")) row = { ...row,
      status: values[2] === (row.action === "apply_hold") ? "applied" : "outcome_unknown" };
    if (sql.includes("pg_advisory")) return { rows: [] };
    if (sql.includes("worm_claim")) { if (["queued", "pending"].includes(row.status)) row = { ...row, status: "executing", attempts: ++attempts }; }
    if (sql.includes("worm_finish")) row = { ...row, status: values[2] as WormReceipt["status"], result: JSON.parse(values[3] as string) };
    return { rows: [{ ...row }] };
  });
  storage = { hold: vi.fn(async () => { expect(fake.transactions).toBe(0); }),
    read: vi.fn(async () => ({ held: true, retainUntil: null })), retain: vi.fn() };
});
const unavailable = { anchor: vi.fn(async (): Promise<TimestampResult> => ({ status: "pending", reason: "service_unavailable" })) };
describe("dark durable WORM application", () => {
  it("defaults off before database access and refuses D07 deletion/expiry", async () => {
    await expect(new WormCommandRepository(pool).submit(context, command())).rejects.toMatchObject({ code: "DARK_ONLY" });
    expect(fake.query).not.toHaveBeenCalled(); expect(() => repo().deleteOrExpire()).toThrow("D07_REQUIRED");
  });
  it("refuses execution without a separately configured executor pool", async () => {
    await expect(new WormCommandRepository(pool, true).execute(context, row.id, storage, unavailable)).rejects.toThrow("WORM_REFUSED");
    expect(fake.query).not.toHaveBeenCalled();
    expect(storage.hold).not.toHaveBeenCalled();
  });
  it("rejects financial, bill, hidden and provider fields rather than trusting client policy", () => {
    for (const extra of [{ amount: 0 }, { amount: -1 }, { amount: 999999999999 }, { lockedBillId: randomUUID() },
      { finalAccountRevision: randomUUID() }, { shadowSignalId: randomUUID() }, { tenantId: randomUUID() },
      { endpoint: "https://secret.invalid" }, { policyVersion: "approved" }]) {
      expect(wormCommandV1.safeParse({ ...command(), ...extra }).success).toBe(false);
    }
    expect(wormCommandV1.safeParse({ ...command(), action: "release_hold" }).success).toBe(false);
  });
  it("commits the claim before exact-version I/O, audits final state, and does not execute a replay", async () => {
    expect((await repo().execute(context, row.id, storage, unavailable)).status).toBe("applied");
    await repo().execute(context, row.id, storage, unavailable);
    expect(storage.hold).toHaveBeenCalledExactlyOnceWith({ tenantId: context.tenantId, key: row.object_key, versionId: "immutable-v1" }, true);
    expect(fake.audit).toHaveBeenCalledTimes(2);
    expect(fake.pools).toEqual([executorPool, executorPool, executorPool]);
  });
  it("does not mark a hold applied when storage readback disagrees", async () => {
    vi.mocked(storage.read).mockResolvedValue({ held: false, retainUntil: null });
    expect((await repo().execute(context, row.id, storage, unavailable)).status).toBe("outcome_unknown");
    expect(storage.hold).toHaveBeenCalledTimes(1);
  });
  it.each(["apply_hold", "release_hold"] as const)("persists a clear %s refusal and never retries it", async action => {
    row.action = action;
    vi.mocked(storage.hold).mockRejectedValue(new WormBoundaryError("INVALID_INPUT"));
    expect(await repo().execute(context, row.id, storage, unavailable)).toMatchObject({
      status: "refused", result: { status: "refused", reason: "storage_refused" },
    });
    await repo().execute(context, row.id, storage, unavailable);
    expect(storage.hold).toHaveBeenCalledTimes(1);
    expect(storage.read).not.toHaveBeenCalled();
    expect(fake.audit.mock.calls.at(-1)?.[1][0].eventType).toBe("worm.refused");
  });
  it("keeps a refusal during readback unknown because the write already completed", async () => {
    vi.mocked(storage.read).mockRejectedValue(new WormBoundaryError("INVALID_INPUT"));
    expect((await repo().execute(context, row.id, storage, unavailable)).status).toBe("outcome_unknown");
    expect(storage.hold).toHaveBeenCalledTimes(1);
  });
  it("never retries an unknown mutation, including after the application restarts", async () => {
    vi.mocked(storage.hold).mockRejectedValue(new Error("secret/PII/provider-details"));
    expect((await repo().execute(context, row.id, storage, unavailable)).status).toBe("outcome_unknown");
    await repo().execute(context, row.id, storage, unavailable);
    expect(storage.hold).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(row.result)).not.toContain("secret");
  });
  it("does not run a concurrent already-executing claim or a cancelled command", async () => {
    for (const status of ["executing", "cancelled"] as const) {
      row.status = status; await repo().execute(context, row.id, storage, unavailable);
    }
    expect(storage.hold).not.toHaveBeenCalled();
  });
  it("leaves TSA failure pending and persists token/query/trust material on retry", async () => {
    row.action = "request_anchor"; row.payload = { ...command(), action: "request_anchor", subject: "manifest" };
    expect((await repo().execute(context, row.id, storage, unavailable)).status).toBe("pending");
    const anchor = vi.fn(async (): Promise<TimestampResult> => {
      expect(fake.transactions).toBe(0);
      return { status: "anchored", token: new Uint8Array([1, 2]), query: new Uint8Array([3]),
        certificatePem: "fake-leaf", caCertificatePem: "fake-ca", signerSha256: "b".repeat(64),
        policyOid: "1.2.3", algorithm: "sha256", generatedAt: "2026-10-29T00:00:00Z", claim: "synthetic_integrity_and_existence_only" };
    });
    expect((await repo().execute(context, row.id, storage, { anchor })).status).toBe("applied");
    expect(row.result).toMatchObject({ token: "AQI=", query: "Aw==", certificatePem: "fake-leaf", caCertificatePem: "fake-ca" });
    await repo().execute(context, row.id, storage, { anchor }); expect(anchor).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fake.audit.mock.calls)).not.toContain("fake-leaf");
  });
  it("sanitizes SQL exceptions", async () => {
    fake.query.mockRejectedValue(new Error("tenant secrets"));
    await expect(repo().submit(context, command())).rejects.toThrow(/^WORM_REFUSED$/);
  });
});

describe("read-only operator WORM recovery", () => {
  const request = () => ({ version: "worm.recovery.v1", commandId: row.id });
  const operator = () => new WormCommandRepository(pool, true, executorPool, operatorPool);
  it("reads stored alerts only through the separately configured operator pool", async () => {
    await expect(new WormCommandRepository(pool).operatorAlerts(context)).rejects.toThrow("DARK_ONLY");
    await expect(repo().operatorAlerts(context)).rejects.toThrow("WORM_REFUSED");
    expect(fake.query).not.toHaveBeenCalled();
    const alert = { command_id: row.id, evidence_id: row.evidence_id, action: row.action,
      code: "WORM_STORAGE_REFUSED", severity: "critical", occurred_at: new Date() };
    fake.query.mockResolvedValue({ rows: [alert] });
    expect(await operator().operatorAlerts(context)).toEqual([alert]);
    expect(fake.query).toHaveBeenCalledExactlyOnceWith("SELECT * FROM app.worm_operator_alerts()");
    expect(fake.pools).toEqual([operatorPool]);
    expect(storage.hold).not.toHaveBeenCalled(); expect(storage.retain).not.toHaveBeenCalled();
    fake.query.mockRejectedValue(new Error("secret database detail"));
    await expect(operator().operatorAlerts(context)).rejects.toThrow(/^WORM_REFUSED$/);
  });
  it("requires the dark switch, strict versioned input and separate operator credentials before reading", async () => {
    await expect(new WormCommandRepository(pool).recover(context, request(), storage)).rejects.toThrow("DARK_ONLY");
    await expect(repo().recover(context, request(), storage)).rejects.toThrow("WORM_REFUSED");
    for (const extra of [{ tenantId: context.tenantId }, { operator: true }, { held: true }, { version: "v2" }]) {
      await expect(operator().recover(context, { ...request(), ...extra }, storage)).rejects.toThrow("INVALID_INPUT");
    }
    expect(fake.query).not.toHaveBeenCalled(); expect(storage.read).not.toHaveBeenCalled();
  });
  it.each(["executing", "outcome_unknown"] as const)("reconciles %s once after restart, without a mutation", async status => {
    row.status = status; row.attempts = 1;
    vi.mocked(storage.read).mockImplementation(async target => {
      expect(fake.transactions).toBe(0);
      expect(target).toEqual({ tenantId: context.tenantId, key: row.object_key, versionId: "immutable-v1" });
      return { held: true, retainUntil: null };
    });
    expect((await operator().recover(context, request(), storage)).status).toBe("applied");
    await operator().recover(context, request(), storage);
    expect(storage.read).toHaveBeenCalledTimes(1);
    expect(storage.hold).not.toHaveBeenCalled(); expect(storage.retain).not.toHaveBeenCalled();
    expect(fake.query.mock.calls.filter(([sql]) => sql.includes("worm_reconcile"))).toHaveLength(1);
    // PostgreSQL proves audit atomicity; callers have no audit write access.
    expect(fake.audit).not.toHaveBeenCalled();
    expect(fake.pools.every(p => p === operatorPool)).toBe(true);
  });
  it.each(["mismatch", "missing", "malformed"])("keeps %s readback unknown without leaking details or retrying writes", async mode => {
    row.status = "outcome_unknown"; row.attempts = 1;
    if (mode === "missing") vi.mocked(storage.read).mockRejectedValue(new Error("secret object key"));
    else vi.mocked(storage.read).mockResolvedValue({ held: mode === "malformed" ? undefined as unknown as boolean : false, retainUntil: null });
    expect((await operator().recover(context, request(), storage)).status).toBe("outcome_unknown");
    expect(storage.hold).not.toHaveBeenCalled(); expect(storage.retain).not.toHaveBeenCalled();
    expect(JSON.stringify(fake.audit.mock.calls)).not.toContain("secret");
  });
  it("reconciles release only from an observed OFF hold", async () => {
    row.status = "executing"; row.attempts = 1; row.action = "release_hold";
    expect((await operator().recover(context, request(), storage)).status).toBe("outcome_unknown");
    vi.mocked(storage.read).mockResolvedValue({ held: false, retainUntil: null });
    expect((await operator().recover(context, request(), storage)).status).toBe("applied");
    expect(storage.hold).not.toHaveBeenCalled();
  });
  it("refuses unauthorized or cross-tenant SQL targets before object access", async () => {
    fake.query.mockRejectedValue(new Error("WORM_REFUSED"));
    await expect(operator().recover(context, request(), storage)).rejects.toThrow(/^WORM_REFUSED$/);
    expect(storage.read).not.toHaveBeenCalled();
  });
  it("collapses concurrent recoveries to one audited effect", async () => {
    row.status = "outcome_unknown"; row.attempts = 1;
    // Emulate another operator committing while this operator is outside its transaction.
    vi.mocked(storage.read).mockImplementation(async () => {
      row.status = "applied"; return { held: true, retainUntil: null };
    });
    expect((await operator().recover(context, request(), storage)).status).toBe("applied");
    expect(fake.query.mock.calls.some(([sql]) => sql.includes("worm_reconcile"))).toBe(false);
    expect(fake.audit).not.toHaveBeenCalled();
  });
});
