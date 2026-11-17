import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ActionExecutor, appendOutboundAction, MaterialRepository, migrate, withTenant,
  type OutboundAction, type OutboundAdapter } from "../src/index.js";
import { MIGRATION_URLS } from "../src/migrate.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, databaseDir: string, port: number;
const tenantId = randomUUID(), jobId = randomUUID(), scopeItemId = randomUUID();
const context = testTenantContext(tenantId);
const rate = {
  merchantName: "Fictional gross merchant", sku: "SYNTHETIC-08", description: "Synthetic item",
  pricePence: 1200, priceUnit: "each" as const, taxBasis: "gross" as const,
  effectiveFrom: "2026-10-01", sourceLabel: "synthetic audit fixture", expectedVersion: 0,
};
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
};

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "jg-dbsrc08-"));
  port = await freePort(59900, 400);
  postgres = new EmbeddedPostgres({ databaseDir, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise();
  await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: "synthetic" });
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
  await importWatchdogFixtureJob(admin, tenantId, jobId);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",
    [scopeItemId, tenantId, jobId]);
  // Test-only login inherits the existing runtime role; no product privilege changes.
  await admin.query("CREATE ROLE dbsrc08_runtime LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO dbsrc08_runtime");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "dbsrc08_runtime", password: "synthetic", max: 5 });
}, 60_000);

afterAll(async () => {
  await closeTestPools(runtime, admin);
  await postgres?.stop();
  if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
});

describe("AUDIT-FIX-DBSRC-08 real PostgreSQL regressions", () => {
  it("gross material rates require tax review", async () => {
    const repo = new MaterialRepository(runtime);
    const saved = await repo.addRate(context, rate);
    await repo.addRequirement(context, { jobId, scopeItemId, skuId: saved.skuId,
      quantity: "10", unit: "each", expectedRevision: 0 });
    const [view] = await repo.view(context, jobId, "2026-10-13");
    expect(view.status).toBe("review");
    expect(view).not.toHaveProperty("netPence");
  });

  it("demoted approver cannot execute queued sends", async () => {
    const actorId = randomUUID(), userId = randomUUID(), accountId = randomUUID();
    const decisionId = randomUUID(), resolutionId = randomUUID(), authorizationId = randomUUID();
    const content = "Synthetic owner-approved quote", contentHash = createHash("sha256").update(content).digest("hex");
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
    await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic audit account')", [accountId, tenantId]);
    await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
      [actorId, tenantId, accountId, userId]);
    await admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'quote','synthetic-08','send_quote')",
      [decisionId, tenantId]);
    await admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)",
      [resolutionId, tenantId, decisionId, actorId]);
    await admin.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,
      action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at)
      VALUES($1,$2,$3,$4,$5,'send_quote','customer@example.invalid',$6,1,'synthetic.v1','2099-01-01')`,
    [authorizationId, tenantId, decisionId, resolutionId, actorId, contentHash]);
    const action: OutboundAction = { version: "outbound-action.v1", id: randomUUID(), authorizationId,
      adapter: "fake_capture", providerEffectKey: `synthetic:${authorizationId}`, actionType: "send_quote",
      recipient: "customer@example.invalid", contentHash, immutableContent: content, aggregateRevision: 1,
      amountPence: null, currency: null, policyVersion: "synthetic.v1", authorizationExpiresAt: new Date("2099-01-01") };
    await withTenant(runtime, context, db => appendOutboundAction(db, tenantId, action));
    await admin.query("UPDATE app.membership SET role='read_only' WHERE tenant_id=$1 AND id=$2", [tenantId, actorId]);
    const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false,
      deliver: vi.fn(async () => ({ kind: "succeeded" as const, providerReference: "synthetic:08" })), reconcile: async () => "unknown" };
    await new ActionExecutor(runtime, new Map([[adapter.name, adapter]]), { emit: () => undefined }).execute(context, action.id);
    expect(adapter.deliver).not.toHaveBeenCalled();
    const state = await withTenant(runtime, context, async db => ({
      action: (await db.$client.query("SELECT status FROM app.action_outbox WHERE id=$1", [action.id])).rows[0],
      attempts: (await db.$client.query("SELECT * FROM app.action_attempt WHERE action_id=$1", [action.id])).rows,
    }));
    expect(state.action.status).toBe("pending");
    expect(state.attempts).toEqual([]);
  });

  it("concurrent first rate saves create one catalogue identity", async () => {
    const bothEmptyReads = deferred(), bothConnections = deferred();
    let emptyReads = 0, connections = 0;
    const backendIds = new Set<number>();
    const racingPool = { connect: async () => {
      const client = await runtime.connect();
      backendIds.add((await client.query("SELECT pg_backend_pid() AS id")).rows[0].id);
      if (++connections === 2) bothConnections.resolve();
      await bothConnections.promise;
      let locked = false;
      return {
        query: async (sql: string, values?: unknown[]) => {
          const result = await client.query(sql, values);
          if (sql.startsWith("SELECT pg_advisory_xact_lock")) locked = true;
          // Without a lock, hold both empty snapshots before either insert.
          // With a lock, the second connection waits in PostgreSQL before reading.
          if (!locked && sql.startsWith("SELECT m.id") && result.rows.length === 0) {
            if (++emptyReads === 2) bothEmptyReads.resolve();
            await bothEmptyReads.promise;
          }
          return result;
        },
        release: () => client.release(),
      };
    } } as unknown as Pool;
    const repo = new MaterialRepository(racingPool);
    const input = { ...rate, merchantName: "Fictional racing merchant", taxBasis: "net" as const };
    const results = await Promise.allSettled([repo.addRate(context, input), repo.addRate(context, input)]);
    expect(backendIds.size).toBe(2);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected"))
      .toMatchObject({ status: "rejected", reason: new Error("STALE_MATERIAL_RATE_REVISION") });
    const counts = await withTenant(runtime, context, async db => (await db.$client.query(`
      SELECT count(DISTINCT m.id)::int merchants,count(DISTINCT s.id)::int skus,count(DISTINCT r.id)::int rates
      FROM app.merchant m JOIN app.merchant_sku s ON (s.tenant_id,s.merchant_id)=(m.tenant_id,m.id)
      JOIN app.material_rate_revision r ON (r.tenant_id,r.merchant_id,r.sku_id)=(m.tenant_id,m.id,s.id)
      WHERE m.tenant_id=$1 AND lower(m.name)=lower($2) AND s.sku=$3`,
    [tenantId, input.merchantName, input.sku])).rows[0]);
    expect(counts).toEqual({ merchants: 1, skus: 1, rates: 1 });
  });

  it("migration commit survives lost acknowledgement", async () => {
    await admin.query("CREATE DATABASE dbsrc08_upgrade");
    const options = { host: "127.0.0.1", port, database: "dbsrc08_upgrade", user: "postgres", password: "synthetic" };
    let upgrade = new Pool(options);
    const priorTenant = randomUUID();
    try {
      await upgrade.query(`CREATE TABLE public.jobguard_schema_migration (
        migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
      for (const url of MIGRATION_URLS) {
        const name = url.pathname.split("/").at(-1)!;
        if (name === "0031_material_rates.sql") break;
        await upgrade.query(await readFile(url, "utf8"));
        await upgrade.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
      }
      await upgrade.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [priorTenant]);
      const prior = (await upgrade.query("SELECT * FROM control_plane.tenant WHERE id=$1", [priorTenant])).rows;
      let lost = false;
      const faultyConnection = { query: async (sql: string, values?: unknown[]) => {
        const result = await upgrade.query(sql, values);
        if (!lost && sql.includes("CREATE TABLE app.merchant(")) {
          lost = true;
          throw new Error("synthetic lost acknowledgement after commit");
        }
        return result;
      } } as unknown as Pick<Pool, "query">;
      await expect(migrate(faultyConnection)).rejects.toThrow("synthetic lost acknowledgement after commit");
      await closeTestPools(upgrade);
      upgrade = new Pool(options);
      await expect(migrate(upgrade)).resolves.toBeUndefined();
      expect((await upgrade.query("SELECT migration_name FROM public.jobguard_schema_migration WHERE migration_name=$1",
        ["0031_material_rates.sql"])).rows).toEqual([{ migration_name: "0031_material_rates.sql" }]);
      expect((await upgrade.query("SELECT * FROM control_plane.tenant WHERE id=$1", [priorTenant])).rows).toEqual(prior);
    } finally {
      await closeTestPools(upgrade);
    }
  }, 60_000);
});
