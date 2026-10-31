import { randomUUID } from "node:crypto";
import { beforeAll,afterAll,describe,it,expect } from "vitest";
import { createWorkFixture,closeWorkFixture,workTenant,requestCard,recordCard,resultFixture,type WorkFixture } from "./free-first-job-admission-fixtures.js";
import { firstTrialFixture } from "./free-first-job-lifecycle-fixtures.js";
import { historicalAgreement,meterInput,storeMeter,issue,command,terms } from "./subscription-persistence-fixtures.js";
async function closeSource(f:WorkFixture,a:Awaited<ReturnType<typeof firstTrialFixture>>,date:string){
 return workTenant(f.admin,a.tenantId,async db=>{await db.query("SET LOCAL ROLE jobguard_migration");await db.query("INSERT INTO app.trial_end_source(tenant_id,trial_id,source_id,job_id,kind,effective_at,recorded_at) VALUES($1,$2,$3,$4,'close',$5::timestamptz,clock_timestamp())",[a.tenantId,a.trialId,randomUUID(),a.jobId,date]);});
}
describe("MON-3 authoritative billing source and unchanged issued documents",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture();},60000);afterAll(async()=>closeWorkFixture(f));
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
   workTenant(f.runtime,a.tenantId,async db=>(await db.query("SELECT app.mon2_source($1,$2,$3) input",[a.tenantId,a.digest,pinned.source_id])).rows[0].input),
  ]);
  expect(downgrade.status).toBe('pending');expect(read).toEqual(pinned.input);
  expect((await f.admin.query("SELECT plan FROM app.subscription_agreement_revision WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1",[a.tenantId])).rows[0].plan).toBe('Builder');

 });
});
