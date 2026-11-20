import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";
import { count, historicalAgreement, issue, meterCompany, meterInput, storeMeter, type SubscriptionCompany } from "./subscription-persistence-fixtures.js";
import { firstTrialFixture } from "./free-first-job-lifecycle-fixtures.js";

// Admin-only clock substitution in an isolated real PostgreSQL cluster, following
// the first-period suite. Runtime callers gain no clock override or new grant.
describe.sequential("MON-2A refuses open subscription periods", () => {
 let f: WorkFixture; let definition: string;
 beforeAll(async () => {
  f = await createWorkFixture(); // Applies every migration to a fresh database.
  definition = (await f.admin.query("SELECT pg_get_functiondef('app.mon2_issue(uuid,text,date,integer)'::regprocedure) definition")).rows[0].definition;
 }, 60000);
 afterEach(async () => { if (definition) await f.admin.query(definition); });
 afterAll(async () => closeWorkFixture(f));

 async function issueAt(instant: string) {
  expect(definition).toContain("clock_timestamp()");
  await f.admin.query(definition.replaceAll("clock_timestamp()", `'${instant}'::timestamptz`));
 }
 async function assertOpenPeriodRefused(a: SubscriptionCompany) {
  await expect(issue(f, a)).rejects.toMatchObject({ message: "SUBSCRIPTION_PERIOD_OPEN", code: "22023" });
  for (const table of ["subscription_period", "subscription_period_line", "platform_statement", "platform_statement_line"])
   expect(await count(f, a, table)).toBe(0);
 }
 async function nonTrialPeriod() {
  const a = await meterCompany(f);
  await historicalAgreement(f, a);
  await storeMeter(f, a, meterInput(a.tenantId));
  expect(await count(f, a, "trial_start")).toBe(0);
  expect(await count(f, a, "meter_input_event")).toBe(1);
  return a;
 }

 it("refuses a non-trial tenant mid-period, then issues the unchanged amount at London midnight", async () => {
  const a = await nonTrialPeriod();
  await issueAt("2026-09-15T12:00:00Z");
  await assertOpenPeriodRefused(a);
  // BST: still September 30 in London, even one second before the boundary.
  await issueAt("2026-09-30T22:59:59Z");
  await assertOpenPeriodRefused(a);
  // next_day equals the London date: the ended period can now be frozen.
  await issueAt("2026-09-30T23:00:00Z");
  const result = await issue(f, a);
  expect(result).toMatchObject({ amountPence: 8900, principalPence: 8900, basePrincipalPence: 8900 });
  expect(await count(f, a, "subscription_period")).toBe(1);
  expect(await count(f, a, "platform_statement")).toBe(1);
  expect(await issue(f, a)).toEqual(result);
 });

 it("keeps the trial free for an ended period and refuses its open period", async () => {
  const a = await firstTrialFixture(f, "2026-09-01T12:00:00Z");
  await historicalAgreement(f, a, "Solo");
  await storeMeter(f, a, meterInput(a.tenantId, 1));
  expect(await count(f, a, "trial_start")).toBe(1);
  await issueAt("2026-09-15T12:00:00Z");
  await assertOpenPeriodRefused(a);
  await issueAt("2026-10-01T12:00:00Z");
  expect(await issue(f, a)).toMatchObject({ amountPence: 0, principalPence: 0, basePrincipalPence: 0 });
  expect(await count(f, a, "subscription_period")).toBe(1);
  expect(await count(f, a, "platform_statement")).toBe(1);
 });

 it("the same refusal assertion fails when only the new guard is removed (scratch mutation)", async () => {
  const a = await nonTrialPeriod();
  const guard = / IF next_day>\(clock_timestamp\(\) AT TIME ZONE 'Europe\/London'\)::date THEN\s+RAISE EXCEPTION 'SUBSCRIPTION_PERIOD_OPEN' USING ERRCODE='22023';\s+END IF;/u;
  expect(definition).toMatch(guard);
  try {
   await f.admin.query(definition.replace(guard, ""));
   // Exercise precisely the regression assertion above, rather than a source check.
   await expect(assertOpenPeriodRefused(a)).rejects.toMatchObject({ name: "AssertionError" });
   expect(await count(f, a, "subscription_period")).toBe(1);
   expect(await count(f, a, "platform_statement")).toBe(1);
  } finally { await f.admin.query(definition); }
 });
});
