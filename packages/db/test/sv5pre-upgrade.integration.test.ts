import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { PracticeInvoiceRepository } from "../src/practice-invoice-repository.js";
import { asFixtureTenant, closeLockFixture, createLockFixture, LOCK_OWNER, seedAccount, type LockFixture } from "./sv5pre-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";

/* An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'. */
const OWN = "0237_final_check_prerequisites.sql";
// customer_invoice includes the original artifact bytes/hash; action_outbox includes its approved artifact.
const TABLES = ["app.customer_invoice", "app.customer_payment", "app.command_receipt", "app.customer_invoice_sequence",
  "app.decision", "app.decision_resolution", "app.action_authorization", "app.action_outbox", "app.audit_event",
  "audit_control.audit_head", "app.final_account_revision", "app.final_account_line", "app.final_account_draft", "app.job",
  "app.final_account_invoice_binding", "app.evidence_upload", "app.evidence_object"];
type Proof = Awaited<ReturnType<typeof proofBefore>>;
type Account = Awaited<ReturnType<typeof seedAccount>>;
type Queryable = Pick<Pool | PoolClient, "query">;
type Command = { jobId: string; finalAccountRevisionId: string; actorMembershipId: string; commandId: string; recipient: string; issuedOn: string };
const command = (a: Account): Command => ({ jobId: a.jobId, finalAccountRevisionId: a.revisionId, actorMembershipId: LOCK_OWNER,
  commandId: randomUUID(), recipient: "practice-customer@example.invalid", issuedOn: "2026-10-12" });
async function rawIssue(f: LockFixture, a: Account, c: Command) {
  return asFixtureTenant(f.admin, a.tenantId, async db => (await db.query(
    "SELECT * FROM app.issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7::date)",
    [a.tenantId, c.jobId, c.finalAccountRevisionId, c.actorMembershipId, c.commandId, c.recipient, c.issuedOn])).rows[0]);
}
async function compare(db: Queryable, proof: Proof) {
  expect(await proofDifferences(db, proof)).toEqual({ rows: [], types: [] });
}
async function oldGrants(db: Queryable) {
  const tables = (await db.query<{ identity: string; acl: string | null }>(`SELECT n.nspname||'.'||c.relname AS identity,c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','identity','control_plane','audit_control') AND c.relkind='r' ORDER BY 1`)).rows;
  const routines = (await db.query<{ identity: string; acl: string | null }>(`SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS identity,p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','identity','control_plane','audit_control') ORDER BY 1`)).rows;
  return { tables, routines };
}
async function effectCounts(db: Queryable) {
  const result: Record<string, string> = {};
  for (const table of [...TABLES, "app.final_account_lock", "app.final_account_lock_check", "app.shadow_final_check_completion", "app.final_account_invoiced_line"])
    result[table] = (await db.query<{ n: string }>(`SELECT count(*)::text n FROM ${table}`)).rows[0]!.n;
  return result;
}

describe("SV5PRE own-migration upgrade and historical replay", () => {
  let f: LockFixture, a: Account, interimAccount: Account, c: Command, interimCommand: Command;
  let originalResult: Record<string, unknown>, interimInvoice: { id: string }, before: Proof;
  let grants: Awaited<ReturnType<typeof oldGrants>>, own: number;
  beforeAll(async () => {
    f = await createLockFixture(false);
    own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith(OWN)); expect(own).toBeGreaterThan(0);
    await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
    // Every prior migration is installed and recorded; 0147 is deliberately absent while issuing history.
    for (const url of MIGRATION_URLS.slice(0, own)) {
      const name = url.pathname.split("/").at(-1)!, sql = await readFile(url, "utf8");
      await f.admin.query(name === "0095_job_parties.sql" ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);") : sql);
      await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
    }
    await installLegacySyntheticPartyFixtures(f.admin);
    a = await seedAccount(f.admin); c = command(a);
    const invoices = new PracticeInvoiceRepository(f.admin), invoice = await invoices.issue(a.context, c);
    await invoices.recordReceipt(a.context, { jobId: a.jobId, invoiceId: invoice.id, actorMembershipId: LOCK_OWNER,
      commandId: randomUUID(), paidOn: "2026-10-12", amountPence: 12000, method: "bank_transfer", reference: "Historical synthetic receipt" });
    originalResult = await rawIssue(f, a, c);
    interimAccount = await seedAccount(f.admin, a.tenantId); interimCommand = command(interimAccount);
    interimInvoice = await invoices.issue(interimAccount.context, interimCommand);
    // A genuine pre-0147 invoice supplies this old lock-free kind binding; no fresh final is relabelled after upgrade.
    await asFixtureTenant(f.admin, interimAccount.tenantId, db => db.query(`INSERT INTO app.final_account_invoice_binding(tenant_id,job_id,invoice_id,invoice_kind,revision_id)
      VALUES($1,$2,$3,'interim',$4)`, [interimAccount.tenantId, interimAccount.jobId, interimInvoice.id, interimAccount.revisionId]));
    // Deliberately distinct microsecond receipts are genuine pre-0147 evidence history.
    const uploadId=randomUUID();
    await asFixtureTenant(f.admin,a.tenantId,async db=>{
      await db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,server_received_at,state,server_verified_at,object_version_id) VALUES($1,$2,$3,$4,repeat('a',64),'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day','2026-09-30T10:00:00.000001Z','verified',clock_timestamp(),'historical.v1')",[a.tenantId,a.jobId,uploadId,`sv5pre/${uploadId}`]);
      await db.query("INSERT INTO app.evidence_object(tenant_id,job_id,id,upload_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$3,'original','photo',$4,'historical.v1',repeat('a',64),1,'image/png','standard_evidence','2026-09-30T10:00:00.000002Z',clock_timestamp())",[a.tenantId,a.jobId,uploadId,`sv5pre/${uploadId}`]);
    });
    await f.admin.query("CREATE FUNCTION app.sv5pre_upgrade_control() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
    before = await proofBefore(f.admin, TABLES);
    for (const [table, snapshot] of Object.entries(before)) {
      expect(Object.keys(snapshot.rows).length, `${table}: at least one pre-existing row`).toBeGreaterThan(0);
      expect(snapshot.key.length, `${table}: primary-key identity`).toBeGreaterThan(0);
    }
    grants = await oldGrants(f.admin);
  }, 90_000);
  afterAll(async () => { if (f) await closeLockFixture(f); });

  it("[PRE-MIG-01/PRE-MIG-02] SV5PRE proves its own migration and permits later additive changes", async () => {
    await f.admin.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [OWN]);
    await compare(f.admin, before);
    // Rule 9: this unmerged migration creates private result proofs without altering any pre-existing row or ACL.
    const privateTables=['shadow_final_check_completion','shadow_final_check_reveal_proof','shadow_final_check_run_binding','shadow_final_check_source_attempt'];
    const privateCatalog=(await f.admin.query("SELECT c.relname,has_table_privilege('jobguard_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') runtime,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1) ORDER BY c.relname",[privateTables])).rows;
    expect(privateCatalog).toEqual(privateTables.map(relname=>({relname,runtime:false,relrowsecurity:true,relforcerowsecurity:true})));
    expect((await f.admin.query("SELECT tablename FROM pg_tables WHERE schemaname='app' AND tablename=ANY($1)",[privateTables.map(name=>name.replace('shadow_',''))])).rows).toEqual([]);
    const afterOwn = await oldGrants(f.admin);
    // Only this migration is accountable for keeping the ACLs of its pre-existing objects unchanged.
    for (const key of ["tables", "routines"] as const) {
      const identities = new Set(grants[key].map(row => row.identity));
      expect(afterOwn[key].filter(row => identities.has(row.identity))).toEqual(grants[key]);
    }
    await migrate(f.admin); await migrate(f.admin);
    // Named pre-N columns, canonical PostgreSQL text, full types, and original identities survive later migrations.
    await compare(f.admin, before);

    await rolledBack(f.admin, async db => {
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query("UPDATE app.customer_invoice SET created_at=created_at+interval '1 microsecond' WHERE tenant_id=$1", [a.tenantId]);
      const changed = await proofDifferences(db, before);
      expect(changed.rows.some(row => row.startsWith("app.customer_invoice "))).toBe(true);
      expect(changed.types).toEqual([]);
      await expect(compare(db, before)).rejects.toThrow();
    });
    await rolledBack(f.admin, async db => {
      await db.query("ALTER TABLE app.job ALTER COLUMN title TYPE text");
      expect((await proofDifferences(db, before)).types).toContain(`app.job: title ${before["app.job"]!.typed.title} -> text`);
      await expect(compare(db, before)).rejects.toThrow();
    });
    await rolledBack(f.admin, async db => {
      await db.query("ALTER TABLE app.final_account_draft ADD COLUMN sv5pre_later_nullable text");
      await compare(db, before);
    });
    await rolledBack(f.admin, async db => {
      await db.query("CREATE OR REPLACE FUNCTION app.sv5pre_upgrade_control() RETURNS integer LANGUAGE sql AS 'SELECT 2'");
      expect((await db.query("SELECT app.sv5pre_upgrade_control() result")).rows[0]!.result).toBe(2);
      await compare(db, before);
    });
    await rolledBack(f.admin, async db => {
      const originalCount = (await db.query("SELECT count(*)::int n FROM app.final_account_line")).rows[0]!.n;
      await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
        SELECT gen_random_uuid(),tenant_id,job_id,final_account_revision_id,line_kind,gen_random_uuid(),scope_item_id,commercial_revision_id,'Synthetic later inserted line',0,2
        FROM app.final_account_line WHERE tenant_id=$1 AND id=$2`, [a.tenantId, a.lineId]);
      expect((await db.query("SELECT count(*)::int n FROM app.final_account_line")).rows[0]!.n).toBe(originalCount + 1);
      await compare(db, before);
    });
    await compare(f.admin, before);
  }, 90_000);

  it("[PRE-MIG-01/PRE-Q5-03] r1 upgraded evidence serialization preserves supplied composite identities",async()=>{
    const fresh=await seedAccount(f.admin,a.tenantId),uploadId=randomUUID();
    await asFixtureTenant(f.admin,a.tenantId,async db=>{
      await db.query("INSERT INTO app.evidence_upload(tenant_id,job_id,id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,server_received_at) VALUES($1,$2,$3,$4,repeat('a',64),'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day','2026-09-30T10:00:00.000001Z')",[a.tenantId,fresh.jobId,uploadId,`sv5pre/${uploadId}`]);
      await db.query("INSERT INTO app.evidence_object(tenant_id,job_id,id,upload_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$3,'original','photo',$4,'upgraded.v1',repeat('a',64),1,'image/png','standard_evidence','2026-09-30T10:00:00.000002Z',clock_timestamp())",[a.tenantId,fresh.jobId,uploadId,`sv5pre/${uploadId}`]);
    });
    expect((await f.admin.query("SELECT u.server_received_at='2026-09-30T10:00:00.000001Z'::timestamptz upload_time_exact,e.server_received_at='2026-09-30T10:00:00.000002Z'::timestamptz object_time_exact FROM app.evidence_upload u JOIN app.evidence_object e ON(e.tenant_id,e.upload_id)=(u.tenant_id,u.id) WHERE u.tenant_id=$1 AND u.id=$2",[a.tenantId,uploadId])).rows).toEqual([{upload_time_exact:true,object_time_exact:true}]);
    await compare(f.admin,before);
  });

  it("[PRE-Q4-04] historical invoice replay preserves original facts without inventing a lock", async () => {
    const counts = await effectCounts(f.admin);
    expect(counts["app.final_account_lock"]).toBe("0"); expect(counts["app.shadow_final_check_completion"]).toBe("0");
    // Direct checked SQL replay is exercised here; it is not a repository or HTTP replay claim.
    expect(await rawIssue(f, a, c)).toEqual(originalResult);
    expect(await rawIssue(f, a, c)).toEqual(originalResult);
    expect(await effectCounts(f.admin)).toEqual(counts);
    await compare(f.admin, before);
    const invoice = (await f.admin.query<{ size: number; digest_matches: boolean }>("SELECT octet_length(pdf_bytes) size,encode(public.digest(pdf_bytes,'sha256'),'hex')=pdf_sha256 digest_matches FROM app.customer_invoice WHERE tenant_id=$1 AND id=$2", [a.tenantId, originalResult.invoice_id])).rows[0]!;
    expect(invoice.size).toBeGreaterThan(0); expect(invoice.digest_matches).toBe(true);
  });

  it("[PRE-Q4-07] historical interim binding is not a fresh final-issue exemption", async () => {
    expect((await f.admin.query("SELECT invoice_kind,lock_id,check_id FROM app.final_account_invoice_binding WHERE tenant_id=$1 AND invoice_id=$2", [interimAccount.tenantId, interimInvoice.id])).rows)
      .toEqual([{ invoice_kind: "interim", lock_id: null, check_id: null }]);
    const counts = await effectCounts(f.admin);
    expect((await rawIssue(f, interimAccount, interimCommand)).invoice_id).toBe(interimInvoice.id);
    await expect(rawIssue(f, interimAccount, { ...interimCommand, commandId: randomUUID(), jobId: randomUUID() })).rejects.toMatchObject({ code: "42501" });
    expect(await effectCounts(f.admin)).toEqual(counts);
    const fresh = await seedAccount(f.admin, a.tenantId), refusalCounts = await effectCounts(f.admin);
    await expect(rawIssue(f, fresh, command(fresh))).rejects.toThrow("FINAL_ACCOUNT_LOCK_REQUIRED");
    expect(await effectCounts(f.admin)).toEqual(refusalCounts);
    await compare(f.admin, before);
  });
});
