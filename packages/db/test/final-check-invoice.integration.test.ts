import {afterAll,beforeAll,expect,it} from "vitest";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,availableFinalCheck,type FinalCheckFixture} from "./final-check-fixture.js";
let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));
it("SV5-02 SV5-27 separable result does not publish invoice-authorizing check facts while Q5 is STOPPED",async()=>{
 const a=await seedFinalCheckJob(f);await availableFinalCheck(f,a);
 expect(Number((await f.admin.query('SELECT count(*) n FROM app.final_account_lock_check WHERE tenant_id=$1 AND job_id=$2',[a.tenantId,a.jobId])).rows[0].n)).toBe(0);
});
it.todo('SV5-02 Q4/Q5 delayed-source final/supplementary invoice integration STOPPED');
it.todo('SV5-27 Q5 forged completed label and completion/invoice races STOPPED');
it.todo('SV5-28 Q4/Q5 every invoice issue path gate and preserved interim/deposit proof STOPPED');
it.todo('SV5-32 Q6 actual background registration/scheduling/restart STOPPED');
