import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractorBillingDelivery } from "./contractor-billing-delivery.js";
import { SubscriptionRepository } from "./subscription-repository.js";
import { SubscriptionExecutor } from "./subscription-executor.js";
import { executeAuthorizedCommercialAction } from "./commands.js";
import { verifiedTenantContextForQueuedJob, withTenant } from "./tenant-context.js";

// Transaction protocol double. The CI integration tests separately prove SQL effects.
function fixture(enabled = false) {
  let inTransaction = false;
  const context = verifiedTenantContextForQueuedJob(randomUUID());
  const query = vi.fn(async (sql: string) => {
    if (sql === "BEGIN") inTransaction = true;
    if (["COMMIT", "ROLLBACK"].includes(sql)) inTransaction = false;
    if (sql === "SELECT outbound_control.claims_enabled() AS enabled") return { rows: [{ enabled }] };
    if (sql.startsWith("SELECT app.cb_delivery_step")) { expect(inTransaction).toBe(true); return { rows: [{ result: null }] }; }
    if (sql.startsWith("SELECT app.mon2_read")) return { rows: [{ result: {
      version: "subscription-persisted-read.v1", hypothetical: true, environment: "synthetic_demo",
      ...Object.fromEntries(["agreements","changes","changeOutcomes","periods","statements","reviews","work","attempts","results","corrections","alerts","onboarding","periodLines","placeBindings","places","statementLines","operationsCards"].map(key => [key, []])),
    } }] };
    if (sql.startsWith("SELECT app.mon2_command")) throw new Error("claim reached");
    if (sql.startsWith("SELECT a.*")) return { rows: [{ action_type: "quote.send", recipient: null,
      content_hash: "a".repeat(64), aggregate_revision: 1, amount_pence: null, currency: null, policy_version: "synthetic.v1" }] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.startsWith("SELECT set_config")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  return { pool, context, query, inTransaction: () => inTransaction };
}
afterEach(() => vi.unstubAllEnvs());
describe("all commercial outbound claim paths", () => {
  it.each(["database", "deployment"])("contractor delivery refuses a %s pause before the SQL claim or fake adapter", async mode => {
    vi.stubEnv("JOBGUARD_COMMERCIAL_OUTBOUND", mode === "deployment" ? "paused" : "enabled");
    const f = fixture(mode === "deployment"), deliver = vi.fn();
    const adapter = { name: "fake_api" as const, supportsProviderDeduplication: true, deliver, reconcile: vi.fn() };
    const executor = new ContractorBillingDelivery(f.pool, new Map([[adapter.name, adapter]]));
    for (let i = 0; i < 2; i++) await executor.execute(f.context, randomUUID(), randomUUID(), randomUUID());
    expect(deliver).not.toHaveBeenCalled();
    expect(f.query.mock.calls.some(([sql]) => sql.includes("cb_delivery_step"))).toBe(false);
    expect(f.inTransaction()).toBe(false);
  });
  it.each(["database", "deployment"])("subscription execution refuses a %s pause before recording any claim", async mode => {
    vi.stubEnv("JOBGUARD_COMMERCIAL_OUTBOUND", mode === "deployment" ? "paused" : "enabled");
    const f = fixture(mode === "deployment"), adapter = { execute: vi.fn(), reconcile: vi.fn() };
    const repository = new SubscriptionRepository(f.pool), executor = new SubscriptionExecutor(repository, adapter);
    await expect(executor.execute(f.context, "a".repeat(64), randomUUID(), randomUUID(), 1)).rejects.toThrow("SUBSCRIPTION_UNAVAILABLE");
    // Calling the repository directly cannot bypass the same claim gate.
    await expect(repository.command(f.context, "a".repeat(64), randomUUID(), {
      version: "subscription-command.v1", kind: "execute_simulation", workId: randomUUID(), expectedRevision: 1,
    })).rejects.toThrow("SUBSCRIPTION_UNAVAILABLE");
    expect(adapter.execute).not.toHaveBeenCalled();
    expect(f.query.mock.calls.some(([sql]) => sql.includes("mon2_command"))).toBe(false);
    expect(f.inTransaction()).toBe(false);
  });
  it("enabled subscription claims check the shared latch inside the claim transaction", async () => {
    vi.stubEnv("JOBGUARD_COMMERCIAL_OUTBOUND", "enabled");
    const f = fixture(true), adapter = { execute: vi.fn(), reconcile: vi.fn() };
    await expect(new SubscriptionExecutor(new SubscriptionRepository(f.pool), adapter).execute(
      f.context, "a".repeat(64), randomUUID(), randomUUID(), 1,
    )).rejects.toThrow("SUBSCRIPTION_UNAVAILABLE"); // Protocol double deliberately stops at SQL claim.
    const sql = f.query.mock.calls.map(([sql]) => sql);
    const gate = sql.indexOf("SELECT outbound_control.claims_enabled() AS enabled");
    const claim = sql.findIndex(value => value.includes("mon2_command"));
    expect(gate).toBeGreaterThan(sql.lastIndexOf("BEGIN")); expect(claim).toBeGreaterThan(gate);
    expect(sql.at(-1)).toBe("ROLLBACK"); expect(adapter.execute).not.toHaveBeenCalled();
  });
  it("enabled legacy authorization still invokes its adapter once", async () => {
    vi.stubEnv("JOBGUARD_COMMERCIAL_OUTBOUND", "enabled");
    const f = fixture(true), invoke = vi.fn(async () => "synthetic");
    await expect(withTenant(f.pool, f.context, db => executeAuthorizedCommercialAction(db, randomUUID(), {
      actionType: "quote.send", recipient: null, contentHash: "a".repeat(64), aggregateRevision: 1,
      amountPence: null, currency: null, policyVersion: "synthetic.v1", expiresAt: new Date("2099-01-01"),
    }, invoke))).resolves.toBe("synthetic");
    expect(invoke).toHaveBeenCalledOnce();
  });
  it("the legacy exact-authorization boundary cannot invoke a commercial adapter while paused", async () => {
    vi.stubEnv("JOBGUARD_COMMERCIAL_OUTBOUND", "enabled");
    const f = fixture(), invoke = vi.fn();
    await expect(withTenant(f.pool, f.context, db => executeAuthorizedCommercialAction(db, randomUUID(), {
      actionType: "quote.send", recipient: null, contentHash: "a".repeat(64), aggregateRevision: 1,
      amountPence: null, currency: null, policyVersion: "synthetic.v1", expiresAt: new Date("2099-01-01"),
    }, invoke))).rejects.toThrow("AUTHORIZATION_INVALID");
    expect(invoke).not.toHaveBeenCalled();
  });
  it("enabled contractor delivery reaches the checked claim, still within the transaction", async () => {
    vi.stubEnv("JOBGUARD_COMMERCIAL_OUTBOUND", "enabled");
    const f = fixture(true);
    await new ContractorBillingDelivery(f.pool, new Map()).execute(f.context, randomUUID(), randomUUID(), randomUUID());
    const sql = f.query.mock.calls.map(([sql]) => sql);
    expect(sql.indexOf("SELECT outbound_control.claims_enabled() AS enabled")).toBeLessThan(sql.findIndex(value => value.includes("cb_delivery_step")));
    expect(sql.at(-1)).toBe("COMMIT");
  });
});
