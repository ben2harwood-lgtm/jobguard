import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { closeWorkFixture, createWorkFixture, seedWorkJob, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";

describe("MON-1 0385 upgrade (PostgreSQL CI)", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it("preserves rows, policies, ownership and ACLs; applying again is a no-op", async () => {
  const own = "0385_meter_track_review.sql", position = MIGRATION_URLS.findIndex(url => url.pathname.endsWith(`/${own}`));
  expect(position).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, position)) {
   await f.admin.query(await readFile(url, "utf8"));
   await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin); await seedWorkJob(f);
  const before = await proofBefore(f.admin, ["app.account", "app.membership", "app.job", "app.decision", "app.subscription_agreement_revision", "app.meter_work_ledger"]);
  const catalog = async () => ({
   tables: (await f.admin.query("SELECT oid,relacl::text,relowner,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='app'::regnamespace AND relkind='r' ORDER BY oid")).rows,
   policies: (await f.admin.query("SELECT * FROM pg_policies WHERE schemaname='app' ORDER BY tablename,policyname")).rows,
   routines: (await f.admin.query("SELECT oid,proowner,proacl::text,prosecdef,proconfig FROM pg_proc WHERE pronamespace='app'::regnamespace ORDER BY oid")).rows,
  });
  const oldCatalog = await catalog();
  await migrate(f.admin); await migrate(f.admin);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  expect(await catalog()).toEqual(oldCatalog);
  expect((await f.admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name=$1", [own])).rows[0].n).toBe(1);
 });
});
