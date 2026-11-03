// 0515: the demo-only fake-rail step and the compensation gate. Genuine PostgreSQL writers.
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {SimulationFeeCollectionRepository} from "../src/simulation-fee-collection-repository.js";
import {SimulationFeeStatementRepository} from "../src/simulation-fee-statement-repository.js";
import {SimulationMoneyRunRepository} from "../src/simulation-money-run-repository.js";
import {practiceMaterialPool} from "../src/practice-session.js";
import {withTenant} from "../src/tenant-context.js";
import {createFinalCheckFixture,closeFinalCheckFixture,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {recoveryFeeFixture} from "./success-fee-recovery-fixture.js";
import {testTenantContext} from "./tenant-context-test-utils.js";
let f:FinalCheckFixture,statements:SimulationFeeStatementRepository,collection:SimulationFeeCollectionRepository;
beforeAll(async()=>{f=await createFinalCheckFixture();statements=new SimulationFeeStatementRepository(f.runtime);collection=new SimulationFeeCollectionRepository(f.runtime);},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
const version="simulation-fee-demo-settle-command.v1";
const issueCommand=()=>({version:"simulation-fee-statement-command.v1",action:"issue",commandId:randomUUID()});
async function pending(){
 const x=await recoveryFeeFixture(f);await x.allocate(0);await x.approve(await x.review());
 const saved=await statements.command(x.context,x.jobId,x.auth.digest,issueCommand());
 const attempt=await collection.command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-collection-command.v1",action:"collect",commandId:randomUUID(),statementId:saved.statementId,statementHash:saved.documentHash,amountPence:3200});
 const view=()=>collection.view(x.context,x.jobId,x.auth.digest);
 const events=async()=>(await f.admin.query("SELECT state FROM app.platform_fee_attempt_event WHERE tenant_id=$1 AND attempt_id=$2 ORDER BY revision",[x.context.tenantId,attempt.attemptId])).rows.map(r=>r.state);
 return {...x,saved,attemptId:attempt.attemptId,view,events};
}
it("settles this job's pending fake collection once, and a repeat has one effect",async()=>{
 const x=await pending(),command={version,commandId:randomUUID(),attemptId:x.attemptId};
 expect(await x.view()).toMatchObject({settledPrincipal:0,collectionReserved:3200});
 const first=await collection.demoSettle(x.context,x.jobId,x.auth.digest,command);
 expect(first).toMatchObject({attemptId:x.attemptId,replayed:false});
 expect(await collection.demoSettle(x.context,x.jobId,x.auth.digest,command)).toEqual({...first,replayed:true});
 await expect(collection.demoSettle(x.context,x.jobId,x.auth.digest,{...command,commandId:randomUUID()})).rejects.toThrow("SUCCESS_FEE_STALE");
 expect(await x.view()).toMatchObject({settledPrincipal:3200,outstandingPrincipal:0,collectionReserved:0});
 expect(await x.events()).toEqual(["pending","settled"]);
});
it("refuses outside synthetic_demo before opening a connection",async()=>{
 const x=await pending();
 vi.stubEnv("JOBGUARD_ENV","production");
 try{await expect(collection.demoSettle(x.context,x.jobId,x.auth.digest,{version,commandId:randomUUID(),attemptId:x.attemptId})).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");}
 finally{vi.unstubAllEnvs();}
 expect(await x.events()).toEqual(["pending"]);
 // The SQL entry point runs read_success_fee_v3's database check first.
 const sql=await readFile(new URL("../migrations/0515_fee_compensation_gate_and_demo_settle.sql",import.meta.url),"utf8");
 const body=sql.slice(sql.indexOf("CREATE FUNCTION app.simulation_fee_demo_settle("));
 expect(body.indexOf("app.read_success_fee_v3(p_job,p_session)")).toBeGreaterThan(0);
 expect(body.indexOf("app.read_success_fee_v3(p_job,p_session)")).toBeLessThan(body.indexOf("INSERT INTO"));
 const guard=(await f.admin.query("SELECT prosrc FROM pg_proc WHERE oid='app.read_success_fee_v3(uuid,text)'::regprocedure")).rows[0].prosrc as string;
 expect(guard).toContain("current_database()<>'jobguard_synthetic_demo'");
});
it("refuses a stranger, another tenant, another job's attempt and no pending attempt",async()=>{
 const x=await pending(),y=await pending(),command=()=>({version,commandId:randomUUID(),attemptId:x.attemptId});
 await expect(collection.demoSettle(x.context,x.jobId,y.auth.digest,command())).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await expect(collection.demoSettle(testTenantContext(randomUUID()),x.jobId,x.auth.digest,command())).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await expect(collection.demoSettle(y.context,y.jobId,y.auth.digest,command())).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await expect(collection.demoSettle(x.context,x.jobId,x.auth.digest,{...command(),attemptId:randomUUID()})).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 expect(await x.events()).toEqual(["pending"]);
 // An unknown outcome is not "pending", and a settled attempt is not either.
 await collection.command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-collection-command.v1",action:"unknown",commandId:randomUUID(),attemptId:x.attemptId});
 await expect(collection.demoSettle(x.context,x.jobId,x.auth.digest,command())).rejects.toThrow("SUCCESS_FEE_STALE");
 expect(await x.events()).toEqual(["pending","outcome_unknown"]);
 for(const extra of [{state:"settled"},{amountPence:1},{action:"settle"}])await expect(collection.demoSettle(x.context,x.jobId,x.auth.digest,{...command(),...extra})).rejects.toThrow("INVALID_SUCCESS_FEE_COMMAND");
});
it("leaves the general settle command refused on the builder path and the runtime connection",async()=>{
 const x=await pending(),settle={version:"simulation-fee-collection-command.v1",action:"settle",commandId:randomUUID(),attemptId:x.attemptId};
 await expect(collection.command(x.context,x.jobId,x.auth.digest,settle)).rejects.toThrow("SUCCESS_FEE_FORBIDDEN");
 await expect(withTenant(practiceMaterialPool(f.runtime,x.auth.digest),x.context,db=>db.$client.query("SELECT app.write_platform_fee_collection($1,$2,$3::jsonb)",[x.jobId,x.auth.digest,settle]))).rejects.toMatchObject({code:"42501"});
 expect(await x.events()).toEqual(["pending"]);
});
it("the runtime holds only EXECUTE on the step and PUBLIC holds nothing",async()=>{
 const rows=(await f.admin.query("SELECT has_function_privilege('jobguard_runtime','app.simulation_fee_demo_settle(uuid,text,jsonb)','EXECUTE') runtime,has_function_privilege('jobguard_shadow','app.simulation_fee_demo_settle(uuid,text,jsonb)','EXECUTE') shadow,has_function_privilege('jobguard_infrastructure','app.simulation_fee_demo_settle(uuid,text,jsonb)','EXECUTE') infra")).rows[0];
 expect(rows).toEqual({runtime:true,shadow:false,infra:false});
});

const invalidate=(x:Awaited<ReturnType<typeof recoveryFeeFixture>>)=>finalCheckTenant(f.admin,x.context.tenantId,db=>db.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,'verification_invalid')",[randomUUID(),x.context.tenantId,x.evidence,x.actor.membershipId]));
it("hard gate: after proof is invalidated and the allocation fully reversed, a reviewed compensation posts and the refund follows",async()=>{
 const x=await recoveryFeeFixture(f);await x.allocate(0);await x.approve(await x.review());
 const saved=await statements.command(x.context,x.jobId,x.auth.digest,issueCommand());
 const attempt=await collection.command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-collection-command.v1",action:"collect",commandId:randomUUID(),statementId:saved.statementId,statementHash:saved.documentHash,amountPence:3200});
 await collection.demoSettle(x.context,x.jobId,x.auth.digest,{version,commandId:randomUUID(),attemptId:attempt.attemptId});
 await x.reverse(0);await invalidate(x);
 const review=await x.review(1);
 expect(review.statement).toMatchObject({feePence:0,priorPence:3200,deltaPence:-3200});
 const journals=(await f.admin.query("SELECT count(*)::int n FROM app.success_fee_journal WHERE tenant_id=$1 AND job_id=$2",[x.context.tenantId,x.jobId])).rows[0].n as number;
 expect(journals).toBe(1); // A review alone posts nothing.
 const posted=await x.approve(review);expect(posted.journalId).not.toBeNull();
 const correction=await statements.command(x.context,x.jobId,x.auth.digest,issueCommand());
 const refund=await collection.command(x.context,x.jobId,x.auth.digest,{version:"simulation-fee-collection-command.v1",action:"refund",commandId:randomUUID(),statementId:correction.statementId,statementHash:correction.documentHash,amountPence:3200});
 await collection.demoSettle(x.context,x.jobId,x.auth.digest,{version,commandId:randomUUID(),attemptId:refund.attemptId});
 expect(await collection.view(x.context,x.jobId,x.auth.digest)).toMatchObject({settledPrincipal:3200,refundedPrincipal:3200,retainedPrincipal:0,refundDue:0});
 const report=(await new SimulationMoneyRunRepository(f.runtime).command(x.context,x.jobId,x.auth.digest,{version:"simulation-money-command.v1",action:"run",commandId:randomUUID()})).report;
 expect(report.successFee).toMatchObject({postedPence:0,refundedPence:3200});
 expect(report.differences.map(d=>d.code)).not.toContain("FEE_COMPENSATION_REQUIRED");
});
it("hard gate: invalid proof permits only a reduction and refuses new positive entitlement",async()=>{
 const x=await recoveryFeeFixture(f);await x.allocate(0);await x.approve(await x.review());
 await x.allocate(1);await invalidate(x);
 // Both landings lost proof, so even the still-held receipt contributes zero.
 expect((await x.review(1)).statement).toMatchObject({feePence:0,deltaPence:-3200});
 const y=await recoveryFeeFixture(f);await y.allocate(0);await invalidate(y);
 await expect(y.review(0)).rejects.toThrow("SUCCESS_FEE_SOURCE_CHANGED");
 expect((await f.admin.query("SELECT count(*)::int n FROM app.success_fee_journal WHERE tenant_id=$1 AND job_id=$2",[y.context.tenantId,y.jobId])).rows[0].n).toBe(0);
 await expect(statements.command(y.context,y.jobId,y.auth.digest,issueCommand())).rejects.toThrow(/SUCCESS_FEE_(SOURCE_CHANGED|DEPENDENCY_BOUND)/u);
 // A landing cannot be added on proof already invalidated.
 const z=await recoveryFeeFixture(f);await z.allocate(0);await z.approve(await z.review());await z.reverse(0);await invalidate(z);
 await expect(z.allocate(1)).rejects.toThrow();
 expect((await z.review(1)).statement).toMatchObject({feePence:0,deltaPence:-3200});
});
