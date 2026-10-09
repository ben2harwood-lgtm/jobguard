import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ContractorRepository, MIGRATION_URLS, SorRepository, WorkOrderRepository, demoFile, demoRow, migrate, prepareWorkOrderDemo, verifyAuditChain, verifiedTenantContextFromMembership, withTenant,
  type AuditEvent, type AuthenticatedMembership,
} from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, contractors: ContractorRepository, orders: WorkOrderRepository, rates: SorRepository;
const ctx = (p: AuthenticatedMembership) => verifiedTenantContextFromMembership(p);
const TABLES = ["work_order", "work_order_revision", "work_order_line", "work_order_current", "import_batch", "import_row_receipt", "job_assignment", "scope_identity", "job", "contractor_party_binding", "command_receipt", "audit_event"];
const counts = async (tenantId: string) => Object.fromEntries(await Promise.all(TABLES.map(async t => [t, (await admin.query(`SELECT count(*)::int n FROM app.${t} WHERE tenant_id=$1`, [tenantId])).rows[0].n as number])));
async function org() { const p = await contractors.startPractice(randomUUID()); const demo = await prepareWorkOrderDemo(runtime, p); return { p, demo }; }
const importOf = (p: AuthenticatedMembership, csv: string, commandId: string = randomUUID(), name = "concurrent.csv") => orders.importCsv(p, { commandId, name, kind: "csv", csv });
async function auditChain(tenantId: string): Promise<AuditEvent[]> {
  const rows = (await admin.query(`SELECT id,tenant_id "tenantId",sequence::int,version,actor_ref "actorRef",event_type "eventType",subject_type "subjectType",subject_ref "subjectRef",occurred_at "occurredAt",payload,trim(payload_hash) "payloadHash",trim(previous_hash) "previousHash",trim(event_hash) "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [tenantId])).rows;
  return rows as AuditEvent[];
}
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-ent2-conc-")); const port = await freePort(59800, 300);
  postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" }); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("/0110_work_orders.sql")); expect(own).toBeGreaterThan(0);
  for (const url of MIGRATION_URLS.slice(0, own)) { await admin.query(await readFile(url, "utf8")); await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]); }
  await migrate(admin);
  // A short deadlock timeout makes any lock-order inversion between the concurrent writers fail the run instead of waiting.
  await admin.query("ALTER DATABASE jobguard_synthetic_demo SET deadlock_timeout = '200ms'");
  await admin.query("CREATE ROLE ent2_conc_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO ent2_conc_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "ent2_conc_login", password: "synthetic", database: "jobguard_synthetic_demo", max: 12 });
  contractors = new ContractorRepository(runtime); orders = new WorkOrderRepository(runtime); rates = new SorRepository(runtime);
}, 180000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

describe("ENT-2 DW1 concurrent imports", () => {
  it("two (and three) concurrent imports of one file, on separate connections, produce exactly one set of rows and one verifiable audit chain", async () => {
    const { p, demo } = await org(); const N = 150; const csv = demoFile(Array.from({ length: N }, (_, i) => demoRow(demo, i + 1)));
    const before = await counts(p.tenantId);
    const results = await Promise.all([importOf(p, csv), importOf(p, csv), importOf(p, csv)]);
    expect(results.filter(r => !r.replayed)).toHaveLength(1); expect(results.filter(r => r.replayed)).toHaveLength(2);
    expect(new Set(results.map(r => r.batchId)).size).toBe(1);
    for (const r of results) expect(r.counts).toEqual({ rows: N, created: N, revised: 0, unchanged: 0, rejected: 0 });
    const after = await counts(p.tenantId);
    expect(after).toMatchObject({ work_order: N, work_order_revision: N, work_order_line: 2 * N, job: N, contractor_party_binding: N, import_batch: 1, import_row_receipt: N, job_assignment: 2 * N, scope_identity: 2 * N });
    // Exactly one bound job per order, one order per reference, one live job each.
    expect((await admin.query("SELECT count(DISTINCT reference)::int n, count(*)::int total FROM app.work_order WHERE tenant_id=$1", [p.tenantId])).rows[0]).toEqual({ n: N, total: N });
    expect((await admin.query("SELECT count(*)::int n FROM app.job WHERE tenant_id=$1 AND provenance='work_order' AND status='live'", [p.tenantId])).rows[0].n).toBe(N);
    expect(after.audit_event! - before.audit_event!).toBe(2 * N + 1);
    verifyAuditChain(await auditChain(p.tenantId));
  }, 300000);
  it("the same command and the same file racing is one import; the same command with a different file conflicts", async () => {
    const { p, demo } = await org(); const commandId = randomUUID();
    const a = demoFile([demoRow(demo, 1), demoRow(demo, 2)]), b = demoFile([demoRow(demo, 3)]);
    const same = await Promise.all([importOf(p, a, commandId), importOf(p, a, commandId)]);
    expect(same.map(r => r.replayed).sort()).toEqual([false, true]); expect(same[0]!.batchId).toBe(same[1]!.batchId);
    const mixed = await Promise.allSettled([importOf(p, a, commandId), importOf(p, b, commandId)]);
    expect(mixed[0]).toMatchObject({ status: "fulfilled", value: { replayed: true } }); expect(mixed[1]).toMatchObject({ status: "rejected", reason: { code: "COMMAND_CONFLICT" } });
    expect((await counts(p.tenantId)).work_order).toBe(2);
    const fresh = randomUUID(); const racing = await Promise.allSettled([importOf(p, b, fresh), importOf(p, demoFile([demoRow(demo, 4)]), fresh)]);
    expect(racing.map(r => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect((racing.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "COMMAND_CONFLICT" });
  });
  it("two different files that both create one order reference: one creates it, the other is told its revision is stale, and only one job and binding exist", async () => {
    const { p, demo } = await org();
    const one = demoFile([demoRow(demo, 1, { priority: "routine" })]), two = demoFile([demoRow(demo, 1, { priority: "urgent" })]);
    const [a, b] = await Promise.all([importOf(p, one), importOf(p, two)]);
    expect([a.counts.created + b.counts.created, a.counts.rejected + b.counts.rejected]).toEqual([1, 1]);
    expect([a, b].flatMap(r => r.rows).filter(r => r.outcome === "rejected")[0]).toMatchObject({ errorCode: "STALE_REVISION" });
    expect(await counts(p.tenantId)).toMatchObject({ work_order: 1, job: 1, contractor_party_binding: 1, work_order_revision: 1 });
  });
  it("two files revising one order from the same revision: one wins, the other is stale, and the history is a straight line", async () => {
    const { p, demo } = await org(); await importOf(p, demoFile([demoRow(demo, 1)]));
    const [a, b] = await Promise.all([importOf(p, demoFile([demoRow(demo, 1, { expectedRevision: 1, priority: "routine" })])), importOf(p, demoFile([demoRow(demo, 1, { expectedRevision: 1, priority: "emergency" })]))]);
    expect([a.counts.revised + b.counts.revised, a.counts.rejected + b.counts.rejected]).toEqual([1, 1]);
    expect((await admin.query("SELECT revision FROM app.work_order_revision WHERE tenant_id=$1 ORDER BY revision", [p.tenantId])).rows.map(r => r.revision)).toEqual([1, 2]);
  });
  it("an import, an SoR import and an ENT-1 administration command in one tenant all complete (no lock-order deadlock), in either arrival order", async () => {
    const { p, demo } = await org(); const v = await contractors.query(p, { version: "contractor-query.v1", tenantId: p.tenantId, resource: "organisation" });
    for (let round = 0; round < 3; round++) {
      const settled = await Promise.allSettled([
        importOf(p, demoFile(Array.from({ length: 20 }, (_, i) => demoRow(demo, round * 100 + i + 1)))),
        rates.importVersion(p, { version: "sor-version-import.v1", environment: "synthetic_demo", commandId: randomUUID(), scheduleId: randomUUID(), reference: `Race ${round}`, effectiveFrom: "2027-01-01", items: [{ code: "R", description: "r", unit: "each", rate: { pence: 1, currency: "GBP" } }] }),
        contractors.command(p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: 9999, kind: "team.create", branchId: v.teams[0]!.branch_id, name: `Race ${round}` }),
        importOf(p, demoFile([demoRow(demo, round * 100 + 50)])),
      ]);
      expect(settled[0]!.status).toBe("fulfilled"); expect(settled[1]!.status).toBe("fulfilled"); expect(settled[3]!.status).toBe("fulfilled");
      // The stale ENT-1 command is refused for its revision, never by a deadlock or a timeout.
      expect(settled[2]).toMatchObject({ status: "rejected", reason: { code: "STALE_REVISION" } });
    }
    verifyAuditChain(await auditChain(p.tenantId));
  }, 120000);
  it("two tenants import in parallel without touching each other", async () => {
    const [a, b] = await Promise.all([org(), org()]);
    await Promise.all([importOf(a.p, demoFile(Array.from({ length: 40 }, (_, i) => demoRow(a.demo, i + 1)))), importOf(b.p, demoFile(Array.from({ length: 30 }, (_, i) => demoRow(b.demo, i + 1))))]);
    expect([(await counts(a.p.tenantId)).work_order, (await counts(b.p.tenantId)).work_order]).toEqual([40, 30]);
    expect(await withTenant(runtime, ctx(a.p), async db => (await db.$client.query("SELECT count(*)::int n FROM app.work_order")).rows[0].n)).toBe(40);
  }, 120000);
});
