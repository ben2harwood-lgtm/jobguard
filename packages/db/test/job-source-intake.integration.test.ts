// SV-7A intake writer (0297). Real PostgreSQL; CI only.
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {JobSourceError,JobWorkStateError} from "@jobguard/core";
import {JobSourceRepository} from "../src/job-source-repository.js";
import {WatchdogError,claimCommandIdentity,requireLiveJob} from "../src/watchdog.js";
import {withTenant} from "../src/tenant-context.js";
import {sourcesFixture,closeWorkFixture,workTenant,type SourceFixture} from "./job-sources-fixture.js";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,type FinalCheckFixture} from "./final-check-fixture.js";

const diary=(text="Fitted outside tap.",onSite=false,commandId=randomUUID())=>({version:"job-diary-input.v1",commandId,entryMode:"typed",onSite,text});
const message=(text="Please fit an outside tap.",commandId=randomUUID())=>({version:"customer-message-input.v1",commandId,fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional Alex"},text});
const counts=async(f:SourceFixture)=>Object.fromEntries(await Promise.all(["job_source_original","job_diary_entry","customer_message_source","evidence_object","command_receipt","audit_event"].map(async table=>[table,
 Number((await f.admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1`,[f.practice.auth.context.tenantId])).rows[0].n)])));

describe("SV-7A checked intake writer",()=>{
 let f:SourceFixture,repo:JobSourceRepository;
 beforeAll(async()=>{f=await sourcesFixture();repo=new JobSourceRepository(f.runtime)},60000);afterAll(async()=>closeWorkFixture(f));
 it("an off-site diary note persists exact bytes, binds evidence, reads back and replays identically",async()=>{
  const {auth,jobId}=f.practice,input=diary();
  const receipt=await repo.intake(auth.context,jobId,auth.digest,"diary",input);
  expect(receipt).toMatchObject({version:"job-source-intake-receipt.v1",jobId,sourceKind:"diary",record:{text:"Fitted outside tap.",onSite:false,entryMode:"typed",commandId:input.commandId,actualTesterMembershipId:auth.membershipId}});
  expect(await repo.intake(auth.context,jobId,auth.digest,"diary",input)).toEqual(receipt);
  const read=await repo.read(auth.context,jobId,auth.digest,"diary");
  expect(read.entries.find(e=>e.id===receipt.record.id)).toEqual(receipt.record);
  // The server alone chooses the reviewed fixture reference from exact text and kind.
  expect((await f.admin.query("SELECT synthetic_fixture_ref FROM app.job_source_original WHERE tenant_id=$1 AND source_id=$2",[auth.context.tenantId,receipt.record.id])).rows[0].synthetic_fixture_ref).toBe("job-source:outside-tap.v1");
  const other=await repo.intake(auth.context,jobId,auth.digest,"diary",diary("Painted the hall."));
  expect((await f.admin.query("SELECT synthetic_fixture_ref FROM app.job_source_original WHERE tenant_id=$1 AND source_id=$2",[auth.context.tenantId,other.record.id])).rows[0].synthetic_fixture_ref).toBeNull();
  // Audit carries identifiers and the hash only, never the note text.
  const audit=(await f.admin.query("SELECT payload::text p FROM app.audit_event WHERE tenant_id=$1 AND event_type='job_source.diary_recorded'",[auth.context.tenantId])).rows;
  expect(audit.length).toBeGreaterThanOrEqual(2);for(const row of audit)expect(row.p).not.toContain("outside tap");
 });
 it("a customer message keeps the fictional name separate from the actual tester",async()=>{
  const {auth,jobId}=f.practice,receipt=await repo.intake(auth.context,jobId,auth.digest,"customer_message",message());
  expect(receipt.record).toMatchObject({fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional Alex"},actualTesterMembershipId:auth.membershipId});
  expect((await repo.read(auth.context,jobId,auth.digest,"customer_message")).messages.some(m=>m.id===receipt.record.id)).toBe(true);
 });
 it("a reused command id with a different note or kind is a conflict and writes nothing",async()=>{
  const {auth,jobId}=f.practice,input=diary("First note.");await repo.intake(auth.context,jobId,auth.digest,"diary",input);
  const before=await counts(f);
  await expect(repo.intake(auth.context,jobId,auth.digest,"diary",{...input,text:"Changed note."})).rejects.toEqual(new WatchdogError("IDEMPOTENCY_CONFLICT"));
  await expect(repo.intake(auth.context,jobId,auth.digest,"customer_message",message("Hello",input.commandId))).rejects.toEqual(new WatchdogError("IDEMPOTENCY_CONFLICT"));
  expect(await counts(f)).toEqual(before);
 });
 it.each(["diary","customer_message"] as const)("%s parallel retries return one receipt and one source",async kind=>{
  const {auth,jobId}=f.practice,input=kind==="diary"?diary("Concurrent diary."):message("Concurrent message.");
  const receipts=await Promise.all([1,2,3].map(()=>repo.intake(auth.context,jobId,auth.digest,kind,input)));
  expect(receipts[1]).toEqual(receipts[0]);expect(receipts[2]).toEqual(receipts[0]);
  expect(Number((await f.admin.query("SELECT count(*) n FROM app.job_source_original WHERE tenant_id=$1 AND job_id=$2 AND source_id=$3",[auth.context.tenantId,jobId,receipts[0]!.record.id])).rows[0].n)).toBe(1);
 });
 it.each(["diary","customer_message"] as const)("%s history reserves its command id without modern bookkeeping",async kind=>{
  const {auth,jobId}=f.practice,input=kind==="diary"?diary("Legacy diary."):message("Legacy message.");
  const first=await repo.intake(auth.context,jobId,auth.digest,kind,input);
  await f.admin.query("DELETE FROM app.watchdog_command_identity WHERE tenant_id=$1 AND command_id=$2",[auth.context.tenantId,input.commandId]);
  await expect(withTenant(f.runtime,auth.context,async db=>{
   await requireLiveJob(db,jobId);
   await claimCommandIdentity(db,{tenantId:auth.context.tenantId,jobId,commandId:input.commandId,kind:"readiness.record",requestHash:"a".repeat(64)});
  })).rejects.toEqual(new WatchdogError("IDEMPOTENCY_CONFLICT"));
  expect(Number((await f.admin.query("SELECT count(*) n FROM app.watchdog_command_identity WHERE tenant_id=$1 AND command_id=$2",[auth.context.tenantId,input.commandId])).rows[0].n)).toBe(0);
  expect(await repo.intake(auth.context,jobId,auth.digest,kind,input)).toEqual(first);
 });
 it("on-site notes wait for place admission and malformed input is refused, with no effects",async()=>{
  const {auth,jobId}=f.practice,before=await counts(f);
  await expect(repo.intake(auth.context,jobId,auth.digest,"diary",diary("On site today.",true))).rejects.toEqual(new JobSourceError("JOB_SOURCE_UNAVAILABLE"));
  for(const bad of [{...diary(),extra:1},{...diary(),text:"   "},{...diary(),version:"job-diary-input.v0"},{...message(),fictionalCustomer:{kind:"named_fictional_customer",name:" "}}])
   await expect(repo.intake(auth.context,jobId,auth.digest,"version" in bad&&String(bad.version).startsWith("customer")?"customer_message":"diary",bad)).rejects.toEqual(new JobSourceError("INVALID_JOB_SOURCE_INPUT"));
  expect(await counts(f)).toEqual(before);
 });
 it("another session's digest cannot write to this job",async()=>{
  const {auth,jobId}=f.practice,before=await counts(f);
  await expect(repo.intake(auth.context,jobId,"0".repeat(64),"diary",diary())).rejects.toEqual(new JobSourceError("JOB_SOURCE_FORBIDDEN"));
  await expect(repo.intake(auth.context,randomUUID(),auth.digest,"diary",diary())).rejects.toEqual(new JobSourceError("JOB_SOURCE_FORBIDDEN"));
  expect(await counts(f)).toEqual(before);
 });
 it("a job that is not live refuses new sources; a replay of an earlier note still returns its receipt",async()=>{
  const {auth,jobId}=f.practice,input=diary("Before pause.");const saved=await repo.intake(auth.context,jobId,auth.digest,"diary",input);
  await workTenant(f.admin,auth.context.tenantId,db=>db.query("UPDATE app.job SET status='invoiced' WHERE id=$1",[jobId]));
  try{
   const before=await counts(f);
   await expect(repo.intake(auth.context,jobId,auth.digest,"diary",diary("After pause."))).rejects.toEqual(new WatchdogError("JOB_NOT_LIVE"));
   expect(await repo.intake(auth.context,jobId,auth.digest,"diary",input)).toEqual(saved);
   expect(await counts(f)).toEqual(before);
  }finally{await workTenant(f.admin,auth.context.tenantId,db=>db.query("UPDATE app.job SET status='live' WHERE id=$1",[jobId]))}
 });
});

describe("SV-7A intake after the final-account lock",()=>{
 let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));
 it("a note before lock is saved; after the real lock a new note gets the linked-job refusal with no effects",async()=>{
  const a=await seedFinalCheckJob(f),repo=new JobSourceRepository(f.runtime);
  await repo.intake(a.context,a.jobId,a.digest,"diary",diary("Before lock."));
  await a.lock();
  const rows=async()=>Number((await f.admin.query("SELECT count(*) n FROM app.job_source_original WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n);
  const before=await rows();
  await expect(repo.intake(a.context,a.jobId,a.digest,"diary",diary("After lock."))).rejects.toEqual(new JobWorkStateError("POST_LOCK_WORK_REQUIRES_LINKED_JOB"));
  expect(await rows()).toBe(before);
 });
});
