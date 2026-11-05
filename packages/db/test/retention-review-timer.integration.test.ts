import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertRetentionIssueAllowed, RETENTION_BALANCES_ENABLED } from "@jobguard/core";
import { RetentionRecordRepository } from "../src/retention-record-repository.js";
import { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";

describe("M4-20 infrastructure timer (real PostgreSQL)", () => {
 let f: WorkFixture, infrastructure: Pool;
 beforeAll(async () => {
  f = await createWorkFixture();
  infrastructure = new Pool({ ...f.admin.options, password: f.admin.options.password, options: "-c role=jobguard_infrastructure", max: 2 });
 }, 240000);
 afterAll(async () => { await infrastructure?.end(); await closeWorkFixture(f); });
 const timer = () => new RetentionRecordRepository(infrastructure);
 const human = () => new RetentionRecordRepository(f.runtime);
 const company = () => meterCompany(f);
 type Company = Awaited<ReturnType<typeof company>>;
 const amount = { netPence: 10000, taxPence: 2000 };
 function profile(dueDate = "2000-01-01") {
  const source = { kind: "contract_profile", profileVersion: "fictional.v1", clause: "fictional" };
  return { version: "retention.profile.v1", revision: 1, previousProfileId: null as string | null,
   contractProfileVersion: "fictional.v1", fixtureApprovalId: randomUUID(), taxTreatmentVersion: "fictional.v1",
   retained: amount, alreadyBilled: { netPence: 0, taxPence: 0 }, conditions: [{ id: randomUUID(), milestone: "completion",
    description: "Fictional completion", source, dateSource: source, dueDate, cumulativeLimit: amount }] };
 }
 const append = (a: Company, record: unknown, commandId = randomUUID()) => human().command(a.context, { sessionDigest: a.digest },
  { version: "retention-record-command.v1", commandId, jobId: a.jobId, record });
 const read = (a: Company) => human().read(a.context, a.jobId);
 const discovery = async () => (await infrastructure.query("SELECT tenant_id FROM infrastructure.discover_retention_reviews()")).rows.map(r => r.tenant_id);
 async function moneySnapshot() {
  const result: Record<string, unknown> = {};
  for (const table of ["customer_invoice", "customer_payment", "landing_allocation", "landing_reversal", "recovery_fee_derivation", "recovery_fee_journal", "journal", "journal_line", "action_authorization", "decision_resolution", "action_outbox"]) {
   // Use only real table identities present in this branch; missing tables fail the test.
   result[table] = (await f.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) rows FROM app.${table} r`)).rows[0].rows;
  }
  return result;
 }
 it("serializes two workers and crash retries, raises exactly one due review, leaves future/foreign books and money intact", async () => {
  const a = await company(), b = await company(), future = await company();
  await append(a, profile()); await append(b, profile()); await append(future, profile("9999-12-31"));
  const before = await moneySnapshot(), foreign = await read(b);
  expect(await discovery()).toEqual(expect.arrayContaining([a.tenantId, b.tenantId]));
  expect(await discovery()).not.toContain(future.tenantId);
  // Crash after writes but before commit: the same real transaction must roll back records and audit together.
  const crashPool = { connect: async () => {
   const client = await infrastructure.connect();
   return { release: () => client.release(), query: async (sql: string, values?: unknown[]) => {
    if (sql === "COMMIT") throw new Error("synthetic crash before commit");
    return client.query(sql, values);
   } };
  } } as unknown as Pool;
  await expect(new RetentionRecordRepository(crashPool).raiseTimerReviews(a.context)).rejects.toThrow("RETENTION_UNAVAILABLE");
  expect((await read(a)).book.records).toHaveLength(1);
  const results = await Promise.all([timer().raiseTimerReviews(a.context), timer().raiseTimerReviews(a.context)]);
  expect(results.sort()).toEqual([0, 1]);
  expect(await timer().raiseTimerReviews(a.context)).toBe(0); // also retry after a successful commit/worker crash
  expect(await timer().raiseTimerReviews(future.context)).toBe(0);
  const current = await read(a), review = current.book.records[1]!;
  const today = (await f.admin.query("SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') today")).rows[0].today;
  expect(review).toMatchObject({ version: "retention.review.v1", trigger: "timer", owner: "retention-release-review-v1", raisedOn: today });
  expect(Object.keys(review).sort()).toEqual(["conditionId", "id", "jobId", "owner", "profileId", "raisedOn", "tenantId", "trigger", "version"]);
  expect(current.reconciliation).toMatchObject({ released: { netPence: 0, taxPence: 0 }, remaining: amount, pendingReviewIds: [review.id] });
  expect(await read(b)).toEqual(foreign); expect((await read(future)).book.records).toHaveLength(1);
  expect(await discovery()).not.toContain(a.tenantId);
  expect((await f.admin.query("SELECT actor_membership_id FROM app.retention_record WHERE tenant_id=$1 AND command_id=$2", [a.tenantId, review.id])).rows).toEqual([{ actor_membership_id: null }]);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='retention.review.raised'", [a.tenantId])).rows[0].n).toBe(1);
  expect(await moneySnapshot()).toEqual(before);
  expect(RETENTION_BALANCES_ENABLED).toBe(false); expect(assertRetentionIssueAllowed).toThrow("disabled");
 });
 it("date revisions need fresh reviews and invalidate old human approvals", async () => {
  const a = await company(), p = profile(), pid = randomUUID(); await append(a, p, pid);
  await timer().raiseTimerReviews(a.context);
  const reviewId = (await read(a)).book.records[1]!.id, resolutionId = randomUUID();
  await append(a, { version: "retention.resolution.v1", reviewId, outcome: "approved", conditionSatisfied: true,
   humanSource: { inputId: randomUUID() }, amount }, resolutionId);
  const nextId = randomUUID();
  await append(a, { ...p, revision: 2, previousProfileId: pid, conditions: p.conditions.map(c => ({ ...c, dueDate: "2001-01-01" })) }, nextId);
  await expect(append(a, { version: "retention.release.v1", resolutionId })).rejects.toMatchObject({ code: "STALE_PROFILE" });
  expect(await timer().raiseTimerReviews(a.context)).toBe(1);
  expect(await timer().raiseTimerReviews(a.context)).toBe(0);
  expect((await read(a)).book.records.at(-1)).toMatchObject({ version: "retention.review.v1", profileId: nextId });
 });
 it("bounds infrastructure writes, rejects foreign jobs, stale hashes/profiles, extra authority and restores context", async () => {
  const a = await company(), b = await company(), p = profile(), pid = randomUUID(); await append(a, p, pid);
  await workTenant(infrastructure, a.tenantId, async db => {
   const invoke = (j: string, v: unknown, hash: string | null) => db.query("SELECT infrastructure.retention_timer($1,$2,$3::jsonb,$4) result", [a.tenantId, j, v === null ? null : JSON.stringify(v), hash]);
   const stored = (await invoke(a.jobId, null, null)).rows[0].result;
   const valid = { version: "retention.review.v1", id: randomUUID(), tenantId: a.tenantId, jobId: a.jobId, profileId: pid,
    conditionId: p.conditions[0]!.id, owner: "retention-release-review-v1", trigger: "timer", raisedOn: stored.today };
   for (const [job, record, hash] of [
    [b.jobId, null, null], [a.jobId, valid, "0".repeat(64)],
    [a.jobId, { ...valid, profileId: randomUUID() }, stored.bookHash],
    [a.jobId, { ...valid, raisedOn: "1999-01-01" }, stored.bookHash],
    [a.jobId, { ...valid, conditionSatisfied: true }, stored.bookHash],
    ...["resolution", "release", "receipt", "reversal", "profile"].map(kind => [a.jobId, { ...valid, version: `retention.${kind}.v1` }, stored.bookHash]),
   ] as [string, unknown, string | null][]) {
    await db.query("SAVEPOINT attack"); await expect(invoke(job, record, hash)).rejects.toThrow();
    await db.query("ROLLBACK TO SAVEPOINT attack");
    expect((await db.query("SELECT current_setting('app.tenant_id') t")).rows[0].t).toBe(a.tenantId);
   }
   await db.query("SELECT infrastructure.discover_retention_reviews()");
   expect((await db.query("SELECT current_setting('app.tenant_id') t")).rows[0].t).toBe(a.tenantId);
  });
  for (const sql of ["SELECT * FROM app.retention_record", "UPDATE app.retention_record SET record='{}'", "DELETE FROM app.retention_record", "TRUNCATE app.retention_record"]) {
   await expect(infrastructure.query(sql)).rejects.toMatchObject({ code: "42501" });
  }
  await expect(workTenant(f.runtime, a.tenantId, db => db.query("SELECT infrastructure.retention_timer($1,NULL,NULL,NULL)", [a.tenantId]))).rejects.toMatchObject({ code: "42501" });
  expect((await read(a)).book.records).toHaveLength(1);
 });
 it("fails closed on an altered stored history", async () => {
  const a = await company(), p = profile(), pid = randomUUID();
  // Owner fixture bypasses core only to insert a hash-valid but invalid retained-value history.
  const record = { ...p, id: pid, tenantId: a.tenantId, jobId: a.jobId, retained: { netPence: 1, taxPence: 0 } };
  await f.admin.query(`INSERT INTO app.retention_record(tenant_id,job_id,command_id,ordinal,record_kind,record,record_hash,actor_membership_id)
   VALUES($1,$2,$3,1,'retention.profile.v1',$4::jsonb,app.final_lock_hash($4::jsonb),$5)`, [a.tenantId, a.jobId, pid, JSON.stringify(record), a.actorId]);
  await expect(timer().raiseTimerReviews(a.context)).rejects.toMatchObject({ code: "VALUE_LIMIT" });
  expect((await f.admin.query("SELECT count(*)::int n FROM app.retention_record WHERE tenant_id=$1", [a.tenantId])).rows[0].n).toBe(1);
 });
});
