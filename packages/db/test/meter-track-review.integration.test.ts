import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
import { activateMeterJob } from "./meter-journey-fixtures.js";
import { boundaryLock, closeWorkFixture, createWorkFixture, seedWorkJob, workTenant, type WorkFixture, type WorkJob } from "./job-work-state-fixtures.js";
import { calendarInput, command as subscriptionCommand, historicalAgreement, issue, meterCompany, storeMeter } from "./subscription-persistence-fixtures.js";

// Synthetic PostgreSQL CI fixtures. Commands use the real admission boundary;
// staged activation parents bypass unrelated quote fixtures only.
describe("MON-1 immediate grace and track Decisions (RED)", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 const decisions = async (a: WorkJob) => (await f.admin.query(
  "SELECT id,action_type,subject_type,subject_ref FROM app.decision WHERE tenant_id=$1 AND action_type IN('subscription.upgrade','subscription.track_review') ORDER BY action_type,id", [a.tenantId])).rows;
 const money = async (a: WorkJob) => {
  const result: Record<string, unknown> = {};
  for (const table of ["subscription_agreement_revision", "job_commercial_track", "job_activation_terms", "journal", "recovery_fee_journal", "platform_statement", "synthetic_obligation", "action_authorization", "decision_resolution"]) {
   result[table] = (await f.admin.query(`SELECT to_jsonb(x) value FROM app.${table} x WHERE tenant_id=$1 ORDER BY to_jsonb(x)::text`, [a.tenantId])).rows;
  }
  return result;
 };
 const work = (a: WorkJob, action: string, revision: number, extra = {}, commandId = randomUUID()) =>
  new JobWorkStateRepository(f.runtime).command(a.context, a.jobId, a.actorId,
   { version: "job-work-state-command.v1", commandId, action, expectedRevision: revision, ...extra });
 async function company(count: number, plan: "Solo" | "Builder" = "Builder") {
  const a = await meterCompany(f); await historicalAgreement(f, a, plan);
  for (let i = 0; i < count; i++) await activateMeterJob(f, await seedWorkJob(f, a.tenantId));
  return a;
 }
 async function admitActivation(a: WorkJob) {
  const staged = await activateMeterJob(f, a, false, true);
  await f.admin.query("ALTER TABLE app.job_activation_terms ENABLE ALWAYS TRIGGER mon1_live_admission");
  try {
   await workTenant(f.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("SET LOCAL ROLE jobguard_migration");
    await db.query(staged.sql, staged.values);
   });
  } finally { await f.admin.query("ALTER TABLE app.job_activation_terms ENABLE TRIGGER mon1_live_admission"); }
 }
 it("13 is grace; 14 immediately raises one track Decision, 15–17 remain admitted and capped", async () => {
  const a = await company(12);
  expect(await decisions(a)).toEqual([]);
  await admitActivation(a);
  expect((await decisions(a)).map(d => d.action_type)).toEqual(["subscription.upgrade"]);
  const crossing = await seedWorkJob(f, a.tenantId);
  await admitActivation(crossing);
  const first = await decisions(a);
  expect(first.map(d => d.action_type)).toEqual(["subscription.track_review", "subscription.upgrade"]);
  for (const d of first) expect(d.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/u);
  expect(first.every(d => d.subject_type === "subscription" && d.subject_ref === a.tenantId)).toBe(true);
  const before = await money(a), id = randomUUID();
  await Promise.all([work(crossing, "resume", 0, {}, id), work(crossing, "resume", 0, {}, id)]);
  expect(await decisions(a)).toEqual(first);
  expect(await money(a)).toEqual(before);
  for (let n = 15; n <= 17; n++) await admitActivation(await seedWorkJob(f, a.tenantId));
  expect(await decisions(a)).toEqual(first);
  // Existing billing detector must reuse the immediate Decision, even when it
  // first receives a source later. No automatic plan or per-job track change.
  const sourceId = await storeMeter(f, a, calendarInput(a.tenantId, 17, 9));
  await subscriptionCommand(f, a, { version: "subscription-command.v1", kind: "review", sourceId, expectedRevision: 1 });
  expect(await decisions(a)).toEqual(first);
  const issued = await issue(f, a);
  expect(issued.amountPence).toBe(16900);
  expect((await f.admin.query("SELECT sum(amount_pence)::int amount FROM app.subscription_period_line WHERE tenant_id=$1 AND period_id=$2", [a.tenantId, issued.periodId])).rows[0].amount).toBe(16900);
  expect(await decisions(a)).toEqual(first);
  expect((await f.admin.query("SELECT plan,maximum_pence FROM app.subscription_agreement_revision WHERE tenant_id=$1", [a.tenantId])).rows).toEqual([{ plan: "Builder", maximum_pence: 16900 }]);
  expect((await f.admin.query("SELECT DISTINCT job_track FROM app.job_commercial_track WHERE tenant_id=$1", [a.tenantId])).rows).toEqual([{ job_track: "small_builder" }]);
  const review = (await f.admin.query("SELECT decision_id FROM app.subscription_review WHERE tenant_id=$1", [a.tenantId])).rows[0];
  expect(review.decision_id).toBe(first[0].id);
 });
 it("close/reopen and old command replay preserve one effect; locked and other-company attempts refuse", async () => {
  const a = await company(13); await activateMeterJob(f, a);
  // Remove one commitment with a real close, then reopen across 13 -> 14.
  const closed = await work(a, "close", 0, { reason: "other", note: "Fictional pause" });
  expect(await decisions(a)).toEqual([]);
  // Decision insertion shares the business transaction, including rollback.
  await expect(workTenant(f.admin, a.tenantId, async db => {
   await db.query("SET LOCAL ROLE jobguard_migration");
   await db.query("SELECT app.ch4_admit_place($1,$2,'reopen')", [a.tenantId, a.jobId]);
   throw new Error("Fictional transaction failure");
  })).rejects.toThrow("Fictional transaction failure");
  expect(await decisions(a)).toEqual([]);
  const id = randomUUID(), extra = { closeEventId: closed.events[0]!.id };
  await Promise.all([work(a, "reopen", 1, extra, id), work(a, "reopen", 1, extra, id)]);
  const first = await decisions(a);
  expect(first.map(d => d.action_type)).toEqual(["subscription.track_review", "subscription.upgrade"]);
  const secondClose = await work(a, "close", 2, { reason: "other", note: "Fictional stop again" });
  await work(a, "reopen", 1, extra, id); // old result cannot restore capacity
  await work(a, "reopen", 3, { closeEventId: secondClose.events[0]!.id });
  expect(await decisions(a)).toEqual(first);
  await boundaryLock(f, a);
  const locked = (await f.admin.query("SELECT to_jsonb(l) value FROM app.final_account_lock l WHERE tenant_id=$1", [a.tenantId])).rows;
  await expect(work(a, "resume", 4)).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  expect((await f.admin.query("SELECT to_jsonb(l) value FROM app.final_account_lock l WHERE tenant_id=$1", [a.tenantId])).rows).toEqual(locked);
  const b = await company(0);
  await expect(new JobWorkStateRepository(f.runtime).command(b.context, a.jobId, b.actorId,
   { version: "job-work-state-command.v1", commandId: randomUUID(), action: "resume", expectedRevision: 4 })).rejects.toThrow("WORK_STATE_FORBIDDEN");
  expect(await decisions(b)).toEqual([]); expect(await decisions(a)).toEqual(first);
  expect(await workTenant(f.runtime, b.tenantId, async db => (await db.query("SELECT id FROM app.decision WHERE tenant_id=$1", [a.tenantId])).rows)).toEqual([]);
  await expect(workTenant(f.runtime, b.tenantId, db => db.query("SELECT app.ch4_admit_place($1,$2,'resume')", [a.tenantId, a.jobId]))).rejects.toThrow("permission denied");
 });
 it("issue without a prior review reuses the immediate Decision; an earlier billing review is also reused by admission", async () => {
  const a = await company(13); await admitActivation(a);
  const first = await decisions(a);
  await storeMeter(f, a, calendarInput(a.tenantId, 14, 9));
  expect((await issue(f, a)).amountPence).toBe(16900);
  expect(await decisions(a)).toEqual(first);
  expect((await f.admin.query("SELECT decision_id FROM app.subscription_review WHERE tenant_id=$1", [a.tenantId])).rows[0].decision_id).toBe(first[0].id);
  const b = await company(12);
  const sourceId = await storeMeter(f, b, calendarInput(b.tenantId, 14, 9));
  await subscriptionCommand(f, b, { version: "subscription-command.v1", kind: "review", sourceId, expectedRevision: 1 });
  const original = (await decisions(b))[0];
  await admitActivation(b);
  await admitActivation(await seedWorkJob(f, b.tenantId));
  expect((await decisions(b)).filter(d => d.action_type === "subscription.track_review")).toEqual([original]);
 });
 it("Solo grace raises an upgrade once; refused seventh has no effects", async () => {
  const a = await company(5, "Solo"); await admitActivation(a);
  expect((await decisions(a)).map(d => d.action_type)).toEqual(["subscription.upgrade"]);
  const before = await decisions(a), b = await seedWorkJob(f, a.tenantId);
  await expect(admitActivation(b)).rejects.toThrow("METER_UPGRADE_REQUIRED");
  expect(await decisions(a)).toEqual(before);
  expect((await f.admin.query("SELECT id FROM app.job_activation_terms WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, b.jobId])).rows).toEqual([]);
 });
});
