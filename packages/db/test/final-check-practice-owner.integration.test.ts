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
  // This fixture migrates a fresh embedded PostgreSQL 16 database, including 0701.
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
    await db.query("SELECT app.bind_request('practice',$1,$2)", [digest,a.tenantId]);
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

// Owner-seeded v1 receipt fixtures deliberately bypass business triggers, never
// runtime grants. This lets each binding be attacked without changing commands.
async function v1Child(parent: FinalCheckJob, fault = "none") {
  const child = await seedFinalCheckJob(f);
  await scoped(child, child.digest, db => db.query(lockSql, lockArgs(child, randomUUID())));
  await publishEmptyCompletion(f, child);
  await finalCheckTenant(f.admin, child.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query(`UPDATE app.job SET practice_session_digest=$3,practice_scenario=$4,provenance=$5
      WHERE tenant_id=$1 AND id=$2`, [child.tenantId, child.jobId,
      fault === "child digest" ? child.digest : null, fault === "child digest" ? "capture" : null,
      fault === "child provenance" ? "system_generated_quote" : "imported"]);
    const receiptTenant = fault === "receipt tenant" ? randomUUID() : child.tenantId;
    if (fault === "receipt tenant") {
      const account = randomUUID();
      await db.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [receiptTenant]);
      await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional other builder')", [account, receiptTenant]);
      await db.query(`INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)
        SELECT id,$1,$2,identity_user_id,role FROM app.membership WHERE tenant_id=$3 AND id=$4`,
      [receiptTenant, account, child.tenantId, FINAL_CHECK_ACTOR]);
    }
    await db.query(`INSERT INTO app.command_receipt
      (command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [randomUUID(), receiptTenant,
      fault === "command type" ? "IssueLockBoundInvoice" : "job.adopt_in_flight",
      `import:${fault === "semantic key" ? randomUUID() : child.jobId}`, "c".repeat(64),
      fault === "receipt status" ? "processing" : "succeeded",
      fault === "receipt status" ? null : {
        jobId: fault === "result job" ? randomUUID() : child.jobId,
        sourceJobId: fault === "result parent" ? randomUUID() : parent.jobId,
      }, FINAL_CHECK_ACTOR, fault === "receipt status" ? null : new Date()]);
    await db.query("SET LOCAL session_replication_role='origin'");
  });
  expect((await f.admin.query("SELECT 1 FROM app.job_import_v3 WHERE tenant_id=$1 AND job_id=$2", [child.tenantId, child.jobId])).rowCount).toBe(0);
  return child;
}

const ownsJob = (job: FinalCheckJob, digest: string) => finalCheckTenant(f.admin, job.tenantId, async db =>
  (await db.query("SELECT app.final_check_practice_owns_job($1,$2,$3) owns", [job.tenantId, job.jobId, digest])).rows[0].owns as boolean);
const trustedEdge = (child: FinalCheckJob, parent: FinalCheckJob) => finalCheckTenant(f.admin, child.tenantId, async db =>
  (await db.query("SELECT app.trusted_import_edge($1,$2,$3) trusted", [child.tenantId, child.jobId, parent.jobId])).rows[0].trusted as boolean);

it("v1 receipt child issues a final and supplementary invoice and replays both under its parent's digest", async () => {
  const parent = await seedFinalCheckJob(f), other = await seedFinalCheckJob(f);
  const child = await v1Child(parent), finalCommand = randomUUID();
  expect(await trustedEdge(child, parent)).toBe(true);
  expect(await ownsJob(child, parent.digest)).toBe(true);
  const first = await scoped(child, parent.digest, db => db.query(invoiceSql, args(child, finalCommand)));
  expect((await scoped(child, parent.digest, db => db.query(invoiceSql, args(child, finalCommand)))).rows).toEqual(first.rows);

  // Reuse SV-4's supplementary fixture shape: preserve every billed baseline
  // identity and add exactly one fictional variation on the next revision.
  const revision = randomUUID(), scope = randomUUID(), line = randomUUID(), hash = "b".repeat(64);
  await finalCheckTenant(f.admin, child.tenantId, async db => {
    await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, child.tenantId, child.jobId]);
    await db.query(`INSERT INTO app.final_account_revision
      (id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings,created_at)
      SELECT $1,tenant_id,job_id,final_account_draft_id,2,id,$2,baseline_quote_version_id,currency,tax_policy_version,101000,20200,121200,false,findings,clock_timestamp()
      FROM app.final_account_revision WHERE tenant_id=$3 AND id=$4`, [revision, hash, child.tenantId, child.revisionId]);
    await db.query(`INSERT INTO app.final_account_line
      (id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
      SELECT gen_random_uuid(),tenant_id,job_id,$1,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal
      FROM app.final_account_line WHERE tenant_id=$2 AND final_account_revision_id=$3`, [revision, child.tenantId, child.revisionId]);
    await db.query(`INSERT INTO app.final_account_line
      (id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,approval_id,description,net_pence,ordinal)
      VALUES($1,$2,$3,$4,'variation',$5,$6,$7,$8,'Fictional adopted job extra',1000,2)`,
    [line, child.tenantId, child.jobId, revision, randomUUID(), scope, randomUUID(), randomUUID()]);
    await db.query(`UPDATE app.final_account_draft SET current_revision_id=$1,revision=2
      WHERE tenant_id=$2 AND job_id=$3`, [revision, child.tenantId, child.jobId]);
  });
  const supplementarySql = invoiceSql.replace("'final'", "'supplementary'");
  const supplementaryArgs = [child.tenantId, child.jobId, FINAL_CHECK_ACTOR, randomUUID(), revision, hash];
  const before = await effects(child);
  await forbidden(scoped(child, other.digest, db => db.query(supplementarySql, supplementaryArgs)));
  expect(await effects(child)).toEqual(before);
  const supplementary = await scoped(child, parent.digest, db => db.query(supplementarySql, supplementaryArgs));
  expect((await scoped(child, parent.digest, db => db.query(supplementarySql, supplementaryArgs))).rows).toEqual(supplementary.rows);
  const issued = await effects(child);
  await forbidden(scoped(child, other.digest, db => db.query(supplementarySql, supplementaryArgs)));
  expect(await effects(child)).toEqual(issued);
  expect(issued.invoices).toBe(2);
  expect((await f.admin.query(`SELECT i.net_pence,i.tax_pence,i.total_pence,l.final_account_line_id
    FROM app.customer_invoice i JOIN app.final_account_invoice_binding b ON(b.tenant_id,b.job_id,b.invoice_id)=(i.tenant_id,i.job_id,i.id)
    JOIN app.final_account_invoiced_line l ON(l.tenant_id,l.invoice_id)=(i.tenant_id,i.id)
    WHERE i.tenant_id=$1 AND i.job_id=$2 AND b.invoice_kind='supplementary'`, [child.tenantId, child.jobId])).rows)
    .toEqual([{ net_pence: "1000", tax_pence: "200", total_pence: "1200", final_account_line_id: line }]);
});

it("walks mixed v3 then v1 ancestry and preserves the legacy permissive v3 branch", async () => {
  const parent = await seedFinalCheckJob(f), child = await importedChild(parent), grandchild = await v1Child(child);
  // Existing importedChild deliberately has system-generated provenance: 0667 accepted
  // this trusted v3 edge, and the new ownership walk must continue accepting it.
  expect(await trustedEdge(child, parent)).toBe(false);
  expect(await trustedEdge(grandchild, child)).toBe(true);
  expect(await ownsJob(grandchild, parent.digest)).toBe(true);
  await finalCheckTenant(f.admin, child.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.job SET provenance='imported' WHERE tenant_id=$1 AND id=$2", [child.tenantId, child.jobId]);
    await db.query("SET LOCAL session_replication_role='origin'");
  });
  expect(await trustedEdge(child, parent)).toBe(true);
  expect(await trustedEdge(child, grandchild)).toBe(false);
  await finalCheckTenant(f.admin, child.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.job SET practice_session_digest=$3,practice_scenario='capture' WHERE tenant_id=$1 AND id=$2", [child.tenantId, child.jobId, child.digest]);
    await db.query("SET LOCAL session_replication_role='origin'");
  });
  expect(await trustedEdge(child, parent)).toBe(false);
  expect(await ownsJob(grandchild, parent.digest)).toBe(true);
  expect(await trustedEdge({ ...child, tenantId: randomUUID() }, parent)).toBe(false);
});

it.each(["receipt status", "result parent", "result job", "semantic key", "receipt tenant", "child digest", "child provenance", "command type", "parent digest"])(
  "refuses a v1 edge with %s, including invoice admission, without writes", async fault => {
    const parent = await seedFinalCheckJob(f), other = await seedFinalCheckJob(f);
    const child = await v1Child(fault === "parent digest" ? other : parent, fault);
    expect(await trustedEdge(child, parent)).toBe(false);
    expect(await ownsJob(child, parent.digest)).toBe(false);
    const before = await effects(child);
    await forbidden(scoped(child, parent.digest, db => db.query(invoiceSql, args(child))));
    expect(await effects(child)).toEqual(before);
  },
);

it.each(["jobguard_runtime", "jobguard_identity", "jobguard_infrastructure", "jobguard_shadow", "jobguard_shadow_emergency_access"])(
  "keeps trusted_import_edge private from %s", async role => {
    const parent = await seedFinalCheckJob(f), child = await v1Child(parent);
    expect((await f.admin.query("SELECT has_function_privilege($1,'app.trusted_import_edge(uuid,uuid,uuid)','EXECUTE') allowed", [role])).rows[0].allowed).toBe(false);
    await expect(finalCheckTenant(f.admin, child.tenantId, async db => {
      await db.query(`SET LOCAL ROLE ${role}`);
      return db.query("SELECT app.trusted_import_edge($1,$2,$3)", [child.tenantId, child.jobId, parent.jobId]);
    })).rejects.toMatchObject({ code: "42501" });
  },
);

it.each(["receipt branch", "source parent"] as const)("mutation proof: removing %s breaks its assertion, then restores", async mutation => {
  const parent = await seedFinalCheckJob(f), child = await v1Child(parent);
  const signature = "app.trusted_import_edge(uuid,uuid,uuid)";
  const original = (await f.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0].definition as string;
  const changed = mutation === "receipt branch"
    ? original.replace(/OR EXISTS \(SELECT 1 FROM app\.command_receipt rv[^;]+?source\.id::text\)/u, "OR false")
    : original.replace(" AND rv.result->>'sourceJobId'=source.id::text", "");
  expect(changed).not.toBe(original);
  expect(await ownsJob(child, parent.digest)).toBe(true);
  const wrong = await seedFinalCheckJob(f);
  expect(await ownsJob(child, wrong.digest)).toBe(false);
  const db = await f.admin.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [child.tenantId]);
    await db.query(changed);
    const digest = mutation === "receipt branch" ? parent.digest : wrong.digest;
    const expected = mutation === "receipt branch";
    const owns = (await db.query("SELECT app.final_check_practice_owns_job($1,$2,$3) owns", [child.tenantId, child.jobId, digest])).rows[0].owns;
    // The acceptance/refusal expectation turns red in this scratch transaction.
    expect(() => expect(owns).toBe(expected)).toThrow();
    expect(owns).toBe(!expected);
  } finally { await db.query("ROLLBACK"); db.release(); }
  expect((await f.admin.query("SELECT pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0].definition).toBe(original);
  expect(await ownsJob(child, parent.digest)).toBe(true);
  expect(await ownsJob(child, wrong.digest)).toBe(false);
});
