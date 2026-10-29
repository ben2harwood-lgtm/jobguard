// CI only: populated immediate predecessor -> 0450 -> successors and rerun.
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, expect, it } from "vitest";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, type FinalCheckFixture } from "./final-check-fixture.js";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
let f: FinalCheckFixture;
beforeAll(async () => { f = await createFinalCheckFixture(false); }, 120000);
afterAll(async () => { if (f) await closeFinalCheckFixture(f); });
it("0450 upgrades populated previous schema without changing existing rows, columns or primary keys", async () => {
  const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("0450_recovery_billability_integration.sql"));
  expect(own).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, own)) {
    const name = url.pathname.split("/").at(-1)!, sql = await readFile(url, "utf8");
    await f.admin.query(name.startsWith("0095_") ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','details_needed',true);") : sql);
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
  }
  await f.admin.query(`GRANT jobguard_runtime TO ${f.runtime.options.user!}`);
  await installLegacySyntheticPartyFixtures(f.admin); await seedFinalCheckJob(f);
  const tables = (await f.admin.query("SELECT schemaname||'.'||tablename name FROM pg_tables WHERE schemaname='app' ORDER BY tablename")).rows.map(row => row.name as string);
  const before = await proofBefore(f.admin, tables);
  const keys = async () => (await f.admin.query(`SELECT c.oid::regclass::text name,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND k.contype='p' AND c.relname<>'recovery_billability_command' ORDER BY c.relname`)).rows;
  const originalKeys = await keys();
  await f.admin.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES('0450_recovery_billability_integration.sql')");
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] }); expect(await keys()).toEqual(originalKeys);
  expect((await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.recovery_billability_command'::regclass")).rows).toEqual([{ relrowsecurity: true, relforcerowsecurity: true }]);
  expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime','app.recovery_billability_command','SELECT,INSERT,UPDATE,DELETE') allowed")).rows).toEqual([{ allowed: false }]);
  await migrate(f.admin); await migrate(f.admin);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
});
