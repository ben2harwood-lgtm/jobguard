import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { command, meterCompany, terms } from "./subscription-persistence-fixtures.js";
import { proofBefore, proofDifferences } from "./upgrade-proof-utils.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
afterAll(async () => closeWorkFixture(f));
it("0404 upgrades populated subscription/job predecessors without changing their data, types, grants or functions", async () => {
  const own = "0404_plan_entitlement_lifecycle.sql", n = MIGRATION_URLS.findIndex(url => url.pathname.endsWith(own));
  expect(n).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, n)) {
    await f.admin.query(await readFile(url, "utf8"));
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  const a = await meterCompany(f); await command(f, a, terms(a));
  const before = await proofBefore(f.admin, ["app.job", "app.subscription_agreement_revision", "app.command_receipt", "app.audit_event"]);
  const grants = (await f.admin.query("SELECT oid,relacl::text FROM pg_class WHERE relnamespace='app'::regnamespace ORDER BY oid")).rows;
  const routines = (await f.admin.query("SELECT oid,pg_get_functiondef(oid) definition,proacl::text FROM pg_proc WHERE pronamespace='app'::regnamespace AND prokind='f' ORDER BY oid")).rows;
  await f.admin.query(await readFile(MIGRATION_URLS[n]!, "utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [own]);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  expect((await f.admin.query("SELECT oid,relacl::text FROM pg_class WHERE oid=ANY($1::oid[]) ORDER BY oid", [grants.map(row => row.oid)])).rows).toEqual(grants);
  expect((await f.admin.query("SELECT oid,pg_get_functiondef(oid) definition,proacl::text FROM pg_proc WHERE oid=ANY($1::oid[]) ORDER BY oid", [routines.map(row => row.oid)])).rows).toEqual(routines);
  await migrate(f.admin); await migrate(f.admin);
  expect(await proofDifferences(f.admin, before)).toEqual({ rows: [], types: [] });
  const signature = "app.mon8_subscription_context(uuid,text,uuid)";
  expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') allowed", [signature])).rows[0].allowed).toBe(true);
  expect((await f.admin.query("SELECT has_function_privilege('jobguard_infrastructure',$1,'EXECUTE') allowed", [signature])).rows[0].allowed).toBe(false);
});
