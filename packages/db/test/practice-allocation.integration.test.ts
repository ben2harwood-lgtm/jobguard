import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EvidenceService, PracticeAllocationRepository, PracticeFeedRepository, PracticeInvoiceRepository, RecoveryCaseRepository,
 migrate, MIGRATION_URLS, withTenant, type VerifiedTenantContext } from "../src/index.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { closeTestPools } from "./pool-test-utils.js";
import type { PracticeAllocationView } from "@jobguard/core";
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const context = { tenantId: DEMO_TENANT_ID } as VerifiedTenantContext, otherTenant = randomUUID();
const command = (expectedRevision: number, extra: Record<string, unknown>) => ({ version: "practice-allocation-command.v1", commandId: randomUUID(), expectedRevision, ...extra });
const repo = () => new PracticeAllocationRepository(runtime, "synthetic_demo");
// Generated PNG bytes pass the real evidence finalizer; only object storage is in-memory.
function png() {
 const crc=(bytes:Buffer)=>{let n=0xffffffff;for(const b of bytes){n^=b;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return(n^0xffffffff)>>>0};
 const chunk=(type:string,data:Buffer)=>{const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),data.length+8);return out};
 const h=Buffer.alloc(13);h.writeUInt32BE(1,0);h.writeUInt32BE(1,4);h[8]=8;h[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",h),chunk("IDAT",deflateSync(Buffer.from([0,20,40,60]))),chunk("IEND",Buffer.alloc(0))]);
}
async function fixture(settled = true) {
 const jobId=randomUUID(),sessionId=randomUUID(),quoteId=randomUUID(),draftId=randomUUID(),revisionId=randomUUID(),scopeId=randomUUID();
 // Privileged fixture establishes pre-existing commercial baseline; all leaf writes use runtime.
 await admin.query("INSERT INTO app.job(id,tenant_id,title,status)VALUES($1,$2,'Fictional recovery-18800','live')",[jobId,DEMO_TENANT_ID]);
 await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')",[scopeId,DEMO_TENANT_ID,jobId]);
 await admin.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status)VALUES($1,$2,$3,1,$4,1880000,'accepted')",[quoteId,DEMO_TENANT_ID,jobId,"a".repeat(64)]);
 await admin.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id)VALUES($1,$2,$3)",[draftId,DEMO_TENANT_ID,jobId]);
 await admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',1880000,376000,2256000,false,'[]')`,[revisionId,DEMO_TENANT_ID,jobId,draftId,"a".repeat(64),quoteId]);
 await admin.query("UPDATE app.final_account_draft SET revision=1,current_revision_id=$3 WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,draftId,revisionId]);
 const invoice=await new PracticeInvoiceRepository(runtime).issue(context,{jobId,finalAccountRevisionId:revisionId,actorMembershipId:DEMO_MEMBERSHIP_ID,commandId:randomUUID(),recipient:"practice@example.invalid",issuedOn:"2026-09-25"});
 const bytes=png(),sha=createHash("sha256").update(bytes).digest("hex");
 const storage={async createUploadUrl(){return "memory://generated"},async createDownloadUrl(){return "memory://generated"},async deleteExactVersion(){throw new Error("immutable")},async readExactVersion(key:string,versionId:string){return {key,versionId,bytes,byteLength:bytes.length,contentType:"image/png"}}};
 const evidenceService=new EvidenceService(runtime,storage),evidenceIds:string[]=[];
 for(let i=0;i<2;i++) {const upload=await evidenceService.beginUpload(context,{jobId,scopeItemId:scopeId,expectedSha256:sha,contentType:"image/png",maximumBytes:bytes.length,retentionClass:"standard_evidence",expiresAt:new Date(Date.now()+60000)});const e=await evidenceService.finalize(context,{uploadId:upload.id,objectVersionId:`generated-${i}`,evidenceType:"electrical_certificate"});evidenceIds.push(e.id);}
 const cases=new RecoveryCaseRepository(runtime),caseIds:string[]=[];
 for(const amount of [32000,250000]) {
  const c=await cases.command(context,jobId,{version:"recovery-case-command.v1",commandId:randomUUID(),action:"open",caseType:"withheld_customer_payment",claimedNetPence:amount,currency:"GBP",counterparty:"Fictional customer",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:[invoice.id],reviewerRef:"practice-owner"});
  await cases.eligibilityCommand(context,jobId,{version:"recovery-eligibility-command.v1",commandId:randomUUID(),caseId:c.id,action:"review",scenario:"evidence_backed_withheld_payment",expectedCaseRevision:c.revision,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1},"practice-owner");
  await cases.eligibilityCommand(context,jobId,{version:"recovery-eligibility-command.v1",commandId:randomUUID(),caseId:c.id,action:"approve",expectedCaseRevision:c.revision,expectedEvidenceRevision:1,expectedPolicyRevision:1,expectedReviewRevision:1},"practice-owner");caseIds.push(c.id);
 }
 const feed=new PracticeFeedRepository(runtime,"synthetic_demo");
 await feed.command(sessionId,jobId,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:0,action:"connect"});
 await feed.command(sessionId,jobId,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:1,action:"advance",scenario:settled?"settled_384":"pending_384"});
 return {jobId,sessionId,invoiceId:invoice.id,caseIds:caseIds as [string,string],evidenceIds:evidenceIds as [string,string]};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
async function prepare(f:Fixture){return repo().command(f.sessionId,f.jobId,command(0,{action:"prepare",invoiceId:f.invoiceId,caseIds:f.caseIds,evidenceIds:f.evidenceIds}));}
async function allocate(f:Fixture,s:PracticeAllocationView,index=0,netPence=index?250000:32000,representation?:string){const m=s.movements.find(m=>m.grossPence===(index?300000:38400))!;return repo().command(f.sessionId,f.jobId,command(s.revision,{action:"approve",movementId:m.id,representationId:representation??m.representations[0],caseId:f.caseIds[index],evidenceId:f.evidenceIds[index],netPence}));}
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),"jobguard-practice-allocation-"));const port=60600+Math.floor(Math.random()*150);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();admin=new Pool({host:"127.0.0.1",port,database:"postgres",user:"postgres",password:"synthetic"});
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 for(const url of MIGRATION_URLS.filter(u=>!u.pathname.includes("0044_"))){await admin.query(await readFile(url,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[url.pathname.split("/").at(-1)]);}
 await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1),($2)",[DEMO_TENANT_ID,otherTenant]);
 await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[DEMO_IDENTITY_USER_ID]);
 await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Generated allocation test')",[DEMO_ACCOUNT_ID,DEMO_TENANT_ID]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')",[DEMO_MEMBERSHIP_ID,DEMO_TENANT_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
 await migrate(admin);await migrate(admin);
 await admin.query("CREATE ROLE allocation_test_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO allocation_test_login");
 runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"allocation_test_login",password:"synthetic",max:8});
},60000);
afterAll(async()=>{await closeTestPools(runtime,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true});});

describe("M4-8-S real PostgreSQL allocation",()=>{
 it("upgrades 0043 to 0044 once and retains the existing tenant",async()=>{const names=(await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r=>r.migration_name);expect(names).toHaveLength(MIGRATION_URLS.length);expect(names.at(-1)).toBe("0044_practice_allocation.sql");expect(names.some(n=>n.startsWith("0042"))).toBe(false);expect((await admin.query("SELECT 1 FROM app.membership WHERE id=$1",[DEMO_MEMBERSHIP_ID])).rowCount).toBe(1);});
 it("allocates exact net/tax and reverses actual cash without erasing source history",async()=>{
  const f=await fixture();let s=await prepare(f);s=await allocate(f,s);s=await allocate(f,s,1);
  expect(s).toMatchObject({landing:"Simulated",recoveryGrossMovementsPence:338400,eligibleNetPence:282000,allocatedTaxPence:56400,customerInvoiceBalancePence:1917600});
  const original=s.allocations.find(a=>a.caseId===f.caseIds[1])!;
  s=await repo().command(f.sessionId,f.jobId,command(s.revision,{action:"reverse",allocationId:original.id,netPence:250000}));
  expect(s).toMatchObject({recoveryGrossMovementsPence:38400,eligibleNetPence:32000,allocatedTaxPence:6400,customerInvoiceBalancePence:2217600,feeExecutionState:"Paused — recovery changed"});
  expect(s.cases.find(c=>c.id===f.caseIds[1])).toMatchObject({outstandingNetPence:250000});expect(s.allocations).toHaveLength(2);expect(s.events).toMatchObject([{allocationId:original.id,kind:"reverse",netPence:250000,taxPence:50000,grossPence:300000}]);
  expect(await repo().view(f.sessionId,f.jobId)).toEqual(s);
 });
 it("conserves £100 plus £220 partial net allocations and rejects reuse/overflow",async()=>{
  const f=await fixture();let s=await prepare(f);s=await allocate(f,s,0,10000);expect(s.movements.find(m=>m.grossPence===38400)?.availableGrossPence).toBe(26400);
  s=await allocate(f,s,0,22000);expect(s).toMatchObject({eligibleNetPence:32000,allocatedTaxPence:6400});
  await expect(allocate(f,s,0,5)).rejects.toBeTruthy();expect((await repo().view(f.sessionId,f.jobId)).allocations).toHaveLength(2);
 });
 it.each(["invalidate_evidence","dispute"] as const)("%s holds eligibility without inventing a cash reversal",async action=>{
  const f=await fixture();let s=await prepare(f);s=await allocate(f,s);s=await allocate(f,s,1);const a=s.allocations.find(a=>a.caseId===f.caseIds[1])!;
  s=await repo().command(f.sessionId,f.jobId,command(s.revision,{action,allocationId:a.id}));
  expect(s).toMatchObject({recoveryGrossMovementsPence:338400,customerInvoiceBalancePence:1917600,eligibleNetPence:32000,feeExecutionState:"Paused — recovery changed"});expect(s.events[0]?.kind).toBe(action);
 });
 it("partial reversal retains net/tax conservation and cannot be reversed twice",async()=>{
  const f=await fixture();let s=await prepare(f);s=await allocate(f,s,1);const a=s.allocations[0]!;
  s=await repo().command(f.sessionId,f.jobId,command(s.revision,{action:"reverse",allocationId:a.id,netPence:100000}));
  expect(s).toMatchObject({recoveryGrossMovementsPence:218400,eligibleNetPence:150000,allocatedTaxPence:30000,customerInvoiceBalancePence:2037600});
  await expect(repo().command(f.sessionId,f.jobId,command(s.revision,{action:"reverse",allocationId:a.id,netPence:150005}))).rejects.toBeTruthy();
 });
 it("replays one exact command, conflicts on payload reuse and serializes alternative representations",async()=>{
  const f=await fixture(),s=await prepare(f),m=s.movements.find(m=>m.grossPence===38400)!;
  const a=command(s.revision,{action:"approve",movementId:m.id,representationId:m.representations[0],caseId:f.caseIds[0],evidenceId:f.evidenceIds[0],netPence:32000});
  const results=await Promise.all([repo().command(f.sessionId,f.jobId,a),repo().command(f.sessionId,f.jobId,a)]);expect(results[0]).toEqual(results[1]);
  await expect(repo().command(f.sessionId,f.jobId,{...a,netPence:10000})).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
  const g=await fixture(),v=await prepare(g),movement=v.movements.find(m=>m.grossPence===38400)!;
  const attempts=await Promise.allSettled(movement.representations.slice(0,2).map(rep=>allocate(g,v,0,32000,rep)));
  expect(attempts.filter(r=>r.status==="fulfilled")).toHaveLength(1);expect(attempts.filter(r=>r.status==="rejected")).toHaveLength(1);
 });
 it("rejects pending/manual sources, foreign jobs/evidence, foreign sessions and live environments",async()=>{
  const p=await fixture(false);await expect(prepare(p)).rejects.toBeTruthy();
  const f=await fixture(),other=await fixture(),s=await prepare(f),m=s.movements[0]!;
  for(const extra of [{caseId:other.caseIds[0]},{evidenceId:other.evidenceIds[0]},{movementId:randomUUID()},{representationId:"manual-receipt"}])await expect(repo().command(f.sessionId,f.jobId,command(s.revision,{action:"approve",movementId:m.id,representationId:m.representations[0],caseId:f.caseIds[0],evidenceId:f.evidenceIds[0],netPence:32000,...extra}))).rejects.toBeTruthy();
  await expect(repo().view(randomUUID(),f.jobId)).rejects.toBeTruthy();
  for(const mode of ["production_billing","pilot_no_charge"])await expect(new PracticeAllocationRepository(runtime,mode).view(f.sessionId,f.jobId)).rejects.toBeTruthy();
  for(const field of ["revoked_at","expires_at"]){await admin.query(`UPDATE app.membership SET ${field}=now()-interval '1 hour' WHERE id=$1`,[DEMO_MEMBERSHIP_ID]);try{await expect(repo().view(f.sessionId,f.jobId)).rejects.toBeTruthy()}finally{await admin.query(`UPDATE app.membership SET ${field}=NULL WHERE id=$1`,[DEMO_MEMBERSHIP_ID]);}}
 });
});
