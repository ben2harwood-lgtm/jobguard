import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { createWorkFixture,closeWorkFixture,workTenant,requestCard,recordCard,resultFixture,type WorkFixture } from "./free-first-job-admission-fixtures.js";
import { firstTrialFixture } from "./free-first-job-lifecycle-fixtures.js";
import { historicalAgreement,meterInput,storeMeter,issue,command,terms } from "./subscription-persistence-fixtures.js";
import { FreeFirstJobLifecycleRepository } from "../src/free-first-job-lifecycle-repository.js";
import { FreeFirstJobEligibilityRepository } from "../src/free-first-job-eligibility-repository.js";
import { meterCompany, verifyBusiness } from "./free-first-job-admission-fixtures.js";
import { exactTarget } from "./free-first-job-lifecycle-fixtures.js";
import { seedWorkJob } from "./job-work-state-fixtures.js";
async function closeSource(f:WorkFixture,a:Awaited<ReturnType<typeof firstTrialFixture>>,date:string){
 return workTenant(f.admin,a.tenantId,async db=>{await db.query("SET LOCAL ROLE jobguard_migration");await db.query("INSERT INTO app.trial_end_source(tenant_id,trial_id,source_id,job_id,kind,effective_at,recorded_at) VALUES($1,$2,$3,$4,'close',$5::timestamptz,clock_timestamp())",[a.tenantId,a.trialId,randomUUID(),a.jobId,date]);}, { membershipId: a.actorId });
}
describe("MON-3 authoritative billing source and unchanged issued documents",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture();},60000);afterAll(async()=>closeWorkFixture(f));
 it("Day 90 ends at London midnight, bills from that date once and never restores Skip for now",async()=>{
  const old=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV='synthetic_demo';
  try{
   const a=await meterCompany(f);await verifyBusiness(f,a);await exactTarget(f,a);
   const repo=new FreeFirstJobLifecycleRepository(f.runtime),target=await repo.read(a.context,a.digest,a.jobId);
   await repo.activate(a.context,a.digest,a.actorId,{version:'trial-switch-live.v1',commandId:randomUUID(),jobId:a.jobId,...target.target});
   // Test-only superuser clock control, after the real checked activation.
   // June 13 + 90 London dates = September 11; BST midnight is 23:00 UTC.
   const startedAt='2026-06-13T12:00:00.123456Z',deadlineAt='2026-09-10T23:00:00.000000Z';
   await workTenant(f.admin,a.tenantId,async db=>{
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.job_activation SET activated_at=$3::timestamptz WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId,startedAt]);
    await db.query("UPDATE app.trial_start SET started_at=$3::timestamptz,deadline_at=((($3::timestamptz AT TIME ZONE 'Europe/London')::date+90)::timestamp AT TIME ZONE 'Europe/London') WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId,startedAt]);
   }, { membershipId: a.actorId });
   const view=await repo.read(a.context,a.digest,a.jobId);
   expect(view.start).toMatchObject({startedAt,deadlineAt});
   expect(view.timeline).toMatchObject({active:false,endedAt:deadlineAt,deadlineReachedAtEnd:true,sourceIds:[]});
   // Inspect the existing private conversion source as its owner, never grant
   // the runtime a caller-selected clock or permission to backdate a trial.
   const boundary=await workTenant(f.admin,a.tenantId,async db=>{
    await db.query("SET LOCAL ROLE jobguard_migration");
    return (await db.query("SELECT app.mon3_trial_date($1,'2026-09-10T22:59:59.999999Z')::text before_deadline,app.mon3_trial_date($1,$2::timestamptz)::text at_deadline",[a.tenantId,deadlineAt])).rows[0];
   }, { membershipId: a.actorId });
   expect(boundary).toEqual({before_deadline:null,at_deadline:'2026-09-11'});
   await historicalAgreement(f,a,'Solo');const source=await storeMeter(f,a,meterInput(a.tenantId,1));
   const issueCommand=randomUUID(),issued=await issue(f,a,'2026-09-01',1,issueCommand);
   expect(issued.amountPence).toBe(1933); // 20/30 of £29, half-even.
   const pins=(await f.admin.query("SELECT conversion_date::text,input FROM app.trial_subscription_source WHERE tenant_id=$1 AND source_id=$2",[a.tenantId,source])).rows;
   expect(pins).toHaveLength(1);expect(pins[0].conversion_date).toBe('2026-09-11');
   expect(pins[0].input.days.map((day:{date:string;trial:boolean})=>[day.date,day.trial])).toEqual(
    Array.from({length:30},(_,i)=>[`2026-09-${String(i+1).padStart(2,'0')}`,i<10]));
   const next=await seedWorkJob(f,a.tenantId);await exactTarget(f,{...a,jobId:next.jobId});
   const eligibility=new FreeFirstJobEligibilityRepository(f.runtime);
   const effects=async()=>{
    const result:Record<string,unknown>={};
    for(const table of ['trial_start','trial_end_source','trial_identity_key_claim','trial_subscription_source','platform_statement','platform_statement_line','command_receipt','audit_event']){
     result[table]=(await f.admin.query(`SELECT to_jsonb(r) value FROM app.${table} r WHERE tenant_id=$1 ORDER BY to_jsonb(r)::text`,[a.tenantId])).rows;
    }
    return result;
   };
   const before=await effects();
   for(let replay=0;replay<2;replay++){
    expect((await repo.read(a.context,a.digest,a.jobId)).timeline).toMatchObject({active:false,endedAt:deadlineAt});
    for(const jobId of [a.jobId,next.jobId])expect((await eligibility.read(a.context,a.digest,jobId)).offerSkip).toBe(false);
    expect(await eligibility.read(a.context,a.digest,next.jobId)).toMatchObject({cardGate:'add_card',cardAction:'Add a card'});
    expect(await issue(f,a,'2026-09-01',1,issueCommand)).toEqual(issued);
   }
   expect(await effects()).toEqual(before);
  }finally{if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;}
 });
 it("active trial suppresses base AND extras and pins one immutable source on issue/replay",async()=>{
  const a=await firstTrialFixture(f,'2026-09-01T12:00:00.123456Z');await historicalAgreement(f,a,'Solo');const source=await storeMeter(f,a,meterInput(a.tenantId,6));
  const issued=await issue(f,a);expect(issued.amountPence).toBe(0);
  expect(await issue(f,a)).toEqual(issued);
  const pins=(await f.admin.query("SELECT input FROM app.trial_subscription_source WHERE tenant_id=$1 AND source_id=$2",[a.tenantId,source])).rows;
  expect(pins).toHaveLength(1);expect(pins[0].input.days.every((day:{trial:boolean})=>day.trial)).toBe(true);
  expect((await f.admin.query("SELECT amount_pence FROM app.platform_statement_line WHERE tenant_id=$1",[a.tenantId])).rows.every(row=>Number(row.amount_pence)===0)).toBe(true);
 });
 it("pro-rates from the safe conversion date; earlier late sources block collection without rewriting a statement",async()=>{
  const a=await firstTrialFixture(f,'2026-09-01T12:00:00.123456Z');await historicalAgreement(f,a,'Solo');await closeSource(f,a,'2026-09-11T12:00:00.000001Z');await storeMeter(f,a,meterInput(a.tenantId,1));
  const requested=await requestCard(f,a);await recordCard(f,a,resultFixture(requested.attemptId));
  const issued=await issue(f,a);expect(issued.amountPence).toBe(1837);
  const before=(await f.admin.query("SELECT to_jsonb(s) data FROM app.platform_statement s WHERE tenant_id=$1",[a.tenantId])).rows;
  const approved=await command(f,a,{version:'subscription-command.v1',kind:'approve_simulation',statementId:issued.statementId,expectedRevision:1,contentHash:issued.artifactHash,amountPence:issued.amountPence});
  await closeSource(f,a,'2026-09-05T12:00:00.000001Z');
  await expect(command(f,a,{version:'subscription-command.v1',kind:'execute_simulation',workId:approved.workId,expectedRevision:1})).rejects.toThrow('SUBSCRIPTION_FORBIDDEN');
  expect((await f.admin.query("SELECT to_jsonb(s) data FROM app.platform_statement s WHERE tenant_id=$1",[a.tenantId])).rows).toEqual(before);
  expect(await issue(f,a)).toEqual(issued);
 });
 it("initial first-period stub dates stay free; concurrent upgrades cannot spend the same revision",async()=>{
  const a=await firstTrialFixture(f,'2026-09-10T12:00:00.000001Z');await historicalAgreement(f,a,'Solo');await storeMeter(f,a,meterInput(a.tenantId,1));
  expect((await issue(f,a)).amountPence).toBe(0);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.platform_statement WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(1);
  const change={...terms(a,'Builder',1),kind:'change'};
  const outcomes=await Promise.allSettled([command(f,a,change),command(f,a,change)]);
  expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.subscription_agreement_revision WHERE tenant_id=$1 AND revision=2",[a.tenantId])).rows[0].n).toBe(1);
  const pinned=(await f.admin.query("SELECT input,source_id FROM app.trial_subscription_source WHERE tenant_id=$1",[a.tenantId])).rows[0];
  const [downgrade,read]=await Promise.all([
   command(f,a,{...terms(a,'Solo',2),kind:'change'}),
   workTenant(f.runtime,a.tenantId,async db=>(await db.query("SELECT app.mon2_source($1,$2,$3) input",[a.tenantId,a.digest,pinned.source_id])).rows[0].input, { membershipId: a.actorId }),
  ]);
  expect(downgrade.status).toBe('pending');expect(read).toEqual(pinned.input);
  expect((await f.admin.query("SELECT plan FROM app.subscription_agreement_revision WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1",[a.tenantId])).rows[0].plan).toBe('Builder');

 });
});
