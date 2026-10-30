import type { Pool } from "pg";
import { z } from "zod";
import { mapRecoveryReceiptToLines, recoveryReceiptFactsV1, receiptLineAllocationSnapshotV1, receiptLineAllocationCommandV1,
 type ReceiptLineAllocationSnapshot } from "@jobguard/core";
import { practiceMaterialPool } from "./practice-session.js";
import type { RecoveryAllocationActor } from "./recovery-allocation-repository.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

export type ReceiptLineAllocationErrorCode = "RECEIPT_LINE_SYNTHETIC_ONLY" | "RECEIPT_LINE_FORBIDDEN" |
 "INVALID_RECEIPT_LINE_QUERY" | "INVALID_RECEIPT_LINE_COMMAND" | "INVALID_RECEIPT_LINE_RESULT";
export class ReceiptLineAllocationError extends Error {
 constructor(readonly code: ReceiptLineAllocationErrorCode) { super(code); this.name = "ReceiptLineAllocationError"; }
}
const id=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/u),revision=z.number().int().safe().positive();
const selectorV1=z.object({jobId:id,invoiceId:id.optional(),paymentId:id.optional()}).strict();
const queryV1=z.object({version:z.literal("receipt-line-allocation-query.v1"),commandId:id.optional()}).strict();
const expectedV1=z.object({revision,sourceHash:hash}).strict();
const base={version:z.literal("receipt-line-facts-command.v1"),commandId:id,expectedSourceRevision:revision};
/** No application amount, tax, ratio, hash, artifact or allocation shares. */
export const neutralReceiptFactCommandV1=z.discriminatedUnion("action",[
 z.object({...base,action:z.literal("review"),paymentId:id,remittanceEvidenceId:id.optional()}).strict(),
 z.object({...base,action:z.literal("review_reverse"),allocationRevisionId:id,reversalSource:z.object({kind:z.enum(["payment_reversal","credit_note"]),sourceId:id}).strict()}).strict(),
 z.object({...base,action:z.literal("approve"),reviewId:id,approvalHash:hash}).strict(),
 z.object({...base,action:z.literal("reverse"),reviewId:id,approvalHash:hash}).strict(),
]);
const fraction=z.object({numerator:z.string().regex(/^-?(0|[1-9][0-9]*)$/u),denominator:z.string().regex(/^[1-9][0-9]*$/u)}).strict();
const proposedLine=z.object({lineId:id,scopeItemId:id,commercialRevisionId:id,rule:z.enum(["explicit","separate_invoice","pro_rata"]),sourceRef:z.string().min(1).max(300),
 gross:fraction,net:fraction,originalLineNetPence:z.number().int().safe().nonnegative(),originalLineGrossPence:z.number().int().safe().positive(),lineExistedAt:z.string(),reversesLineAllocationId:id.nullable()}).strict();
const resultV1=z.object({version:z.literal("receipt-line-facts-result.v1"),environment:z.literal("synthetic_demo"),realExternalActions:z.literal(0),jobId:id,commandId:id,
 action:z.enum(["review","approve","review_reverse","reverse"]),reviewId:id,approvalHash:hash,allocationRevisionId:id.nullable(),sourceRevision:revision,sourceHash:hash,replayed:z.boolean(),
 input:recoveryReceiptFactsV1,lines:z.array(proposedLine).min(1).max(10000)}).strict();
export type NeutralReceiptFactResult=z.infer<typeof resultV1>;
type Selector=z.infer<typeof selectorV1>;
/** Keep SSI local to this producer; the pinned practice-session bridge retains
 * its existing BEGIN/digest contract. The adapter owns no session-wide state. */
function serializableReceiptPool(pool:Pool):Pool{
 return {connect:async()=>{
  const client=await pool.connect();
  return {
   query:(sql:string,values?:unknown[])=>client.query(sql==="BEGIN"?"BEGIN ISOLATION LEVEL SERIALIZABLE":sql,values),
   release:()=>client.release(),
  };
 }} as unknown as Pool;
}

function fail(code:ReceiptLineAllocationErrorCode):never{throw new ReceiptLineAllocationError(code);}
/** Synthetic neutral receipt producer. SQL derives all money; SH-1 checks the
 * proposal again before the repository can return a review or saved result. */
export class RecoveryLineAllocationRepository {
 constructor(private readonly pool:Pool,private readonly environment=process.env.JOBGUARD_ENV??"unconfigured"){}
 private guard(actor:RecoveryAllocationActor,digest:string,jobId:string):void{
  if(this.environment!=="synthetic_demo")fail("RECEIPT_LINE_SYNTHETIC_ONLY");
  if(!hash.safeParse(digest).success||!id.safeParse(jobId).success||!id.safeParse(actor?.membershipId).success||!id.safeParse(actor?.identityUserId).success)fail("RECEIPT_LINE_FORBIDDEN");
 }
 private async scope(db:TenantTransaction,context:VerifiedTenantContext,actor:RecoveryAllocationActor,digest:string,jobId:string):Promise<void>{
  this.guard(actor,digest,jobId);
  const found=await db.$client.query(`SELECT m.id FROM app.membership m
   JOIN app.authenticate_practice_session($4,$1) p ON(p.tenant_id,p.membership_id,p.identity_user_id)=(m.tenant_id,m.id,m.identity_user_id)
   JOIN app.job j ON(j.tenant_id,j.id)=(m.tenant_id,$5::uuid)
   WHERE m.tenant_id=$1 AND m.id=$2 AND m.identity_user_id=$3 AND m.role='owner'
   AND m.revoked_at IS NULL AND(m.expires_at IS NULL OR m.expires_at>clock_timestamp()) AND j.practice_session_digest=$4
   AND current_setting('app.tenant_id',true)=$1::text AND current_setting('app.practice_material_digest',true)=$4 FOR SHARE OF m`,
   [context.tenantId,actor.membershipId,actor.identityUserId,digest,jobId]);
  if(found.rowCount!==1)fail("RECEIPT_LINE_FORBIDDEN");
 }
 async readCurrent(context:VerifiedTenantContext,actor:RecoveryAllocationActor,digest:string,selector:Selector):Promise<ReceiptLineAllocationSnapshot>{
  this.guard(actor,digest,selector?.jobId);if(!selectorV1.safeParse(selector).success)fail("INVALID_RECEIPT_LINE_QUERY");
  return withTenant(practiceMaterialPool(this.pool,digest),context,db=>this.readCurrentInTransaction(db,context,actor,digest,selector));
 }
 async readCurrentInTransaction(db:TenantTransaction,context:VerifiedTenantContext,actor:RecoveryAllocationActor,digest:string,selector:Selector,expected?:z.infer<typeof expectedV1>):Promise<ReceiptLineAllocationSnapshot>{
  this.guard(actor,digest,selector?.jobId);
  if(!selectorV1.safeParse(selector).success||(expected!==undefined&&!expectedV1.safeParse(expected).success))fail("INVALID_RECEIPT_LINE_QUERY");
  await this.scope(db,context,actor,digest,selector.jobId);
  await db.$client.query("SELECT set_config('app.receipt_line_environment','synthetic_demo',true)");
  const row=(await db.$client.query<{result:unknown}>("SELECT app.read_receipt_allocation_facts($1,$2,$3,$4::jsonb,$5::jsonb) result",[context.tenantId,selector.jobId,digest,JSON.stringify(selector),expected===undefined?null:JSON.stringify(expected)])).rows[0];
  const snapshot=receiptLineAllocationSnapshotV1.safeParse(row?.result);
  if(!snapshot.success||snapshot.data.rows.some(r=>r.tenantId!==context.tenantId||r.jobId!==selector.jobId||(selector.invoiceId&&r.invoiceId!==selector.invoiceId)||(selector.paymentId&&r.paymentId!==selector.paymentId)))fail("INVALID_RECEIPT_LINE_RESULT");
  return snapshot.data;
 }
 async view(context:VerifiedTenantContext,actor:RecoveryAllocationActor,digest:string,jobId:string,rawQuery?:unknown):Promise<ReceiptLineAllocationSnapshot>{
  this.guard(actor,digest,jobId);
  if(!queryV1.safeParse(rawQuery===undefined?{version:"receipt-line-allocation-query.v1"}:rawQuery).success)fail("INVALID_RECEIPT_LINE_QUERY");
  return this.readCurrent(context,actor,digest,{jobId});
 }
 async command(context:VerifiedTenantContext,actor:RecoveryAllocationActor,digest:string,jobId:string,raw:unknown):Promise<NeutralReceiptFactResult>{
  this.guard(actor,digest,jobId);
  const command=z.union([neutralReceiptFactCommandV1,receiptLineAllocationCommandV1]).safeParse(raw);
  if(!command.success)fail("INVALID_RECEIPT_LINE_COMMAND");
  // SSI is selected at BEGIN, before the digest/tenant configuration queries.
  // Unknown transport/commit outcomes remain errors; retry the same command id.
  return withTenant(practiceMaterialPool(serializableReceiptPool(this.pool),digest),context,async db=>{
   await this.scope(db,context,actor,digest,jobId);
   await db.$client.query("SELECT set_config('app.receipt_line_environment','synthetic_demo',true)");
   const row=(await db.$client.query<{result:unknown}>("SELECT app.write_receipt_allocation_facts($1,$2,$3,$4::jsonb,NULL::jsonb) result",[context.tenantId,jobId,digest,JSON.stringify(command.data)])).rows[0];
   const parsed=resultV1.safeParse(row?.result);
   if(!parsed.success||parsed.data.jobId!==jobId||parsed.data.commandId!==command.data.commandId||parsed.data.action!==command.data.action)fail("INVALID_RECEIPT_LINE_RESULT");
   const shared=mapRecoveryReceiptToLines(parsed.data.input);
   if(shared.length!==parsed.data.lines.length||shared.some(line=>!parsed.data.lines.some(saved=>saved.lineId===line.lineId&&saved.rule===line.rule&&saved.sourceRef===line.sourceRef&&JSON.stringify(saved.gross)===JSON.stringify(line.gross)&&JSON.stringify(saved.net)===JSON.stringify(line.net))))fail("INVALID_RECEIPT_LINE_RESULT");
   return parsed.data;
  });
 }
}
