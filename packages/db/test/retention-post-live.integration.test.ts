import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { RETENTION_REVIEW_OWNER } from "@jobguard/core";
import { RetentionRecordRepository } from "../src/retention-record-repository.js";
import { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
let f: WorkFixture;
beforeAll(async () => { f = await createWorkFixture(); }, 240000);
afterAll(async () => { if (f) await closeWorkFixture(f); });
async function setJobStatus(tenantId: string, jobId: string, status: string) {
 // Synthetic setup only: isolate retention behavior from the separate invoice journey.
 const client = await f.admin.connect();
 try {
  await client.query("BEGIN"); await client.query("SET LOCAL session_replication_role=replica");
  await client.query("UPDATE app.job SET status=$3 WHERE tenant_id=$1 AND id=$2", [tenantId, jobId, status]);
  await client.query("COMMIT");
 } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
it.each(["invoiced", "paid"])("reads, reviews and runs the retention timer after a job is %s", async (status) => {
 const a = await meterCompany(f); const repo = new RetentionRecordRepository(f.runtime);
 const amount = (netPence: number, taxPence = 0) => ({ netPence, taxPence });
 const source = { kind: "contract_profile", profileVersion: "fictional.v1", clause: "fictional-retention" };
 const pid = randomUUID(), cond = randomUUID();
 const p = { version: "retention.profile.v1", revision: 1, previousProfileId: null, contractProfileVersion: "fictional.v1", fixtureApprovalId: randomUUID(), taxTreatmentVersion: "fictional.v1",
  retained: amount(10000,2000), alreadyBilled: amount(1000,200),
  conditions: [{ id: cond, milestone: "completion", description: "Fictional completion", source, dateSource: source, dueDate: "2026-01-01", cumulativeLimit: amount(5000,1000) },
  { id: randomUUID(), milestone: "defects", description: "Fictional defects", source, dateSource: source, dueDate: "9999-12-31", cumulativeLimit: amount(10000,2000) }] };
 await repo.command(a.context, { sessionDigest: a.digest }, { version: "retention-record-command.v1", jobId: a.jobId, commandId: pid, record: p });

 expect((await repo.read(a.context, { sessionDigest: a.digest }, a.jobId)).book.records).toHaveLength(1);
 await setJobStatus(a.tenantId, a.jobId, status);
 const read = await repo.read(a.context, { sessionDigest: a.digest }, a.jobId).then(() => "READ_OK", (e: { code?: string }) => `READ_REFUSED ${e.code}`);
 const rv = await repo.command(a.context, { sessionDigest: a.digest }, { version: "retention-record-command.v1", jobId: a.jobId, commandId: randomUUID(),
  record: { version: "retention.review.v1", profileId: pid, conditionId: cond, owner: RETENTION_REVIEW_OWNER, trigger: "human", raisedOn: "2026-01-01" } })
  .then(() => "REVIEW_OK", (e: { code?: string }) => `REVIEW_REFUSED ${e.code}`);
 const timer = await repo.raiseTimerReviews(a.context);
 expect({ read, rv, timer }).toEqual({ read: "READ_OK", rv: "REVIEW_OK", timer: { appended: 0, refused: 0 } });
}, 240000);

it("refuses new human and timer rows before live while preserving reads and exact replay", async () => {
 const a = await meterCompany(f), repo = new RetentionRecordRepository(f.runtime);
 const source = { kind: "contract_profile", profileVersion: "fictional.v1", clause: "fictional" };
 const pid = randomUUID(), conditionId = randomUUID();
 const input = { version: "retention-record-command.v1", jobId: a.jobId, commandId: pid,
  record: { version: "retention.profile.v1", revision: 1, previousProfileId: null,
   contractProfileVersion: "fictional.v1", fixtureApprovalId: randomUUID(), taxTreatmentVersion: "fictional.v1",
   retained: { netPence: 10000, taxPence: 2000 }, alreadyBilled: { netPence: 0, taxPence: 0 },
   conditions: [{ id: conditionId, milestone: "completion", description: "Fictional completion",
    source, dateSource: source, dueDate: "2000-01-01", cumulativeLimit: { netPence: 10000, taxPence: 2000 } }] } };
 await repo.command(a.context, { sessionDigest: a.digest }, input);
 await setJobStatus(a.tenantId, a.jobId, "quoting");
 const before = await repo.read(a.context, { sessionDigest: a.digest }, a.jobId);
 expect(before.book.records).toHaveLength(1);
 expect((await repo.command(a.context, { sessionDigest: a.digest }, input)).book).toEqual(before.book);
 const review = { version: "retention.review.v1", profileId: pid, conditionId,
  owner: RETENTION_REVIEW_OWNER, trigger: "human", raisedOn: "2000-01-01" };
 await expect(repo.command(a.context, { sessionDigest: a.digest }, { ...input, commandId: randomUUID(), record: review }))
  .rejects.toMatchObject({ code: "RETENTION_CONFLICT" });
 // Check the SQL refusal itself as well as its repository mapping.
 await expect(workTenant(f.runtime, a.tenantId, async db => {
  const stored = (await db.query("SELECT app.retention_records($1,$2,$3,NULL,NULL,NULL) result",
   [a.tenantId, a.digest, a.jobId])).rows[0].result;
  const id = randomUUID();
  const record = { ...review, id, tenantId: a.tenantId, jobId: a.jobId };
  await db.query("SELECT app.retention_records($1,$2,$3,$4,$5::jsonb,$6)",
   [a.tenantId, a.digest, a.jobId, id, JSON.stringify(record), stored.bookHash]);
 }, { membershipId: a.actorId, bindRequest: false })).rejects.toThrow("JOB_NOT_LIVE");
 expect(await repo.raiseTimerReviews(a.context)).toEqual({ appended: 0, refused: 1 });
 expect((await repo.read(a.context, { sessionDigest: a.digest }, a.jobId)).book).toEqual(before.book);
 // The same pending timer is allowed when the job reaches invoiced.
 await setJobStatus(a.tenantId, a.jobId, "invoiced");
 expect(await repo.raiseTimerReviews(a.context)).toEqual({ appended: 1, refused: 0 });
 expect(await repo.raiseTimerReviews(a.context)).toEqual({ appended: 0, refused: 0 });
 expect((await repo.read(a.context, { sessionDigest: a.digest }, a.jobId)).book.records).toHaveLength(2);
}, 240000);
