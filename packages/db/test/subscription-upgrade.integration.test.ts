import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { meterCompany, meterInput, storeMeter, refreshMeter } from "./meter-persistence-fixtures.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";

const own = "0190_subscription_persistence.sql";
describe.sequential("MON-2A-P upgrade against populated predecessors", () => {
 let f: WorkFixture;
 let before: Awaited<ReturnType<typeof proofBefore>>;
 beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it("own migration preserves populated predecessors", async () => {
  const n = MIGRATION_URLS.findIndex(url => url.pathname.endsWith(own));
  expect(n).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, n)) {
   await f.admin.query(await readFile(url, "utf8"));
   await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  const company = await meterCompany(f); await storeMeter(f, company, meterInput(company.tenantId)); await refreshMeter(f, company);
  before = await proofBefore(f.admin, ["app.account", "app.membership", "app.job", "app.command_receipt", "app.meter_input_event", "app.meter_computation", "app.meter_day_ledger"]);
  for (const table of ["app.job", "app.meter_input_event", "app.meter_computation", "app.meter_day_ledger"]) expect(Object.keys(before[table]!.rows).length).toBeGreaterThan(0);
  const acl = (await f.admin.query("SELECT c.oid,c.relacl::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity') AND c.relkind='r' ORDER BY c.oid")).rows;
  const functions = (await f.admin.query("SELECT p.oid,pg_get_functiondef(p.oid) definition,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity') AND p.prokind='f' ORDER BY p.oid")).rows;
  await f.admin.query(await readFile(MIGRATION_URLS[n]!, "utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [own]);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  expect((await f.admin.query("SELECT oid,relacl::text FROM pg_class WHERE oid=ANY($1::oid[]) ORDER BY oid", [acl.map(row => row.oid)])).rows).toEqual(acl);
  expect((await f.admin.query("SELECT oid,pg_get_functiondef(oid) definition,proacl::text FROM pg_proc WHERE oid=ANY($1::oid[]) ORDER BY oid", [functions.map(row => row.oid)])).rows).toEqual(functions);
 });
 it("later migrations and repeated runner succeed", async () => {
  await migrate(f.admin); await migrate(f.admin);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
 });
 it("catalogue denies direct writes and shadow access", async () => {
  const tables = (await f.admin.query("SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND (c.relname='subscription_plan_catalogue' OR (n.nspname='app' AND c.relname LIKE 'shadow_%'))")).rows;
  expect(tables.some(row => row.relname === "subscription_plan_catalogue")).toBe(true);
  expect(tables.some(row => row.relname.startsWith("shadow_"))).toBe(true);
  for (const table of tables) {
   const privileges = table.relname === "subscription_plan_catalogue" ? "INSERT,UPDATE,DELETE,TRUNCATE" : "SELECT,INSERT,UPDATE,DELETE,TRUNCATE";
   expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1::oid,$2) allowed", [table.oid, privileges])).rows[0].allowed).toBe(false);
  }
 });
 it("negative controls detect changed rows types grants and missing identities", async () => {
  for (const sql of ["UPDATE app.job SET created_at=created_at+interval '1 microsecond'", "ALTER TABLE app.job ALTER COLUMN title TYPE text", "DELETE FROM app.job"]) {
   await rolledBack(f.admin, async db => {
    await db.query("SET LOCAL session_replication_role='replica'"); await db.query(sql);
    expect(await proofDifferences(db, before)).not.toEqual({ rows: [], types: [] });
   });
  }
  await rolledBack(f.admin, async db => {
   expect((await db.query("SELECT has_table_privilege('jobguard_runtime','app.job','TRUNCATE') allowed")).rows[0].allowed).toBe(false);
   await db.query("GRANT TRUNCATE ON app.job TO jobguard_runtime");
   expect((await db.query("SELECT has_table_privilege('jobguard_runtime','app.job','TRUNCATE') allowed")).rows[0].allowed).toBe(true);
  });
 });
});
