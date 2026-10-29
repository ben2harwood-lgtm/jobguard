import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { closeWorkFixture, createWorkFixture, seedWorkJob, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
afterAll(async () => { await closeWorkFixture(f); });
it("upgrades populated predecessor storage without changing its rows or schema and migrates twice", async () => {
  const own = MIGRATION_URLS.find(url => url.pathname.endsWith("/0430_platform_tax_invoice.sql"));
  expect(own).toBeDefined();
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS) {
    if (url === own) break;
    const name = url.pathname.split("/").at(-1)!;
    let sql = await readFile(url, "utf8");
    if (name === "0095_job_parties.sql") sql = sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);");
    await f.admin.query(sql);
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  const a = await seedWorkJob(f);
  const before = (await f.admin.query("SELECT row_to_json(j)::text bytes FROM app.job j WHERE tenant_id=$1", [a.tenantId])).rows;
  const columns = async () => (await f.admin.query("SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='app' AND table_name='platform_statement' ORDER BY ordinal_position")).rows;
  const previousColumns = await columns();
  await migrate(f.admin); await migrate(f.admin);
  expect((await f.admin.query("SELECT row_to_json(j)::text bytes FROM app.job j WHERE tenant_id=$1", [a.tenantId])).rows).toEqual(before);
  expect(await columns()).toEqual(previousColumns);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.platform_invoice_document")).rows[0].n).toBe(0);
  expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name='0430_platform_tax_invoice.sql'")).rows[0].n).toBe(1);
}, 240000);
