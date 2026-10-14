import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

const nameOf = (url: URL) => fileURLToPath(url).split("/").at(-1)!;
const ownName = "0158_shadow_disclosure_completion.sql";
async function populatedTables(db: PoolClient) {
  const names = (await db.query(`SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY 1`)).rows;
  const populated: string[] = [];
  for (const row of names) if ((await db.query(`SELECT EXISTS(SELECT 1 FROM ${row.name}) AS present`)).rows[0].present) populated.push(row.name);
  return populated;
}
type Snapshot = { table: string; columns: { name: string; type: string }[]; keys: string[]; rows: { identity: string; bytes: string }[] };
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function snapshot(db: Pool | PoolClient, table: string, previous?: Snapshot): Promise<Snapshot> {
  const columns = (await db.query(`SELECT attname AS name,format_type(atttypid,atttypmod) AS type FROM pg_attribute
    WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`, [table])).rows;
  const keys = previous?.keys ?? (await db.query(`SELECT a.attname AS name FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,position)
    JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
    WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.position`, [table])).rows.map(row => row.name as string);
  expect(keys.length).toBeGreaterThan(0);
  const named = (previous?.columns ?? columns).map(column => quote(column.name)).join(",");
  const identity = `jsonb_build_array(${keys.map(quote).join(",")})::text`;
  const rows = (await db.query(`SELECT ${identity} AS identity,row_to_json(t)::text AS bytes FROM (SELECT ${named} FROM ${table}) t ORDER BY ${identity} COLLATE "C"`)).rows;
  // Only the rows that existed before N; later inserts are outside the preservation assertion.
  const selected = previous ? rows.filter(row => previous.rows.some(old => old.identity === row.identity)) : rows;
  return { table, columns: previous ? columns.filter(column => previous.columns.some(old => old.name === column.name)) : columns, keys, rows: selected };
}
async function preserved(db: Pool | PoolClient, before: Snapshot[]) {
  for (const old of before) {
    expect(old.rows.length, `pre-existing rows in ${old.table}`).toBeGreaterThan(0);
    expect(await snapshot(db, old.table, old)).toEqual(old);
  }
}
async function catalog(db: Pool | PoolClient) {
  return (await db.query(`SELECT c.oid::regclass::text AS name,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text AS acl,
    (SELECT jsonb_agg(jsonb_build_array(polname,polcmd,polroles,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) ORDER BY polname) FROM pg_policy WHERE polrelid=c.oid) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY name`)).rows;
}
async function routines(db: PoolClient) {
  return (await db.query(`SELECT p.oid::regprocedure::text AS name,pg_get_userbyid(proowner) AS owner,prosecdef,proacl::text AS acl,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') AND p.prokind='f' ORDER BY name`)).rows;
}
const credential = randomUUID();
let postgres: EmbeddedPostgres, admin: Pool;
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "jg-migfix-7-upgrade-")), port = await freePort(62600, 100);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"] });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential });
}, 60_000);
afterAll(async () => { await closeTestPools(admin); await postgres?.stop(); });

describe("MIGFIX-7 upgrade", () => {
  it("MIGFIX-7.UPGRADE own-step preservation, grants, repeat application, later migrations twice and full types", async () => {
    const db = await admin.connect();
    try {
      await db.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
      for (const url of MIGRATION_URLS.filter(url => nameOf(url) < ownName)) {
        const name = nameOf(url), text = await readFile(url, "utf8");
        await db.query(name === "0095_job_parties.sql" ? text.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);") : text);
        await db.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
      }
      await installLegacySyntheticPartyFixtures(admin);
      const tenant = randomUUID(), job = randomUUID(), survivor = randomUUID(), dup = randomUUID(), hidden = randomUUID(), event = randomUUID();
      await db.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
      await db.query("SELECT set_config('app.tenant_id',$1,false)", [tenant]);
      await db.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional upgrade job','live')", [job, tenant]);
      await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT DO NOTHING", [tenant, job]);
      for (const id of [survivor, dup, hidden]) await db.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band)
        VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic:m7','2026-10-01T00:00:00.123456Z','Fictional upgrade signal','low')`, [tenant, job, id]);
      await db.query("UPDATE app.shadow_commercial_signal SET state='reconciled',outcome='duplicate_signal',coalesced_into_signal_id=$2 WHERE id=$1", [dup, survivor]);
      await db.query("SELECT app.record_shadow_disclosure($1,$2,$3,$4,'defect')", [tenant, job, hidden, event]); // historical single-signal disclosure
      const tables = ["app.shadow_commercial_signal", "app.shadow_disclosure_event", "app.shadow_signal_ineligibility", "app.audit_event", "app.job"];
      const populated = await populatedTables(db);
      for (const table of tables) expect(populated).toContain(table);
      const before = await Promise.all(tables.map(table => snapshot(db, table))), privileges = await catalog(db), beforeRoutines = await routines(db);
      const own = MIGRATION_URLS.find(url => nameOf(url) === ownName);
      expect(own, "own migration registered").toBeDefined();
      await db.query("SET ROLE jobguard_migration");
      await db.query(await readFile(own!, "utf8"));
      await db.query("RESET ROLE");
      await preserved(db, before); expect(await catalog(db)).toEqual(privileges);
      const afterRoutines = await routines(db), names = new Set(beforeRoutines.map(row => row.name));
      for (const prior of beforeRoutines) {
        const after = afterRoutines.find(row => row.name === prior.name);
        if (prior.name === "app.record_shadow_disclosure(uuid,uuid,uuid,uuid,text)") {
          expect({ ...after, definition: prior.definition }).toEqual(prior); // owner, SECURITY DEFINER and EXECUTE grantees unchanged
          expect(after.definition).not.toBe(prior.definition);
        } else expect(after).toEqual(prior);
      }
      const added = afterRoutines.filter(row => !names.has(row.name)).map(row => row.name).sort();
      expect(added).toEqual(["app.complete_shadow_firing_post_lock(uuid,uuid,uuid,uuid,uuid,uuid,text,text,uuid,text,jsonb)", "app.propagate_shadow_group_disclosure()"]);
      for (const row of afterRoutines.filter(row => added.includes(row.name))) expect(row).toMatchObject({ owner: "jobguard_migration", prosecdef: true, acl: "{jobguard_migration=X/jobguard_migration}" });
      const grantees = (await db.query(`SELECT count(*)::int n FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE p.proname IN('complete_shadow_firing_post_lock','propagate_shadow_group_disclosure') AND a.grantee<>p.proowner`)).rows[0];
      expect(grantees.n, "no new EXECUTE grantee on either new routine").toBe(0);
      expect((await db.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgfoid='app.propagate_shadow_group_disclosure()'::regprocedure")).rows).toEqual([{ tgname: "shadow_group_disclosure" }]);
      await db.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [ownName]);
      // Historical rows are never rewritten: the survivor and duplicate stay undisclosed until someone discloses them.
      expect((await db.query("SELECT id,disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=ANY($1::uuid[]) ORDER BY id", [[survivor, dup]])).rows.every(row => row.disclosed_before_lock === false)).toBe(true);
      await migrate(db); await migrate(db); // Everything after N succeeds twice.
      await preserved(db, before);
      async function control(sql: string, succeeds: boolean, args: unknown[] = []) {
        await db.query("BEGIN");
        try { await db.query(sql, args); if (succeeds) await preserved(db, before); else await expect(preserved(db, before)).rejects.toThrow(); }
        finally { await db.query("ROLLBACK"); }
      }
      await control("UPDATE app.job SET title=title||'x' WHERE id=$1", false, [job]);
      await control("ALTER TABLE app.shadow_commercial_signal ALTER COLUMN signal_type TYPE varchar(80)", false);
      await control("ALTER TABLE app.shadow_commercial_signal ADD COLUMN migfix_7_nullable text", true);
      await preserved(db, before);
    } finally { await db.query("ROLLBACK"); await db.query("RESET ROLE"); db.release(); }
  }, 120_000);
});
