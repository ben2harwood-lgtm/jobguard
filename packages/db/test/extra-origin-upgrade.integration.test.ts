// Written first; NOT RUN (sandbox cannot start PostgreSQL / a browser).
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExtraRepository, MIGRATION_URLS, migrate, withTenant } from "../src/index.js";
import { cluster, fixture, rawVariation, rawOrigin, receipt, ownerTx, newOriginColumns, newTables, type Cluster } from "./extra-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
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
  await migrate(c.admin); await migrate(c.admin);
  for (const table of tables) {
   const added = table === "extra_origin" ? newOriginColumns : table === "variation" ? ["sor_version_id", "sor_code", "excess_of_revision_id", "excess_of_scope_item_id"] : [];
   const after = (await c.admin.query(`SELECT * FROM app.${table} ORDER BY tenant_id,${table === "extra_origin" ? "variation_id" : "id"}`)).rows;
   expect(after.map(row => Object.fromEntries(Object.entries(row).filter(([k]) => !added.includes(k))))).toEqual(before[table]);
   for (const row of after) for (const col of added) expect(row[col]).toBeNull();
  }
  // Round 1: read the actual SH-1 backfill, preserving its unknown identities (written first, NOT RUN).
  for (const old of before.extra_origin!.filter((row: Record<string, any>) => row.provenance === "backfilled_synthetic_fixture")) {
   expect(await new ExtraRepository(c.runtime).readExtra(testTenantContext(old.tenant_id), old.job_id, old.variation_id)).toMatchObject({ version: "extra-record-legacy.v1", origin: { version: "extra-origin-legacy.v1", legacy: true, provenance: old.provenance, commandId: null, raisingMembershipId: null } });
  }
  for (const row of existingFunctions) expect((await c.admin.query("SELECT pg_get_functiondef($1::oid) definition", [row.oid])).rows[0].definition).toBe(row.definition);
  expect((await c.admin.query("SELECT * FROM public.jobguard_schema_migration WHERE migration_name='0122_extra_origin_persistence.sql'")).rowCount).toBe(1);
  for (const col of newOriginColumns) await expect(withTenant(c.runtime, f.ctx, async db => { const id = randomUUID(), command = await receipt(db, f.p.tenantId, fixtureJob, id, f.p.membershipId); await rawVariation(db, f.p.tenantId, fixtureJob, id); await rawOrigin(db, { ...f, jobId: fixtureJob }, id, command, { raising_grant_id: null, [col]: col === "raiser_assigned" ? false : col.includes("hash") ? "a".repeat(64) : col === "command_type" ? "LogSiteExtra" : randomUUID() }); })).rejects.toMatchObject({ code: "23514" });
  const fresh = await cluster(); try {
   const catalog = async (db: typeof c.admin) => (await db.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,pg_get_constraintdef(k.oid) definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_constraint k ON k.conrelid=c.oid WHERE n.nspname='app' AND c.relname=ANY($1::text[]) ORDER BY c.relname,definition", [newTables])).rows;
   expect(await catalog(fresh.admin)).toEqual(await catalog(c.admin));
  } finally { await fresh.close(); }
 });
});
