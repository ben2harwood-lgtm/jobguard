import { fakeAuditAppend } from "./audit-protocol-test-fixture.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { MaterialRepository, type MaterialRateInput } from "./material-repository.js";
import { ActionExecutor, type OutboundAdapter } from "./outbox.js";
import { migrate, MIGRATION_URLS } from "./migrate.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

const tenantId = randomUUID();
const context = verifiedTenantContextForQueuedJob(tenantId);
const rate: MaterialRateInput = {
  merchantName: "Fictional merchant", sku: "SYNTHETIC-08", description: "Synthetic item",
  pricePence: 1200, priceUnit: "each", taxBasis: "gross", effectiveFrom: "2026-10-01",
  sourceLabel: "synthetic audit fixture", expectedVersion: 0,
};
type Query = (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number }>;
const poolWithQuery = (query: Query) => ({
  connect: async () => ({ query, release: () => undefined }),
}) as unknown as Pool;
const transactionSql = (sql: string) => ["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)
  || sql.startsWith("SELECT set_config")
  || sql.startsWith("SELECT pg_advisory_xact_lock(");
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};

// SQL protocol doubles reproduce application behavior locally. The companion
// PostgreSQL suite is required evidence for SQL predicates, locking and commits.
describe("AUDIT-FIX-DBSRC-08 blocking regressions (SQL protocol doubles)", () => {
  it("gross material rates require tax review", async () => {
    let storedRate: unknown[] = [], requirement: unknown[] = [];
    const query: Query = async (sql, values = []) => {
      if (sql.startsWith("SELECT m.id")) return { rows: [] };
      if (sql.startsWith("SELECT coalesce(max(revision)")) return { rows: [{ revision: 0 }] };
      if (sql.startsWith("INSERT INTO app.material_rate_revision")) storedRate = values;
      if (sql.startsWith("INSERT INTO app.material_requirement")) requirement = values;
      if (sql.startsWith("SELECT q.id")) return { rows: [{
        id: requirement[0], quantity: requirement[5], unit: requirement[6],
        rateId: storedRate[0], pricePence: String(storedRate[5]),
        priceUnit: storedRate[6], taxBasis: storedRate[7],
      }] };
      if (transactionSql(sql) || sql.startsWith("INSERT INTO app.")
        || sql.startsWith("SELECT pg_advisory_xact_lock")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    };
    const repo = new MaterialRepository(poolWithQuery(query));
    const saved = await repo.addRate(context, rate);
    const jobId = randomUUID();
    await repo.addRequirement(context, {
      jobId, scopeItemId: randomUUID(), skuId: saved.skuId,
      quantity: "10", unit: "each", expectedRevision: 0,
    });
    const [view] = await repo.view(context, jobId, "2026-10-13");
    expect(view.status).toBe("review");
    expect(view).not.toHaveProperty("netPence");
  });

  it("demoted approver cannot execute queued sends", async () => {
    const id = randomUUID();
    let role = "owner", status = "pending";
    const row = {
      id, adapter: "fake_capture", authorization_id: randomUUID(), provider_effect_key: "synthetic:08",
      action_type: "send_quote", recipient: "customer@example.invalid", content_hash: "a".repeat(64),
      immutable_content: "Approved synthetic quote", aggregate_revision: 1,
      amount_pence: null, currency: null, policy_version: "synthetic.v1",
      authorization_expires_at: new Date("2099-01-01"), created_at: new Date(), status,
    };
    const query: Query = async (sql, values = []) => {
      if (sql.startsWith("SELECT o.*")) {
        // Model the membership predicate against the current stored role.
        const permitted = !/m\.role\s*=\s*'owner'/u.test(sql) || role === "owner";
        return { rows: permitted ? [{ ...row, status }] : [] };
      }
      if (sql.startsWith("SELECT count(*)")) return { rows: [{ n: 0 }] };
      if (sql.includes("FROM app.append_audit(")) return { rows: fakeAuditAppend(String(values?.[0]), tenantId) };
      if (sql.startsWith("SELECT nullif(current_setting")) return { rows: [{ tenant_id: tenantId }] };
      if (sql.startsWith("UPDATE app.action_outbox SET status='executing'")) status = "executing";
      if (sql.startsWith("UPDATE app.action_outbox SET status=$2")) status = String(values[1]);
      if (transactionSql(sql) || sql.startsWith("UPDATE ") || sql.startsWith("INSERT ")) return { rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    };
    const adapter: OutboundAdapter = {
      name: "fake_capture", supportsProviderDeduplication: false,
      deliver: vi.fn(async () => ({ kind: "succeeded" as const, providerReference: "synthetic:08" })),
      reconcile: async () => "unknown",
    };
    // The queued row was approved while the actor was an owner.
    role = "read_only";
    await new ActionExecutor(poolWithQuery(query), new Map([[adapter.name, adapter]]), { emit: () => undefined })
      .execute(context, id);
    expect(adapter.deliver).not.toHaveBeenCalled();
    expect(status).not.toBe("succeeded");
  });

  it("concurrent first rate saves create one catalogue identity", async () => {
    const committed: { merchant: unknown[][]; sku: unknown[][]; rate: unknown[][] } = {
      merchant: [], sku: [], rate: [],
    };
    const bothReads = deferred();
    let reads = 0, lockTail = Promise.resolve();
    const pool = { connect: async () => {
      const staged = { merchant: [] as unknown[][], sku: [] as unknown[][], rate: [] as unknown[][] };
      let locked = false, unlock: (() => void) | undefined;
      const query: Query = async (sql, values = []) => {
        if (sql.startsWith("SELECT pg_advisory_xact_lock")) {
          const previous = lockTail, acquired = deferred();
          lockTail = acquired.promise;
          await previous;
          locked = true;
          unlock = acquired.resolve;
        } else if (sql.startsWith("SELECT m.id")) {
          const rows = committed.rate.map(r => ({ merchantId: r[2], skuId: r[3], version: r[4] }));
          // Force the unprotected implementation's two reads to see no identity.
          // A transaction lock must precede this read, so the fixed path serializes.
          if (!locked && reads++ < 2) {
            if (reads === 2) bothReads.resolve();
            await bothReads.promise;
          }
          return { rows };
        } else if (sql.startsWith("INSERT INTO app.merchant(")) staged.merchant.push(values);
        else if (sql.startsWith("INSERT INTO app.merchant_sku(")) staged.sku.push(values);
        else if (sql.startsWith("INSERT INTO app.material_rate_revision(")) staged.rate.push(values);
        else if (sql === "COMMIT") {
          committed.merchant.push(...staged.merchant);
          committed.sku.push(...staged.sku);
          committed.rate.push(...staged.rate);
          unlock?.();
        } else if (sql === "ROLLBACK") unlock?.();
        else if (!transactionSql(sql)) throw new Error(`Unexpected SQL: ${sql}`);
        return { rows: [] };
      };
      return { query, release: () => undefined };
    } } as unknown as Pool;
    const repo = new MaterialRepository(pool);
    const results = await Promise.allSettled([repo.addRate(context, rate), repo.addRate(context, rate)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find(r => r.status === "rejected");
    expect(failure).toMatchObject({ status: "rejected", reason: new Error("STALE_MATERIAL_RATE_REVISION") });
    expect(committed.merchant).toHaveLength(1);
    expect(committed.sku).toHaveLength(1);
    expect(committed.rate).toHaveLength(1);
  });

  it("migration commit survives lost acknowledgement", async () => {
    const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
    const target = "0031_material_rates.sql";
    const applied = new Set(names.slice(0, names.indexOf(target)));
    const priorData = ["synthetic prior row"];
    let merchantTable = false, loseAcknowledgement = true;
    const query: Query = async (sql, values = []) => {
      if (sql.startsWith("CREATE TABLE IF NOT EXISTS public.jobguard_schema_migration")) return { rows: [] };
      if (sql.startsWith("SELECT 1 FROM public.jobguard_schema_migration")) {
        return { rows: [], rowCount: applied.has(String(values[0])) ? 1 : 0 };
      }
      if (sql.startsWith("INSERT INTO public.jobguard_schema_migration")) {
        applied.add(String(values[0]));
        return { rows: [] };
      }
      // Simulate committed server effects followed by transport/process loss.
      if (sql.includes("CREATE TABLE app.merchant(")) {
        if (merchantTable) throw new Error("relation merchant already exists");
        merchantTable = true;
        const record = /INSERT INTO public\.jobguard_schema_migration\(migration_name\) VALUES\('([^']+)'\)/u.exec(sql);
        if (record && sql.indexOf(record[0]) < sql.lastIndexOf("COMMIT;")) applied.add(record[1]!);
        if (loseAcknowledgement) {
          loseAcknowledgement = false;
          throw new Error("synthetic lost acknowledgement after commit");
        }
      } else {
        const record = /INSERT INTO public\.jobguard_schema_migration\(migration_name\) VALUES\('([^']+)'\)/u.exec(sql);
        if (record) applied.add(record[1]!);
      }
      return { rows: [] };
    };
    const connection = { query } as unknown as Pick<Pool, "query">;
    await expect(migrate(connection)).rejects.toThrow("synthetic lost acknowledgement after commit");
    await expect(migrate(connection)).resolves.toBeUndefined();
    expect([...applied].filter(name => name === target)).toHaveLength(1);
    expect(priorData).toEqual(["synthetic prior row"]);
  });
  it("accepts a migration whose BEGIN follows leading comment and blank lines", async () => {
    const target = "0153_quote_supersession_guard.sql";
    const sent: string[] = [];
    const connection = { query: async (sql: string, values?: unknown[]) => {
      if (sql.startsWith("SELECT 1 FROM public.jobguard_schema_migration")) return { rows: [], rowCount: values?.[0] === target ? 0 : 1 };
      if (!sql.startsWith("CREATE TABLE IF NOT EXISTS")) sent.push(sql);
      return { rows: [], rowCount: 0 };
    } } as unknown as Pick<Pool, "query">;
    await expect(migrate(connection)).resolves.toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.startsWith("--")).toBe(true);
    expect(sent[0]).toMatch(/VALUES\('0153_quote_supersession_guard\.sql'\) ON CONFLICT DO NOTHING;\nCOMMIT;\n$/u);
  });
});
