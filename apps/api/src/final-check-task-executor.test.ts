import { expect, it, vi } from "vitest";
import type { FinalCheckManifest } from "@jobguard/db";
import { executeFinalCheckTask, type FinalCheckExecutionPorts } from "./final-check-task-executor.js";
const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const tenantId="10000000-0000-4000-8000-000000000001", jobId="10000000-0000-4000-8000-000000000002";
const task={version:"final-check-task.v1",tenantId,jobId,lockId:"10000000-0000-4000-8000-000000000003",manifestId:"10000000-0000-4000-8000-000000000004",executionId:"10000000-0000-4000-8000-000000000005"};
function setup(){
 const m:FinalCheckManifest={version:"final-check.manifest.v1",id:task.manifestId,lockId:task.lockId,cutoff:"2026-10-29T00:00:00Z",hash:"a".repeat(64),detectorVersion:"shadow-detection.v1",policyVersion:"final-check.reconciliation.v1",sources:[],signals:[],result:null,comparisons:{tenantId,jobId,captures:[],baselineItemIds:[],lines:[],baseline:[],baselineRecordedAt:"2026-10-28T00:00:00Z"}};
 const ports={read:vi.fn(async()=>structuredClone(m)),execute:vi.fn(async()=>{m.result={runId:task.executionId,lockId:task.lockId,zeroResult:true,classifications:[]};}),publish:vi.fn(async(_context:Parameters<FinalCheckExecutionPorts["publish"]>[0],_request:Parameters<FinalCheckExecutionPorts["publish"]>[1])=>undefined)};
 return {m,ports,context:testTenantContext(tenantId)};
}
it("replays and new execution IDs publish the same certificate for the persisted run",async()=>{
 const {ports,context}=setup();
 for(const executionId of [task.executionId,task.executionId,tenantId]) await executeFinalCheckTask(context,{...task,executionId},ports,"synthetic_demo");
 expect(ports.publish).toHaveBeenCalledTimes(3);
 for(const [c,p] of ports.publish.mock.calls){expect(c).toBe(context);expect(p).toEqual({version:"final-check-publication.v1",jobId,runId:task.executionId,checkId:task.manifestId});}
});
it("rejects production, cross-tenant and authority-bearing tasks before reading shadow data",async()=>{
 const {ports,context}=setup();
 for(const environment of ["production_billing","pilot_no_charge","disabled"]) await expect(executeFinalCheckTask(context,task,ports,environment)).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
 await expect(executeFinalCheckTask(testTenantContext(jobId),task,ports,"synthetic_demo")).rejects.toThrow("FINAL_CHECK_TASK_TENANT_MISMATCH");
 for(const extra of [{amountPence:1},{allocationId:jobId},{approved:true},{reversed:false}])await expect(executeFinalCheckTask(context,{...task,...extra},ports,"synthetic_demo")).rejects.toThrow("INVALID_FINAL_CHECK_TASK");
 expect(ports.read).not.toHaveBeenCalled();expect(ports.publish).not.toHaveBeenCalled();
});
it.each(["lockId","id","jobId","tenantId"])("refuses forged %s bindings before executing or publishing",async field=>{
 const {m,ports,context}=setup();
 if(field==="jobId"||field==="tenantId")m.comparisons[field]=task.executionId;else m[field as "id"|"lockId"]=task.executionId;
 await expect(executeFinalCheckTask(context,task,ports,"synthetic_demo")).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
 expect(ports.execute).not.toHaveBeenCalled();expect(ports.publish).not.toHaveBeenCalled();
});
it("failed or unreadable processing cannot publish or become an empty success",async()=>{
 const {ports,context}=setup();ports.execute.mockRejectedValue(new Error("FINAL_CHECK_PENDING"));
 await expect(executeFinalCheckTask(context,task,ports,"synthetic_demo")).rejects.toThrow("FINAL_CHECK_PENDING");expect(ports.publish).not.toHaveBeenCalled();
});
it("an acknowledged execution without persisted completion cannot publish",async()=>{
 const {ports,context}=setup();ports.execute.mockImplementation(async()=>undefined);
 await expect(executeFinalCheckTask(context,task,ports,"synthetic_demo")).rejects.toThrow("FINAL_CHECK_PENDING");expect(ports.publish).not.toHaveBeenCalled();
});
it("a changed frozen bill or result lock cannot publish",async()=>{
 for(const change of ["hash","lock"]){const {m,ports,context}=setup();ports.execute.mockImplementation(async()=>{m.result={runId:task.executionId,lockId:change==="lock"?jobId:task.lockId,zeroResult:true,classifications:[]};if(change==="hash")m.hash="b".repeat(64);});
 await expect(executeFinalCheckTask(context,task,ports,"synthetic_demo")).rejects.toThrow("FINAL_CHECK_PENDING");expect(ports.publish).not.toHaveBeenCalled();}
});

it("certificate proof failures and idempotency conflicts propagate instead of acknowledging success",async()=>{
 for(const code of ["FINAL_CHECK_INPUT_UNAVAILABLE","IDEMPOTENCY_PAYLOAD_CONFLICT"]){const {ports,context}=setup();ports.publish.mockRejectedValue(new Error(code));
 await expect(executeFinalCheckTask(context,task,ports,"synthetic_demo")).rejects.toThrow(code);}
});
