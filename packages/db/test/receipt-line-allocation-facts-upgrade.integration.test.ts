// CI ONLY. Certify against the actual latest migration before this leaf.
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, seedWorkJob, type WorkFixture } from "./job-work-state-fixtures.js";
import { migrate, MIGRATION_URLS } from "../src/migrate.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences, rolledBack } from "./upgrade-proof-utils.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(false); }, 120_000);
afterAll(async () => { await closeWorkFixture(f); });
it("A8: populated actual base -> only 0241 -> named rows/types/PKs unchanged -> successors and rerun", async () => {
 const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("0241_receipt_line_source_bridge.sql"));
 expect(own).toBeGreaterThan(0);
 const previous = MIGRATION_URLS[own - 1]!;
 expect(Number(previous.pathname.split("/").at(-1)!.slice(0, 4))).toBeLessThan(241);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for (const url of MIGRATION_URLS.slice(0, own)) {
  const name = url.pathname.split("/").at(-1)!;
  const sql = await readFile(url, "utf8");
  await f.admin.query(name.startsWith("0095_") ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : sql);
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const seed = await seedWorkJob(f);
 const tables = (await f.admin.query("SELECT schemaname||'.'||tablename name FROM pg_tables WHERE schemaname='app' ORDER BY tablename")).rows.map(row => row.name as string);
 const before = await proofBefore(f.admin, tables);
 expect(Object.keys(before["app.job"]!.rows)).not.toHaveLength(0);
 const keys = async () => (await f.admin.query(`SELECT c.oid::regclass::text name,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND k.contype='p' ORDER BY c.relname`)).rows;
 const originalKeys = await keys();
 await f.admin.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
 await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES('0241_receipt_line_source_bridge.sql')");
 expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
 expect((await keys()).filter(row => !row.name.includes("receipt_allocation_fact_"))).toEqual(originalKeys);
 await rolledBack(f.admin, async db => {
  await db.query("SELECT set_config('app.tenant_id',$1,true)", [seed.tenantId]);
  await db.query("UPDATE app.account SET name='mutation negative control' WHERE tenant_id=$1", [seed.tenantId]);
  expect((await proofDifferences(db, before)).rows.length).toBeGreaterThan(0);
 });
 await rolledBack(f.admin, async db => {
  await db.query("ALTER TABLE app.account ALTER COLUMN name TYPE varchar(201)");
  expect((await proofDifferences(db, before)).types.length).toBeGreaterThan(0);
 });
 await migrate(f.admin); await migrate(f.admin);
 expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
 const refs = (await f.admin.query("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='app.receipt_allocation_fact_line'::regclass AND contype='f'")).rows;
 expect(refs).toHaveLength(4);
 expect(refs.every(row => row.definition.startsWith("FOREIGN KEY (tenant_id, job_id,"))).toBe(true);
}, 120_000);
