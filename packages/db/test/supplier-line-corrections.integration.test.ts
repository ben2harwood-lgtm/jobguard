import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type SupplierLineMatchInput } from "@jobguard/core";
import { migrate } from "../src/migrate.js";
import { SupplierLineCorrectionRepository } from "../src/supplier-line-correction-repository.js";
import { appendAuditBatch } from "../src/audit.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let pg: EmbeddedPostgres, directory: string, admin: Pool, runtime: Pool, repo: SupplierLineCorrectionRepository;
const tenant = randomUUID(), other = randomUUID(), job = randomUUID(), wrongJob = randomUUID(), otherJob = randomUUID();
const actor = { membershipId: randomUUID(), identityUserId: randomUUID() };
const otherActor = { membershipId: randomUUID(), identityUserId: randomUUID() };
const ctx = testTenantContext(tenant), otherCtx = testTenantContext(other);
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  directory = await mkdtemp(join(tmpdir(), "jg-line-corrections-"));
  const port = await freePort(58000, 250);
  pg = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await pg.initialise(); await pg.start();
  const connection = { host: "127.0.0.1", port, database: "postgres", password: "synthetic" };
  admin = new Pool({ ...connection, user: "postgres" });
  // Upgrade from the complete base; preserve its jobs and membership rows byte-for-byte.
  await migrate({ query: async (sql: string, values?: unknown[]) => {
    if (sql.startsWith("SELECT 1 FROM public.jobguard_schema_migration") && String(values?.[0]) === "0494_supplier_line_corrections.sql")
      return { rows: [{}], rowCount: 1 };
    return admin.query(sql, values);
  } } as Pick<Pool, "query">);
  await installLegacySyntheticPartyFixtures(admin);
  for (const [t, a, j] of [[tenant, actor, job], [other, otherActor, otherJob]] as const) {
    const account = randomUUID();
    await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [t]);
    await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [a.identityUserId]);
    await admin.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional correction account')", [t, account]);
    await admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
      [t, a.membershipId, account, a.identityUserId]);
    await admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional matching job','live')", [t, j]);
  }
  await admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional second job','live')", [tenant, wrongJob]);
  const before = (await admin.query("SELECT to_jsonb(j) data FROM app.job j ORDER BY id")).rows;
  await migrate(admin); await migrate(admin);
  expect((await admin.query("SELECT to_jsonb(j) data FROM app.job j ORDER BY id")).rows).toEqual(before);
  await admin.query("ALTER ROLE jobguard_runtime LOGIN PASSWORD 'synthetic'");
  runtime = new Pool({ ...connection, user: "jobguard_runtime", max: 4 });
  repo = new SupplierLineCorrectionRepository(runtime);
}, 60000);
afterAll(async () => { await closeTestPools(runtime, admin); await pg?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); });

function line() { return { lineId: randomUUID(), versionId: randomUUID(), documentVersionId: randomUUID(), sourceHash: randomUUID().replaceAll("-", "").repeat(2),
  page: 1, sku: "TIMBER", orderReference: "PO-1", unit: "each", baseUnit: "each", unitsPerPack: "1" }; }
async function fixture() {
  const order = { ...line(), quantity: "10", unitNetPence: 100, discountBps: 0, rateVersionId: randomUUID(), validFrom: "2030-01-01", validTo: "2030-01-31" };
  const facts: SupplierLineMatchInput = { version: "supplier-line-match-input.v1", environment: "synthetic_demo", tenantId: tenant,
    jobId: job, merchantId: randomUUID(), orders: [order, { ...order, ...line() }], receipts: [{ ...line(), acceptedQuantity: "8" }],
    bills: [{ ...line(), kind: "invoice", documentReference: "INV-1", quantity: "10", netPence: 1000,
      taxBasis: "net", supplyDate: "2030-01-02", creditsInvoiceVersionId: null }], aliases: [], mappings: [] };
  const input = { version: "supplier-line-snapshot.v1", commandId: randomUUID(), snapshotId: randomUUID(), facts };
  const initial = await repo.create(ctx, actor, input);
  const command = { version: "supplier-line-correction.v1", commandId: randomUUID(), snapshotId: input.snapshotId,
    expectedRevision: 0, sourceVersionId: facts.bills[0]!.versionId, orderVersionId: facts.orders[0]!.versionId };
  const read = { version: "supplier-line-match-read.v1", jobId: job, snapshotId: input.snapshotId };
  return { facts, input, initial, command, read };
}
describe("M2-4 durable audited reviewer corrections (PostgreSQL)", () => {
  it("serializes concurrent corrections with a revision conflict rather than lost updates", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([repo.correct(ctx, actor, job, f.command),
      repo.correct(ctx, actor, job, { ...f.command, commandId: randomUUID(), orderVersionId: f.facts.orders[1]!.versionId })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "MATCH_REVISION_CONFLICT" } });
    const current = await repo.read(ctx, actor, f.read);
    expect(current.revision).toBe(1); expect(current.history).toHaveLength(1);
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2",
      [tenant, current.history[0]!.id])).rows[0].n).toBe(1);
  });
  it("replays concurrent identical commands once and refuses cross-command-kind reuse", async () => {
    const f = await fixture();
    const [one,two] = await Promise.all([repo.correct(ctx, actor, job, f.command), repo.correct(ctx, actor, job, f.command)]);
    expect(two).toEqual(one); expect(one.history).toHaveLength(1);
    await expect(repo.correct(ctx, actor, job, { ...f.command, commandId: f.input.commandId })).rejects.toThrow("MATCH_IDEMPOTENCY_CONFLICT");
  });
  it("keeps originals immutable, resolves ambiguity explicitly and reproduces every historical result", async () => {
    const f = await fixture(), before = structuredClone(f.facts);
    expect(f.initial.result.unresolved).toHaveLength(2);
    const first = await repo.correct(ctx, actor, job, f.command);
    expect(first.result.unresolved).toHaveLength(1);
    const second = await repo.correct(ctx, actor, job, { ...f.command, commandId: randomUUID(), expectedRevision: 1,
      sourceVersionId: f.facts.receipts[0]!.versionId });
    expect(second.result.unresolved).toEqual([]);
    expect(second.result.groups.flatMap(g => g.issues).map(i => i.code)).toEqual(expect.arrayContaining(["short_delivery", "billed_above_received"]));
    expect(await repo.read(ctx, actor, f.read)).toEqual(second);
    expect(await repo.read(ctx, actor, { ...f.read, revision: 1 })).toEqual(first);
    expect(await repo.read(ctx, actor, { ...f.read, revision: 0 })).toEqual(f.initial);
    expect(await repo.correct(ctx, actor, job, f.command)).toEqual(first);
    expect(await repo.create(ctx, actor, f.input)).toEqual(f.initial);
    expect(f.facts).toEqual(before);
    const stored = (await admin.query("SELECT facts FROM app.supplier_line_match_snapshot WHERE tenant_id=$1 AND id=$2", [tenant, f.input.snapshotId])).rows[0].facts;
    expect(stored).toEqual(before);
    for (const key of ["orders", "receipts", "bills", "aliases"] as const) expect(second.facts[key]).toEqual(before[key]);
    await expect(repo.correct(ctx, actor, job, { ...f.command, orderVersionId: null })).rejects.toThrow("MATCH_IDEMPOTENCY_CONFLICT");
  });
  it("refuses another tenant's snapshot and same-tenant wrong-job corrections without disclosure", async () => {
    const f = await fixture();
    await expect(repo.correct(otherCtx, otherActor, otherJob, f.command)).rejects.toThrow("MATCH_NOT_FOUND");
    await expect(repo.read(otherCtx, otherActor, f.read)).rejects.toThrow("MATCH_NOT_FOUND");
    await expect(repo.correct(ctx, actor, wrongJob, f.command)).rejects.toThrow("MATCH_NOT_FOUND");
    await expect(repo.create(otherCtx, otherActor, { ...f.input, commandId: randomUUID() })).rejects.toThrow("MATCH_SCOPE_CONFLICT");
    expect((await repo.read(ctx, actor, f.read)).revision).toBe(0);
  });
  it("rejects absent source versions and restores unresolved matching when a mapping is withdrawn", async () => {
    const f = await fixture();
    await expect(repo.correct(ctx, actor, job, { ...f.command, sourceVersionId: randomUUID() })).rejects.toThrow("MATCH_SOURCE_VERSION_CONFLICT");
    await repo.correct(ctx, actor, job, f.command);
    const withdrawn = await repo.correct(ctx, actor, job, { ...f.command, commandId: randomUUID(), expectedRevision: 1, orderVersionId: null });
    expect(withdrawn.result).toEqual(f.initial.result);
    expect(withdrawn.history).toHaveLength(2);
  });
  it("rechecks membership and identity, including on replays, and fails closed outside synthetic mode", async () => {
    const f = await fixture();
    await expect(repo.correct(ctx, otherActor, job, f.command)).rejects.toThrow("MATCH_FORBIDDEN");
    await expect(repo.read(ctx, { ...actor, identityUserId: randomUUID() }, f.read)).rejects.toThrow("MATCH_FORBIDDEN");
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [tenant, actor.membershipId]);
    try { await expect(repo.create(ctx, actor, f.input)).rejects.toThrow("MATCH_FORBIDDEN"); }
    finally { await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2", [tenant, actor.membershipId]); }
    vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
    try { await expect(repo.read(ctx, actor, f.read)).rejects.toThrow("SYNTHETIC_MODE_REQUIRED"); }
    finally { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); }
  });
  it("enforces append-only grants, RLS and mandatory audit binding at the database boundary", async () => {
    const f = await fixture(); await repo.correct(ctx, actor, job, f.command);
    for (const table of ["supplier_line_match_snapshot", "supplier_line_match_correction"]) {
      for (const sql of [`UPDATE app.${table} SET request_hash=repeat('0',64)`, `DELETE FROM app.${table}`, `TRUNCATE app.${table}`])
        await expect(withTenant(runtime, ctx, db => db.$client.query(sql))).rejects.toMatchObject({ code: "42501" });
      await expect(admin.query(`DELETE FROM app.${table}`)).rejects.toMatchObject({ code: "55000" });
      expect((await withTenant(runtime, otherCtx, db => db.$client.query(`SELECT * FROM app.${table} WHERE tenant_id=$1`, [tenant]))).rows).toEqual([]);
    }
    const id = randomUUID(), commandId = randomUUID(), auditId = randomUUID();
    await expect(withTenant(runtime, ctx, async db => {
      await db.$client.query(`INSERT INTO app.supplier_line_match_snapshot
        SELECT tenant_id,$1,job_id,$2,actor_membership_id,facts,request_hash,$3,created_at
        FROM app.supplier_line_match_snapshot WHERE tenant_id=$4 AND id=$5`, [id,commandId,auditId,tenant,f.input.snapshotId]);
      await appendAuditBatch(db,[{id:auditId,version:"audit.v1",actorRef:`membership:${actor.membershipId}`,
        eventType:"supplier_line_match.created",subjectType:"supplier_line_match",subjectRef:id,
        payload:{references:{commandId},hashes:{requestHash:"f".repeat(64)}}}]);
    })).rejects.toThrow("MATCH_AUDIT_BINDING_REQUIRED");
    expect((await admin.query("SELECT 1 FROM app.supplier_line_match_snapshot WHERE tenant_id=$1 AND id=$2",[tenant,id])).rows).toEqual([]);
    await expect(withTenant(runtime, ctx, db => db.$client.query(`INSERT INTO app.supplier_line_match_correction
      SELECT tenant_id,$1,job_id,snapshot_id,$2,3,actor_membership_id,
      correction||jsonb_build_object('commandId',$2::text,'expectedRevision',2),request_hash,$3,created_at
      FROM app.supplier_line_match_correction WHERE tenant_id=$4 AND snapshot_id=$5`,
      [randomUUID(),randomUUID(),randomUUID(),tenant,f.input.snapshotId]))).rejects.toThrow("MATCH_REVISION_CONFLICT");
    await expect(withTenant(runtime, ctx, db => db.$client.query(`INSERT INTO app.supplier_line_match_snapshot
      SELECT tenant_id,$1,job_id,$2,actor_membership_id,facts,request_hash,audit_event_id,created_at
      FROM app.supplier_line_match_snapshot WHERE tenant_id=$3 AND id=$4`, [randomUUID(), randomUUID(), tenant, f.input.snapshotId])))
      .rejects.toMatchObject({ code: "23505" }); // Audit event cannot be reused.
    await expect(withTenant(runtime, ctx, db => db.$client.query(`INSERT INTO app.supplier_line_match_snapshot
      SELECT tenant_id,$1,job_id,$2,actor_membership_id,facts,request_hash,$3,created_at
      FROM app.supplier_line_match_snapshot WHERE tenant_id=$4 AND id=$5`, [randomUUID(), randomUUID(), randomUUID(), tenant, f.input.snapshotId])))
      .rejects.toThrow(); // Deferred audit FK/guard aborts the whole transaction.
  });
});
