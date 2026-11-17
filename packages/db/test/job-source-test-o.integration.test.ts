// BUILD_PLAN 10.2.11 Test O: diary note "fitted outside tap"; no Log an extra; omitted at lock → eligible catch.
// Real PostgreSQL; CI only. The note goes through the checked SV-7A writer; the Final Check runs through the
// existing worker harness, decoding only the server-chosen reviewed fixture reference.
import {randomUUID} from "node:crypto";
import {afterAll,beforeAll,expect,it} from "vitest";
import {JobSourceRepository} from "../src/job-source-repository.js";
import {FinalCheckRepository} from "../src/final-check-repository.js";
import {decodeJobSourceFixture} from "../src/job-source-fixtures.js";
import {createFinalCheckFixture,closeFinalCheckFixture,seedFinalCheckJob,type FinalCheckFixture} from "./final-check-fixture.js";

let f:FinalCheckFixture;beforeAll(async()=>{f=await createFinalCheckFixture()},60000);afterAll(async()=>closeFinalCheckFixture(f));

it("SV7A-INT-O Test O: an outside-tap diary note omitted from the locked bill is revealed after lock, with no variation or case",async()=>{
 const {createFinalCheckWorker}=await import("./final-check-worker-factory.js");
 const a=await seedFinalCheckJob(f);
 const note=await new JobSourceRepository(f.runtime).intake(a.context,a.jobId,a.digest,"diary",{version:"job-diary-input.v1",commandId:randomUUID(),entryMode:"typed",onSite:false,text:"Fitted outside tap."});
 // No Log an extra exists for the tap: the builder never captured it.
 expect(Number((await f.admin.query("SELECT count(*) n FROM app.variation WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n)).toBe(0);
 const diaryBefore=await new JobSourceRepository(f.runtime).read(a.context,a.jobId,a.digest,"diary");
 await a.lock();
 const m=await new FinalCheckRepository(f.shadow).begin(a.context,a.jobId);
 expect(m.sources.some(s=>s.sourceKind==="builder_capture_not_scanned")).toBe(false);
 const source=m.sources.find(s=>s.evidenceId===note.record.evidence.id)!;
 expect(source).toBeDefined();
 // The server set the decoder reference at intake; the test only reads it.
 const ref=(await f.admin.query("SELECT synthetic_fixture_ref FROM app.job_source_original WHERE tenant_id=$1 AND evidence_id=$2",[a.tenantId,note.record.evidence.id])).rows[0].synthetic_fixture_ref as string;
 const decoded=decodeJobSourceFixture(ref,note.record.text,"note_or_voice");
 expect(decoded).not.toBeNull();
 const observation={version:"observation.v1",tenantId:a.tenantId,jobId:a.jobId,kind:"note_or_voice",
  evidence:{id:source.evidenceId,objectVersionId:source.objectVersionId,sha256:source.sha256,serverReceivedAt:source.receivedAt},...decoded};
 const worker=createFinalCheckWorker(f.shadow,[observation],"synthetic_demo"),task={version:"final-check.task.v1",jobId:a.jobId,manifestId:m.id};
 const first=await worker.execute(a.context,task);
 expect(await worker.execute(a.context,task)).toEqual(first);
 const view=await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest);
 expect(await new JobSourceRepository(f.runtime).read(a.context,a.jobId,a.digest,"diary")).toEqual(diaryBefore);
 expect(view.state).toBe("completed");
 expect(view.items).toHaveLength(1);
 expect(view.items[0]!.description).toBe("outside tap");
 expect((view.items[0]!.evidence as {id:string}[]).map(e=>e.id)).toEqual([note.record.evidence.id]);
 // Revealing a catch creates no variation, case, invoice or money effect; confirming it is SV-5 Q2.
 for(const table of ["variation","recovery_case","customer_invoice"])expect(Number((await f.admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId])).rows[0].n)).toBe(0);
});
