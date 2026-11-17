import { randomUUID } from "node:crypto";
import { describe,expect,it } from "vitest";
import { MeterRepository, meterReadRequestV1, meterRebuildRequestV1 } from "./meter-repository.js";
import { MeterPersistenceError,projectMeterFixture } from "./meter-persistence.js";
import { verifiedTenantContextFromMembership } from "./tenant-context.js";
const testTenantContext=(tenantId:string)=>verifiedTenantContextFromMembership({tenantId,identityUserId:randomUUID(),membershipId:randomUUID()} as Parameters<typeof verifiedTenantContextFromMembership>[0]);
const meterInput=(tenantId:string)=>({version:"meter-persisted-fixture.v1",environment:"synthetic_demo",startDate:"2026-09-01",endDateExclusive:"2026-10-01",days:Array.from({length:30},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,"0")}`,plan:"Builder",annualPrepaid:false,trial:false,jobs:Array.from({length:8},()=>({tenantId,jobId:randomUUID(),customerId:randomUUID(),siteId:randomUUID(),small:false}))}))});
import type { Pool } from "pg";
const tenant=randomUUID(),digest="d".repeat(64),id=randomUUID();
function pool(result:unknown,fail?:Error) {
 const queries:string[]=[];let released=false;
 const client={query:async(sql:string)=>{queries.push(sql);if(sql.includes("mon1_rebuild"))return{rows:[{id}]};if(sql.includes("mon1_read")){if(fail)throw fail;return{rows:[{result}]}};return{rows:[]}},release:()=>{released=true}};
 return{value:{connect:async()=>client} as unknown as Pool,queries,released:()=>released};
}
const response=()=>({version:"meter-persisted-read.v1",hypothetical:true,computationId:id,sourceId:randomUUID(),sourceHash:"a".repeat(64),resultHash:"b".repeat(64),result:projectMeterFixture(tenant,meterInput(tenant)).result,corrections:[],alerts:[]});
describe("MON-1B versioned repository",()=>{
 it("MON1-A33 reads through the checked routine with per-call verified context",async()=>{
  const p=pool(response());const result=await new MeterRepository(p.value).read(testTenantContext(tenant),digest,{version:"meter-read.v1",computationId:id});
  expect(result.result.principal.pence).toBe(8900);expect(p.queries.some(sql=>sql.includes("mon1_read"))).toBe(true);expect(p.released()).toBe(true);
 });
 it("MON1-A23 MON1-A33 rebuild accepts only a period selector and validates the returned projection",async()=>{
  const p=pool(response());await new MeterRepository(p.value).rebuild(testTenantContext(tenant),digest,{version:"meter-rebuild.v1",startDate:"2026-09-01"});
  expect(p.queries.filter(sql=>sql.includes("mon1_rebuild"))).toHaveLength(1);
  expect(meterReadRequestV1.safeParse({version:"meter-read.v1",computationId:id,tenantId:tenant}).success).toBe(false);
  expect(meterRebuildRequestV1.safeParse({version:"meter-rebuild.v1",startDate:"2026-09-01",count:8}).success).toBe(false);
  const valid=response(),invalid={...valid,result:{...valid.result,principal:{...valid.result.principal,pence:1}}};
  await expect(new MeterRepository(pool(invalid).value).read(testTenantContext(tenant),digest,{version:"meter-read.v1",computationId:id})).rejects.toMatchObject({code:"METER_PROJECTION_MISMATCH"});
 });
 it("MON1-A35 refuses a pilot result at the synthetic persistence boundary",async()=>{
  const valid=response(),invalid={...valid,result:{...valid.result,environment:"pilot_no_charge"}};
  await expect(new MeterRepository(pool(invalid).value).read(testTenantContext(tenant),digest,{version:"meter-read.v1",computationId:id})).rejects.toMatchObject({code:"METER_PROJECTION_MISMATCH"});
 });
 it("MON1-A30 MON1-A33 maps unavailable storage and identical authority refusals to typed errors",async()=>{
  for(const [error,code] of [[new Error("METER_FORBIDDEN"),"METER_FORBIDDEN"],[new Error("METER_CORRECTION_PERIOD_CLOSED"),"METER_CORRECTION_PERIOD_CLOSED"],[new Error("offline"),"METER_UNAVAILABLE"]] as const){
   const p=pool(null,error);await expect(new MeterRepository(p.value).read(testTenantContext(tenant),digest,{version:"meter-read.v1",computationId:id})).rejects.toMatchObject({code});expect(p.queries.at(-1)).toBe("ROLLBACK");
  }
  await expect(new MeterRepository(pool(null).value).read(testTenantContext(tenant),"invalid",{})).rejects.toBeInstanceOf(MeterPersistenceError);
 });
});
