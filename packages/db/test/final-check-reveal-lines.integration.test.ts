// SV-5 reveal screen (0247). Real PostgreSQL; CI only.
import {afterAll,beforeAll,expect,it} from "vitest";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,availableFinalCheck,type FinalCheckFixture} from "./final-check-fixture.js";
import {FinalCheckRepository} from "../src/final-check-repository.js";
let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));
it("a completed check names exactly the locked lines; before lock nothing is listed",async()=>{
 const a=await seedFinalCheckJob(f),repo=new FinalCheckRepository(f.runtime);
 expect(await repo.read(a.context,a.jobId,a.digest)).toEqual({state:"unlocked",items:[]});
 await availableFinalCheck(f,a);
 const view=await repo.read(a.context,a.jobId,a.digest);
 const locked=(await f.admin.query("SELECT l.id,l.line_kind kind,l.scope_item_id \"scopeItemId\",l.description FROM app.final_account_line l JOIN app.final_account_lock k ON(k.tenant_id,k.job_id,k.final_account_revision_id)=(l.tenant_id,l.job_id,l.final_account_revision_id) WHERE l.tenant_id=$1 AND l.job_id=$2 ORDER BY l.line_kind,l.description,l.id",[a.tenantId,a.jobId])).rows;
 expect(locked.length).toBeGreaterThan(0);
 expect(view.lockedLines).toEqual(locked);
 expect(view.items).toHaveLength(1);
 const ids=new Set(locked.map(line=>line.id));
 for(const id of (view.items[0]!.comparisons as {lockedLineIds:string[]}).lockedLineIds)expect(ids.has(id)).toBe(true);
});
