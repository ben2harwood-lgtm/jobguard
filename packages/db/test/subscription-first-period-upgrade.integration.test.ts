import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { command, meterCompany, readSubscription, terms } from "./subscription-persistence-fixtures.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(false); }, 60000);
afterAll(async () => closeWorkFixture(f));
it("0374 preserves legacy agreements, approvals, receipts and routine privileges on upgrade", async () => {
 const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("0374_subscription_first_period_safety.sql"));
 expect(own).toBeGreaterThan(0);
 await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for (const url of MIGRATION_URLS.slice(0, own)) {
  await f.admin.query(await readFile(url, "utf8"));
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
 }
 await installLegacySyntheticPartyFixtures(f.admin);
 const a = await meterCompany(f), id = randomUUID(), legacy = terms(a, "Solo", 0, 1);
 const accepted = await command(f, a, legacy, id), before = await readSubscription(f, a);
 const metadata = async () => (await f.admin.query(`SELECT proname,proowner,proacl::text,prosecdef,proconfig
 FROM pg_proc WHERE oid IN ('app.mon2_command(uuid,text,uuid,jsonb)'::regprocedure,'app.mon2_issue(uuid,text,date,integer)'::regprocedure) ORDER BY proname`)).rows;
 const privileges = await metadata();
 await migrate(f.admin); await migrate(f.admin);
 expect(await metadata()).toEqual(privileges);
 expect(await command(f, a, legacy, id)).toEqual(accepted);
 expect(await readSubscription(f, a)).toEqual(before);
 const b = await meterCompany(f), current = terms(b, "Solo");
 await command(f, b, current);
 expect((await readSubscription(f, b)).agreements[0].anchor_day).toBe(current.anchorDay);
});
