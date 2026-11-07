import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RETENTION_BALANCES_ENABLED, RETENTION_REVIEW_OWNER, assertRetentionIssueAllowed } from "@jobguard/core";
import { RetentionRecordRepository } from "../src/retention-record-repository.js";
import { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";

describe("M4-20 durable synthetic retention books (PostgreSQL)", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 240000);
 afterAll(async () => { await closeWorkFixture(f); });
 const company = () => meterCompany(f);
 type Company = Awaited<ReturnType<typeof company>>;
 const amount = (netPence: number, taxPence = 0) => ({ netPence, taxPence });
 const actor = (a: Company) => ({ sessionDigest: a.digest });
 const repo = () => new RetentionRecordRepository(f.runtime);
 const input = (a: Company, record: unknown, commandId = randomUUID()) => ({ version: "retention-record-command.v1", jobId: a.jobId, commandId, record });
 const append = (a: Company, record: unknown, cid = randomUUID()) => repo().command(a.context,actor(a),input(a,record,cid));
 const read = (a: Company) => repo().read(a.context,actor(a),a.jobId);
 function profile() {
  const source = { kind: "contract_profile", profileVersion: "fictional.v1", clause: "fictional-retention" };
  return { version: "retention.profile.v1", revision: 1, previousProfileId: null as string | null,
   contractProfileVersion: "fictional.v1", fixtureApprovalId: randomUUID(), taxTreatmentVersion: "fictional.v1",
   retained: amount(10000,2000), alreadyBilled: amount(1000,200),
   conditions: [
    { id:randomUUID(),milestone:"completion",description:"Fictional completion",source,dateSource:source,dueDate:"2026-11-01",cumulativeLimit:amount(5000,1000) },
    { id:randomUUID(),milestone:"defects",description:"Fictional defects",source,dateSource:source,dueDate:"2027-11-01",cumulativeLimit:amount(10000,2000) },
   ] };
 }
 const review = (profileId: string, conditionId: string) => ({ version:"retention.review.v1",profileId,conditionId,owner:RETENTION_REVIEW_OWNER,trigger:"human",raisedOn:"2028-11-01" });
 const resolution = (reviewId: string, net = 4000, tax = 800) => ({ version:"retention.resolution.v1",reviewId,outcome:"approved",conditionSatisfied:true,humanSource:{inputId:randomUUID()},amount:amount(net,tax) });
 const release = (resolutionId: string) => ({ version:"retention.release.v1",resolutionId });
 const financialTables = ["customer_invoice","customer_payment","landing_allocation","landing_reversal","recovery_fee_derivation","recovery_fee_journal","journal","journal_line"];
 async function financialSnapshot(a: Company) {
  const result: Record<string,unknown> = {};
  for (const table of financialTables) result[table] = (await f.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) rows FROM app.${table} r WHERE tenant_id=$1`,[a.tenantId])).rows[0].rows;
  return result;
 }
 it("stores reviews without satisfaction, resolves by the session actor, serializes duplicate releases and never writes money", async () => {
  const a=await company(), p=profile(), pid=randomUUID(), rid=randomUUID(), sid=randomUUID();
  const before=await financialSnapshot(a);
  await append(a,p,pid); await append(a,review(pid,p.conditions[0]!.id),rid);
  expect((await read(a)).reconciliation).toMatchObject({released:amount(0),pendingReviewIds:[rid]});
  await expect(append(a,release(sid))).rejects.toMatchObject({code:"RETENTION_NOT_FOUND"});
  await expect(append(a,{...resolution(rid),conditionSatisfied:false})).rejects.toMatchObject({code:"CONDITION_UNMET"});
  await append(a,resolution(rid),sid);
  const outcomes=await Promise.allSettled([append(a,release(sid)),append(a,release(sid))]);
  expect(outcomes.filter(result=>result.status==="fulfilled")).toHaveLength(1);
  const rejected=outcomes.filter(result=>result.status==="rejected");
  expect(rejected).toHaveLength(1);
  expect(rejected[0]).toMatchObject({status:"rejected",reason:{code:"REPLAY_CONFLICT"}});
  const current=await read(a);
  expect(current.book.records).toHaveLength(4);
  expect(current.book.records.find(row=>row.version==="retention.resolution.v1")).toMatchObject({humanSource:{actorId:a.actorId}});
  expect(current.reconciliation).toMatchObject({released:amount(4000,800),remaining:amount(5000,1000),feeEligibleRecovery:{pence:0}});
  expect(await financialSnapshot(a)).toEqual(before);
  expect(RETENTION_BALANCES_ENABLED).toBe(false); expect(assertRetentionIssueAllowed).toThrow("disabled");
 });
 it("replays once across repository instances, conflicts on changed payload, and preserves all earlier rows through final release/date changes/reversal", async () => {
  const a=await company(),p=profile(),pid=randomUUID(),rid=randomUUID(),sid=randomUUID(),lid=randomUUID();
  const before=await financialSnapshot(a);
  const cmd=input(a,p,pid);
  const retry=await Promise.all([repo().command(a.context,actor(a),cmd),repo().command(a.context,actor(a),cmd)]);
  expect(retry[0]).toEqual(retry[1]);
  await expect(repo().command(a.context,actor(a),{...cmd,record:{...p,taxTreatmentVersion:"changed"}})).rejects.toMatchObject({code:"REPLAY_CONFLICT"});
  await append(a,review(pid,p.conditions[0]!.id),rid); await append(a,resolution(rid),sid); await append(a,release(sid),lid);
  const original=await read(a);
  const receiptId=randomUUID();
  await append(a,{version:"retention.receipt.v1",releaseId:lid,grossPence:4800},receiptId);
  await append(a,{version:"retention.reversal.v1",receiptId,grossPence:1200});
  await expect(append(a,{version:"retention.reversal.v1",receiptId,grossPence:3601})).rejects.toMatchObject({code:"VALUE_LIMIT"});
  await expect(append(a,release(sid))).rejects.toMatchObject({code:"REPLAY_CONFLICT"});
  expect((await read(a)).reconciliation).toMatchObject({grossReceived:{pence:3600},grossReleasedOutstanding:{pence:1200},released:amount(4000,800)});
  const nextId=randomUUID();
  const next={...p,revision:2,previousProfileId:pid,conditions:p.conditions.map(c=>({...c,dueDate:"2028-01-01",dateSource:{kind:"human_input",inputId:randomUUID()}}))};
  await append(a,next,nextId);
  await expect(append(a,resolution(rid))).rejects.toMatchObject({code:"STALE_PROFILE"});
  const finalReview=randomUUID(),finalResolution=randomUUID();
  await append(a,review(nextId,p.conditions[1]!.id),finalReview);
  await append(a,resolution(finalReview,5000,1000),finalResolution); await append(a,release(finalResolution));
  const final=await read(a);
  expect(final.reconciliation).toMatchObject({remaining:amount(0),alreadyBilled:amount(1000,200),released:amount(9000,1800)});
  expect(final.book.records.slice(0,original.book.records.length)).toEqual(original.book.records);
  expect(final.book.records.find(r=>r.id===nextId)).toMatchObject({conditions:[{dateSource:{actorId:a.actorId}},{dateSource:{actorId:a.actorId}}]});
  expect(await financialSnapshot(a)).toEqual(before);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.retention_record WHERE tenant_id=$1 AND command_id=$2",[a.tenantId,pid])).rows[0].n).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'commandId'=$2",[a.tenantId,pid])).rows[0].n).toBe(1);
 });
 it("refuses cross-tenant and nonexistent jobs identically, cross-job lineage, revoked sessions, and raw authority fields", async () => {
  const a=await company(),b=await company(),p=profile(),pid=randomUUID();await append(a,p,pid);
  const sameTenantOtherJob=await meterCompany(f,a.tenantId);
  for (const job of [b.jobId,randomUUID()]) {
   await expect(repo().read(a.context,actor(a),job)).rejects.toThrow("RETENTION_NOT_FOUND");
   await expect(repo().command(a.context,actor(a),{...input(a,p),jobId:job})).rejects.toThrow("RETENTION_NOT_FOUND");
  }
  for (const other of [b,sameTenantOtherJob]) {
   await expect(append(other,review(pid,p.conditions[0]!.id))).rejects.toMatchObject({code:"RETENTION_NOT_FOUND"});
  }
  for (const key of ["tenantId","actorId","enabled"]) await expect(repo().command(a.context,actor(a),{...input(a,p),[key]:a.tenantId})).rejects.toThrow("INVALID_RETENTION_INPUT");
  await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
  await expect(append(a,p)).rejects.toThrow();
  await expect(read(a)).rejects.toThrow("RETENTION_UNAUTHENTICATED");
 });
 it("enforces FORCE RLS, append-only storage, no direct runtime privileges and restores tenant context", async () => {
  const a=await company();await append(a,profile());
  for (const sql of ["UPDATE app.retention_record SET record='{}' WHERE tenant_id=$1","DELETE FROM app.retention_record WHERE tenant_id=$1"]) {
   await expect(f.admin.query(sql,[a.tenantId])).rejects.toMatchObject({code:"55000"});
  }
  await expect(f.admin.query("TRUNCATE app.retention_record")).rejects.toMatchObject({code:"55000"});
  for (const sql of ["SELECT * FROM app.retention_record","DELETE FROM app.retention_record","UPDATE app.retention_record SET record='{}'","INSERT INTO app.retention_record DEFAULT VALUES"]) {
   await expect(workTenant(f.runtime,a.tenantId,db=>db.query(sql), { membershipId: a.actorId })).rejects.toMatchObject({code:"42501"});
  }
  expect((await f.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.retention_record'::regclass")).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
  await workTenant(f.runtime,a.tenantId,async db=>{
   await db.query("SELECT app.retention_records($1,$2,$3,NULL,NULL,NULL)",[a.tenantId,a.digest,a.jobId]);
   expect((await db.query("SELECT current_setting('app.tenant_id') t")).rows[0].t).toBe(a.tenantId);
  }, { membershipId: a.actorId });
  await workTenant(f.runtime,a.tenantId,async db=>{
   const prepared=(await db.query("SELECT app.retention_records($1,$2,$3,NULL,NULL,NULL) result",[a.tenantId,a.digest,a.jobId])).rows[0].result;
   await db.query("SAVEPOINT attack");
   const forged={version:"retention.resolution.v1",id:randomUUID(),tenantId:a.tenantId,jobId:a.jobId,humanSource:{actorId:randomUUID(),inputId:randomUUID()}};
   await expect(db.query("SELECT app.retention_records($1,$2,$3,$4,$5::jsonb,$6)",[a.tenantId,a.digest,a.jobId,forged.id,JSON.stringify(forged),prepared.bookHash])).rejects.toThrow("RETENTION_CONFLICT");
   await db.query("ROLLBACK TO SAVEPOINT attack");
   expect((await db.query("SELECT current_setting('app.tenant_id') t")).rows[0].t).toBe(a.tenantId);
  }, { membershipId: a.actorId });
  expect((await read(a)).book.records).toHaveLength(1);
 });
 it("requires live owner/admin sessions for SQL and repository reads, refuses timer forgery and stamps human dates", async () => {
  const a = await company(), p = profile(), pid = randomUUID(); await append(a,p,pid);
  const r = review(pid,p.conditions[0]!.id), cid = randomUUID();
  await expect(append(a,{...r,trigger:"timer"})).rejects.toThrow("INVALID_RETENTION_INPUT");
  await workTenant(f.runtime,a.tenantId,async db => {
   const stored = (await db.query("SELECT app.retention_records($1,$2,$3,NULL,NULL,NULL) result",[a.tenantId,a.digest,a.jobId])).rows[0].result;
   const forged = {...r,trigger:"timer",id:cid,tenantId:a.tenantId,jobId:a.jobId};
   await db.query("SAVEPOINT forgery");
   await expect(db.query("SELECT app.retention_records($1,$2,$3,$4,$5::jsonb,$6)",[a.tenantId,a.digest,a.jobId,cid,JSON.stringify(forged),stored.bookHash])).rejects.toThrow("RETENTION_CONFLICT");
   await db.query("ROLLBACK TO SAVEPOINT forgery");
  }, { membershipId: a.actorId });
  await append(a,r,cid);
  const today = (await f.admin.query("SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') today")).rows[0].today;
  expect((await read(a)).book.records[1]).toMatchObject({raisedOn:today,trigger:"human"});
  await append(a,r,cid); expect((await read(a)).book.records).toHaveLength(2);
  for (const role of ["read_only","finance","foreman","estimator","admin","owner"]) {
   await f.admin.query("UPDATE app.membership SET role=$1 WHERE tenant_id=$2 AND id=$3",[role,a.tenantId,a.actorId]);
   const sqlRead = () => workTenant(f.runtime,a.tenantId,db => db.query("SELECT app.retention_records($1,$2,$3,NULL,NULL,NULL)",[a.tenantId,a.digest,a.jobId]), { membershipId: a.actorId });
   if (["owner","admin"].includes(role)) { await sqlRead(); expect((await read(a)).book.records).toHaveLength(2); }
   else { await expect(sqlRead()).rejects.toThrow("METER_FORBIDDEN"); await expect(read(a)).rejects.toThrow("RETENTION_FORBIDDEN"); }
  }
  for (const digest of [null,"invalid","f".repeat(64)]) {
   await expect(workTenant(f.runtime,a.tenantId,db => db.query("SELECT app.retention_records($1,$2,$3,NULL,NULL,NULL)",[a.tenantId,digest,a.jobId]), { membershipId: a.actorId })).rejects.toThrow("RETENTION_UNAUTHENTICATED");
  }
 });

 it("never stores the client date even when a person requests an early review", async () => {
  const a = await company(), p = profile(), pid = randomUUID();
  await append(a,{...p,conditions:p.conditions.map(c=>({...c,dueDate:"9999-12-31"}))},pid);
  await workTenant(f.runtime,a.tenantId,async db => {
   const prepared = (await db.query("SELECT app.retention_records($1,$2,$3,NULL,NULL,NULL) result",[a.tenantId,a.digest,a.jobId])).rows[0].result;
   const cid = randomUUID(), record = {...review(pid,p.conditions[0]!.id),raisedOn:"9999-12-31",id:cid,tenantId:a.tenantId,jobId:a.jobId};
   const invoke = (hash:string) => db.query("SELECT app.retention_records($1,$2,$3,$4,$5::jsonb,$6) result",[a.tenantId,a.digest,a.jobId,cid,JSON.stringify(record),hash]);
   const written = (await invoke(prepared.bookHash)).rows[0].result;
   expect((await invoke(written.bookHash)).rows[0].result).toEqual(written);
  }, { membershipId: a.actorId });
  const today = (await f.admin.query("SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') today")).rows[0].today;
  expect((await read(a)).book.records[1]).toMatchObject({trigger:"human",raisedOn:today});
  expect((await read(a)).reconciliation).toMatchObject({released:amount(0)});
 });

});
