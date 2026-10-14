import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

// Supplementary proof: the merged N-only test stays unchanged. Expectations
// were written before the helpers below. PostgreSQL cannot start in the builder sandbox.
type Connection = Pick<PoolClient, "query">;
type Column = { name: string; fullType: string };
type OriginalRow = { keys: string[]; identity: string; bytes: string };
type Snapshot = { table: string; columns: Column[]; primaryKey: string[]; rows: OriginalRow[] };
type Differences = { types: string[]; changed: string[]; missing: string[] };
const tables = ["job", "scope_identity", "variation", "job_commercial_track", "extra_origin"];
const fixtures = Array.from({ length: 2 }, () => ({ tenant: randomUUID(), job: randomUUID(), scope: randomUUID(), variation: randomUUID() }));
const ownName = "0128_shadow_persistence.sql";
const routineSignature = "app.half_even_ratio(bigint,bigint,bigint)";
const scratchColumn = "f7_nullable_control";
const dbAccessValue = randomUUID();
const clear: Differences = { types: [], changed: [], missing: [] };
const restoredControls: string[] = [];
let postgres: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool | undefined;
let port: number, originals: Snapshot[], originalRoutine: string;
const nameOf = (url: URL) => url.pathname.split("/").at(-1)!;
const originLabel = () => `extra_origin:${JSON.stringify([fixtures[0]!.tenant, fixtures[0]!.variation])}`;

describe.sequential("FIXLATER-7 supplementary SV-2 rule-9 proof", () => {
  beforeAll(async () => { await preparePredecessors(); }, 60_000);
  afterAll(async () => {
    await closeTestPools(runtime, admin);
    await postgres?.stop();
    // Retain the disposable directory: this order forbids deleting anything.
  });

  it("[F7-U01] seeded predecessors produce nonempty SH-1 backfilled origins", async () => {
    expect(originals.map(snapshot => snapshot.table)).toEqual(tables);
    for (const snapshot of originals) {
      expect(snapshot.rows.length, snapshot.table).toBeGreaterThan(0);
      expect(snapshot.primaryKey.length, snapshot.table).toBeGreaterThan(0);
    }
    const origins = (await admin.query(`SELECT tenant_id,variation_id,kind,provenance,raising_role,raising_membership_id,command_id
      FROM app.extra_origin ORDER BY tenant_id,variation_id`)).rows;
    expect(origins).toHaveLength(fixtures.length);
    for (const fixture of fixtures) expect(origins).toContainEqual({ tenant_id: fixture.tenant, variation_id: fixture.variation,
      kind: "builder_logged", provenance: "backfilled_synthetic_fixture", raising_role: "legacy_unrecorded", raising_membership_id: null, command_id: null });
  });

  it("[F7-U02] 0128 alone preserves identified predecessor rows and full types", async () => {
    const own = MIGRATION_URLS.find(url => nameOf(url) === ownName)!;
    await applyAndRecord(admin, own);
    expect(await compareOriginals(admin)).toEqual(clear);
    const source = (await admin.query(`SELECT variation_id,source_signal_id FROM app.extra_origin ORDER BY variation_id`)).rows;
    expect(source).toHaveLength(fixtures.length);
    for (const row of source) expect(row.source_signal_id).toBeNull();
    await requireSingleOrigins(admin);
    originalRoutine = await routineDefinition(admin);
  });

  it("[F7-U04] a one-microsecond change fails the shared canonical comparison", async () => {
    await rolledBackControl("microsecond", async db => {
      await db.query("SET LOCAL session_replication_role=replica");
      const updated = await db.query(`UPDATE app.extra_origin SET server_recorded_at=server_recorded_at+interval '1 microsecond'
        WHERE tenant_id=$1 AND variation_id=$2`, [fixtures[0]!.tenant, fixtures[0]!.variation]);
      expect(updated.rowCount).toBe(1);
      expect(await compareOriginals(db)).toEqual({ types: [], missing: [], changed: [originLabel()] });
    });
  });

  it("[F7-U05] a value-preserving retype fails the shared full-type comparison", async () => {
    await rolledBackControl("retype", async db => {
      const before = await originalRowTexts(db, originals.find(snapshot => snapshot.table === "extra_origin")!);
      await db.query("ALTER TABLE app.extra_origin ALTER COLUMN source_capture_kind TYPE varchar(64)");
      expect(await originalRowTexts(db, originals.find(snapshot => snapshot.table === "extra_origin")!)).toEqual(before);
      expect(await compareOriginals(db)).toEqual({ types: ["extra_origin.source_capture_kind: character varying(32) -> character varying(64)"], changed: [], missing: [] });
    });
  });

  it("[F7-U06] a missing original primary key fails the shared identity comparison", async () => {
    await rolledBackControl("missing", async db => {
      await db.query("SET LOCAL session_replication_role=replica");
      const removed = await db.query("DELETE FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2", [fixtures[0]!.tenant, fixtures[0]!.variation]);
      expect(removed.rowCount).toBe(1);
      expect(await compareOriginals(db)).toEqual({ types: [], changed: [], missing: [originLabel()] });
    });
  });

  it("[F7-U07] a later nullable column passes the original-column comparison", async () => {
    await rolledBackControl("nullable column", async db => {
      await db.query(`ALTER TABLE app.extra_origin ADD COLUMN ${scratchColumn} text`);
      expect((await db.query(`SELECT is_nullable FROM information_schema.columns
        WHERE table_schema='app' AND table_name='extra_origin' AND column_name=$1`, [scratchColumn])).rows).toEqual([{ is_nullable: "YES" }]);
      expect(await compareOriginals(db)).toEqual(clear);
    });
  });

  it("[F7-U08] a later equivalent routine replacement passes the post-N proof", async () => {
    await rolledBackControl("routine", async db => {
      const replacement = originalRoutine.replace(/AS (\$[^$]*\$)/u, "$&\n/* F7 scratch equivalent definition */");
      expect(replacement).not.toBe(originalRoutine);
      await db.query(replacement);
      const definition = await routineDefinition(db);
      expect(definition).not.toBe(originalRoutine);
      expect(definition).toContain("F7 scratch equivalent definition");
      expect(await compareOriginals(db)).toEqual(clear);
    });
  });

  it("[F7-U09] a later inserted row passes while every original row remains present", async () => {
    await rolledBackControl("insert", async db => {
      const id = randomUUID(), fixture = fixtures[0]!;
      expect((await db.query(`INSERT INTO app.scope_identity(id,tenant_id,job_id,state)
        VALUES($1,$2,$3,'confirmed')`, [id, fixture.tenant, fixture.job])).rowCount).toBe(1);
      expect((await db.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND id=$2", [fixture.tenant, id])).rows).toEqual([{ id }]);
      expect(await compareOriginals(db)).toEqual(clear);
    });
  });

  it("[F7-U10] every rolled-back control restores its fixture before later migrations", async () => {
    expect(restoredControls).toEqual(["microsecond", "retype", "missing", "nullable column", "routine", "insert"]);
    await requireRestored(admin);
    expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration WHERE migration_name=$1", [ownName])).rowCount).toBe(1);
    const own = MIGRATION_URLS.findIndex(url => nameOf(url) === ownName);
    for (const url of MIGRATION_URLS.slice(own + 1)) expect((await admin.query(
      "SELECT migration_name FROM public.jobguard_schema_migration WHERE migration_name=$1", [nameOf(url)])).rowCount).toBe(0);
  });

  // Controls deliberately precede both real later-migration calls: future views
  // must not prevent the retype control from reaching the shared comparator.
  it("[F7-U03] every later migration succeeds twice and preserves original identities", async () => {
    const reader = new Pool({ host: "127.0.0.1", port, user: "postgres", password: dbAccessValue, database: "postgres", max: 1 });
    try {
      const writerPid = (await admin.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      expect((await reader.query("SELECT pg_backend_pid() AS pid")).rows[0].pid).not.toBe(writerPid);
      for (let call = 0; call < 2; call++) {
        await migrate(admin);
        expect((await reader.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows
          .map(row => row.migration_name)).toEqual(MIGRATION_URLS.map(nameOf).sort());
        expect(await compareOriginals(reader)).toEqual(clear);
        await requireSingleOrigins(reader);
      }
    } finally { await closeTestPools(reader); }
  }, 60_000);

  it("[F7-U11] runtime tenant isolation survives the complete upgrade", async () => {
    await admin.query(`CREATE ROLE f7_runtime LOGIN PASSWORD '${dbAccessValue}' INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT jobguard_runtime TO f7_runtime`);
    runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "f7_runtime", password: dbAccessValue, max: 1 });
    expect((await runtime.query(`SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication
      FROM pg_roles WHERE rolname=current_user`)).rows).toEqual([{ rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false }]);
    for (const fixture of fixtures) expect(await runtimeOrigins(fixture.tenant)).toEqual([{ tenant_id: fixture.tenant, variation_id: fixture.variation }]);
    expect(await runtimeOrigins()).toEqual([]);
    expect(await runtimeOrigins("")).toEqual([]);
    expect(await runtimeOrigins(fixtures[1]!.tenant, fixtures[0]!.variation)).toEqual([]);
    // This proves RLS under a supplied setting, not caller authentication.
  });

  it("[F7-U12] refused runtime writes and shadow reads leave original rows unchanged", async () => {
    for (const statement of [
      "UPDATE app.extra_origin SET source_capture_kind='voice' WHERE tenant_id=$1 AND variation_id=$2",
      "DELETE FROM app.extra_origin WHERE tenant_id=$1 AND variation_id=$2",
      "TRUNCATE app.extra_origin",
      "SELECT * FROM app.shadow_commercial_signal",
    ]) {
      const client = await runtime!.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id',$1,true)", [fixtures[0]!.tenant]);
        await expect(client.query(statement, statement.includes("$1") ? [fixtures[0]!.tenant, fixtures[0]!.variation] : []))
          .rejects.toMatchObject({ code: "42501" });
      } finally { try { await client.query("ROLLBACK"); } finally { client.release(); } }
      expect(await compareOriginals(admin)).toEqual(clear);
      await requireSingleOrigins(admin);
    }
  });
});

const ident = (value: string) => `"${value.replaceAll('"', '""')}"`;
const tableSql = (table: string) => `app.${ident(table)}`;

async function columnsOf(db: Connection, table: string): Promise<Column[]> {
  return (await db.query<Column>(`SELECT attname AS name,format_type(atttypid,atttypmod) AS "fullType"
    FROM pg_attribute WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`, [`app.${table}`])).rows;
}

async function captureOriginals(db: Connection): Promise<Snapshot[]> {
  const snapshots: Snapshot[] = [];
  for (const table of tables) {
    const columns = await columnsOf(db, table);
    const primaryKey = (await db.query<{ name: string }>(`SELECT a.attname AS name FROM pg_index i
      CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,position)
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
      WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.position`, [`app.${table}`])).rows.map(row => row.name);
    expect(primaryKey.length, `${table} primary key`).toBeGreaterThan(0);
    expect(columns.length, `${table} columns`).toBeGreaterThan(0);
    const rows = (await db.query<{ keys: string[]; bytes: string }>(`SELECT row_to_json(t)::text AS bytes,
      ARRAY[${primaryKey.map(key => `t.${ident(key)}::text`).join(",")}] AS keys
      FROM (SELECT ${columns.map(column => ident(column.name)).join(",")} FROM ${tableSql(table)}) t
      ORDER BY ${primaryKey.map(ident).join(",")}`)).rows;
    expect(rows.length, `${table} populated predecessor`).toBeGreaterThan(0);
    snapshots.push({ table, columns, primaryKey, rows: rows.map(row => ({ ...row, identity: JSON.stringify(row.keys) })) });
  }
  return snapshots;
}

// Select only captured columns and only captured keys. PostgreSQL produces the
// canonical text: timestamp precision never passes through a JavaScript Date.
async function originalRowTexts(db: Connection, snapshot: Snapshot): Promise<Array<string | undefined>> {
  const values: Array<string | undefined> = [];
  for (const row of snapshot.rows) {
    const result = await db.query<{ bytes: string }>(`SELECT row_to_json(t)::text AS bytes FROM
      (SELECT ${snapshot.columns.map(column => ident(column.name)).join(",")} FROM ${tableSql(snapshot.table)}
       WHERE ${snapshot.primaryKey.map((key, index) => `${ident(key)}=$${index + 1}`).join(" AND ")}) t`, row.keys);
    expect(result.rows.length, `${snapshot.table}:${row.identity} unique key`).toBeLessThanOrEqual(1);
    values.push(result.rows[0]?.bytes);
  }
  return values;
}

async function compareOriginals(db: Connection): Promise<Differences> {
  const differences: Differences = { types: [], changed: [], missing: [] };
  for (const snapshot of originals) {
    const current = new Map((await columnsOf(db, snapshot.table)).map(column => [column.name, column.fullType]));
    for (const column of snapshot.columns) if (current.get(column.name) !== column.fullType) differences.types.push(
      `${snapshot.table}.${column.name}: ${column.fullType} -> ${current.get(column.name) ?? "(missing)"}`);
    // A removed column is already a reported difference; avoid a SQL setup
    // error masking that difference when attempting its named projection.
    if (snapshot.columns.some(column => !current.has(column.name))) continue;
    const texts = await originalRowTexts(db, snapshot);
    snapshot.rows.forEach((row, index) => {
      if (texts[index] === undefined) differences.missing.push(`${snapshot.table}:${row.identity}`);
      else if (texts[index] !== row.bytes) differences.changed.push(`${snapshot.table}:${row.identity}`);
    });
  }
  return differences;
}

async function requireSingleOrigins(db: Connection): Promise<void> {
  for (const fixture of fixtures) {
    const rows = (await db.query(`SELECT tenant_id,job_id,variation_id,kind FROM app.extra_origin
      WHERE tenant_id=$1 AND variation_id=$2`, [fixture.tenant, fixture.variation])).rows;
    expect(rows).toEqual([{ tenant_id: fixture.tenant, job_id: fixture.job, variation_id: fixture.variation, kind: "builder_logged" }]);
  }
}

async function routineDefinition(db: Connection): Promise<string> {
  return (await db.query<{ definition: string }>("SELECT pg_get_functiondef($1::regprocedure) AS definition", [routineSignature])).rows[0]!.definition;
}

async function requireRestored(db: Connection): Promise<void> {
  expect(await compareOriginals(db)).toEqual(clear);
  expect(await routineDefinition(db)).toBe(originalRoutine);
  expect((await columnsOf(db, "extra_origin")).some(column => column.name === scratchColumn)).toBe(false);
  for (const table of tables) expect((await db.query(`SELECT count(*)::int AS count FROM ${tableSql(table)}`)).rows[0].count)
    .toBe(originals.find(snapshot => snapshot.table === table)!.rows.length);
  await requireSingleOrigins(db);
}

async function rolledBackControl(name: string, work: (db: Connection) => Promise<void>): Promise<void> {
  const client = await admin.connect();
  try { await client.query("BEGIN"); await work(client); }
  finally { try { await client.query("ROLLBACK"); } finally { client.release(); } }
  // Read outside the control transaction, including the restored routine and
  // absent scratch column. A setup failure never reaches this success record.
  await requireRestored(admin);
  restoredControls.push(name);
}

async function applyAndRecord(db: Connection, url: URL): Promise<void> {
  const name = nameOf(url), sql = await readFile(url, "utf8");
  // Match the real runner's default details-needed mode for the party backfill.
  await db.query(name === "0095_job_parties.sql"
    ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : sql);
  await db.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
}

async function preparePredecessors(): Promise<void> {
  const own = MIGRATION_URLS.findIndex(url => nameOf(url) === ownName);
  expect(own).toBeGreaterThan(0);
  const predecessors = MIGRATION_URLS.slice(0, own);
  const sh1 = predecessors.findIndex(url => nameOf(url) === "0053_shared_money_origin.sql");
  expect(sh1).toBeGreaterThan(0);
  const directory = await mkdtemp(join(tmpdir(), "jg-fixlater7-pg16-"));
  port = await freePort(62000, 200);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: dbAccessValue, persistent: true,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise();
  await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: dbAccessValue, database: "postgres", max: 1 });
  await admin.query(`CREATE TABLE public.jobguard_schema_migration(
    migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`);
  for (const url of predecessors.slice(0, sh1)) await applyAndRecord(admin, url);
  for (const fixture of fixtures) {
    await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [fixture.tenant]);
    await admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional F7 legacy job','live')", [fixture.job, fixture.tenant]);
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [fixture.scope, fixture.tenant, fixture.job]);
    await admin.query(`INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description)
      VALUES($1,$2,$3,$4,'text','Fictional pre-SH-1 capture','Synthetic F7 legacy')`, [fixture.variation, fixture.tenant, fixture.job, fixture.scope]);
  }
  // The actual SH-1 migration creates tracks and origins. No substitute backfill.
  for (const url of predecessors.slice(sh1)) await applyAndRecord(admin, url);
  originals = await captureOriginals(admin);
}

async function runtimeOrigins(tenant?: string, variation?: string): Promise<unknown[]> {
  const client = await runtime!.connect();
  try {
    await client.query("BEGIN");
    if (tenant !== undefined) await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenant]);
    else expect((await client.query("SELECT nullif(current_setting('app.tenant_id',true),'') AS tenant")).rows).toEqual([{ tenant: null }]);
    return (await client.query(`SELECT tenant_id,variation_id FROM app.extra_origin
      ${variation === undefined ? "" : "WHERE variation_id=$1"} ORDER BY tenant_id,variation_id`, variation === undefined ? [] : [variation])).rows;
  } finally { try { await client.query("ROLLBACK"); } finally { client.release(); } }
}
