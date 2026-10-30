import { randomUUID } from "node:crypto";
import type { WorkFixture } from "./job-work-state-fixtures.js";
import { workTenant } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
export { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
export { meterCompany };
export type TrialCompany=Awaited<ReturnType<typeof meterCompany>>;
export async function verifyBusiness(f:WorkFixture,a:TrialCompany,company:string|null=`fictional_${randomUUID()}`,phone:string|null=`demo_${randomUUID()}`){
 const id=randomUUID();
 await workTenant(f.admin,a.tenantId,async db=>{
  await db.query("SET LOCAL ROLE jobguard_migration");
  await db.query("INSERT INTO app.trial_business_verification(tenant_id,id,version,environment,source,company_number,normalized_phone) VALUES($1,$2,'trial-business-verification.v1','synthetic_demo','fictional_verified_fixture.v1',$3,$4)",[a.tenantId,id,company,phone]);
 });return id;
}
export async function requestCard(f:WorkFixture,a:TrialCompany,id=randomUUID(),raw:unknown={version:"trial-card-request.v1"}){
 return workTenant(f.runtime,a.tenantId,async db=>(await db.query("SELECT app.mon3_request_card($1,$2,$3,$4::jsonb) result",[a.tenantId,a.digest,id,JSON.stringify(raw)])).rows[0].result);
}
export function resultFixture(attemptId:string,outcome="completed",fixtureCard="card_a"){
 return {version:"trial-card-fixture.v1",attemptId,outcome,fixtureCard};
}
export async function recordCard(f:WorkFixture,a:TrialCompany,v:ReturnType<typeof resultFixture>,id=randomUUID()){
 return workTenant(f.admin,a.tenantId,async db=>{
  await db.query("SET LOCAL ROLE jobguard_migration");
  await db.query("SELECT app.mon3_record_card_fixture($1,$2,$3,$4::jsonb)",[a.tenantId,a.digest,id,JSON.stringify(v)]);
 });
}
export async function ownCounts(f:WorkFixture,a:TrialCompany){
 const tables=['trial_business_verification','trial_card_attempt','trial_card_result','trial_admission','trial_identity_snapshot','trial_identity_key_claim','job_activation','command_receipt','audit_event'];
 return Object.fromEntries(await Promise.all(tables.map(async table=>[table,Number((await f.admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1`,[a.tenantId])).rows[0].n)])));
}
export async function denyAdmission(f:WorkFixture,a:TrialCompany,v:unknown={},command=randomUUID()){
 return workTenant(f.runtime,a.tenantId,db=>db.query("SELECT app.mon3_admit($1,$2,$3,$4::jsonb)",[a.tenantId,a.digest,command,JSON.stringify(v)]));
}
