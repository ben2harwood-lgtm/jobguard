import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { command, historicalAgreement, issue, meterCompany, meterInput, readSubscription, storeMeter, terms } from "./subscription-persistence-fixtures.js";
import { firstTrialFixture } from "./free-first-job-lifecycle-fixtures.js";
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
 // Install MON-3 trial facts before 0374, then exercise the replaced routine.
 // Six places would bill both base and extras without MON-3's trial handling.
 const trial = await firstTrialFixture(f, "2026-09-01T12:00:00.123456Z");
 await historicalAgreement(f, trial, "Solo");
 const sourceId = await storeMeter(f, trial, meterInput(trial.tenantId, 6));
 await migrate(f.admin); await migrate(f.admin);
 expect(await metadata()).toEqual(privileges);
 expect(await command(f, a, legacy, id)).toEqual(accepted);
 expect(await readSubscription(f, a)).toEqual(before);
 const b = await meterCompany(f), current = terms(b, "Solo");
 await command(f, b, current);
 expect((await readSubscription(f, b)).agreements[0].anchor_day).toBe(current.anchorDay);
 const issued = await issue(f, trial);
 expect(issued.amountPence).toBe(0);
 expect(await issue(f, trial)).toEqual(issued);
 const pins = (await f.admin.query("SELECT input FROM app.trial_subscription_source WHERE tenant_id=$1 AND source_id=$2", [trial.tenantId, sourceId])).rows;
 expect(pins).toHaveLength(1);
 expect(pins[0].input.days).toHaveLength(30);
 expect(pins[0].input.days.every((day: { trial: boolean }) => day.trial)).toBe(true);
 const lines = (await f.admin.query("SELECT amount_pence FROM app.platform_statement_line WHERE tenant_id=$1 AND statement_id=$2", [trial.tenantId, issued.statementId])).rows;
 expect(lines.length).toBeGreaterThan(0);
 expect(lines.every(line => Number(line.amount_pence) === 0)).toBe(true);
});
