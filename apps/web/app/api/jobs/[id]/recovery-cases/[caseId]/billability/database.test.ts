// PostgreSQL CI only: real command/read routines through the web route. No provider calls.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createFinalCheckFixture, closeFinalCheckFixture, finalCheckTenant, seedFinalCheckJob, type FinalCheckFixture } from "../../../../../../../../../packages/db/test/final-check-fixture.js";
import { realReceiptFixture } from "../../../../../../../../../packages/db/test/stored-receipt-case-fixture.js";
import { testTenantContext } from "../../../../../../../../../packages/db/test/tenant-context-test-utils.js";
import { StoredReceiptCaseAllocationRepository } from "../../../../../../../../../packages/db/src/stored-receipt-case-allocation-repository.js";
import { RecoveryBillabilityRepository } from "../../../../../../../../../packages/db/src/recovery-billability-repository.js";
const state=vi.hoisted(()=>({pool:undefined as unknown,practice:"",identity:"",tenant:"",member:"",digest:""}));
vi.mock("server-only",()=>({}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>({value:key==="jg_session"?state.practice:state.identity})})}));
vi.mock("../../../../../../lib/synthetic-server",()=>({syntheticPool:()=>state.pool}));
vi.mock("@jobguard/db",()=>import("../../../../../../../../../packages/db/src/index.js"));
vi.mock("../../../../../../lib/identity-server",()=>({identityApplication:()=>({
 session:async()=>({csrfToken:"synthetic-csrf",memberships:[{tenantId:state.tenant,role:"owner"}]}),
 context:async()=>testTenantContext(state.tenant),allowedOrigin:"http://example.invalid",provider:{digest:()=>state.digest},
})}));
import { POST, GET } from "./route";
let f:FinalCheckFixture;
const priorEnvironment=process.env.JOBGUARD_ENV,priorOrigin=process.env.AUTH_ALLOWED_ORIGIN;
beforeAll(async()=>{f=await createFinalCheckFixture();state.pool=f.runtime;process.env.JOBGUARD_ENV="synthetic_demo";process.env.AUTH_ALLOWED_ORIGIN="http://example.invalid";},120000);
afterAll(async()=>{await closeFinalCheckFixture(f);if(priorEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=priorEnvironment;if(priorOrigin===undefined)delete process.env.AUTH_ALLOWED_ORIGIN;else process.env.AUTH_ALLOWED_ORIGIN=priorOrigin;});
type Fixture=Awaited<ReturnType<typeof realReceiptFixture>>;
async function ready(){
 const x=await realReceiptFixture(f);
 state.practice=x.session;state.identity="";state.tenant=x.context.tenantId;
 const revision=(await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2",[state.tenant,x.caseId])).rows[0].revision;
 const p={version:"stored-receipt-case-command.v1",action:"review",commandId:randomUUID(),factLineId:x.fact.lineAllocationId,caseId:x.caseId,workId:x.workId,expectedCaseRevision:revision};
 const allocator=new StoredReceiptCaseAllocationRepository(f.runtime,"synthetic_demo");
 const review=await allocator.command(x.context,x.jobId,x.auth.digest,p);
 await allocator.command(x.context,x.jobId,x.auth.digest,{...p,action:"approve",commandId:randomUUID(),reviewId:review.reviewId,approvalHash:review.approvalHash});
 return {x,command:{version:"recovery-billability-command.v1",action:"review",commandId:randomUUID(),caseId:x.caseId,workId:x.workId,lineId:x.line,expectedCaseRevision:revision,claimedEligiblePrincipalPence:80000,reasons:"Fictional review via web route"}};
}
function send(x:Fixture,body:unknown){return POST(new Request("http://example.invalid",{method:"POST",headers:{origin:"http://example.invalid","content-type":"application/json"},body:JSON.stringify(body)}),{params:Promise.resolve({id:x.jobId,caseId:x.caseId})});}
async function owner(x:Fixture,same=false){
 const user=same?x.actor.identityUserId:randomUUID(),member=same?x.actor.membershipId:randomUUID();state.identity=randomUUID();state.digest=createHash("sha256").update(state.identity).digest("hex");state.member=member;
 await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[user]);
 if(!same)await finalCheckTenant(f.admin,x.context.tenantId,async db=>{const account=(await db.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[x.context.tenantId,x.actor.membershipId])).rows[0].account_id;await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[member,x.context.tenantId,account,user]);});
 await f.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')",[randomUUID(),user,state.digest,randomUUID()]);
}
const approve=(command:Awaited<ReturnType<typeof ready>>["command"])=>{const {claimedEligiblePrincipalPence:_amount,reasons:_reasons,...base}=command;return {...base,action:"approve",commandId:randomUUID(),reviewCommandId:command.commandId};};
it("route records one review and one approval under duplicate/replay and serves the stored review to the second person",async()=>{
 const {x,command}=await ready();const a=await send(x,command),b=await send(x,command);expect(a.status).toBe(200);expect(await b.json()).toEqual(await a.json());
 await owner(x);const view=await GET(new Request("http://example.invalid"),{params:Promise.resolve({id:x.jobId,caseId:x.caseId})});expect(view.status).toBe(200);expect((await view.json()).reviews[0].review.command.reasons).toBe(command.reasons);
 const p=approve(command);const first=await send(x,p),replay=await send(x,p);expect(first.status).toBe(200);expect(await replay.json()).toEqual(await first.json());
 expect((await f.admin.query("SELECT count(*)::int n FROM app.recovery_billability_command WHERE tenant_id=$1 AND job_id=$2",[state.tenant,x.jobId])).rows[0].n).toBe(2);
},120000);
it("stale revision changes nothing and exact command replay conflicts remain typed",async()=>{
 const {x,command}=await ready();expect((await send(x,{...command,expectedCaseRevision:command.expectedCaseRevision+1})).status).toBe(409);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.recovery_billability_command WHERE tenant_id=$1 AND job_id=$2",[state.tenant,x.jobId])).rows[0].n).toBe(0);
 expect((await send(x,command)).status).toBe(200);expect((await send(x,{...command,reasons:"Another payload"})).status).toBe(409);
},120000);
it("self-approval and a second membership for the same person cannot approve",async()=>{
 const {x,command}=await ready();await send(x,command);await owner(x,true);expect((await send(x,approve(command))).status).toBe(404);
 await finalCheckTenant(f.admin,state.tenant,async db=>{const account=(await db.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[state.tenant,x.actor.membershipId])).rows[0].account_id;await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[randomUUID(),state.tenant,account,x.actor.identityUserId]);});
 expect((await send(x,approve(command))).status).toBe(404);
},120000);
it("reversal prevents approval while preserving the stored review",async()=>{
 const {x,command}=await ready();expect((await send(x,command)).status).toBe(200);await owner(x);
 await x.invoices.reverseReceipt(x.context,{jobId:x.jobId,invoiceId:x.invoiceId,paymentId:x.paymentId,actorMembershipId:x.actor.membershipId,commandId:randomUUID(),reason:"Fictional refund"});
 expect([409,422]).toContain((await send(x,approve(command))).status);
 expect((await new RecoveryBillabilityRepository(f.runtime,"synthetic_demo").read(x.context,x.jobId,x.caseId,x.auth.digest)).reviews[0]?.approved).toBe(false);
},120000);
it("read refuses an unlocked job before any source or review projection",async()=>{
 const x=await seedFinalCheckJob(f);
 await expect(new RecoveryBillabilityRepository(f.runtime,"synthetic_demo").read(x.context,x.jobId,randomUUID(),x.digest)).rejects.toThrow("BILLABILITY_NOT_FOUND");
},120000);
it("read hides another practice session, unknown case, another tenant and a revoked role alike",async()=>{
 const {x}=await ready();const repo=new RecoveryBillabilityRepository(f.runtime,"synthetic_demo");
 await expect(repo.read(x.context,x.jobId,randomUUID(),x.auth.digest)).rejects.toThrow("BILLABILITY_NOT_FOUND");
 await expect(repo.read(testTenantContext(randomUUID()),x.jobId,x.caseId,x.auth.digest)).rejects.toThrow("BILLABILITY_NOT_FOUND");
 await expect(repo.read(x.context,x.jobId,x.caseId,"a".repeat(64))).rejects.toThrow("BILLABILITY_NOT_FOUND");
 await owner(x);await finalCheckTenant(f.admin,state.tenant,db=>db.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[state.tenant,state.member]));
 const response=await GET(new Request("http://example.invalid"),{params:Promise.resolve({id:x.jobId,caseId:x.caseId})});expect(response.status).toBe(404);
},120000);
