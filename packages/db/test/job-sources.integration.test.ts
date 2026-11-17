import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {Pool} from "pg";
import {JobSourceApplication} from "../../../apps/api/src/job-source.application.js";
import {JobSourceRepository} from "../src/job-source-repository.js";
import {sourcesFixture,seedSource,closeWorkFixture,type SourceFixture,workTenant} from "./job-sources-fixture.js";
describe("SV-7A labelled storage/read fixtures (both intake routines held)",()=>{
 let f:SourceFixture;beforeAll(async()=>{f=await sourcesFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("SV7A-03 SV7A-04 Q4 independent fixture records persist; new connection/repository preserve separate fictional customer and actual tester",async()=>{
  const diary=await seedSource(f,"diary","  Fictional café 🛠\n",null,"dictated_text"),message=await seedSource(f,"customer_message");
  const repo=new JobSourceRepository(f.runtime),{auth,jobId}=f.practice;
  const first=await repo.read(auth.context,jobId,auth.digest,"diary");
  const restarted=new Pool({...f.runtime.options,password:f.runtime.options.password,max:1});try{
   const originalPid=(await f.runtime.query("SELECT pg_backend_pid() id")).rows[0].id;
   expect((await restarted.query("SELECT pg_backend_pid() id")).rows[0].id).not.toBe(originalPid);
   expect(await new JobSourceRepository(restarted).read(auth.context,jobId,auth.digest,"diary")).toEqual(first);
   expect(await new JobSourceApplication(restarted,f.practice.sessionId).diary(jobId)).toEqual(first);
  }finally{await restarted.end()}
  expect(first).toMatchObject({entries:[{id:diary.id,text:diary.text,entryMode:"dictated_text",evidence:{objectVersionId:diary.version,serverReceivedAt:diary.at}}]});
  expect(await repo.read(auth.context,jobId,auth.digest,"customer_message")).toMatchObject({messages:[{id:message.id,fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional Alex"},actualTesterMembershipId:auth.membershipId}]});
 });
 it("SV7A-24 committed records remain readable after leaving live; no intake permission is inferred",async()=>{
  await workTenant(f.admin,f.practice.auth.context.tenantId,db=>db.query("UPDATE app.job SET status='invoiced' WHERE id=$1",[f.practice.jobId]));
  expect(await f.repository.read(f.practice.auth.context,f.practice.jobId,f.practice.auth.digest,"diary")).toMatchObject({entries:expect.any(Array)});
 });
});
