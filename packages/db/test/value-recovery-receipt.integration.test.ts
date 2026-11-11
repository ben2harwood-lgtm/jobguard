// CI only: real PostgreSQL and synthetic command writers, no provider calls.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { mapValueReceiptV2 } from "@jobguard/core";
import { createFinalCheckFixture, closeFinalCheckFixture, finalCheckTenant, seedFinalCheckJob, type FinalCheckFixture } from "./final-check-fixture.js";
import { recoveryFeeFixture } from "./success-fee-recovery-fixture.js";
let f:FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture();},120000);
afterAll(async()=>{if(f)await closeFinalCheckFixture(f);});
type Fixture=Awaited<ReturnType<typeof recoveryFeeFixture>>;
const read=(x:Fixture)=>finalCheckTenant(f.runtime,x.context.tenantId,async db=>
 (await db.query("SELECT app.read_value_job_v2($1,$2) result",[x.jobId,x.auth.digest])).rows[0].result,{owner:f.admin,membershipId:x.actor.membershipId}); // LP-6d: the owner's own bound request
it("saved allocations reproduce £2820/£282/£2538 then £320/£32/£288, once per window",async()=>{
 const x=await recoveryFeeFixture(f);await x.allocate(0);await x.allocate(1);
 const pending=mapValueReceiptV2(await read(x));expect(pending.withheld.recovered).toBeNull();
 await x.approve(await x.review());
 const before=mapValueReceiptV2(await read(x));
 expect(before.withheld).toMatchObject({state:"mapped",recovered:{pence:282000},fee:{pence:28200},yoursBeforeVatAndTax:{pence:253800}});
 expect(before.supplier).toMatchObject({state:"unavailable",recovered:null});
 await x.reverse(1);
 expect(mapValueReceiptV2(await read(x)).withheld.recovered).toBeNull();
 await x.approve(await x.review(1));
 const raw=await read(x),after=mapValueReceiptV2(raw);
 expect(await read(x)).toEqual(raw);
 expect(after.withheld).toMatchObject({recovered:{pence:32000},fee:{pence:3200},yoursBeforeVatAndTax:{pence:28800}});
 expect(after.withheld.movements.filter(m=>m.kind==="reversal")).toHaveLength(1);
 const boundary=after.withheld.movements[1]!.at;
 const a=mapValueReceiptV2(raw,{from:"2000-01-01T00:00:00Z",toExclusive:boundary});
 const b=mapValueReceiptV2(raw,{from:boundary,toExclusive:"2100-01-01T00:00:00Z"});
 for(const key of ["recovered","fee","yoursBeforeVatAndTax"] as const)expect(a.withheld[key]!.pence+b.withheld[key]!.pence).toBe(after.withheld[key]!.pence);
 expect(b.withheld.movements).toHaveLength(1);expect(b.withheld.movements[0]?.kind).toBe("reversal");
});
it("denies another session/company before recovery source reads; reader has no write grants",async()=>{
 const x=await recoveryFeeFixture(f),other=await recoveryFeeFixture(f);
 await expect(finalCheckTenant(f.runtime,x.context.tenantId,db=>db.query("SELECT app.read_value_job_v2($1,$2)",[x.jobId,other.auth.digest]))).rejects.toThrow("VALUE_FORBIDDEN");
 await expect(finalCheckTenant(f.runtime,randomUUID(),db=>db.query("SELECT app.read_value_job_v2($1,$2)",[x.jobId,x.auth.digest]))).rejects.toThrow();
 const acl=(await f.admin.query("SELECT has_function_privilege('jobguard_runtime','app.read_value_job_v2(uuid,text)','EXECUTE') runtime,has_function_privilege('jobguard_shadow','app.read_value_job_v2(uuid,text)','EXECUTE') shadow")).rows[0];
 expect(acl).toEqual({runtime:true,shadow:false});
});

it("pre-lock direct reads preserve the refusal envelope without recovery sources",async()=>{
 const x=await seedFinalCheckJob(f);
 const raw=await finalCheckTenant(f.runtime,x.tenantId,async db=>(await db.query("SELECT app.read_value_job_v2($1,$2) result",[x.jobId,x.digest])).rows[0].result);
 expect(raw).toBeNull();
});

it("a newly settled allocation cannot disappear behind an older approved balance",async()=>{
 const x=await recoveryFeeFixture(f);await x.allocate(0);await x.approve(await x.review());
 expect(mapValueReceiptV2(await read(x)).withheld.recovered?.pence).toBe(32000);
 await x.allocate(1);expect(mapValueReceiptV2(await read(x)).withheld.recovered).toBeNull();
 await x.approve(await x.review(1));expect(mapValueReceiptV2(await read(x)).withheld.recovered?.pence).toBe(282000);
});
