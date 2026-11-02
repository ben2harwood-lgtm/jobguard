import type { Pool } from "pg";
import { z } from "zod";
import { mapValueReceipt, mapBusinessValueSummary, type ValueWindowV1 } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { subscriptionPersistedReadV1 } from "./subscription-repository.js";

/** Company credentials only. MON-2A rechecks current company membership before
 * any job enumeration. Shared practice cookies never reach this reader. */
export class ValueBusinessReader {
 constructor(private readonly pool:Pool){}
 async readJob(context:VerifiedTenantContext,digest:string,jobId:string,window:ValueWindowV1|null=null){
  const id=z.string().uuid().parse(jobId);
  const raw=await withTenant(this.pool,context,async db=>(await db.$client.query("SELECT app.read_value_job($1,$2) result",[id,digest])).rows[0]?.result);
  if(raw===null)return null;
  const receipt=mapValueReceipt(raw,window);
  if(receipt.sources.tenantId!==context.tenantId||receipt.sources.jobId!==id)throw new Error("VALUE_SCOPE_MISMATCH");
  return receipt;
 }
 async readBusiness(context:VerifiedTenantContext,digest:string,periodId?:string,window:ValueWindowV1|null=null){
  const snapshot=await withTenant(this.pool,context,async db=>(await db.$client.query(
   "SELECT app.read_value_business($1) result",[digest])).rows[0]?.result);
  const raw=z.object({billing:subscriptionPersistedReadV1,jobs:z.array(z.unknown())}).strict().parse(snapshot);
  const billing=raw.billing;
  const jobs=raw.jobs.map(source=>{
   const receipt=mapValueReceipt(source,window);
   if(receipt.sources.tenantId!==context.tenantId)throw new Error("VALUE_SCOPE_MISMATCH");
   return {version:"job-value.v3",environment:"synthetic_demo",jobId:receipt.sources.jobId,status:"mapped",receipt};
  });
  const period=z.object({tenant_id:z.literal(context.tenantId),id:z.string().uuid(),period_start:z.string(),period_end:z.string(),
   source_id:z.string().uuid(),principal_pence:z.number().int().min(0).max(16900),artifact_hash:z.string()});
  const periods=billing.periods.map(p=>period.parse(p)).filter(p=>!periodId||p.id===periodId);
  if(periodId&&!periods.length)throw new Error("VALUE_PERIOD_UNAVAILABLE");
  const subscription=periods.map(p=>{
   const lines=billing.periodLines.filter(l=>l.period_id===p.id);
   const statements=billing.statements.filter(s=>s.period_id===p.id);
   const statementLines=billing.statementLines.filter(l=>l.period_id===p.id);
   const lineAmounts=new Map(lines.map(l=>[l.line_key,l.amount_pence]));
   if(statementLines.length!==lines.length||statementLines.some(l=>l.tenant_id!==context.tenantId||l.statement_id!==statements[0]?.id||l.amount_pence!==lineAmounts.get(l.line_key))
    ||new Set(statementLines.map(l=>l.line_key)).size!==statementLines.length
    ||statements[0]?.currency!=="GBP"||statements[0]?.hypothetical!==true||statements.length!==1||statements[0]?.tenant_id!==context.tenantId||statements[0]?.amount_pence!==p.principal_pence
    ||statements[0]?.artifact_hash!==p.artifact_hash||statements[0]?.namespace!=="subscription.synthetic.v1"
    ||lines.some(l=>l.tenant_id!==context.tenantId)||new Set(lines.map(l=>l.line_key)).size!==lines.length
    ||lines.reduce((n,l)=>n+z.number().int().nonnegative().parse(l.amount_pence),0)!==p.principal_pence)throw new Error("VALUE_PERIOD_SOURCE_MISMATCH");
   return {periodId:p.id,from:p.period_start,toExclusive:p.period_end,sourceId:p.source_id,statementId:statements[0]!.id,
    policyVersion:"subscription_pricing_policy_v4",derivationVersion:"MON-1/MON-2A",amount:{pence:p.principal_pence,currency:"GBP"},lines};
  });
  return {version:"business-value-result.v1",state:"mapped",label:"mapped, inspectable",environment:"synthetic_demo",tenantId:context.tenantId,jobs,summary:mapBusinessValueSummary(jobs.map(j=>j.receipt)),subscription};
 }
}
