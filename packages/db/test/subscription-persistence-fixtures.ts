import { subscriptionTermsContentHash } from "../src/subscription-repository.js";
import { randomUUID } from "node:crypto";
import { workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany, meterInput, storeMeter } from "./meter-persistence-fixtures.js";
export { meterCompany, meterInput, storeMeter };
export type SubscriptionCompany = Awaited<ReturnType<typeof meterCompany>>;
export const terms = (a: SubscriptionCompany, plan: "Solo" | "Builder" = "Builder", expectedRevision = 0) => {
 const bound = { tenantId: a.tenantId, termsVersion: "subscription_terms_v1", catalogueVersion: "subscription_pricing_policy_v4", plan, cadence: "monthly", anchorDay: 1, maximumPence: plan === "Solo" ? 4900 : 16900, expectedRevision };
 const {tenantId,...selection}=bound;
 const contentHash = subscriptionTermsContentHash(tenantId,selection);
 return ({
 version: "subscription-command.v1", kind: "accept", plan, cadence: "monthly", anchorDay: 1,
 termsVersion: "subscription_terms_v1", catalogueVersion: "subscription_pricing_policy_v4",
 maximumPence: plan === "Solo" ? 4900 : 16900, contentHash, expectedRevision,
}); };
export const command = (f: WorkFixture, a: SubscriptionCompany, value: Record<string, unknown>, id = randomUUID()) =>
 workTenant(f.runtime, a.tenantId, async db => (await db.query("SELECT app.mon2_command($1,$2,$3,$4::jsonb) result", [a.tenantId, a.digest, id, JSON.stringify(value)])).rows[0].result);
export const readSubscription = (f: WorkFixture, a: SubscriptionCompany) =>
 workTenant(f.runtime, a.tenantId, async db => (await db.query("SELECT app.mon2_read($1,$2) result", [a.tenantId, a.digest])).rows[0].result);
export const issue = (f: WorkFixture, a: SubscriptionCompany, periodStart = "2026-09-01", expectedRevision = 1, id = randomUUID()) => command(f, a, { version: "subscription-command.v1", kind: "issue", periodStart, expectedRevision }, id);
export async function rows(f: WorkFixture, a: SubscriptionCompany, table: string) {
 if (!/^[a-z_]+$/u.test(table)) throw new Error("Invalid fixture table");
 return (await f.admin.query(`SELECT to_jsonb(t) value FROM app.${table} t WHERE tenant_id=$1 ORDER BY to_jsonb(t)::text`, [a.tenantId])).rows.map(row => row.value);
}
export async function count(f: WorkFixture, a: SubscriptionCompany, table: string) { return (await rows(f, a, table)).length; }

/** Admin-only synthetic historical fixture, never a runtime backdate capability.
 * A real checked acceptance first supplies all authorization/receipt parents. */
export async function historicalAgreement(f: WorkFixture, a: SubscriptionCompany, plan: "Solo" | "Builder" = "Builder", date = "2026-09-01") {
 const accepted = await command(f, a, terms(a, plan));
 await workTenant(f.admin, a.tenantId, async db => {
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("UPDATE app.subscription_agreement_revision SET effective_date=$2::date WHERE tenant_id=$1", [a.tenantId, date]);
 });
 return accepted;
}
export async function preparedPeriod(f: WorkFixture, places = 8, plan: "Solo" | "Builder" = "Builder") {
 const a = await meterCompany(f); await historicalAgreement(f, a, plan);
 const input = meterInput(a.tenantId, places); await storeMeter(f, a, input);
 const issued = await issue(f, a); return { a, input, issued };
}
export function calendarInput(tenantId: string, places: number, month: number, year = 2026) {
 const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
 const start = `${year}-${String(month).padStart(2, "0")}`;
 const input = meterInput(tenantId, places, start, length);
 input.endDateExclusive = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
 return input;
}
/** MON-1B-qualified positive correction, with both immutable source revisions. */
export async function correctionPeriod(f: WorkFixture, receivingPlaces = 12) {
 const { refreshMeter } = await import("./meter-persistence-fixtures.js");
 const a = await meterCompany(f); await historicalAgreement(f, a);
 const old = meterInput(a.tenantId, 7); await storeMeter(f, a, old); await refreshMeter(f, a);
 const extra = { tenantId: a.tenantId, jobId: randomUUID(), customerId: randomUUID(), siteId: randomUUID(), small: false };
 old.days.forEach(day => day.jobs.push(extra)); await storeMeter(f, a, old); await refreshMeter(f, a);
 await storeMeter(f, a, meterInput(a.tenantId, receivingPlaces, "2026-10", 31));
 const issued = await issue(f, a, "2026-10-01"); return { a, issued };
}
export async function approvedSimulation(f: WorkFixture) {
 const { a, issued } = await preparedPeriod(f);
 const approved = await command(f, a, { version: "subscription-command.v1", kind: "approve_simulation", statementId: issued.statementId, contentHash: issued.artifactHash, amountPence: issued.amountPence, expectedRevision: 1 });
 return { a, issued, approved };
}
