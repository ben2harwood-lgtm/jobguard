import { createHash, randomUUID } from "node:crypto";
import type { WorkFixture } from "./job-work-state-fixtures.js";
import { seedWorkJob, workTenant } from "./job-work-state-fixtures.js";
export async function meterCompany(f: WorkFixture, tenantId?: string) {
 const company=await seedWorkJob(f,tenantId), digest=createHash("sha256").update(randomUUID()).digest("hex"), sessionId=randomUUID();
 const user=(await f.admin.query("SELECT identity_user_id FROM app.membership WHERE id=$1",[company.actorId])).rows[0].identity_user_id;
 await f.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${randomUUID()}@meter.invalid`,user]);
 await f.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)",[user,company.tenantId,company.actorId]);
 await f.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')",[sessionId,user,digest,randomUUID()]);
 return {...company,digest,sessionId};
}
export function meterInput(tenantId:string, places=8, month="2026-09",length=30) {
 const jobs=Array.from({length:places},()=>({tenantId,jobId:randomUUID(),customerId:randomUUID(),siteId:randomUUID(),small:false}));
 return {version:"meter-persisted-fixture.v1",environment:"synthetic_demo",startDate:`${month}-01`,endDateExclusive:month==="2026-09"?"2026-10-01":"2026-11-01",days:Array.from({length},(_,i)=>({date:`${month}-${String(i+1).padStart(2,"0")}`,plan:"Builder",annualPrepaid:false,trial:false,jobs:jobs.map(job=>({...job}))}))};
}
export async function storeMeter(f:WorkFixture,a:Awaited<ReturnType<typeof meterCompany>>,input:unknown,id=randomUUID()) {
 await workTenant(f.admin,a.tenantId,db=>db.query("SELECT app.mon1_store_fixture($1,$2,$3,$4::jsonb)",[a.tenantId,a.digest,id,JSON.stringify(input)]));return id;
}
export const refreshMeter=(f:WorkFixture,a:Awaited<ReturnType<typeof meterCompany>>,date="2026-09-01")=>workTenant(f.runtime,a.tenantId,async db=>(await db.query("SELECT app.mon1_rebuild($1,$2,$3::date) id",[a.tenantId,a.digest,date])).rows[0].id as string);
export const readMeter=(f:WorkFixture,a:Awaited<ReturnType<typeof meterCompany>>,id:string)=>workTenant(f.runtime,a.tenantId,async db=>(await db.query("SELECT app.mon1_read($1,$2,$3) result",[a.tenantId,a.digest,id])).rows[0].result);
