import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate, PracticeInvoiceRepository } from "../src/index.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const ownName = "0190_credit_command_replay.sql", credential = randomUUID();
const nameOf = (url: URL) => fileURLToPath(url).split("/").at(-1)!;
let pg: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, port: number;
type Snapshot = { table: string; columns: { name: string; type: string }[]; keys: string[]; rows: { identity: string; bytes: string }[] };
const quote = (name: string) => `"${name.replaceAll('"','""')}"`;
async function snapshot(db: PoolClient, table: string, previous?: Snapshot): Promise<Snapshot> {
 const columns = (await db.query(`SELECT attname AS name,format_type(atttypid,atttypmod) AS type FROM pg_attribute
  WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`,[table])).rows;
 const keys = previous?.keys ?? (await db.query(`SELECT a.attname AS name FROM pg_index i
  CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,position)
  JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
  WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.position`,[table])).rows.map(row=>row.name as string);
 expect(keys.length).toBeGreaterThan(0);
 const named = (previous?.columns??columns).map(column=>quote(column.name)).join(",");
 const identity = `jsonb_build_array(${keys.map(quote).join(",")})::text`;
 const rows = (await db.query(`SELECT ${identity} AS identity,row_to_json(t)::text AS bytes FROM (SELECT ${named} FROM ${table}) t ORDER BY ${identity} COLLATE "C"`)).rows;
 return {table,columns:previous?columns.filter(column=>previous.columns.some(old=>old.name===column.name)):columns,keys,
  rows:previous?rows.filter(row=>previous.rows.some(old=>old.identity===row.identity)):rows};
}
async function preserved(db: PoolClient, before: Snapshot[]) {
 for (const prior of before) {
  expect(prior.rows.length,`pre-existing rows in ${prior.table}`).toBeGreaterThan(0);
  expect(await snapshot(db,prior.table,prior)).toEqual(prior);
 }
}
async function catalog(db: PoolClient) {
 return (await db.query(`SELECT c.oid::regclass::text AS name,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text AS acl,
  (SELECT jsonb_agg(jsonb_build_array(polname,polcmd,polroles,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) ORDER BY polname) FROM pg_policy WHERE polrelid=c.oid) AS policies
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY name`)).rows;
}
async function routines(db: PoolClient) {
 return (await db.query(`SELECT p.oid::regprocedure::text AS name,pg_get_userbyid(proowner) AS owner,prosecdef,proacl::text AS acl,pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') AND p.prokind='f' ORDER BY name`)).rows;
}
beforeAll(async () => {
 const directory = await mkdtemp(join(tmpdir(),"invoice-later-upgrade-")); port = await freePort(60600,150);
 pg = new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:credential,persistent:false,
  createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});
 await pg.initialise(); await pg.start();
 admin = new Pool({host:"127.0.0.1",port,user:"postgres",password:credential});
},60000);
afterAll(async () => {await closeTestPools(runtime,admin);await pg?.stop();});

describe("LATER-B16 own migration preservation", () => {
 it("L082 fresh/upgrade/rollback preserves 0166 facts and later migrations succeed twice", async () => {
  const db = await admin.connect();
  try {
   await db.query(`CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
   for (const url of MIGRATION_URLS.filter(url=>nameOf(url)<ownName)) {
    const name = nameOf(url), sql = await readFile(url,"utf8");
    await db.query(name==="0095_job_parties.sql"?sql.replace("BEGIN;","BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);"):sql);
    await db.query(`INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)`,[name]);
   }
   await installLegacySyntheticPartyFixtures(admin);
   const f = await seedEvidencePackFixture(admin), context = testTenantContext(f.tenantId);
   await db.query(`CREATE ROLE invoice_later_upgrade_login LOGIN PASSWORD '${credential}' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO invoice_later_upgrade_login`);
   runtime = new Pool({host:"127.0.0.1",port,database:"postgres",user:"invoice_later_upgrade_login",password:credential});
   const repo = new PracticeInvoiceRepository(runtime);
   const input = {jobId:f.jobId,invoiceId:f.invoiceId,netPence:100001,reason:"Historic synthetic correction"};
   const command = {...input,actorMembershipId:f.memberId,commandId:randomUUID(),previewHash:(await repo.previewCredit(context,input)).previewHash};
   const result = await repo.issueCredit(context,command);
   const names = (await db.query(`SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY 1`)).rows;
   const before: Snapshot[] = [];
   for (const row of names) if ((await db.query(`SELECT EXISTS(SELECT 1 FROM ${row.name}) AS present`)).rows[0].present) before.push(await snapshot(db,row.name));
   for (const required of ["app.customer_invoice","app.customer_credit_note","app.command_receipt","app.audit_event","app.action_authorization"]) expect(before.map(row=>row.table)).toContain(required);
   const privileges = await catalog(db), original = await routines(db);
   const url = MIGRATION_URLS.find(url=>nameOf(url)===ownName);
   expect(url,"own migration discovered").toBeDefined();
   const sql = await readFile(url!,"utf8");
   // Applying only N can be rolled back without changing the old rows or routine.
   await db.query(sql.replace(/COMMIT;\s*$/u,""));
   await preserved(db,before); await db.query("ROLLBACK");
   expect(await routines(db)).toEqual(original);
   await db.query("SET ROLE jobguard_migration"); await db.query(sql); await db.query("RESET ROLE");
   await preserved(db,before); expect(await catalog(db)).toEqual(privileges);
   const after = await routines(db), ownRoutine = "app.issue_practice_customer_credit_note(uuid,uuid,uuid,uuid,uuid,bigint,text,text)";
   expect(after.map(row=>row.name)).toEqual(original.map(row=>row.name));
   for (const prior of original) {
    const current = after.find(row=>row.name===prior.name)!;
    if (prior.name===ownRoutine) {
     expect({...current,definition:prior.definition}).toEqual(prior);
     expect(current.definition).not.toBe(prior.definition);
    } else expect(current).toEqual(prior);
   }
   await db.query(sql); await preserved(db,before);
   await db.query(`INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)`,[ownName]);
   await migrate(db); await migrate(db); await preserved(db,before);
   expect(await repo.issueCredit(context,command)).toEqual(result);
   async function control(sql: string, passes: boolean) {
    await db.query("BEGIN");
    try {await db.query(sql);if(passes)await preserved(db,before);else await expect(preserved(db,before)).rejects.toThrow();}
    finally {await db.query("ROLLBACK");}
   }
   await control(`UPDATE app.command_receipt SET completed_at=completed_at+interval '1 microsecond' WHERE tenant_id='${f.tenantId}' AND command_id='${command.commandId}'`,false);
   await control(`ALTER TABLE app.customer_credit_note ALTER COLUMN reason TYPE varchar(300)`,false);
   await control(`ALTER TABLE app.customer_credit_note ADD COLUMN invoice_later_nullable text`,true);
   await control(sql.replace(/^BEGIN;/u,"").replace(/COMMIT;\s*$/u,"").replace("BEGIN\n IF p_tenant","BEGIN\n -- Later replacement allowed by this preservation proof.\n IF p_tenant"),true);
   await control(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
    VALUES('${randomUUID()}','${f.tenantId}','invoice-later.control','later-insert','${"d".repeat(64)}','succeeded','{}','${f.memberId}',clock_timestamp())`,true);
   await preserved(db,before);
  } finally {await db.query("ROLLBACK");await db.query("RESET ROLE");db.release();}
 },120000);
});
