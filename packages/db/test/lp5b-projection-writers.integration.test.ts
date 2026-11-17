import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { JobPartiesRepository } from "../src/job-parties-repository.js";
import { PreventionCheckRepository } from "../src/prevention-check-repository.js";
import { InboxRelevanceRepository } from "../src/inbox-relevance-repository.js";
import { beginRepositoryCommand, completeRepositoryCommand } from "../src/repository-command.js";
import { withTenant } from "../src/tenant-context.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
let db: JobDoorsDatabase;
const previous=process.env.JOBGUARD_ENV;
beforeAll(async()=>{process.env.JOBGUARD_ENV="synthetic_demo";db=await jobDoorsDatabase(true);},300_000);
afterAll(async()=>{await db?.close();if(previous===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previous;});
async function fixture(status:"quoting"|"live"="quoting"){
 const actor=await jobDoorsActor(db.owner),context=testTenantContext(actor.tenant),job=randomUUID();
 if(status==="live")await importWatchdogFixtureJob(db.owner,actor.tenant,job,"Fictional LP5b projection job");
 else await db.owner.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional LP5b projection job','quoting')",[actor.tenant,job]);
 return {actor,context,job};
}
async function preventionFixture(){
 const f=await fixture(),parties=new JobPartiesRepository(db.runtime);
 const command=(action:string,values:Record<string,unknown>)=>parties.command(f.context,f.actor.member,f.job,{version:"job-parties-command.v1",commandId:randomUUID(),action,...values});
 const customer=await command("create_customer",{customer:{version:"customer.v1",type:"business",name:"Fictional projection company",companyNumber:"01234567"}});
 const site=await command("create_site",{site:{version:"site.v1",addressLines:["1 Fictional Projection Lane"],town:"London",postcode:"SW1A 1AA"}});
 const bound=await command("bind",{expectedJobRevision:0,parties:{version:"job-parties.v1",customerRevisionId:customer.revisionId,siteRevisionId:site.revisionId}});
 return {...f,binding:bound.id as string,repo:new PreventionCheckRepository(db.runtime)};
}
it("LP-5b prevention keeps the complete timestamped DTO and first result after newer facts",async()=>{
 const f=await preventionFixture(),input={version:"prevention-command.v1",commandId:randomUUID(),action:"property",expectedBindingId:f.binding,scenarioNow:"2026-10-07T13:00:00.000Z",fixture:"fresh"};
 const first=await f.repo.command(f.context,f.actor.member,f.job,input);
 const current=await f.repo.view(f.context,f.actor.member,f.job);
 expect(first.view).toEqual({...current,retrievedAt:first.view.retrievedAt,payingParty:current.payingParty?{...current.payingParty,retrievedAt:first.view.retrievedAt}:null});
 expect(first.view.retrievedAt).toMatch(/\.\d{3}Z$/);
 expect(first.view.property).toHaveLength(5);
 expect(await f.repo.command(f.context,f.actor.member,f.job,input)).toEqual(first);
 await expect(f.repo.command(f.context,f.actor.member,f.job,{...input,fixture:"missing"})).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
 await f.repo.command(f.context,f.actor.member,f.job,{...input,commandId:randomUUID(),fixture:"missing"});
 expect(await f.repo.command(f.context,f.actor.member,f.job,input)).toEqual(first);
 await db.owner.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.actor.tenant,f.actor.member]);
 await expect(f.repo.command(f.context,f.actor.member,f.job,input)).rejects.toMatchObject({code:"FORBIDDEN"});
});
it("LP-5b inbox seed and seed-existing no-op return exact projections and keep old budgets on replay",async()=>{
 const f=await fixture("live"),repo=new InboxRelevanceRepository(db.runtime),commandId=randomUUID();
 const first:any=await repo.seed(f.context,f.job,commandId,f.actor.member);
 expect(first).toEqual(await repo.view(f.context,f.job,f.actor.member));
 expect(first.advisoryBudget).toBe(100);
 expect(await repo.seed(f.context,f.job,commandId,f.actor.member)).toEqual(first);
 await repo.setBudget(f.context,f.job,{commandId:randomUUID(),advisoryBudget:0},f.actor.member);
 const noop:any=await repo.seed(f.context,f.job,randomUUID(),f.actor.member);
 expect(noop).toEqual(await repo.view(f.context,f.job,f.actor.member));
 expect(noop.advisory).toEqual([]);
 expect(await repo.seed(f.context,f.job,commandId,f.actor.member)).toEqual(first);
 await expect(repo.seed(f.context,f.job,commandId,f.actor.member,"different-fictional-practice")).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
 await db.owner.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.actor.tenant,f.actor.member]);
 await expect(repo.seed(f.context,f.job,commandId,f.actor.member)).rejects.toMatchObject({message:"FORBIDDEN"});
});
it("LP-5b inbox keeps its active-member operational permission without promoting a member to owner",async()=>{
 const f=await fixture("live"),repo=new InboxRelevanceRepository(db.runtime),commandId=randomUUID();
 await db.owner.query("UPDATE app.membership SET role='member' WHERE tenant_id=$1 AND id=$2",[f.actor.tenant,f.actor.member]);
 const result=await repo.seed(f.context,f.job,commandId,f.actor.member);
 expect(result.mandatory).toHaveLength(2);
 expect(await repo.seed(f.context,f.job,commandId,f.actor.member)).toEqual(result);
});
it("LP-5b projection unknown types and completion with no domain effects cannot commit receipts",async()=>{
 const f=await preventionFixture();
 for(const [commandType,input] of [
  ["prevention.check",{job:f.job,input:{version:"prevention-command.v1",commandId:randomUUID(),action:"property",expectedBindingId:f.binding,scenarioNow:"2026-10-07T13:00:00.000Z",fixture:"fresh"}}],
  ["inbox.seed",{jobId:f.job,membershipId:f.actor.member,commandType:"inbox.seed"}],
  ["unknown.projection.command",{jobId:f.job}],
 ] as const){
  const commandId=randomUUID();
  await expect(withTenant(db.runtime,f.context,async tx=>{
   await beginRepositoryCommand(tx,{tenantId:f.actor.tenant,actorMembershipId:f.actor.member,commandId,commandType,semanticKey:commandId,jobId:f.job,legacyJson:JSON.stringify(input)});
   await completeRepositoryCommand(tx,commandId);
  })).rejects.toMatchObject({message:"AUTHORIZATION_INVALID"});
  expect((await db.owner.query("SELECT 1 FROM app.command_receipt WHERE command_id=$1",[commandId])).rowCount).toBe(0);
 }
});
