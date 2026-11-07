import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { practiceMaterialPool } from "../src/practice-session.js";
import { publishEmptyCompletion } from "./sv5pre-fixtures.js";
import {
  createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant,
  FINAL_CHECK_ACTOR, type FinalCheckFixture, type FinalCheckJob,
} from "./final-check-fixture.js";

let f: FinalCheckFixture;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  // This fixture migrates a fresh embedded PostgreSQL 16 database, including 0667.
  f = await createFinalCheckFixture();
}, 60000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });

const lockSql = "SELECT * FROM app.lock_final_account($1,$2,$3,$4,$5,1,'final_account_declaration.v1')";
const invoiceSql = "SELECT app.issue_lock_bound_customer_invoice($1,$2,$5,$3,$4,'final','owner@example.invalid','2026-11-06'::date,$6)";
const args = (a: FinalCheckJob, command = randomUUID()) =>
  [a.tenantId, a.jobId, FINAL_CHECK_ACTOR, command, a.revisionId, "a".repeat(64)];
const lockArgs = (a: FinalCheckJob, command: string) => args(a, command).slice(0, 5);
const forbidden = (result: Promise<unknown>) => expect(result).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" });
// Use withTenant's exact tenant setup: since LP-6b the practice pool installs the digest only after that statement.
const scoped = async <T>(a: FinalCheckJob, digest: string, work: (db: PoolClient) => Promise<T>) => {
  const db = await practiceMaterialPool(f.runtime, digest).connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.tenant_id', $1, true)", [a.tenantId]);
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
};

async function effects(a: FinalCheckJob) {
  return (await f.admin.query(`SELECT
    (SELECT count(*)::int FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2) locks,
    (SELECT count(*)::int FROM app.command_receipt WHERE tenant_id=$1) receipts,
    (SELECT count(*)::int FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2) invoices,
    (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1) audits`, [a.tenantId, a.jobId])).rows[0];
}

async function importedChild(parent: FinalCheckJob) {
  const child = await seedFinalCheckJob(f);
  // Privileged synthetic fixture: a NULL-digest child plus the same trusted import
  // record shape written by adoption. No audit-event ancestry is fabricated.
  await finalCheckTenant(f.admin, child.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.job SET practice_session_digest=NULL,practice_scenario=NULL WHERE tenant_id=$1 AND id=$2", [child.tenantId, child.jobId]);
    await db.query("SET LOCAL session_replication_role='origin'");
    await db.query(`INSERT INTO app.job_import_v3
      (tenant_id,id,job_id,source_job_id,session_digest,command_id,public_request_hash,fixture_id,snapshot,result,meter_exclusion_id,meter_reason,counted_places)
      SELECT $1,$2,$3,$4,$5,command_id,$6,'fictional-extension-v3','{"lifecyclePoint":"invoiced"}','{}',$7,'imported_at_invoiced_stage',0
      FROM app.final_account_scope_disposition WHERE tenant_id=$1 AND job_id=$3 LIMIT 1`,
      [child.tenantId, randomUUID(), child.jobId, parent.jobId, parent.digest, "b".repeat(64), randomUUID()]);
    expect((await db.query("SELECT 1 FROM app.job_import_v3 WHERE tenant_id=$1 AND job_id=$2", [child.tenantId, child.jobId])).rowCount).toBe(1);
  });
  return child;
}

async function invoiceReadyChild(parent: FinalCheckJob) {
  const child = await importedChild(parent);
  await scoped(child, parent.digest, db => db.query(lockSql, lockArgs(child, randomUUID())));
  await publishEmptyCompletion(f, child);
  return child;
}

it("refuses B locking A's job without a lock, receipt, invoice or audit write; A locks and replays", async () => {
  const a = await seedFinalCheckJob(f), b = await seedFinalCheckJob(f), command = randomUUID();
  const before = await effects(a);
  await forbidden(scoped(a, b.digest, db => db.query(lockSql, lockArgs(a, command))));
  expect(await effects(a)).toEqual(before);
  const first = await scoped(a, a.digest, db => db.query(lockSql, lockArgs(a, command)));
  expect(first.rows[0]).toMatchObject({ job_id: a.jobId, command_id: command });
  await forbidden(scoped(a, b.digest, db => db.query(lockSql, lockArgs(a, command))));
  expect((await scoped(a, a.digest, db => db.query(lockSql, lockArgs(a, command)))).rows).toEqual(first.rows);
});

it.each(["own job", "imported child"] as const)("refuses B invoicing A's %s with no writes; A issues and replays", async target => {
  const a = await seedFinalCheckJob(f), b = await seedFinalCheckJob(f);
  const child = target === "imported child" ? await invoiceReadyChild(a) : a;
  if (target === "own job") {
    await scoped(a, a.digest, db => db.query(lockSql, lockArgs(a, randomUUID())));
    await publishEmptyCompletion(f, a);
  }
  const command = randomUUID(), before = await effects(child);
  await forbidden(scoped(child, b.digest, db => db.query(invoiceSql, args(child, command))));
  expect(await effects(child)).toEqual(before);
  const first = await scoped(child, a.digest, db => db.query(invoiceSql, args(child, command)));
  expect((await effects(child)).invoices).toBe(1);
  const issued = await effects(child);
  await forbidden(scoped(child, b.digest, db => db.query(invoiceSql, args(child, command))));
  expect(await effects(child)).toEqual(issued);
  expect((await scoped(child, a.digest, db => db.query(invoiceSql, args(child, command)))).rows).toEqual(first.rows);
});

it("follows multiple trusted import edges, scopes every edge to the tenant and keeps the helper private", async () => {
  const a = await seedFinalCheckJob(f), b = await seedFinalCheckJob(f);
  const child = await importedChild(a), grandchild = await importedChild(child);
  const owns = (tenant: string, job: string, digest: string | null) => finalCheckTenant(f.admin, tenant, async db =>
    (await db.query("SELECT app.final_check_practice_owns_job($1,$2,$3) owns", [tenant, job, digest])).rows[0].owns);
  expect(await owns(a.tenantId, grandchild.jobId, a.digest)).toBe(true);
  expect(await owns(a.tenantId, grandchild.jobId, b.digest)).toBe(false);
  expect(await owns(randomUUID(), grandchild.jobId, a.digest)).toBe(false);
  expect(await owns(a.tenantId, randomUUID(), a.digest)).toBe(false);
  expect(await owns(a.tenantId, a.jobId, null)).toBe(false);
  await expect(scoped(a, a.digest, db => db.query("SELECT app.final_check_practice_owns_job($1,$2,$3)", [a.tenantId, a.jobId, a.digest]))).rejects.toMatchObject({ code: "42501" });
});

it.each(["lock", "invoice"] as const)("mutation proof: removing the %s guard breaks its refusal assertion, then rolls back", async kind => {
  const a = await seedFinalCheckJob(f), b = await seedFinalCheckJob(f);
  const job = kind === "invoice" ? await invoiceReadyChild(a) : a;
  const signature = kind === "lock"
    ? "app.lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text)"
    : "app.final_check_require_invoice_actor(uuid,uuid,uuid)";
  const original = (await f.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0].definition as string;
  const guard = kind === "lock"
    ? / IF nullif\(current_setting\('app.practice_material_digest',true\),''\) IS NOT NULL\n  AND NOT app\.final_check_practice_owns_job[^;]+;\n END IF;/u
    : /  IF NOT app\.final_check_practice_owns_job[^;]+; END IF;/u;
  const changed = original.replace(guard, kind === "invoice" ? "  NULL;" : "");
  expect(changed).not.toBe(original);
  const db = await f.admin.connect();
  try {
    await db.query("BEGIN");
    await db.query(changed);
    await db.query("SET LOCAL ROLE jobguard_runtime");
    await db.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true)", [a.tenantId, b.digest]);
    // The exact refusal assertion above must fail when only its new guard is absent.
    await expect(forbidden(db.query(kind === "lock" ? lockSql : invoiceSql,
      kind === "lock" ? lockArgs(job, randomUUID()) : args(job)))).rejects.toThrow();
    const table = kind === "lock" ? "final_account_lock" : "customer_invoice";
    expect((await db.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [job.tenantId, job.jobId])).rows[0].n).toBe(1);
  } finally { await db.query("ROLLBACK"); db.release(); }
  expect((await f.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0].definition).toBe(original);
});
