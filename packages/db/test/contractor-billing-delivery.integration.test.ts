import { assertLp4SealedEvents } from "./lp4-writer-catchup-fixture.js";
import {afterAll,beforeAll,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {ContractorBillingDelivery} from "../src/contractor-billing-delivery.js";
import type {OutboundAdapter} from "../src/outbox.js";
import {cluster,world,code} from "./contractor-billing-fixtures.js";
let c:Awaited<ReturnType<typeof cluster>>;beforeAll(async()=>{c=await cluster();},240000);afterAll(async()=>{await c?.close();});
it("E6-23 E6-24 outcome_unknown delivery is reconciled, never blindly retried",async()=>{
 const w=await world(c),batch=await w.exported(),v=await w.repo.read(w.ctx,w.session,w.s.jobId);let calls=0,reconciliations=0;
 const adapter:OutboundAdapter={name:"fake_sftp",supportsProviderDeduplication:true,async deliver(){calls++;return {kind:"outcome_unknown",code:"FICTIONAL_UNKNOWN"};},async reconcile(){reconciliations++;return "succeeded";}};
 const delivery=new ContractorBillingDelivery(c.runtime,new Map([[adapter.name,adapter]]));
 const action=await w.repo.approveDelivery(w.ctx,w.session,w.s.jobId,{version:"billing-approve-delivery.v1",commandId:randomUUID(),batchId:batch.batchId,channel:"fake_sftp",destination:"fictional.invalid",contentHash:v.exports[0]!.jsonHash,expiresAt:new Date(Date.now()+3600000).toISOString()});
 await delivery.execute(w.ctx,w.session,w.s.jobId,action.outboxActionId);await delivery.execute(w.ctx,w.session,w.s.jobId,action.outboxActionId);expect(calls).toBe(1);
 await delivery.reconcile(w.ctx,w.session,w.s.jobId,action.outboxActionId);expect(reconciliations).toBe(1);expect(calls).toBe(1);
 const after=await w.repo.read(w.ctx,w.session,w.s.jobId);
 expect(after.deliveries[0]).toMatchObject({status:"succeeded",outbox_action_id:action.outboxActionId});
 await assertLp4SealedEvents(c.admin, w.w.p.tenantId, "contractor.billing.delivery_claimed");
 // The screen offers export only to contracts on this job's own work orders.
 expect(after.clientContractIds).toEqual((await c.admin.query("SELECT DISTINCT contract_id::text id FROM app.work_order WHERE job_id=$1 ORDER BY 1",[w.s.jobId])).rows.map(r=>r.id));
 expect(after.clientContractIds.length).toBeGreaterThan(0);
});
it("E6-23 wrong content hash refuses before creating durable delivery",async()=>{const w=await world(c),batch=await w.exported();expect(await code(w.repo.approveDelivery(w.ctx,w.session,w.s.jobId,{version:"billing-approve-delivery.v1",commandId:randomUUID(),batchId:batch.batchId,channel:"fake_api",destination:"fictional.invalid",contentHash:"0".repeat(64),expiresAt:new Date(Date.now()+3600000).toISOString()}))).toBe("BILLING_INVALID");});
it("E6-25 download retrieves only persisted authorized bytes after the fake action succeeds",async()=>{
 const own=await world(c),batch=await own.exported(),view=await own.repo.read(own.ctx,own.session,own.s.jobId);
 const {BillingApplication}=await import("../../../apps/api/src/contractor/billing.application.js"),app=new BillingApplication(c.runtime);
 await expect(app.download(own.session,own.s.jobId,batch.batchId)).rejects.toMatchObject({code:"BILLING_NOT_FOUND"});
 await app.approveDelivery(own.session,own.s.jobId,{version:"billing-approve-delivery.v1",commandId:randomUUID(),batchId:batch.batchId,channel:"fake_download",destination:"fictional.invalid",contentHash:view.exports[0]!.jsonHash,expiresAt:new Date(Date.now()+3600000).toISOString()});
 expect(await app.download(own.session,own.s.jobId,batch.batchId)).toEqual({csv:view.exports[0]!.csv,hash:view.exports[0]!.csvHash});
 expect((await app.read(own.session,own.s.jobId)).exports[0]).not.toHaveProperty("csv");
});
it("E6-24 an interrupted claim is inspected as unknown and reconciliation never sends",async()=>{
 const own=await world(c),batch=await own.exported(),view=await own.repo.read(own.ctx,own.session,own.s.jobId),action=await own.repo.approveDelivery(own.ctx,own.session,own.s.jobId,{version:"billing-approve-delivery.v1",commandId:randomUUID(),batchId:batch.batchId,channel:"fake_api",destination:"fictional.invalid",contentHash:view.exports[0]!.jsonHash,expiresAt:new Date(Date.now()+3600000).toISOString()});
 const {withTenant}=await import("../src/index.js");await withTenant(c.runtime,own.ctx,db=>db.$client.query("SELECT app.cb_delivery_step($1,$2,$3,'claim','{}'::jsonb)",[own.session,own.s.jobId,action.outboxActionId]));
 let sends=0;const adapter:OutboundAdapter={name:"fake_api",supportsProviderDeduplication:true,async deliver(){sends++;return {kind:"succeeded",providerReference:"fictional"};},async reconcile(){return "unknown";}};
 const delivery=new ContractorBillingDelivery(c.runtime,new Map([[adapter.name,adapter]]));await delivery.execute(own.ctx,own.session,own.s.jobId,action.outboxActionId);await delivery.reconcile(own.ctx,own.session,own.s.jobId,action.outboxActionId);await delivery.execute(own.ctx,own.session,own.s.jobId,action.outboxActionId);
 expect(sends).toBe(0);expect((await own.repo.read(own.ctx,own.session,own.s.jobId)).deliveries[0]).toMatchObject({status:"outcome_unknown"});
});
