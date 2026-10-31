import { seedActiveContractorAgreement } from "./contractor-agreement-test-fixture.js";
// Written first; NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExtraRepository, MIGRATION_URLS, migrate, withTenant } from "../src/index.js";
import { cluster, fixture, rawVariation, rawOrigin, receipt, ownerTx, newOriginColumns, newTables, type Cluster } from "./extra-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
// [MO3-5] Literal pre-0122 lists copied from the merged columnsAt0115; never built from the live catalogue.
const columnsBefore0122: Record<string, string[]> = {
 extra_origin: ["tenant_id uuid", "job_id uuid", "variation_id uuid", "job_track character varying(16)", "kind character varying(32)", "command_id uuid", "raising_membership_id uuid", "raising_role character varying(40)", "server_recorded_at timestamp with time zone", "device_id character varying(200)", "device_captured_at timestamp with time zone", "evidence_hash character(64)", "provenance character varying(40)", "source_capture_kind character varying(32)", "source_capture_hash character(64)"],
 variation: ["id uuid", "tenant_id uuid", "job_id uuid", "scope_item_id uuid", "existing_scope_item_id uuid", "lineage_parent_scope_item_id uuid", "capture_kind character varying(32)", "capture_text character varying(5000)", "description character varying(500)", "ai_rate_pence bigint", "ai_source_ref character varying(300)", "ai_source_hash character(64)", "ai_rate_version character varying(80)", "state character varying(12)", "current_revision_id uuid", "created_at timestamp with time zone", "job_track character varying(16)", "origin character varying(32)"],
 variation_revision: ["id uuid", "tenant_id uuid", "job_id uuid", "variation_id uuid", "scope_item_id uuid", "revision integer", "previous_revision_id uuid", "description character varying(500)", "quantity_decimal character varying(40)", "unit character varying(40)", "unit_rate_pence bigint", "signed_delta_pence bigint", "content_hash character(64)", "confirmed_by_membership_id uuid", "rate_provenance_kind character varying(32)", "rate_source_ref character varying(300)", "rate_source_hash character(64)", "rate_version character varying(80)", "created_at timestamp with time zone"],
};
const columnsAddedBy0122: Record<string, string[]> = {
 extra_origin: ["command_type text", "raising_grant_id uuid", "raiser_assigned boolean", "work_order_id uuid", "work_order_revision_id uuid", "site_visit_id uuid", "evidence_id uuid", "resident_confirmation_evidence_id uuid", "client_capture_id uuid", "origin_hash character(64)"],
 variation: ["sor_version_id uuid", "sor_code text", "excess_of_revision_id uuid", "excess_of_scope_item_id uuid"],
 variation_revision: [],
};
type SqlConnection = Pick<Cluster["admin"], "query">;
type RecordedFunction = { oid: number; definition: string };
const columnName = (column: string) => column.slice(0, column.indexOf(" "));
async function liveColumns(db: SqlConnection): Promise<Record<string, string[]>> {
 const rows = (await db.query(`SELECT c.relname AS name,array_agg(a.attname::text||' '||format_type(a.atttypid,a.atttypmod) ORDER BY a.attnum) AS columns
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON (a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)
  WHERE (c.relkind='r' AND n.nspname='app' AND c.relname=ANY($1::text[])) GROUP BY c.relname`, [Object.keys(columnsBefore0122)])).rows;
 return Object.fromEntries(rows.map(row => [row.name as string, row.columns as string[]]));
}
function changedColumnTypes(before: Record<string, string[]>, after: Record<string, string[]>) {
 const changed: string[] = [];
 for (const [table, columns] of Object.entries(before)) {
  const now = new Map((after[table] ?? []).map(column => [columnName(column), column]));
  for (const column of columns) if (now.get(columnName(column)) !== column) changed.push(`${table}.${columnName(column)}`);
 }
 return changed;
}
// [MO3-5] The fingerprinted-table guard owns exact head shapes: variation_revision is pinned there;
// extra_origin and variation deliberately are not. This comparison only projects the named old columns.
async function namedColumnRows(db: SqlConnection, table: string, rows?: Record<string, unknown>[]) {
 const columns = columnsBefore0122[table]!.map(columnName);
 const values = rows ?? (await db.query(`SELECT ${columns.join(",")} FROM app.${table} ORDER BY tenant_id,${table === "extra_origin" ? "variation_id" : "id"}`)).rows;
 return values.map(row => Object.fromEntries(columns.map(name => [name, row[name]])));
}
async function changedFunctions(db: SqlConnection, functions: RecordedFunction[]) {
 const changed: number[] = [];
 for (const row of functions) {
  const current = (await db.query("SELECT pg_get_functiondef(oid) definition FROM pg_proc WHERE oid=$1::oid", [row.oid])).rows[0];
  if (current?.definition !== row.definition) changed.push(row.oid); // [MO3-3] Gone is changed too.
 }
 return changed;
}
async function scratchStatement(work: (db: SqlConnection) => Promise<void>) {
 const db = await c.admin.connect();
 try { await db.query("BEGIN"); await work(db); }
 finally { try { await db.query("ROLLBACK"); } finally { db.release(); } }
}
let c: Cluster;
beforeAll(async () => { c = await cluster(true); }, 60_000);
afterAll(async () => { await c?.close(); });
describe("ENT-4b additive upgrade", () => {
 it("[S8] preserves old columns and fixture origins, adds only NULL columns; migrator idempotent and ordered", async () => {
  const names = MIGRATION_URLS.map(u => u.pathname.split("/").at(-1)!);
  expect(names).toEqual([...names].sort()); expect(new Set(names).size).toBe(names.length);
  const own = names.indexOf("0122_extra_origin_persistence.sql"); expect(own).toBeGreaterThan(names.indexOf("0053_shared_money_origin.sql")); expect(own).toBeGreaterThan(names.indexOf("0110_work_orders.sql"));
  const f = await fixture(c);
  const fixtureJob = await ownerTx(c, f.p.tenantId, async db => { const id = randomUUID(); await db.$client.query("INSERT INTO app.job(tenant_id,id,title) VALUES($1,$2,'Fictional contractor fixture')", [f.p.tenantId, id]); await db.$client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'contractor','synthetic_demo','work_order_import')", [f.p.tenantId, id]); return id; });
  await withTenant(c.runtime, f.ctx, async db => { const id = randomUUID(), command = await receipt(db, f.p.tenantId, fixtureJob, id, f.p.membershipId); await rawVariation(db, f.p.tenantId, fixtureJob, id); await rawOrigin(db, { ...f, jobId: fixtureJob }, id, command, { raising_grant_id: undefined }); });
  await ownerTx(c, f.p.tenantId, async db => { const job = randomUUID(); await db.$client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional legacy small builder','live')", [f.p.tenantId, job]); await rawVariation(db, f.p.tenantId, job, randomUUID(), "builder_logged", "small_builder"); });
  // Existing revision fixture copies the already-imported immutable SoR values;
  // this leaf supplies no price or calculation and the repository writes no revision.
  await ownerTx(c, f.p.tenantId, async db => {
   const v = (await db.$client.query("SELECT * FROM app.variation WHERE tenant_id=$1 AND job_track='small_builder' LIMIT 1", [f.p.tenantId])).rows[0];
   await db.$client.query("INSERT INTO app.variation_revision(tenant_id,id,job_id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version) SELECT $1,$2,$3,$4,$5,1,'Fictional preceding revision','1',unit,rate_pence,rate_pence,$6,$7,'human_entered','fixture://merged-sor',$6,'fixture-v1' FROM app.sor_item WHERE tenant_id=$1 AND version_id=$8 AND code='FIT-LOCK'", [f.p.tenantId, randomUUID(), v.job_id, v.id, v.scope_item_id, "a".repeat(64), f.p.membershipId, f.demo.sorVersionId]);
  });
  expect((await c.admin.query("SELECT DISTINCT provenance FROM app.extra_origin WHERE job_track='small_builder'")).rows.map(r => r.provenance)).toEqual(expect.arrayContaining(["backfilled_synthetic_fixture", "legacy_synthetic_capture"]));
  const tables = ["extra_origin", "variation", "variation_revision"];
  const before = Object.fromEntries(await Promise.all(tables.map(async table => [table, (await c.admin.query(`SELECT * FROM app.${table} ORDER BY tenant_id,${table === "extra_origin" ? "variation_id" : "id"}`)).rows])));
  const existingFunctions = (await c.admin.query("SELECT oid,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='app'::regnamespace ORDER BY oid")).rows;
  expect(await liveColumns(c.admin), "[MO3-1(b)] The pre-0122 catalogue equals the written lists").toEqual(columnsBefore0122);
  // [MO3-2] Byte for byte what migrate.ts:79-83 does for this file: read, run, record its name.
  // The existing fresh cluster below still installs 0122 through the runner.
  await c.admin.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
  await c.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1) ON CONFLICT DO NOTHING", [names[own]]);
  expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name), "[MO3-2] 0122 alone, nothing later").toEqual(names.slice(0, own + 1));
  expect(await changedFunctions(c.admin, existingFunctions), "[MO3-3] 0122 changed no existing function").toEqual([]);
  expect(await liveColumns(c.admin), "[MO3-1(b)] 0122 adds exactly its declared columns in order, preserving old names and types").toEqual(Object.fromEntries(tables.map(table => [table, [...columnsBefore0122[table]!, ...columnsAddedBy0122[table]!]])));
  const scratchFunction = existingFunctions.find((row: RecordedFunction) => row.definition.includes("FUNCTION app.half_even_ratio(n bigint, num bigint, den bigint)")) as RecordedFunction | undefined;
  expect(scratchFunction, "[MO3-1(iii)] The recorded half_even_ratio function exists").toBeDefined();
  expect(scratchFunction!.definition, "[MO3-1(iii)] The recorded body has the expected delimiter").toContain("$function$");
  const replaceScratchFunction = scratchFunction!.definition.replace("$function$", "$function$/* mo3 scratch */");
  // [MO3-1(a), MO3-1(iii)] The same replacement at 0122's step still stops passing, for exactly one function.
  await scratchStatement(async db => {
   await db.query(replaceScratchFunction);
   expect(await changedFunctions(db, existingFunctions), "[MO3-1(iii)] Own-step function negative control").toEqual([scratchFunction!.oid]);
  });
  expect(await changedFunctions(c.admin, existingFunctions), "[MO3-3] Own-step scratch function change was rolled back").toEqual([]);
  // [MO3-4] All later migrations must succeed twice, with no special case in the runner.
  await migrate(c.admin); await migrate(c.admin);
  expect((await c.admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name), "[MO3-4] The complete registry is installed").toEqual(names);
  for (const table of tables) {
   const added = table === "extra_origin" ? newOriginColumns : table === "variation" ? ["sor_version_id", "sor_code", "excess_of_revision_id", "excess_of_scope_item_id"] : [];
   expect(added, "[MO3-5] NULL checks cover exactly the declared 0122 additions").toEqual(columnsAddedBy0122[table]!.map(columnName));
   const after = (await c.admin.query(`SELECT * FROM app.${table} ORDER BY tenant_id,${table === "extra_origin" ? "variation_id" : "id"}`)).rows;
   expect(await namedColumnRows(c.admin, table, after)).toEqual(before[table]); // [MO3-5, MO3-1(c)] Same rows, order, count and old values.
   for (const row of after) for (const col of added) expect(row[col]).toBeNull();
  }
  expect(changedColumnTypes(columnsBefore0122, await liveColumns(c.admin)), "[MO3-5, MO3-1(d)] Every named old column still exists with its old type").toEqual([]);
  const columnsBeforeControls = await liveColumns(c.admin);
  const rowsBeforeControls = Object.fromEntries(await Promise.all(tables.map(async table => [table, await namedColumnRows(c.admin, table)])));
  // [MO3-1] These are the same post-step-2 comparisons as above; functions are deliberately not compared here.
  const assertHeadComparisons = async (db: SqlConnection) => {
   for (const table of tables) {
    expect(await namedColumnRows(db, table), `[MO3-5] ${table} old rows`).toEqual(before[table]);
    const rows = (await db.query(`SELECT * FROM app.${table}`)).rows;
    for (const row of rows) for (const col of columnsAddedBy0122[table]!.map(columnName)) expect(row[col], "[MO3-1(e)] 0122 additions remain NULL on old rows").toBeNull();
   }
   expect(changedColumnTypes(columnsBefore0122, await liveColumns(db)), "[MO3-5] Old column types").toEqual([]);
  };
  // [MO3-1(i)] A later nullable column stays GREEN.
  await scratchStatement(async db => {
   await db.query("ALTER TABLE app.extra_origin ADD COLUMN mo3_scratch text");
   await assertHeadComparisons(db);
  });
  // [MO3-1(ii)] A later function replacement stays GREEN: no function comparison after step 2.
  await scratchStatement(async db => {
   await db.query(replaceScratchFunction);
   await assertHeadComparisons(db);
  });
  // [MO3-1(iv)] Change exactly one old value in each table; the same named-row comparison stops passing.
  for (const [table, column] of [["extra_origin", "device_id"], ["variation", "description"], ["variation_revision", "description"]] as const) {
   await scratchStatement(async db => {
    await db.query("SET LOCAL session_replication_role=replica");
    const old = before[table]![0]!;
    const id = table === "extra_origin" ? "variation_id" : "id";
    const result = await db.query(`UPDATE app.${table} SET ${column}=$1 WHERE (tenant_id=$2 AND ${id}=$3)`, ["mo3 scratch value", old.tenant_id, old[id]]);
    expect(result.rowCount, `[MO3-1(iv)] ${table}.${column}: exactly one row changed`).toBe(1);
    const expected = before[table]!.map((row: Record<string, unknown>, index: number) => index === 0 ? { ...row, [column]: "mo3 scratch value" } : row);
    const changed = await namedColumnRows(db, table);
    expect(changed, `[MO3-1(iv)] ${table}.${column} stops passing`).not.toEqual(before[table]);
    expect(changed, `[MO3-1(iv)] Only the intended value changed in ${table}`).toEqual(expected);
   });
  }
  // [MO3-1(iv)] A real retype stops passing even when the values stay identical.
  await scratchStatement(async db => {
   await db.query("ALTER TABLE app.extra_origin ALTER COLUMN device_id TYPE character varying(201)");
   expect(changedColumnTypes(columnsBefore0122, await liveColumns(db)), "[MO3-1(iv)] Real retype negative control").toEqual(["extra_origin.device_id"]);
   expect(await namedColumnRows(db, "extra_origin"), "[MO3-1(iv)] Retype kept the row values").toEqual(before.extra_origin);
  });
  // [MO3-1(iv)] Required list-form control independently exercises the same type comparison.
  await scratchStatement(async db => {
   const altered = { ...columnsBefore0122, extra_origin: columnsBefore0122.extra_origin!.map(column => columnName(column) === "device_id" ? "device_id character varying(201)" : column) };
   expect(changedColumnTypes(altered, await liveColumns(db)), "[MO3-1(iv)] List-form retype negative control").toEqual(["extra_origin.device_id"]);
  });
  expect(await liveColumns(c.admin), "[MO3-1] All scratch column changes were rolled back").toEqual(columnsBeforeControls);
  for (const table of tables) expect(await namedColumnRows(c.admin, table), `[MO3-1] ${table} scratch row changes were rolled back`).toEqual(rowsBeforeControls[table]);
  // Round 1: read the actual SH-1 backfill, preserving its unknown identities (written first, NOT RUN).
  for (const old of before.extra_origin!.filter((row: Record<string, any>) => row.provenance === "backfilled_synthetic_fixture")) {
   expect(await new ExtraRepository(c.runtime).readExtra(testTenantContext(old.tenant_id), old.job_id, old.variation_id)).toMatchObject({ version: "extra-record-legacy.v1", origin: { version: "extra-origin-legacy.v1", legacy: true, provenance: old.provenance, commandId: null, raisingMembershipId: null } });
  }
  expect((await c.admin.query("SELECT * FROM public.jobguard_schema_migration WHERE migration_name='0122_extra_origin_persistence.sql'")).rowCount).toBe(1);
  await seedActiveContractorAgreement(c.admin,f.p.tenantId);
  for (const col of newOriginColumns) await expect(withTenant(c.runtime, f.ctx, async db => { const id = randomUUID(), command = await receipt(db, f.p.tenantId, fixtureJob, id, f.p.membershipId); await rawVariation(db, f.p.tenantId, fixtureJob, id); await rawOrigin(db, { ...f, jobId: fixtureJob }, id, command, { raising_grant_id: null, [col]: col === "raiser_assigned" ? false : col.includes("hash") ? "a".repeat(64) : col === "command_type" ? "LogSiteExtra" : randomUUID() }); })).rejects.toMatchObject({ code: "23514" });
  const fresh = await cluster(); try {
   const catalog = async (db: typeof c.admin) => (await db.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,pg_get_constraintdef(k.oid) definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_constraint k ON k.conrelid=c.oid WHERE n.nspname='app' AND c.relname=ANY($1::text[]) ORDER BY c.relname,definition", [newTables])).rows;
   expect(await catalog(fresh.admin)).toEqual(await catalog(c.admin));
  } finally { await fresh.close(); }
 }, 120_000);
});
