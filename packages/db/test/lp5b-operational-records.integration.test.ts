import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { CommercialIntegrityApplicationRepository } from "../src/commercial-integrity-application-repository.js";
import { issuePracticeSession } from "../src/practice-session.js";
import { beginRepositoryCommand, completeRepositoryCommand } from "../src/repository-command.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_JOB_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, seedDemo, type DemoSeedCommand } from "../src/demo-seed.js";
import { withTenant } from "../src/tenant-context.js";
let db:JobDoorsDatabase,actor:Awaited<ReturnType<typeof jobDoorsActor>>;
const priorEnvironment=process.env.JOBGUARD_ENV,context=testTenantContext(DEMO_TENANT_ID);
beforeAll(async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";db=await jobDoorsDatabase(true);
 actor=await jobDoorsActor(db.owner,DEMO_TENANT_ID);
 // Session issuance requires the fixed synthetic principal. The separate owner
 // above remains this suite's actor, including the revoked-replay assertions.
 await db.owner.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[DEMO_IDENTITY_USER_ID]);
 await db.owner.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional fixed demo account') ON CONFLICT DO NOTHING",[DEMO_TENANT_ID,DEMO_ACCOUNT_ID]);
 await db.owner.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID,DEMO_ACCOUNT_ID,DEMO_IDENTITY_USER_ID]);
 await db.owner.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional checkpoint job','quoting')",[DEMO_TENANT_ID,DEMO_JOB_ID]);
},300_000);
afterAll(async()=>{await db?.close();if(priorEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=priorEnvironment;});
const receipt=(id:string)=>db.owner.query("SELECT status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[DEMO_TENANT_ID,id]).then(r=>r.rows);
const effects=(id:string)=>db.owner.query("SELECT record_kind,result FROM app.repository_operational_record WHERE tenant_id=$1 AND command_id=$2",[DEMO_TENANT_ID,id]).then(r=>r.rows);
async function feedbackFixture(){
 const token=await issuePracticeSession(db.runtime),digest=createHash("sha256").update(token).digest("hex"),jobId=randomUUID();
 await withTenant(db.owner,context,tx=>tx.$client.query("INSERT INTO app.job(tenant_id,id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional feedback job','quoting',$3,'capture')",[DEMO_TENANT_ID,jobId,digest]));
 const input={version:"commercial-integrity-review.v1",commandId:randomUUID(),findingKey:"fictional-check",explanation:"Fictional false positive was checked",outcome:"dismissed_false_positive"};
 return {jobId,digest,input};
}
async function demoInput(){const commands:DemoSeedCommand[]=[];await seedDemo("synthetic_demo",{execute:async c=>{commands.push(c);return "created";}});return commands.find(c=>c.checkpoint==="capture")!;}
/** Same seed boundary calls as bootstrap. The public created/replayed return
 * differs by execution, while the persisted checkpoint result stays exact. */
const executeCheckpoint=(command:DemoSeedCommand)=>withTenant(db.runtime,context,async tx=>{
 const claim=await beginRepositoryCommand<{checkpoint:string}>(tx,{tenantId:DEMO_TENANT_ID,actorMembershipId:actor.member,commandId:command.commandId,
  commandType:"synthetic_demo.seed",semanticKey:command.semanticKey,jobId:command.jobId,legacyJson:JSON.stringify(command)});
 if(claim.kind==="replay")return {state:"replayed",result:claim.result};
 await tx.$client.query("SELECT app.record_repository_command($1)",[command.commandId]);
 return {state:"created",result:await completeRepositoryCommand<{checkpoint:string}>(tx,command.commandId)};
});
const revoke=()=>db.owner.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,actor.member]);
const restore=()=>db.owner.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2",[DEMO_TENANT_ID,actor.member]);
describe("LP-5b feedback and demo checkpoint business records",()=>{
 it("feedback keeps its complete result, exact replay and conflict, and refuses revoked replay",async()=>{
  const f=await feedbackFixture(),repo=new CommercialIntegrityApplicationRepository(db.runtime);
  const run=(changed=false)=>repo.review(context,actor.member,f.jobId,changed?{...f.input,explanation:"Changed fictional explanation"}:f.input,f.digest);
  const first=await run();
  expect(first).toEqual({...f.input,jobId:f.jobId,recordedAt:expect.stringMatching(/\.\d{3}Z$/)});
  expect(await receipt(f.input.commandId)).toEqual([{status:"succeeded",result:first}]);
  expect(await effects(f.input.commandId)).toEqual([{record_kind:"feedback",result:first}]);
  expect(await run()).toEqual(first);await expect(run(true)).rejects.toMatchObject({message:"IDEMPOTENCY_CONFLICT"});
  await revoke();try{await expect(run()).rejects.toMatchObject({code:"NOT_FOUND"});expect(await effects(f.input.commandId)).toEqual([{record_kind:"feedback",result:first}]);}finally{await restore();}
 });
 it("demo seed distinguishes created/replayed and keeps one result; changed reuse and revoked replay fail",async()=>{
  const input=await demoInput(),first=await executeCheckpoint(input);
  expect(first).toEqual({state:"created",result:{checkpoint:"capture"}});
  expect(await executeCheckpoint(input)).toEqual({state:"replayed",result:first.result});
  expect(await receipt(input.commandId)).toEqual([{status:"succeeded",result:first.result}]);
  expect(await effects(input.commandId)).toEqual([{record_kind:"demo_checkpoint",result:first.result}]);
  await expect(executeCheckpoint({...input,checkpoint:"review_confirm"})).rejects.toMatchObject({message:"COMMAND_CONFLICT"});
  await revoke();try{await expect(executeCheckpoint(input)).rejects.toMatchObject({message:"FORBIDDEN"});}finally{await restore();}
 });
 it.each(["commercial_integrity.review","synthetic_demo.seed"])("%s refuses unknown types and completion without a business record",async commandType=>{
  const f=await feedbackFixture(),input=commandType==="synthetic_demo.seed"?await demoInput():{jobId:f.jobId,...f.input};
  for(const type of [commandType,"unknown.operational.record"]){
   const commandId=randomUUID();await expect(withTenant(db.runtime,context,async tx=>{
    const boundInput={...input,commandId,...(commandType==="synthetic_demo.seed"?{semanticKey:commandId}:{})};
    const claim=await beginRepositoryCommand(tx,{tenantId:DEMO_TENANT_ID,actorMembershipId:actor.member,commandId,commandType:type,semanticKey:commandId,
     jobId:commandType==="synthetic_demo.seed"?DEMO_JOB_ID:f.jobId,legacyJson:JSON.stringify(boundInput)});
    expect(claim.kind).toBe("claim");
    await completeRepositoryCommand(tx,commandId);
   })).rejects.toMatchObject({message:"AUTHORIZATION_INVALID"});
   expect(await receipt(commandId)).toEqual([]);expect(await effects(commandId)).toEqual([]);
  }
 });
});
