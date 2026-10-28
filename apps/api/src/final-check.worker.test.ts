import { afterEach,expect,it,vi } from "vitest";
import type { Pool } from "pg";
import { authenticatePracticeSession,DEMO_TENANT_ID,DEMO_MEMBERSHIP_ID,DEMO_IDENTITY_USER_ID,type FinalCheckManifest } from "@jobguard/db";
import { FinalCheckWorker } from "./final-check.worker.js";
// Deliberately no new context constructor. Negative schema tests never use the context.
it("SV5-30 malformed worker payloads fail before any port",async()=>{
 const ports={read:vi.fn(),process:vi.fn(),record:vi.fn(),reconcile:vi.fn()};
 const worker=new FinalCheckWorker(ports,"synthetic_demo");
 await expect(worker.execute(undefined!,{version:"final-check.task.v1",actor:"invalid"})).rejects.toMatchObject({code:"INVALID_FINAL_CHECK_INPUT"});expect(ports.read).not.toHaveBeenCalled();
});
it("SV5-32 Q6 registration remains a prerequisite: handler refuses non-synthetic execution",async()=>{
 const worker=new FinalCheckWorker({read:vi.fn(),process:vi.fn(),record:vi.fn(),reconcile:vi.fn()},"production");
 await expect(worker.execute(undefined!,{})).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
});
afterEach(()=>vi.unstubAllEnvs());
async function context(){vi.stubEnv("JOBGUARD_ENV","synthetic_demo");const pool={query:async()=>({rows:[{tenant_id:DEMO_TENANT_ID,membership_id:DEMO_MEMBERSHIP_ID,identity_user_id:DEMO_IDENTITY_USER_ID}]})} as unknown as Pool;return (await authenticatePracticeSession(pool,"18000000-0000-4000-8000-000000000001")).context;}
const jobId="18000000-0000-4000-8000-000000000002",manifestId="18000000-0000-4000-8000-000000000003";
function manifest():FinalCheckManifest{return {version:"final-check.manifest.v1",id:manifestId,lockId:jobId,cutoff:"2026-10-12T10:00:00.000001Z",hash:"a".repeat(64),detectorVersion:"synthetic.v1",policyVersion:"final-check.reconciliation.v1",result:null,signals:[],comparisons:{tenantId:DEMO_TENANT_ID,jobId,captures:[],baselineItemIds:[],lines:[],baseline:[],baselineRecordedAt:"2026-10-12T09:00:00Z"},sources:[{id:jobId,evidenceId:jobId,sourceRef:jobId,sourceKind:"diary",objectVersionId:"v1",sha256:"a".repeat(64),receivedAt:"2026-10-12T09:00:00Z",inputHash:"a".repeat(64),input:{},processable:true,status:"pending"}]};}
it("SV5-02 SV5-03 delayed processing prevents reconciliation; failures persist before typed refusal",async()=>{
 const m=manifest(),record=vi.fn(async()=>{m.sources[0]!.status="failed";}),reconcile=vi.fn();
 const worker=new FinalCheckWorker({read:async()=>structuredClone(m),process:async()=>{throw new Error("Synthetic decoder failure");},record,reconcile},"synthetic_demo");
 await expect(worker.execute(await context(),{version:"final-check.task.v1",jobId,manifestId})).rejects.toThrow("FINAL_CHECK_PENDING");expect(record).toHaveBeenCalledWith(expect.anything(),expect.anything(),expect.anything(),expect.objectContaining({status:"failed",failureCode:"PROCESSING_FAILED"}));expect(reconcile).not.toHaveBeenCalled();
});
it("SV5-19 same frozen inventory resumes after a recorded failure and explicitly persists zero",async()=>{
 const m=manifest();m.sources[0]!.status="failed";const reconcile=vi.fn(async()=>({runId:manifestId}));
 const worker=new FinalCheckWorker({read:async()=>structuredClone(m),process:async()=>({version:"final-check.source-result.v1",inputHash:"a".repeat(64),status:"zero_result",failureCode:null,signalIds:[]}),record:async()=>{m.sources[0]!.status="zero_result";},reconcile},"synthetic_demo");
 expect(await worker.execute(await context(),{version:"final-check.task.v1",jobId,manifestId})).toEqual({runId:manifestId});expect(reconcile).toHaveBeenCalledTimes(1);
});
it("the job's own walk-it text is listed but never processed or recorded, and does not hold completion",async()=>{
 const m=manifest();m.sources[0]!.sourceKind="builder_capture_not_scanned";m.sources[0]!.processable=false;
 const process=vi.fn(),record=vi.fn(),reconcile=vi.fn(async()=>({runId:manifestId}));
 const worker=new FinalCheckWorker({read:async()=>structuredClone(m),process,record,reconcile},"synthetic_demo");
 expect(await worker.execute(await context(),{version:"final-check.task.v1",jobId,manifestId})).toEqual({runId:manifestId});
 expect(process).not.toHaveBeenCalled();expect(record).not.toHaveBeenCalled();expect(reconcile).toHaveBeenCalledTimes(1);
});
