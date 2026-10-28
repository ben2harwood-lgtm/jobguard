// Real PostgreSQL + checked work commands + authenticated browser read. Synthetic only.
import { createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
const E2E_RUNTIME_URL = "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo";
import { meterCompany } from "../../../packages/db/test/meter-persistence-fixtures.js";
import { historicalAgreement } from "../../../packages/db/test/subscription-persistence-fixtures.js";
import { activateMeterJob } from "../../../packages/db/test/meter-journey-fixtures.js";
import { seedWorkJob, workTenant, insertPhoto, type WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";
import { JobWorkStateRepository } from "../../../packages/db/src/job-work-state-repository.js";

test("MON1-J: real starts, finish tail, London stop, restart, Solo grace and cap", async ({page,context}) => {
 const admin=new Pool({host:"127.0.0.1",port:55432,database:"jobguard_synthetic_demo",user:"postgres",password:"sbox-e2e-owner",max:1});
 const runtime=new Pool({connectionString:E2E_RUNTIME_URL,max:1});
 const f={admin,runtime} as WorkFixture;
 try {
  const a=await meterCompany(f), token=randomUUID();
  const digest=createHmac("sha256","sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
  await admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2",[digest,a.sessionId]);
  await historicalAgreement(f,{...a,digest},"Solo"); await activateMeterJob(f,a);
  await context.addCookies([{name:"jobguard_session",value:token,url:"http://127.0.0.1:3000"}]);
  const count=async(n:number)=>{
   await page.goto("/meter");
   await expect(page.getByTestId("jobs-on-the-go")).toHaveText(`${n} of 4 jobs on the go`);
  };
  await count(0);
  await insertPhoto(f,a,new Date().toISOString()); await count(1);
  const commands=new JobWorkStateRepository(runtime);
  const finish={version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:1,action:"finish"};
  await commands.command(a.context,a.jobId,a.actorId,finish); await count(1);
  await commands.command(a.context,a.jobId,a.actorId,finish); await count(1);
  // Seed a historical clock boundary; no client clock/backdate is exposed.
  await workTenant(admin,a.tenantId,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.job_activation SET activated_at=clock_timestamp()-interval '8 days' WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]);
   await db.query(`UPDATE app.job_work_state_event SET fact_at=((clock_timestamp() AT TIME ZONE 'Europe/London')::date-7+time '12:00') AT TIME ZONE 'Europe/London',recorded_at=((clock_timestamp() AT TIME ZONE 'Europe/London')::date-7+time '12:00') AT TIME ZONE 'Europe/London' WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId]);
  });
  await count(0);
  await commands.command(a.context,a.jobId,a.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:2,action:"resume"}); await count(1);
  // Four more distinct accepted jobs fill Solo; a real reopen admits grace.
  for(let i=0;i<4;i++) {
   const job=await seedWorkJob(f,a.tenantId); await activateMeterJob(f,job);
   await insertPhoto(f,job,new Date().toISOString());
  }
  const sixth=await seedWorkJob(f,a.tenantId); await activateMeterJob(f,sixth);
  const graceClosed=await commands.command(sixth.context,sixth.jobId,sixth.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:0,action:"close",reason:"other",note:"Fictional pause before grace"});
  await commands.command(sixth.context,sixth.jobId,sixth.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:1,action:"reopen",closeEventId:graceClosed.events[0]!.id});
  await insertPhoto(f,sixth,new Date().toISOString());
  await count(6);
  await expect(page.getByText("Today's count reaches the grace place.",{exact:false})).toBeVisible();
  await expect(page.getByTestId("next-job-price")).toHaveText("Further places need a move to Builder.");
  const seventh=await seedWorkJob(f,a.tenantId); await activateMeterJob(f,seventh);
  const closed=await commands.command(seventh.context,seventh.jobId,seventh.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:0,action:"close",reason:"other",note:"Fictional unused job"});
  await expect(commands.command(seventh.context,seventh.jobId,seventh.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:1,action:"reopen",closeEventId:closed.events[0]!.id})).rejects.toThrow("METER_UPGRADE_REQUIRED");
  await count(6);
  const other=await meterCompany(f);
  await expect(commands.command(other.context,a.jobId,other.actorId,finish)).rejects.toThrow("WORK_STATE_FORBIDDEN");
  await count(6);
 } finally { await runtime.end(); await admin.end(); }
});
