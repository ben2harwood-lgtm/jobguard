// Real PostgreSQL + checked work commands + authenticated browser read. Synthetic only.
import { createHmac, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type Page } from "@playwright/test";
const E2E_RUNTIME_URL = "postgresql://jobguard_runtime:sbox-e2e-runtime@127.0.0.1:55432/jobguard_synthetic_demo";
import { meterCompany } from "../../../packages/db/test/meter-persistence-fixtures.js";
import { historicalAgreement } from "../../../packages/db/test/subscription-persistence-fixtures.js";
import { activateMeterJob } from "../../../packages/db/test/meter-journey-fixtures.js";
import { seedWorkJob, workTenant, insertPhoto, type WorkFixture } from "../../../packages/db/test/job-work-state-fixtures.js";

async function expectMeter(page: Page, count: string, next?: string, grace?: string) {
 await page.goto("/meter");
 const main = page.getByRole("main");
 const verify = async () => {
  await expect(main.getByTestId("jobs-on-the-go")).toHaveText(count);
  if (next) await expect(main.getByTestId("next-job-price")).toHaveText(next);
  if (grace) await expect(main.getByText(grace, { exact: false })).toBeVisible();
 };
 await verify();
 await page.reload();
 await verify();
}

test("MON1-J: Builder's five distinct started jobs show the next job included after reload", async ({page,context}) => {
 const admin=new Pool({host:"127.0.0.1",port:55432,database:"jobguard_synthetic_demo",user:"postgres",password:"sbox-e2e-owner",max:1});
 const runtime=new Pool({connectionString:E2E_RUNTIME_URL,max:1});
 const f={admin,runtime} as WorkFixture;
 try {
  const a=await meterCompany(f), token=randomUUID();
  const digest=createHmac("sha256","sbox-only-identity-hmac-secret-32-bytes").update(`session:${token}`).digest("hex");
  await admin.query("UPDATE identity.session SET token_digest=$1 WHERE id=$2",[digest,a.sessionId]);
  await historicalAgreement(f,{...a,digest},"Builder");
  await activateMeterJob(f,a);
  await context.addCookies([{name:"jobguard_session",value:token,url:"http://127.0.0.1:3000"}]);
  await expectMeter(page,"0 of 7 jobs on the go","Next job included");
  await insertPhoto(f,a,"now");
  for(let i=0;i<4;i++) {
   const job=await seedWorkJob(f,a.tenantId); await activateMeterJob(f,job);
   await insertPhoto(f,job,"now");
  }
  await expectMeter(page,"5 of 7 jobs on the go","Next job included");
 } finally { await runtime.end(); await admin.end(); }
});

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
  const count=(n:number)=>expectMeter(page,`${n} of 4 jobs on the go`,
   n===6 ? "Further places need a move to Builder." : undefined,
   n===6 ? "Today's count reaches the grace place." : undefined);
  await count(0);
  // PostgreSQL transaction time preserves activation-before-photo ordering at microsecond precision.
  await insertPhoto(f,a,"now"); await count(1);
  const session = await (await page.request.get("/api/auth/session")).json();
  const send = (jobId: string, data: unknown, tenantId=a.tenantId) => page.request.post(`/api/meter/jobs/${jobId}/work-state`, {
   headers: { origin: new URL(page.url()).origin, "x-csrf-token": session.csrfToken, "x-tenant-id": tenantId }, data });
  const command = async (jobId: string, data: unknown) => {
   const response=await send(jobId,data); expect(response.status()).toBe(201); return response.json();
  };
  const finish={version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:1,action:"finish"};
  await command(a.jobId,finish); await count(1);
  await command(a.jobId,finish); await count(1);
  const replayConflict=await send(a.jobId,{...finish,expectedRevision:0});
  expect(replayConflict.status()).toBe(409);
  expect(await replayConflict.json()).toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
  await count(1);
  // Seed a historical clock boundary; no client clock/backdate is exposed.
  await workTenant(admin,a.tenantId,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.job_activation SET activated_at=clock_timestamp()-interval '8 days' WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]);
   // Preserve first-evidence-before-finish ordering when relocating these fictional facts.
   await db.query(`UPDATE app.job_work_state_event SET fact_at=(((clock_timestamp() AT TIME ZONE 'Europe/London')::date-7+time '12:00') AT TIME ZONE 'Europe/London')+sequence*interval '1 microsecond',recorded_at=(((clock_timestamp() AT TIME ZONE 'Europe/London')::date-7+time '12:00') AT TIME ZONE 'Europe/London')+sequence*interval '1 microsecond' WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId]);
  });
  await count(0);
  await command(a.jobId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:2,action:"resume"}); await count(1);
  // Four more distinct accepted jobs fill Solo; a real reopen admits grace.
  for(let i=0;i<4;i++) {
   const job=await seedWorkJob(f,a.tenantId); await activateMeterJob(f,job);
   await insertPhoto(f,job,"now");
  }
  const sixth=await seedWorkJob(f,a.tenantId); await activateMeterJob(f,sixth);
  const graceClosed=await command(sixth.jobId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:0,action:"close",reason:"other",note:"Fictional pause before grace"});
  const reopen={version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:1,action:"reopen",closeEventId:graceClosed.events[0]!.id};
  const reopened=await command(sixth.jobId,reopen);
  await insertPhoto(f,sixth,"now");
  await count(6);
  expect(await command(sixth.jobId,reopen)).toEqual(reopened);
  await count(6);
  const seventh=await seedWorkJob(f,a.tenantId); await activateMeterJob(f,seventh);
  const closed=await command(seventh.jobId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:0,action:"close",reason:"other",note:"Fictional unused job"});
  const refused=await send(seventh.jobId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:1,action:"reopen",closeEventId:closed.events[0]!.id});
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toMatchObject({code:"METER_UPGRADE_REQUIRED"});
  await count(6);
  const other=await meterCompany(f);
  const foreign=await send(a.jobId,finish,other.tenantId);
  expect(foreign.status()).toBe(403);
  const foreignJob=await send(other.jobId,{...finish,commandId:randomUUID(),expectedRevision:0});
  expect(foreignJob.status()).toBe(404);
  const foreignRead=await page.request.get("/api/meter/current",{headers:{"x-tenant-id":other.tenantId,"x-csrf-token":session.csrfToken}});
  expect(foreignRead.status()).toBe(403);
  expect(await foreignRead.text()).not.toContain("countedPlaces");
  const badCsrf=await page.request.post(`/api/meter/jobs/${a.jobId}/work-state`,{headers:{origin:new URL(page.url()).origin,"x-tenant-id":a.tenantId,"x-csrf-token":"x".repeat(24)},data:finish});
  expect(badCsrf.status()).toBe(403);
  await count(6);
 } finally { await runtime.end(); await admin.end(); }
});
