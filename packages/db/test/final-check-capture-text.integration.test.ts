// SV-5: a job created by talking it through (walk-it capture) can complete its Final Check. The job's own
// capture text is builder capture, not a post-lock evidence source. Real PostgreSQL; CI only.
import {createHash,randomUUID} from "node:crypto";
import {afterAll,beforeAll,expect,it} from "vitest";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,finalCheckTenant,type FinalCheckFixture} from "./final-check-fixture.js";
import {FinalCheckRepository} from "../src/final-check-repository.js";
let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));
it("the job's own capture text is not frozen as a source, so a captured job completes its check",async()=>{
 const a=await seedFinalCheckJob(f),captureId=randomUUID(),text="Fictional walk-it: refit kitchen.",hash=createHash("sha256").update(text).digest("hex");
 await finalCheckTenant(f.admin,a.tenantId,async db=>{
  await db.query("INSERT INTO app.capture_source(id,tenant_id,kind,content_bytes,content_text,sha256) VALUES($1,$2,'text',convert_to($3,'UTF8'),$3,$4)",[captureId,a.tenantId,text,hash]);
  await db.query("INSERT INTO app.job_record_proposal(id,tenant_id,capture_id,job_id,source_id,source_version,source_sha256,prompt_version,schema_version,model,proposal) VALUES($1,$2,$3,$4,$3,1,$5,'fixture.v1','fixture.v1','fixture','{}'::jsonb)",[randomUUID(),a.tenantId,captureId,a.jobId,hash]);
 });
 await a.lock();
 const worker=new FinalCheckRepository(f.shadow),m=await worker.begin(a.context,a.jobId);
 expect(m.sources).toEqual([]);
 expect(Number((await f.admin.query("SELECT count(*) n FROM app.final_check_processing_source WHERE tenant_id=$1 AND job_id=$2 AND source_kind='unlinked_capture_source'",[a.tenantId,a.jobId])).rows[0].n)).toBe(0);
 await worker.reconcile(a.context,a.jobId,m.id,[]);
 expect(await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest)).toMatchObject({state:"completed",items:[]});
});
