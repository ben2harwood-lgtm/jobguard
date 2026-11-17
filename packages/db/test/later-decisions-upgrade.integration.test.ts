import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
const migration = "0193_later_decision_identity.sql", tenant = randomUUID(), member = randomUUID();
let postgres: EmbeddedPostgres, admin: Pool;
const tables = ["job_finding", "decision_resolution", "command_receipt", "audit_event"] as const;
type Snapshot = { table: string; identity: string; ids: string[]; columns: { name: string; type: string }[]; rows: string[] };
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
async function columns(db: Pool | PoolClient, table: string) {
  return (await db.query<{ name: string; type: string }>(`SELECT attname AS name,format_type(atttypid,atttypmod) AS type
    FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`, [`app.${table}`])).rows;
}
async function rows(db: Pool | PoolClient, s: Omit<Snapshot, "rows">) {
  return (await db.query<{ bytes: string }>(`SELECT row_to_json(t)::text AS bytes FROM
    (SELECT ${s.columns.map(c => quote(c.name)).join(",")} FROM app.${quote(s.table)} WHERE tenant_id=$1 AND ${quote(s.identity)}=ANY($2::${s.table === "audit_event" ? "bigint" : "uuid"}[]) ORDER BY ${quote(s.identity)}) t`, [tenant, s.ids])).rows.map(r => r.bytes);
}
async function snapshot(db: Pool | PoolClient): Promise<Snapshot[]> {
  return Promise.all(tables.map(async table => {
    const identity = table === "command_receipt" ? "command_id" : table === "audit_event" ? "sequence" : "id";
    const ids = (await db.query(`SELECT ${quote(identity)} AS id FROM app.${quote(table)} WHERE tenant_id=$1 ORDER BY 1`, [tenant])).rows.map(r => r.id as string);
    expect(ids.length, `pre-existing rows: ${table}`).toBeGreaterThan(0);
    const base = { table, identity, ids, columns: await columns(db, table) };
    return { ...base, rows: await rows(db, base) };
  }));
}
async function compare(db: Pool | PoolClient, before: Snapshot[]) {
  for (const s of before) {
    const current = new Map((await columns(db, s.table)).map(c => [c.name, c.type]));
    expect(s.columns.map(c => ({ name: c.name, type: current.get(c.name) }))).toEqual(s.columns);
    expect(await rows(db, s)).toEqual(s.rows);
  }
}
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const directory = await mkdtemp(join(tmpdir(), "jg-later-upgrade-")), port = await freePort(59400, 200), credential = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: credential });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.filter(u => u.pathname.split("/").at(-1)! < migration)) {
    const name = url.pathname.split("/").at(-1)!, sql = await readFile(url, "utf8");
    await admin.query(name === "0095_job_parties.sql" ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);") : sql);
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
  }
  const user = randomUUID(), account = randomUUID(), job = randomUUID(), decision = randomUUID();
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional upgrade')", [account, tenant]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member, tenant, account, user]);
  await admin.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional upgrade')", [job, tenant]);
  await admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'finding','question','question.resolve')", [decision, tenant]);
  await admin.query(`INSERT INTO app.job_finding(id,tenant_id,job_id,decision_id,fingerprint,kind,classification,title,detail,subject_ref,action_type,snapshot_revision)
    VALUES($1,$2,$3,$4,$5,'unresolved_question','advisory','Fictional question','Confirm fictional scope','question','question.resolve',1)`, [randomUUID(), tenant, job, decision, "a".repeat(64)]);
  await admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'dismissed',$4)", [randomUUID(), tenant, decision, member]);
  await admin.query(`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
    VALUES($1,$2,'fixture.upgrade','fictional',$3,'succeeded','{}',$4,clock_timestamp())`, [randomUUID(), tenant, "b".repeat(64), member]);
  await admin.query(`INSERT INTO app.audit_event(id,tenant_id,sequence,version,actor_ref,event_type,subject_type,subject_ref,occurred_at,payload,payload_hash,previous_hash,event_hash)
    VALUES($1,$2,1,'audit.v1','fixture','fixture.upgrade','job',$3,clock_timestamp(),'{}',$4,NULL,$5)`, [randomUUID(), tenant, job, "c".repeat(64), "d".repeat(64)]);
}, 120000);
afterAll(async () => { await closeTestPools(admin); await postgres?.stop(); vi.unstubAllEnvs(); });
it("L065 upgrade applies only 0193 before later migrations, preserves named rows/types, and repeats successfully", async () => {
  const before = await snapshot(admin), url = MIGRATION_URLS.find(u => u.pathname.endsWith(`/${migration}`));
  expect(url).toBeDefined();
  const client = await admin.connect();
  try { await client.query("SET ROLE jobguard_migration"); await client.query(await readFile(url!, "utf8")); }
  finally { await client.query("RESET ROLE"); client.release(); }
  await compare(admin, before);
  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [migration]);
  await migrate(admin); await compare(admin, before); await migrate(admin); await compare(admin, before);
  const routine = (await admin.query(`SELECT p.prosecdef,pg_get_userbyid(p.proowner) AS owner,
    has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') AS runtime_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname='decision_check_command'`)).rows;
  expect(routine).toEqual([{ prosecdef: true, owner: "jobguard_migration", runtime_execute: true }]);
});
it("L065 upgrade comparison rejects a microsecond change and a retype; accepts later columns, functions and inserted rows", async () => {
  const client = await admin.connect();
  try {
    await client.query("CREATE FUNCTION app.later_upgrade_control() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
    const before = await snapshot(client);
    for (const [sql, fails] of [
      ["ALTER TABLE app.command_receipt DISABLE TRIGGER USER; UPDATE app.command_receipt SET created_at=created_at+interval '1 microsecond' WHERE command_type='fixture.upgrade'", true],
      ["ALTER TABLE app.command_receipt ALTER COLUMN semantic_key TYPE text", true],
      ["ALTER TABLE app.command_receipt ADD COLUMN later_nullable text; CREATE OR REPLACE FUNCTION app.later_upgrade_control() RETURNS integer LANGUAGE sql AS 'SELECT 2'", false],
      [`INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at) VALUES('${randomUUID()}','${tenant}','fixture.later','later','${"e".repeat(64)}','succeeded','{}','${member}',clock_timestamp())`, false],
    ] as const) {
      await client.query("BEGIN");
      try { await client.query(sql); if (fails) await expect(compare(client, before)).rejects.toThrow(); else await compare(client, before); }
      finally { await client.query("ROLLBACK"); }
    }
  } finally { client.release(); }
});
