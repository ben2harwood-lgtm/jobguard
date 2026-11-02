import { z } from "zod";
import { recoveryAttributionRevisionV1 } from "./recovery-attribution-persistence.js";
import { exactPence, exactPenceV1, serializeExactPence, calculateCumulativeFee } from "./cumulative-fee.js";
import { compareServerInstants } from "./enterprise-domain/contracts.js";
import { MAX_MONEY_PENCE } from "./money.js";

const uuid=z.string().uuid().toLowerCase(), pence=z.number().int().safe().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE);
export const valueJobSourcesV1=z.object({
 tenantId:uuid,jobId:uuid,lockId:uuid,lockedRevisionId:uuid,lockedAt:z.string().datetime(),
 foundComplete:z.boolean(),checkId:uuid.nullable(),checkedAt:z.string().datetime().nullable(),checked:z.array(uuid),
 tracked:z.array(z.object({id:uuid,revisionId:uuid,sourceId:uuid,netPence:pence,invoiceId:uuid,checkId:uuid,at:z.string().datetime()}).strict()),
 assessments:z.array(z.object({document:recoveryAttributionRevisionV1,current:z.boolean()}).strict()),
}).strict().superRefine((s,ctx)=>{
 const fail=(message:string)=>ctx.addIssue({code:"custom",message});
 if(new Set(s.checked).size!==s.checked.length || new Set(s.tracked.map(l=>l.id)).size!==s.tracked.length)fail("Duplicate source");
 for(const l of s.tracked)if(l.revisionId!==s.lockedRevisionId)fail("Tracked line outside locked revision");
 if((s.checkId===null)!==(s.checkedAt===null))fail("Incomplete check source");
 const lines=new Map<string,string>(),works=new Map<string,string>();
 const ids=new Set<string>(), latest=new Map<string,typeof s.assessments[number]["document"]>();
 for(const {document:d} of s.assessments){
  if(d.tenantId!==s.tenantId||d.jobId!==s.jobId||d.lockId!==s.lockId)fail("Attribution scope mismatch");
  if(s.tracked.some(l=>l.id===d.lineId))fail("Catch line overlaps original bill");
  try {if(compareServerInstants(d.serverRecordedAt,s.lockedAt)<0)fail("Assessment before lock");}
  catch {fail("Invalid assessment/lock time");}
  if(ids.has(d.assessmentId))fail("Duplicate assessment");ids.add(d.assessmentId);
  const key=[d.caseId,d.workId,d.lineId,d.lockId].join(":");const prior=latest.get(key);
  if((lines.has(d.lineId)&&lines.get(d.lineId)!==key)||(works.has(d.workId)&&works.get(d.workId)!==key))fail("Line/work allocated to more than one subject");
  lines.set(d.lineId,key);works.set(d.workId,key);
  try {if(prior&&compareServerInstants(prior.serverRecordedAt,d.serverRecordedAt)>0)fail("Assessment time regressed");}
  catch {fail("Invalid assessment time");}
  if(d.revision!==(prior?.revision??0)+1 || d.previousAssessmentId!==(prior?.assessmentId??null))fail("Broken assessment history");
  latest.set(key,d);
 }
});
export type ValueJobSourcesV1=z.infer<typeof valueJobSourcesV1>;
const amount=z.object({pence,currency:z.literal("GBP")}).strict();
const movement=z.object({assessmentId:uuid,previousAssessmentId:uuid.nullable(),at:z.string().datetime(),
 kind:z.enum(["assessment","reassessment","reversal"]),recovered:amount,fee:exactPenceV1,yoursBeforeVatAndTax:exactPenceV1}).strict();
export const valueWindowV1=z.object({from:z.string().datetime(),toExclusive:z.string().datetime()}).strict().refine(w=>{try{return compareServerInstants(w.from,w.toExclusive)<0;}catch{return false;}});
export type ValueWindowV1=z.infer<typeof valueWindowV1>;
export const mappedValueReceiptV1=z.object({version:z.literal("mapped-value-receipt.v1"),
 label:z.literal("mapped, inspectable"),policyVersion:z.literal("reference_fee_policy_v3"),derivationVersion:z.literal("cumulative-fee.v1"),
 notice:z.literal("Illustration — proposed policy; principal only"),
 window:valueWindowV1.nullable(),sources:valueJobSourcesV1,checkedCount:z.number().int().nonnegative().nullable(),tracked:amount,trackedFee:amount,
 found:z.object({state:z.enum(["mapped","unavailable"]),recovered:amount.nullable(),fee:amount.nullable(),yoursBeforeVatAndTax:amount.nullable(),movements:z.array(movement)}).strict(),
 supplier:z.literal("unavailable"),withheld:z.literal("unavailable"),
}).strict();
export type MappedValueReceiptV1=z.infer<typeof mappedValueReceiptV1>;
const money=(n:bigint)=>amount.parse({pence:Number(n),currency:"GBP"});
/** SV-6 history is a succession of balances, never additive recoveries. Round
 * the cumulative exact principal through the same v3 kernel as SV-6. */
export function mapValueReceipt(raw:unknown,window:ValueWindowV1|null=null):MappedValueReceiptV1{
 if(window)valueWindowV1.parse(window);
 const inside=(at:string)=>!window||(compareServerInstants(at,window.from)>=0&&compareServerInstants(at,window.toExclusive)<0);
 const sources=valueJobSourcesV1.parse(raw),latest=new Map<string,{net:bigint;current:boolean}>();
 const movements:z.infer<typeof movement>[]=[];let unavailable=false, beforeNet=0n;
 for(const {document:d,current} of sources.assessments){
  const key=[d.caseId,d.workId,d.lineId,d.lockId].join(":");
  const n=BigInt(d.remainingPrincipal.numerator),den=BigInt(d.remainingPrincipal.denominator);
  if(n%den!==0n){unavailable=true;continue;}
  const net=d.assessmentOutcome==="eligible_for_review"?n/den:0n;
  const prior=latest.get(key)??{net:0n};
  const delta=net-prior.net;
  if(window&&compareServerInstants(d.serverRecordedAt,window.from)<0)beforeNet+=delta;
  if(inside(d.serverRecordedAt))movements.push({assessmentId:d.assessmentId,previousAssessmentId:d.previousAssessmentId,at:d.serverRecordedAt,
   kind:net<prior.net?"reversal":d.previousAssessmentId?"reassessment":"assessment",recovered:money(delta),
   fee:serializeExactPence(exactPence(delta,10n)),yoursBeforeVatAndTax:serializeExactPence(exactPence(delta*9n,10n))});
  latest.set(key,{net,current});
 }
 unavailable ||= !sources.foundComplete || sources.checkId===null || [...latest.values()].some(v=>!v.current);
 const net=movements.reduce((n,v)=>n+BigInt(v.recovered.pence),0n);
 const cumulativeFee=(principal:bigint)=>BigInt(calculateCumulativeFee({version:"cumulative-fee.v1",
  cumulativeQualifyingPrincipal:{numerator:principal.toString(),denominator:"1"},
  rate:{version:"fee-rate.v1",policyVersion:"reference_fee_policy_v3",numerator:"1",denominator:"10"},priorNetPostedPence:0,
  priorPolicyVersion:"reference_fee_policy_v3",compensatesDerivationId:null}).cumulativeFee.pence);
 // Job totals round once. A window is the change between rounded cumulative
 // balances, so adjacent windows reconcile even across a fractional fee share.
 const fee=cumulativeFee(beforeNet+net)-(window?cumulativeFee(beforeNet):0n);
 return mappedValueReceiptV1.parse({version:"mapped-value-receipt.v1",label:"mapped, inspectable",policyVersion:"reference_fee_policy_v3",derivationVersion:"cumulative-fee.v1",
  notice:"Illustration — proposed policy; principal only",window,sources,checkedCount:sources.checkId?(sources.checkedAt&&inside(sources.checkedAt)?sources.checked.length:0):null,
  tracked:money(sources.tracked.filter(l=>inside(l.at)).reduce((n,l)=>n+BigInt(l.netPence),0n)),trackedFee:money(0n),
  found:{state:unavailable?"unavailable":"mapped",recovered:unavailable?null:money(net),fee:unavailable?null:money(fee),yoursBeforeVatAndTax:unavailable?null:money(net-fee),movements},supplier:"unavailable",withheld:"unavailable"});
}

export const mappedBusinessSummaryV1=z.object({
 sourceJobIds:z.array(uuid),checkedCount:z.number().int().safe().nonnegative().nullable(),
 tracked:amount,trackedFee:amount,recovered:amount.nullable(),fee:amount.nullable(),yoursBeforeVatAndTax:amount.nullable(),
}).strict();
/** Sum only the already-mapped job receipts; never allocate a subscription. */
export function mapBusinessValueSummary(receipts:readonly MappedValueReceiptV1[]){
 const jobs=receipts.map(r=>mappedValueReceiptV1.parse(r));
 if(new Set(jobs.map(r=>r.sources.jobId)).size!==jobs.length||new Set(jobs.map(r=>r.sources.tenantId)).size>1)throw new Error("VALUE_SUMMARY_SCOPE_MISMATCH");
 const sum=(values:readonly {pence:number}[])=>money(values.reduce((n,v)=>n+BigInt(v.pence),0n));
 const complete=jobs.every(r=>r.found.state==="mapped");
 return mappedBusinessSummaryV1.parse({sourceJobIds:jobs.map(r=>r.sources.jobId),checkedCount:jobs.some(r=>r.checkedCount===null)?null:jobs.reduce((n,r)=>n+(r.checkedCount??0),0),
  tracked:sum(jobs.map(r=>r.tracked)),trackedFee:money(0n),recovered:complete?sum(jobs.map(r=>r.found.recovered!)):null,
  fee:complete?sum(jobs.map(r=>r.found.fee!)):null,yoursBeforeVatAndTax:complete?sum(jobs.map(r=>r.found.yoursBeforeVatAndTax!)):null});
}
