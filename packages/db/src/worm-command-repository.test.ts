import { randomUUID } from "node:crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Pool } from "pg";
import type { WormStorage, TimestampResult } from "@jobguard/storage";
import { WormCommandRepository, wormCommandV1, type WormReceipt } from "./worm-command-repository.js";
import type { VerifiedTenantContext } from "./tenant-context.js";

const fake = vi.hoisted(() => ({ query: vi.fn(), audit: vi.fn(), transactions: 0 }));
vi.mock("./tenant-context.js", () => ({ withTenant: async (_p: unknown, _c: unknown, fn: (db: unknown) => unknown) => {
  fake.transactions++;
  try { return await fn({ $client: { query: fake.query } }); } finally { fake.transactions--; }
} }));
vi.mock("./audit.js", () => ({ appendAuditBatch: (...args: unknown[]) => fake.audit(...args) }));
const context = { tenantId: randomUUID() } as VerifiedTenantContext;
const command = () => ({ version: "worm.command.v1" as const, policyVersion: "synthetic_d07_v1" as const,
  commandId: randomUUID(), idempotencyKey: randomUUID(), actorMembershipId: randomUUID(),
  jobId: randomUUID(), evidenceId: randomUUID(), action: "apply_hold" as const });
const pool = {} as Pool;
const repo = () => new WormCommandRepository(pool, true);
let row: WormReceipt;
let attempts: number;
let storage: WormStorage;
beforeEach(() => {
  fake.query.mockReset(); fake.audit.mockReset(); attempts = 0;
  const c = command();
  row = { id: c.commandId, tenant_id: context.tenantId, actor_id: c.actorMembershipId, evidence_id: c.evidenceId,
    action: c.action, payload: c, object_key: `synthetic/tenants/${context.tenantId}/one`,
    object_version_id: "immutable-v1", imprint: "a".repeat(64), attempts: 0, status: "queued", result: null };
  fake.query.mockImplementation(async (sql: string, values: unknown[]) => {
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
