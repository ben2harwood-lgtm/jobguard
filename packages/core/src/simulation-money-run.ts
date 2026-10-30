import { z } from "zod";
import { sha256 } from "./evidence-pack.js";
import { exactPence, exactPenceInputV1, parseExactPence, sumExactPence, serializeExactPence } from "./cumulative-fee.js";
const id=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/u);
const amount=z.union([z.number().int().safe(),z.string().regex(/^-?\d+$/u)]);
const row=<T extends z.ZodRawShape>(shape:T)=>z.object(shape).passthrough();
const rows=<T extends z.ZodType>(schema:T)=>z.array(schema).max(10000);
const identity={id};
export const simulationMoneySnapshotV1=z.object({
 version:z.literal("simulation-money-snapshot.v1"),tenantId:id,jobId:id,
 practice_feed_event:rows(row({...identity,event_id:z.string(),movement_key:z.string(),state:z.enum(["pending","settled","possible_duplicate"]),identity:z.enum(["identified","unidentified"])})),
 practice_feed_receipt_match:rows(row({...identity,payment_id:id,movement_key:z.string()})),
 practice_feed_command:rows(row({...identity,action:z.string(),movement_key:z.string().nullable()})),
 customer_invoice:rows(row({...identity,total_pence:amount})),
 customer_credit_note:rows(row({...identity,invoice_id:id,amount_pence:amount})),
 customer_payment:rows(row({...identity,invoice_id:id,amount_pence:amount})),
 customer_payment_reversal:rows(row({...identity,payment_id:id})),
 receipt_allocation_fact_revision:rows(row({...identity,payment_id:id,direction:z.enum(["receipt","reversal"])})),
 receipt_allocation_fact_source:rows(row({...identity,allocation_revision_id:id,payment_id:id,invoice_id:id})),
 receipt_allocation_fact_line:rows(row({...identity,source_id:id,net_numerator:z.string(),net_denominator:z.string(),gross_numerator:z.string(),gross_denominator:z.string()})),
 stored_receipt_case_allocation:rows(row({...identity,fact_line_id:id,net_numerator:z.string(),net_denominator:z.string()})),
 success_fee_derivation:rows(row({...identity,revision:z.number().int(),fee_pence:amount,delta_pence:amount})),
 success_fee_journal:rows(row({...identity,derivation_id:id,amount_pence:amount})),
 success_fee_journal_line:rows(row({journal_id:id,side:z.enum(["debit","credit"]),amount_pence:amount})),
 platform_fee_statement:rows(row({...identity,document_hash:hash})),
 platform_fee_attempt:rows(row({...identity,statement_id:id,kind:z.enum(["collection","refund"]),amount_pence:amount})),
 platform_fee_attempt_event:rows(row({attempt_id:id,revision:z.number().int(),state:z.enum(["pending","outcome_unknown","settled","definite_failure"])})),
 subscription_period:rows(row({...identity,principal_pence:amount})),
 subscription_period_line:rows(row({period_id:id,line_key:z.string(),amount_pence:amount})),
 platform_statement:rows(row({...identity,period_id:id,amount_pence:amount})),
 platform_statement_line:rows(row({statement_id:id,period_id:id,line_key:z.string(),amount_pence:amount})),
 subscription_simulated_work:rows(row({...identity,statement_id:id,amount_pence:amount})),
 subscription_simulated_result:rows(row({...identity,work_id:id,outcome:z.enum(["redirect","settled","outcome_unknown","failed"])})),
 liveFee:z.union([z.null(),z.object({unavailable:z.literal(true)}).strict(),z.object({feePence:amount,qualifyingPrincipal:exactPenceInputV1}).passthrough()]),
}).strict();
export const simulationMoneyCommandV1=z.discriminatedUnion("action",[
 z.object({version:z.literal("simulation-money-command.v1"),commandId:id,action:z.literal("run")}).strict(),
 z.object({version:z.literal("simulation-money-command.v1"),commandId:id,action:z.enum(["read","review","restore"]),runId:id,sourceHash:hash}).strict(),
]);
/** Same canonical encoding as final_lock_canonical; snapshots are ASCII-keyed JSON with integer amounts. */
export function simulationMoneyHash(value:unknown):string {
 const canonical=(v:unknown):string=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v!==null&&typeof v==="object"?`{${Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,c])=>`${JSON.stringify(k)}:${canonical(c)}`).join(",")}}`:JSON.stringify(v);
 return sha256(canonical(value));
}
const n=(value:unknown)=>BigInt(amount.parse(value));
const number=(value:bigint)=>{const result=Number(value);if(!Number.isSafeInteger(result))throw new Error("MONEY_TRAIL_MAGNITUDE");return result;};
type Book="customer"|"success_fee"|"subscription";
/** Deterministic analysis of saved server rows. No settlement, repair, allocation or authorization. */
export function reconcileSimulationMoney(raw:unknown){
 const s=simulationMoneySnapshotV1.parse(raw),differences:{book:Book;code:string;sourceRefs:string[];differenceHash:string}[]=[];
 const add=(book:Book,code:string,sourceRefs:string[])=>{const detail={book,code,sourceRefs:[...sourceRefs].sort()};differences.push({...detail,differenceHash:simulationMoneyHash(detail)});};
 const sum=(rs:readonly Record<string,unknown>[],key:string)=>rs.reduce((a,r)=>a+n(r[key]),0n);
 const has=(rs:readonly Record<string,unknown>[],key:unknown)=>rs.some(r=>r.id===key);
 // Preserve duplicate rows as differences, rather than collapsing the evidence.
 for(const [table,rs] of Object.entries(s))if(Array.isArray(rs)){
  const seen=new Set<string>();for(const r of rs){const key=String(r.id??(table==="platform_fee_attempt_event"?`${r.attempt_id}/${r.revision}`:table==="success_fee_journal_line"?`${r.journal_id}/${r.account}`:`${r.statement_id??r.period_id}/${r.line_key}`));
   if(seen.has(key))add(table.startsWith("subscription")||table.startsWith("platform_statement")?"subscription":table.startsWith("customer")?"customer":"success_fee","DUPLICATE_ROW",[table,key]);seen.add(key);
  }
 }
 for(const e of s.practice_feed_event){
  const reconciled=s.practice_feed_command.some(c=>c.action==="reconcile_duplicate"&&c.movement_key===e.movement_key);
  if(e.identity==="unidentified"&&!reconciled)add("customer","UNKNOWN_FEED_EVENT",[e.id,e.event_id]);
  if(e.state==="possible_duplicate"&&!reconciled)add("customer","POSSIBLE_DUPLICATE_EVENT",[e.id,e.event_id]);
  if(e.state==="pending"&&!s.practice_feed_event.some(x=>x.movement_key===e.movement_key&&x.state==="settled"))add("customer","UNSETTLED_FEED_EVENT",[e.id,e.event_id]);
  if(e.state==="settled"&&e.movement_key.startsWith("receipt-")&&!s.practice_feed_receipt_match.some(m=>m.movement_key===e.movement_key))add("customer","ORPHAN_FEED_EVENT",[e.id,e.event_id]);
 }
 for(const m of s.practice_feed_receipt_match)if(!has(s.customer_payment,m.payment_id))add("customer","ORPHAN_FEED_MATCH",[m.id,m.payment_id]);
 for(const p of s.customer_payment)if(!has(s.customer_invoice,p.invoice_id))add("customer","ORPHAN_RECEIPT",[p.id,p.invoice_id]);
 for(const c of s.customer_credit_note)if(!has(s.customer_invoice,c.invoice_id))add("customer","ORPHAN_CREDIT",[c.id,c.invoice_id]);
 for(const r of s.customer_payment_reversal)if(!has(s.customer_payment,r.payment_id))add("customer","ORPHAN_REVERSAL",[r.id,r.payment_id]);
 let balance=0n;
 for(const i of s.customer_invoice){const payments=s.customer_payment.filter(p=>p.invoice_id===i.id&&!s.customer_payment_reversal.some(r=>r.payment_id===p.id));
  const remaining=n(i.total_pence)-sum(s.customer_credit_note.filter(c=>c.invoice_id===i.id),"amount_pence")-sum(payments,"amount_pence");balance+=remaining;
  if(remaining<0n)add("customer","NEGATIVE_INVOICE_BALANCE",[i.id]);
 }
 for(const r of s.receipt_allocation_fact_revision){
  if(!has(s.customer_payment,r.payment_id))add("customer","ORPHAN_ALLOCATION",[r.id,r.payment_id]);
  if(r.direction==="receipt"&&s.customer_payment_reversal.some(x=>x.payment_id===r.payment_id)&&!s.receipt_allocation_fact_revision.some(x=>x.payment_id===r.payment_id&&x.direction==="reversal"))add("customer","LATE_RECEIPT_REVERSAL",[r.id,r.payment_id]);
 }
 for(const src of s.receipt_allocation_fact_source)if(!has(s.receipt_allocation_fact_revision,src.allocation_revision_id)||!has(s.customer_invoice,src.invoice_id))add("customer","ORPHAN_ALLOCATION_SOURCE",[src.id]);
 for(const l of s.receipt_allocation_fact_line)if(!has(s.receipt_allocation_fact_source,l.source_id))add("customer","ORPHAN_ALLOCATION_LINE",[l.id,l.source_id]);
 for(const src of s.receipt_allocation_fact_source){
  const payment=s.customer_payment.find(p=>p.id===src.payment_id),revision=s.receipt_allocation_fact_revision.find(r=>r.id===src.allocation_revision_id);
  const lines=s.receipt_allocation_fact_line.filter(l=>l.source_id===src.id);
  const gross=sumExactPence(lines.map(l=>parseExactPence({numerator:l.gross_numerator,denominator:l.gross_denominator})));
  if(payment&&(gross.numerator>n(payment.amount_pence)*gross.denominator||gross.numerator< -n(payment.amount_pence)*gross.denominator))add("customer","ALLOCATION_EXCEEDS_RECEIPT",[src.id,payment.id]);
  if(payment&&payment.invoice_id!==src.invoice_id)add("customer","CROSS_INVOICE_ALLOCATION",[src.id,payment.id]);
  if(revision&&((revision.direction==="receipt"&&gross.numerator<0n)||(revision.direction==="reversal"&&gross.numerator>0n)))add("customer","ALLOCATION_DIRECTION_MISMATCH",[src.id,revision.id]);
 }
 for(const a of s.stored_receipt_case_allocation){const l=s.receipt_allocation_fact_line.find(l=>l.id===a.fact_line_id);
  if(!l)add("success_fee","ORPHAN_CASE_ALLOCATION",[a.id,a.fact_line_id]);
  else if(BigInt(l.net_numerator)*BigInt(a.net_denominator)!==BigInt(a.net_numerator)*BigInt(l.net_denominator))add("success_fee","CASE_ALLOCATION_MISMATCH",[a.id,l.id]);
 }
 const posted=sum(s.success_fee_journal,"amount_pence");
 if(s.liveFee===null||"unavailable" in s.liveFee)add("success_fee","CURRENT_ELIGIBILITY_UNAVAILABLE",["approved attribution and fee derivation"]);
 else if(posted!==n(s.liveFee.feePence))add("success_fee","FEE_COMPENSATION_REQUIRED",s.success_fee_journal.map(j=>j.id));
 if(s.customer_invoice.length===0)add("customer","CUSTOMER_INVOICE_MISSING",[s.jobId]);
 if(s.receipt_allocation_fact_line.length===0)add("customer","RECEIPT_LINE_ALLOCATION_MISSING",[s.jobId]);
 if(s.stored_receipt_case_allocation.length===0)add("success_fee","CASE_ALLOCATION_MISSING",[s.jobId]);
 for(const d of s.success_fee_derivation)if(sum(s.success_fee_journal.filter(j=>j.derivation_id===d.id),"amount_pence")!==n(d.delta_pence))add("success_fee","DERIVATION_JOURNAL_MISMATCH",[d.id]);
 for(const j of s.success_fee_journal){const lines=s.success_fee_journal_line.filter(l=>l.journal_id===j.id);
  if(!has(s.success_fee_derivation,j.derivation_id))add("success_fee","ORPHAN_JOURNAL",[j.id]);
  const magnitude=n(j.amount_pence)<0n?-n(j.amount_pence):n(j.amount_pence);
  if(lines.length!==2||sum(lines.filter(l=>l.side==="debit"),"amount_pence")!==magnitude||sum(lines.filter(l=>l.side==="credit"),"amount_pence")!==magnitude)add("success_fee","UNBALANCED_JOURNAL",[j.id]);
 }
 let collected=0n,refunded=0n;
 for(const e of s.platform_fee_attempt_event)if(!has(s.platform_fee_attempt,e.attempt_id))add("success_fee","ORPHAN_EVENT",[e.attempt_id,String(e.revision)]);
 for(const a of s.platform_fee_attempt){
  if(!has(s.platform_fee_statement,a.statement_id))add("success_fee","ORPHAN_ATTEMPT",[a.id,a.statement_id]);
  const history=s.platform_fee_attempt_event.filter(e=>e.attempt_id===a.id).sort((a,b)=>a.revision-b.revision),latest=history.at(-1);
  if(!latest)add("success_fee","MISSING_EVENT",[a.id]);
  if(latest?.state==="outcome_unknown"||latest?.state==="pending")add("success_fee",latest.state==="pending"?"UNSETTLED_EVENT":"OUTCOME_UNKNOWN",[a.id]);
  history.forEach((e,i)=>{if(e.revision!==i+1||(i>0&&["settled","definite_failure"].includes(history[i-1]!.state)))add("success_fee","LATE_OR_INVALID_EVENT",[a.id,String(e.revision)]);});
  if(latest?.state==="settled"){if(a.kind==="collection")collected+=n(a.amount_pence);else refunded+=n(a.amount_pence);}
 }
 if(refunded>collected)add("success_fee","REFUND_EXCEEDS_SETTLED",s.platform_fee_attempt.map(a=>a.id));
 if(collected-refunded!==posted)add("success_fee","COLLECTION_POSTING_MISMATCH",s.platform_fee_attempt.map(a=>a.id));
 let subscriptionSettled=0n;
 for(const result of s.subscription_simulated_result)if(!has(s.subscription_simulated_work,result.work_id))add("subscription","ORPHAN_EVENT",[result.id,result.work_id]);
 for(const work of s.subscription_simulated_work){
  if(!has(s.platform_statement,work.statement_id))add("subscription","ORPHAN_WORK",[work.id,work.statement_id]);
  const results=s.subscription_simulated_result.filter(r=>r.work_id===work.id);
  if(results.some(r=>r.outcome==="settled"))subscriptionSettled+=n(work.amount_pence);
  else if(!results.some(r=>r.outcome==="failed"))add("subscription","OUTCOME_UNKNOWN",[work.id]);
 }
 for(const p of s.subscription_period){const statements=s.platform_statement.filter(x=>x.period_id===p.id);
  if(sum(s.subscription_period_line.filter(l=>l.period_id===p.id),"amount_pence")!==n(p.principal_pence)||statements.length!==1||sum(statements,"amount_pence")!==n(p.principal_pence))add("subscription","PERIOD_LINE_MISMATCH",[p.id]);
  const settled=s.subscription_simulated_work.filter(w=>statements.some(x=>x.id===w.statement_id)&&s.subscription_simulated_result.some(r=>r.work_id===w.id&&r.outcome==="settled"));
  if(sum(settled,"amount_pence")!==n(p.principal_pence))add("subscription","SETTLEMENT_MISMATCH",[p.id,...settled.map(w=>w.id)]);
 }
 for(const st of s.platform_statement)if(!has(s.subscription_period,st.period_id)||sum(s.platform_statement_line.filter(l=>l.statement_id===st.id),"amount_pence")!==n(st.amount_pence))add("subscription","STATEMENT_LINE_MISMATCH",[st.id]);
 differences.sort((a,b)=>a.differenceHash.localeCompare(b.differenceHash));
 const eligible=s.liveFee!==null&&!("unavailable" in s.liveFee)?s.liveFee.qualifyingPrincipal:null;
 const yoursBeforeTax=eligible?serializeExactPence(sumExactPence([parseExactPence(eligible),exactPence(-posted)])):null;
 const report={version:"simulation-money-report.v1" as const,label:differences.length?"Review needed" as const:"Records match within this simulation" as const,unresolvedDifferenceCount:differences.length,
  customer:{label:"Customer book",invoiceBalancePence:number(balance)},successFee:{label:"Success-fee book",eligibleNet:eligible,yoursBeforeTax,postedPence:number(posted),collectedPence:number(collected),refundedPence:number(refunded),retainedPence:number(collected-refunded)},
  subscription:{label:"Subscription book",principalPence:number(sum(s.subscription_period,"principal_pence")),settledPence:number(subscriptionSettled)},differences,realExternalActions:0 as const};
 return {...report,reportHash:simulationMoneyHash(report)};
}
export type SimulationMoneyReport=ReturnType<typeof reconcileSimulationMoney>;
const signedPence=z.number().int().safe();
const reportV1=z.object({
 version:z.literal("simulation-money-report.v1"),label:z.enum(["Review needed","Records match within this simulation"]),unresolvedDifferenceCount:z.number().int().nonnegative(),
 customer:z.object({label:z.literal("Customer book"),invoiceBalancePence:signedPence}).strict(),
 successFee:z.object({label:z.literal("Success-fee book"),eligibleNet:exactPenceInputV1.nullable(),yoursBeforeTax:exactPenceInputV1.nullable(),postedPence:signedPence,collectedPence:signedPence,refundedPence:signedPence,retainedPence:signedPence}).strict(),
 subscription:z.object({label:z.literal("Subscription book"),principalPence:signedPence,settledPence:signedPence}).strict(),
 differences:z.array(z.object({book:z.enum(["customer","success_fee","subscription"]),code:z.string().min(1),sourceRefs:z.array(z.string()),differenceHash:hash}).strict()),realExternalActions:z.literal(0),reportHash:hash,
}).strict();
export const simulationMoneyRunResultV1=z.object({runId:id,jobId:id,sourceHash:hash,snapshot:simulationMoneySnapshotV1,paused:z.literal(true),report:reportV1}).strict();
