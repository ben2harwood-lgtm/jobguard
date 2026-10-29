import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { command, meterCompany, readSubscription, terms } from "./subscription-persistence-fixtures.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(false); }, 120000);
afterAll(async () => closeWorkFixture(f));
it("0452 upgrades without granting a mandate to legacy subscription approvals and re-applies safely", async () => {
  const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("0452_subscription_mandate.sql"));
  expect(own).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, own)) {
    await f.admin.query(await readFile(url, "utf8"));
    await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  await installLegacySyntheticPartyFixtures(f.admin);
  const a = await meterCompany(f); await command(f, a, terms(a));
  const before = await readSubscription(f, a);
  await migrate(f.admin); await migrate(f.admin);
  expect(await readSubscription(f, a)).toEqual(before);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.subscription_mandate_event")).rows[0].n).toBe(0);
  expect((await f.admin.query(`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
    WHERE oid IN('app.subscription_terms_version'::regclass,'app.subscription_mandate_event'::regclass)
    ORDER BY relname`)).rows).toEqual([
    { relname: "subscription_mandate_event", relrowsecurity: true, relforcerowsecurity: true },
    { relname: "subscription_terms_version", relrowsecurity: true, relforcerowsecurity: true },
  ]);
});
