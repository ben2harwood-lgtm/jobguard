import { z } from "zod";
import { calculateCumulativeFee, exactPence, exactPenceInputV1, parseExactPence, serializeExactPence, sumExactPence, type ExactPence } from "./cumulative-fee.js";
import { sha256 } from "./evidence-pack.js";
import { MAX_MONEY_PENCE, moneyFromBigInt } from "./money.js";
import { feeCollectionStateV1 } from "./fee-collection.js";

export class MoneyTrailError extends Error {
 constructor(readonly code: "INVALID_MONEY_TRAIL_REFERENCE" | "MONEY_TRAIL_FORBIDDEN" | "MONEY_TRAIL_SOURCE_UNAVAILABLE" = "INVALID_MONEY_TRAIL_REFERENCE") { super(code); this.name="MoneyTrailError"; }
}
// Reference policy registry: a version selects terms; callers cannot override its rate.
const referenceFeePolicies = {
 reference_fee_policy_v3: {version:"fee-rate.v1" as const,policyVersion:"reference_fee_policy_v3",numerator:"1",denominator:"10"},
};
const key=z.string().min(1).max(200);
const hash=z.string().regex(/^[a-f0-9]{64}$/u);
export const moneyTrailFamilies=["customer","allocations","eligibility","fee_postings","fee_statements","fee_events","subscription"] as const;
const fact=z.object({
 id:key,revision:key,hash,
 kind:z.enum(["invoice","credit","receipt","receipt_reversal","eligible_net","fee_posting","subscription_line","subscription_settlement"]),
 amount:exactPenceInputV1,periodId:key.optional(),
}).strict();
const event=z.object({
 id:key,effectKey:key,kind:z.enum(["collection","refund"]),state:feeCollectionStateV1,
 principal:z.object({pence:z.number().int().safe().positive().max(MAX_MONEY_PENCE),currency:z.literal("GBP")}).strict(),
 sourceId:key,originalCollectionId:key.nullable(),receivedAfterCheckpoint:z.boolean(),awaitingPredecessor:z.boolean(),
}).strict();
/** Supplied reference data only. No network, authorization, source gathering or allocator. */
export const moneyTrailReferenceV1=z.object({
 version:z.literal("money-trail-reference.v1"),policyVersion:z.enum(["reference_fee_policy_v3"]).default("reference_fee_policy_v3"),environment:z.literal("synthetic_demo"),tenantId:z.string().uuid(),jobId:z.string().uuid(),
 families:z.array(z.object({family:z.enum(moneyTrailFamilies),version:key,status:z.enum(["available","missing","read_failed","unsupported"])}).strict()).max(moneyTrailFamilies.length),
 facts:z.array(fact).max(10_000),events:z.array(event).max(10_000),
}).strict();
type Fact=z.infer<typeof fact>;
type Event=z.infer<typeof event>;
type Book="customer"|"success_fee"|"subscription"|"coverage";
type Difference={code:string;book:Book;sourceRefs:string[];expected:ReturnType<typeof serializeExactPence>|null;observed:ReturnType<typeof serializeExactPence>|null;difference:ReturnType<typeof serializeExactPence>|null;differenceHash:string};
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
/** Versioned canonical JSON: object keys sorted by code point, arrays sorted by their named identities by callers. */
function canonical(value:unknown):string {
 if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
 if(value!==null&&typeof value==="object")return `{${Object.entries(value).filter(([,child])=>child!==undefined).sort(([a],[b])=>order(a,b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
 return JSON.stringify(value);
}
const digest=(tag:string,value:unknown)=>sha256(`${tag}\n${canonical(value)}`);
const normalized=(raw:z.infer<typeof exactPenceInputV1>)=>{const n=parseExactPence(raw);return serializeExactPence(exactPence(n.numerator,n.denominator));};
function checked(raw:unknown){
 const parsed=moneyTrailReferenceV1.safeParse(raw);
 if(!parsed.success)throw new MoneyTrailError();
 const input=parsed.data;
 if(new Set(input.families.map(f=>f.family)).size!==input.families.length || new Set(input.facts.map(f=>f.id)).size!==input.facts.length)throw new MoneyTrailError();
 for(const f of input.facts){
  const n=parseExactPence(f.amount);
  if((f.kind.startsWith("subscription_") !== (f.periodId!==undefined)) || (f.kind!=="fee_posting"&&n.numerator<0n) || (f.kind!=="eligible_net"&&n.numerator%n.denominator!==0n))throw new MoneyTrailError();
  f.amount=normalized(f.amount);
 }
 const ids=new Map<string,Event>();
 for(const e of input.events){
  if((e.kind==="collection")!==(e.originalCollectionId===null))throw new MoneyTrailError();
  const prior=ids.get(e.id);
  if(prior&&canonical(prior)!==canonical(e))throw new MoneyTrailError();
  ids.set(e.id,e);
 }
 input.events=[...ids.values()].sort((a,b)=>order(a.id,b.id));
 input.facts.sort((a,b)=>order(a.id,b.id));input.families.sort((a,b)=>order(a.family,b.family));
 return input;
}
/** Independent reference comparison. Availability flags and supplied facts are NOT proof of real sources.
 * Cannot persist a run, authorize a check, decide eligibility, post a delta or execute compensation.
 */
export function reconcileMoneyTrailReference(raw:unknown){
 try{return reconcile(checked(raw));}catch(error){if(error instanceof MoneyTrailError)throw error;throw new MoneyTrailError();}
}
function reconcile(input:ReturnType<typeof checked>){
 const differences:Difference[]=[];
 const add=(code:string,book:Book,refs:string[],expected:ExactPence|null=null,observed:ExactPence|null=null)=>{
  const difference=expected&&observed?serializeExactPence(sumExactPence([observed,exactPence(-expected.numerator,expected.denominator)])):null;
  if(difference)parseExactPence(difference);
  const row={code,book,sourceRefs:[...new Set(refs)].sort(order),expected:expected?serializeExactPence(expected):null,observed:observed?serializeExactPence(observed):null,difference};
  differences.push({...row,differenceHash:digest("money-trail-difference.v1",row)});
 };
 const missing=moneyTrailFamilies.filter(f=>!input.families.some(x=>x.family===f&&x.status==="available"&&x.version==="reference.v1"));
 for(const family of missing)add("SOURCE_UNAVAILABLE","coverage",[family]);
 const sum=(kinds:Fact["kind"][],period?:string)=>{
  const total=sumExactPence(input.facts.filter(f=>kinds.includes(f.kind)&&(period===undefined||f.periodId===period)).map(f=>parseExactPence(f.amount)));
  parseExactPence(serializeExactPence(total));return total;
 };
 const pence=(n:ExactPence)=>moneyFromBigInt(n.numerator/n.denominator);
 const refs=(kinds:Fact["kind"][],period?:string)=>input.facts.filter(f=>kinds.includes(f.kind)&&(period===undefined||f.periodId===period)).map(f=>f.id);
 const invoice=sum(["invoice"]),credits=sum(["credit"]),receipts=sum(["receipt"]),reversals=sum(["receipt_reversal"]);
 const balance=sumExactPence([invoice,exactPence(-credits.numerator,credits.denominator),exactPence(-receipts.numerator,receipts.denominator),reversals]);
 if(balance.numerator<0n)add("CUSTOMER_OVERPAYMENT","customer",refs(["invoice","credit","receipt","receipt_reversal"]),exactPence(0n),balance);
 const q=sum(["eligible_net"]),posted=sum(["fee_posting"]);
 // Reuse the accepted cumulative half-even kernel. J=0 computes the expected cumulative principal only.
 const expected=calculateCumulativeFee({version:"cumulative-fee.v1",rate:referenceFeePolicies[input.policyVersion],cumulativeQualifyingPrincipal:serializeExactPence(q),priorNetPostedPence:0,priorPolicyVersion:input.policyVersion,compensatesDerivationId:null}).cumulativeFee;
 if(posted.numerator!==BigInt(expected.pence)*posted.denominator)add("FEE_POSTING_MISMATCH","success_fee",refs(["eligible_net","fee_posting"]),exactPence(BigInt(expected.pence)),posted);
 const byEffect=new Map<string,Event[]>();
 for(const e of input.events){const group=byEffect.get(e.effectKey)??[];group.push(e);byEffect.set(e.effectKey,group);}
 const blocked=new Set<string>();
 for(const group of byEffect.values())if(group.length>1){add("DUPLICATE_EVENT","success_fee",group.map(e=>e.id));for(const e of group)blocked.add(e.id);}
 const sourceIds=new Set(input.facts.filter(f=>f.kind==="fee_posting").map(f=>f.id));
 for(const e of input.events){
  if(!sourceIds.has(e.sourceId)){add("ORPHAN_EVENT","success_fee",[e.id,e.sourceId]);blocked.add(e.id);}
  if(e.receivedAfterCheckpoint)add("LATE_AFTER_CHECKPOINT","success_fee",[e.id]);
  if(e.awaitingPredecessor){add("AWAITING_PREDECESSOR","success_fee",[e.id]);blocked.add(e.id);}
  if(e.state==="outcome_unknown")add("OUTCOME_UNKNOWN","success_fee",[e.id]);
  if(e.state==="pending"||e.state==="accepted")add("UNSETTLED_EVENT","success_fee",[e.id]);
 }
 const settled=input.events.filter(e=>e.state==="settled"&&!blocked.has(e.id));
 const collections=new Map(settled.filter(e=>e.kind==="collection").map(e=>[e.id,e]));
 const refunds=settled.filter(e=>e.kind==="refund");
 const invalid=new Set<string>();
 for(const e of refunds){
  const original=collections.get(e.originalCollectionId!);
  const total=refunds.filter(r=>r.originalCollectionId===e.originalCollectionId).reduce((n,r)=>n+BigInt(r.principal.pence),0n);
  if(!original||total>BigInt(original.principal.pence)){add("INVALID_REFUND","success_fee",[e.id,e.originalCollectionId!]);invalid.add(e.id);}
 }
 const collected=[...collections.values()].reduce((n,e)=>n+BigInt(e.principal.pence),0n);
 const refunded=refunds.filter(e=>!invalid.has(e.id)).reduce((n,e)=>n+BigInt(e.principal.pence),0n);
 const periods=[...new Set(input.facts.filter(f=>f.periodId!==undefined).map(f=>f.periodId!))].sort(order);
 for(const period of periods){const line=sum(["subscription_line"],period),paid=sum(["subscription_settlement"],period);
  if(line.numerator*paid.denominator!==paid.numerator*line.denominator)add("SUBSCRIPTION_MISMATCH","subscription",[period,...refs(["subscription_line","subscription_settlement"],period)],line,paid);
 }
 const customer={invoiceBalance:pence(balance)};
 const successFee={eligibleNet:serializeExactPence(q),expectedPrincipal:expected,postedPrincipal:pence(posted),collectedPrincipal:moneyFromBigInt(collected),refundedPrincipal:moneyFromBigInt(refunded),retainedPrincipal:moneyFromBigInt(collected-refunded)};
 const subscription={periodIds:periods,chargedPrincipal:pence(sum(["subscription_line"])),settledPrincipal:pence(sum(["subscription_settlement"]))};
 differences.sort((a,b)=>order(a.differenceHash,b.differenceHash));
 const sourceHash=digest("money-trail-source.v1",input);
 const result={version:"money-trail-reference-result.v1" as const,environment:input.environment,referenceOnly:true as const,authoritativeSourceVerification:false as const,productionEnabled:false as const,realExternalActions:0 as const,
  complete:missing.length===0,label:differences.length===0?"Records match within this simulation" as const:"Review needed" as const,unresolvedDifferenceCount:differences.length,
  sourceHash,customer,successFee,subscription,differences};
 return {...result,reportHash:digest("money-trail-report.v1",result)};
}
/** Availability only, never an empty completed report. No run command is authorized by this schema. */
export const moneyTrailAvailabilityV1=z.object({
 version:z.literal("money-trail-availability.v1"),jobId:z.string().uuid(),environment:z.literal("synthetic_demo"),state:z.literal("dependency_bound"),
 dependency:z.literal("accepted_money_trail_source_and_run_authority"),productionEnabled:z.literal(false),realExternalActions:z.literal(0),
}).strict();
