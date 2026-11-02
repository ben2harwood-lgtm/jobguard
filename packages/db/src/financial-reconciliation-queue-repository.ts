import type { Pool } from "pg";
import { z } from "zod";
import {
 FakeFinancialReconciliationRunner, FinancialReconciliationError, financialReconciliationSnapshotV1,
 financialReconciliationAdjustmentV1, reconcileFinancialSnapshot, reconciliationAdjustmentHash,
} from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid=z.string().uuid(), hash=z.string().regex(/^[a-f0-9]{64}$/u);
const runV1=z.object({version:z.literal("financial-reconciliation-store.v1"),commandId:uuid,
 trigger:z.enum(["daily","on_demand"]),day:z.iso.date(),snapshot:financialReconciliationSnapshotV1}).strict();
const proposeV1=z.object({version:z.literal("financial-reconciliation-propose.v1"),runId:uuid,adjustment:financialReconciliationAdjustmentV1}).strict();
const approveV1=z.object({version:z.literal("financial-reconciliation-approve.v1"),commandId:uuid,jobId:uuid,adjustmentId:uuid,contentHash:hash}).strict();
const receipt=z.object({id:uuid}).strict();
type Snapshot=z.infer<typeof financialReconciliationSnapshotV1>;
type Report=ReturnType<typeof reconcileFinancialSnapshot>;
/** Stored fake reference analysis only. No route, scheduler, financial posting or provider adapter. */
export class FinancialReconciliationQueueRepository {
 constructor(private readonly pool:Pool){}
 private async call(context:VerifiedTenantContext,session:string,jobId:string,command:Record<string,unknown>){
  if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw new FinancialReconciliationError("RECONCILIATION_DISABLED");
  return withTenant(this.pool,context,async db=>{
   const row=await db.$client.query<{result:unknown}>("SELECT app.financial_reconciliation_queue($1,$2,$3::jsonb) result",[uuid.parse(session),uuid.parse(jobId),JSON.stringify({version:"financial-reconciliation-storage.v1",...command})]);
   return row.rows[0]?.result;
  });
 }
 private stored(raw:unknown,context:VerifiedTenantContext,jobId:string):{runId:string;snapshot:Snapshot;report:Report}|null{
  if(raw===null)return null;
  const row=z.object({id:uuid,snapshot:financialReconciliationSnapshotV1,report:z.unknown()}).strict().parse(raw);
  if(row.snapshot.tenantId!==context.tenantId||row.snapshot.jobId!==jobId)throw new FinancialReconciliationError("RECONCILIATION_FORBIDDEN");
  const report=reconcileFinancialSnapshot(row.snapshot);
  // JSONB has its own key order. Compare structural content via the source hash
  // and a canonical object comparison rather than JSON.stringify key order.
  const normalized=(value:unknown):string=>JSON.stringify(value,(_key,v:unknown)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v);
  if(normalized(row.report)!==normalized(report))throw new FinancialReconciliationError("RECONCILIATION_CONFLICT");
  return {runId:row.id,snapshot:row.snapshot,report};
 }
 async run(context:VerifiedTenantContext,session:string,raw:unknown){
  const command=runV1.parse(raw),s=command.snapshot;
  if(s.tenantId!==context.tenantId)throw new FinancialReconciliationError("RECONCILIATION_FORBIDDEN");
  for(const rows of [s.invoices,s.provider,s.journals,s.corrections])rows.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const report=reconcileFinancialSnapshot(s);
  const result=await this.call(context,session,s.jobId,{action:"run",commandId:command.commandId,trigger:command.trigger,day:command.day,snapshot:s,report});
  const stored=this.stored(result,context,s.jobId);if(!stored)throw new FinancialReconciliationError("RECONCILIATION_CONFLICT");return stored;
 }
 async read(context:VerifiedTenantContext,session:string,jobId:string,runId:string){
  const result=this.stored(await this.call(context,session,jobId,{action:"read",runId:uuid.parse(runId)}),context,jobId);
  if(result&&result.runId!==runId)throw new FinancialReconciliationError("RECONCILIATION_CONFLICT");
  return result;
 }
 async propose(context:VerifiedTenantContext,session:string,raw:unknown){
  const command=proposeV1.parse(raw),adjustment=command.adjustment;
  const run=await this.read(context,session,adjustment.jobId,command.runId);
  if(!run)throw new FinancialReconciliationError("RECONCILIATION_FORBIDDEN");
  // Exercise the existing pure fake adjustment rules as a preview only. This
  // callback grants no database/commercial authority; SQL authenticates finance.
  const preview=new FakeFinancialReconciliationRunner(run.snapshot,true);
  preview.appendAdjustment(adjustment,{tenantId:context.tenantId,jobId:adjustment.jobId,actorId:adjustment.commandId,
   currentMember:true,canRun:true,canAdjust:true,approves:()=>true});
  const contentHash=reconciliationAdjustmentHash(adjustment);
  const result=receipt.parse(await this.call(context,session,adjustment.jobId,{action:"propose",commandId:adjustment.commandId,runId:command.runId,adjustment,contentHash}));
  return {adjustmentId:result.id,contentHash};
 }
 async approve(context:VerifiedTenantContext,session:string,raw:unknown){
  const command=approveV1.parse(raw);
  const result=receipt.parse(await this.call(context,session,command.jobId,{action:"approve",commandId:command.commandId,adjustmentId:command.adjustmentId,contentHash:command.contentHash}));
  return {approvalId:result.id};
 }
}
