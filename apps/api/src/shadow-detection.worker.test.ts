import { describe, expect, it, vi } from "vitest";
import { parseObservation, sha256 } from "@jobguard/core";
import { ShadowDetectionWorker, type ShadowWorkerPorts } from "./shadow-detection.worker.js";
const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const tenantId = "10000000-0000-4000-8000-000000000001", jobId = "10000000-0000-4000-8000-000000000002";
const task = { version: "shadow-detection-task.v1", tenantId, jobId };
const at = "2026-10-12T00:00:00Z";
const observation = parseObservation({ version: "observation.v1",tenantId,jobId,kind:"note_or_voice",text:"outside tap",citations:[{start:0,end:11,quote:"outside tap"}],
  evidence:{id:jobId,objectVersionId:"synthetic-v1",sha256:sha256("outside tap"),serverReceivedAt:at},facts:{workReference:"outside-tap",scopeArea:"job",description:"outside tap",status:"completed",estimatedValuePence:null,safetyImplication:false,customerClearlyRequested:false,needsPriorWrittenAgreement:false,significantWork:null,activeDispute:false,silenceMateriallyWorsensDispute:false,disclosureDuty:false} });
const ports = (): ShadowWorkerPorts => ({ assertTermsRelation:vi.fn(async()=>undefined),hasAcceptedTerms:vi.fn(async()=>true),read:vi.fn(async()=>({observations:[observation],captures:[]})),propose:vi.fn(async()=>({proposals:[]})),persist:vi.fn(async()=>undefined) });
describe("SV-3 worker boundary and terms gate", () => {
  it("passes each stamped context whole per call; repeated invocations never retain it", async () => {
    const p=ports(),worker=new ShadowDetectionWorker(p,"synthetic_demo",()=>at),context=testTenantContext(tenantId);
    await worker.start();await worker.execute(context,task);await worker.execute(context,task);
    expect(p.read).toHaveBeenCalledWith(context,{version:"shadow-observation-read.v1",jobId});
    expect(p.persist).toHaveBeenCalledTimes(2);expect(vi.mocked(p.persist).mock.calls[0]![1]).toEqual(vi.mocked(p.persist).mock.calls[1]![1]);
  });
  it("refuses unaccepted terms before reading, detecting or writing",async()=>{
    const p=ports();vi.mocked(p.hasAcceptedTerms).mockResolvedValue(false);
    await expect(new ShadowDetectionWorker(p,"synthetic_demo").execute(testTenantContext(tenantId),task)).rejects.toThrow("SHADOW_TERMS_NOT_ACCEPTED");
    expect(p.read).not.toHaveBeenCalled();expect(p.propose).not.toHaveBeenCalled();expect(p.persist).not.toHaveBeenCalled();
  });
  it("refuses startup without SV-4's real relation and outside synthetic mode",async()=>{
    const p=ports();vi.mocked(p.assertTermsRelation).mockRejectedValue(new Error("TERMS_RELATION_UNAVAILABLE"));
    await expect(new ShadowDetectionWorker(p,"synthetic_demo").start()).rejects.toThrow("TERMS_RELATION_UNAVAILABLE");
    for(const env of ["production_billing","pilot_no_charge","provider_sandbox","disabled"]){
      await expect(new ShadowDetectionWorker(p,env).start()).rejects.toThrow("SHADOW_SYNTHETIC_ONLY");
      await expect(new ShadowDetectionWorker(p,env).execute(testTenantContext(tenantId),task)).rejects.toThrow("SHADOW_SYNTHETIC_ONLY");
    }
  });
  it("rejects malformed, cross-tenant, authority-bearing and request-shaped tasks",async()=>{
    const p=ports(),worker=new ShadowDetectionWorker(p,"synthetic_demo");
    for(const extra of [{tenantId:"invalid"},{jobId:"invalid"},{price:800000},{approved:true},{headers:{}}])
      await expect(worker.execute(testTenantContext(tenantId),{...task,...extra})).rejects.toThrow("INVALID_SHADOW_TASK");
    await expect(worker.execute(testTenantContext(jobId),task)).rejects.toThrow("SHADOW_TASK_TENANT_MISMATCH");
    expect(p.read).not.toHaveBeenCalled();
  });
});
