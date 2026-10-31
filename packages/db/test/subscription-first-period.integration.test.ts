import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { command, count, issue, meterCompany, meterInput, readSubscription, rows, storeMeter, terms } from "./subscription-persistence-fixtures.js";
import { firstTrialFixture } from "./free-first-job-lifecycle-fixtures.js";

// An admin-only clock substitution in this isolated test cluster exercises the real
// command without introducing a caller-controlled clock or production helper.
describe.sequential("MON-2A first-period safety", () => {
 let f: WorkFixture; let definition: string;
 beforeAll(async () => {
  f = await createWorkFixture();
  definition = (await f.admin.query("SELECT pg_get_functiondef('app.mon2_command(uuid,text,uuid,jsonb)'::regprocedure) definition")).rows[0].definition;
 }, 60000);
 afterEach(async () => { if (definition) await f.admin.query(definition); });
 afterAll(async () => closeWorkFixture(f));
 async function acceptAt(instant: string) {
  const needle = "accepted_time:=clock_timestamp();";
  expect(definition).toContain(needle);
  await f.admin.query(definition.replace(needle, `accepted_time:='${instant}'::timestamptz;`));
 }
 it.each([
  ["2026-06-14T23:30:00Z", "2026-06-15", 15, "2026-07-15"],
  ["2026-01-31T12:00:00Z", "2026-01-31", 31, "2026-02-28"],
  ["2024-02-29T12:00:00Z", "2024-02-29", 29, "2024-03-29"],
 ] as const)("accepts %s with the London acceptance day and one replay effect", async (instant, date, day, end) => {
  await acceptAt(instant);
  const a = await meterCompany(f), id = randomUUID(), value = terms(a, "Solo", 0, day);
  const accepted = await command(f, a, value, id);
  expect(accepted.effectiveDate).toBe(date);
  // Replay after the date changed must retain the original receipt.
  await acceptAt("2026-07-02T12:00:00Z");
  expect(await command(f, a, value, id)).toEqual(accepted);
  const saved = await readSubscription(f, a);
  expect(saved.agreements).toHaveLength(1);
  expect(saved.agreements[0]).toMatchObject({ anchor_day: day, effective_date: date });
  expect(new Date(saved.agreements[0].accepted_at).toISOString()).toBe(new Date(instant).toISOString());
  expect(await count(f, a, "action_authorization")).toBe(1);
  expect(await count(f, a, "subscription_period")).toBe(0);
  const length = (Date.parse(end) - Date.parse(date)) / 86400000;
  const input = meterInput(a.tenantId, 4, date.slice(0, 7), length);
  input.startDate = date; input.endDateExclusive = end;
  input.days.forEach((row, index) => { row.date = new Date(Date.parse(date) + index * 86400000).toISOString().slice(0, 10); });
  await storeMeter(f, a, input);
  const issueId = randomUUID(), first = await issue(f, a, date, 1, issueId);
  expect(first.amountPence).toBe(2900);
  expect(await issue(f, a, date, 1, issueId)).toEqual(first);
  expect(await count(f, a, "subscription_period")).toBe(1);
  expect(await count(f, a, "platform_statement")).toBe(1);
 });
 it("refuses mismatched anchors with no effects and retains the re-anchor refusal", async () => {
  await acceptAt("2026-06-15T12:00:00Z");
  const a = await meterCompany(f);
  await expect(command(f, a, terms(a, "Solo", 0, 1))).rejects.toThrow("SUBSCRIPTION_ANCHOR_NOT_ACCEPTANCE_DAY");
  expect(await count(f, a, "subscription_agreement_revision")).toBe(0);
  expect(await count(f, a, "action_authorization")).toBe(0);
  await command(f, a, terms(a, "Solo", 0, 15));
  await expect(command(f, a, { ...terms(a, "Builder", 1, 16), kind: "change" })).rejects.toThrow("SUBSCRIPTION_REANCHOR_POLICY_HOLD");
 });
 it("refuses backdated periods before looking for meter data and cannot cross companies", async () => {
  await acceptAt("2026-06-15T12:00:00Z");
  const a = await meterCompany(f), b = await meterCompany(f);
  await command(f, a, terms(a, "Solo", 0, 15));
  await expect(issue(f, a, "2026-05-15")).rejects.toThrow("SUBSCRIPTION_PERIOD_BEFORE_ACCEPTANCE");
  await expect(issue(f, a, "2026-06-14")).rejects.toThrow("SUBSCRIPTION_PERIOD_BEFORE_ACCEPTANCE");
  // The acceptance boundary itself passes the new guard (then needs its meter source).
  await expect(issue(f, a, "2026-06-15")).rejects.toThrow("SUBSCRIPTION_SOURCE_UNAVAILABLE");
  await expect(workTenant(f.runtime, b.tenantId, db => db.query("SELECT app.mon2_command($1,$2,$3,$4::jsonb)",
   [a.tenantId, b.digest, randomUUID(), JSON.stringify(terms(a, "Solo", 0, 15))]))).rejects.toThrow();
  expect(await count(f, a, "subscription_period")).toBe(0);
  expect(await count(f, b, "subscription_agreement_revision")).toBe(0);
 });
 it("refuses a pre-acceptance period even when the trial already started, without writing any effects", async () => {
  const a = await firstTrialFixture(f, "2026-08-01T12:00:00Z");
  await acceptAt("2026-09-01T12:00:00Z");
  expect((await command(f, a, terms(a, "Solo", 0, 1))).effectiveDate).toBe("2026-09-01");
  // Supply a complete, anchor-aligned period covered by the earlier trial.
  // A missing source or invalid anchor must not explain the refusal.
  const input = meterInput(a.tenantId, 6, "2026-08", 31);
  input.endDateExclusive = "2026-09-01";
  await storeMeter(f, a, input);
  const tables = [
   "subscription_agreement_revision", "meter_input_event", "trial_start", "trial_subscription_source",
   "subscription_period", "subscription_period_line", "platform_statement", "platform_statement_line",
   "subscription_place", "subscription_place_binding", "subscription_review", "subscription_alert",
   "subscription_operations_card", "subscription_correction_disposition", "decision",
   "action_authorization", "command_receipt", "audit_event",
  ];
  const before = await Promise.all(tables.map(table => rows(f, a, table)));
  const auditHead = async () => (await f.admin.query("SELECT to_jsonb(h) value FROM audit_control.audit_head h WHERE tenant_id=$1", [a.tenantId])).rows;
  const headBefore = await auditHead();
  await expect(issue(f, a, "2026-08-01")).rejects.toThrow("SUBSCRIPTION_PERIOD_BEFORE_ACCEPTANCE");
  expect(await Promise.all(tables.map(table => rows(f, a, table)))).toEqual(before);
  expect(await auditHead()).toEqual(headBefore);
 });
});
