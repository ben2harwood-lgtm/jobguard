import { z } from "zod";
import { compareServerInstants } from "./enterprise-domain/contracts.js";
import { mapValueReceipt, mappedValueReceiptV1, mapBusinessValueSummary, mappedBusinessSummaryV1, valueJobSourcesV1, type ValueWindowV1 } from "./value-source-receipt.js";
import { MAX_MONEY_PENCE } from "./money.js";

const uuid=z.string().uuid().toLowerCase();
const pence=z.number().int().safe().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE);
const money=z.object({pence,currency:z.literal("GBP")}).strict();
const balance=z.object({tenantId:uuid,jobId:uuid,derivationId:uuid,revision:z.number().int().positive(),at:z.string().datetime(),
 recovered:money,fee:money,allocationIds:z.array(uuid).min(1),statementHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const categorySources=z.object({reason:z.string().min(1).nullable(),balances:z.array(balance)}).strict().superRefine((s,ctx)=>{
 const ids=new Set<string>();
 for(const [i,b] of s.balances.entries()){
  const previous=s.balances[i-1];
  if(ids.has(b.derivationId)||b.revision!==(previous?.revision??0)+1||new Set(b.allocationIds).size!==b.allocationIds.length
   ||b.recovered.pence<0||b.fee.pence<0||b.fee.pence>b.recovered.pence
   ||(previous&&compareServerInstants(previous.at,b.at)>0))ctx.addIssue({code:"custom",message:"Invalid derivation history"});
  ids.add(b.derivationId);
 }
 if(s.reason===null&&!s.balances.length)ctx.addIssue({code:"custom",message:"Missing derivation sources"});
});
export const valueJobSourcesV2=z.object({base:valueJobSourcesV1,supplier:categorySources,withheld:categorySources}).strict().superRefine((s,ctx)=>{
 const balances=s.supplier.balances.concat(s.withheld.balances);
 for(const b of balances)if(b.tenantId!==s.base.tenantId||b.jobId!==s.base.jobId)ctx.addIssue({code:"custom",message:"Derivation scope mismatch"});
 const ids=balances.map(b=>b.derivationId);
 if(new Set(ids).size!==ids.length)ctx.addIssue({code:"custom",message:"Derivation counted in multiple categories"});
 const supplierAllocations=new Set(s.supplier.balances.flatMap(b=>b.allocationIds));
 if(s.withheld.balances.some(b=>b.allocationIds.some(id=>supplierAllocations.has(id))))ctx.addIssue({code:"custom",message:"Allocation counted in multiple categories"});
});
const category=z.object({state:z.enum(["mapped","unavailable"]),reason:z.string().nullable(),recovered:money.nullable(),fee:money.nullable(),yoursBeforeVatAndTax:money.nullable(),
 movements:z.array(z.object({derivationId:uuid,at:z.string().datetime(),kind:z.enum(["assessment","reassessment","reversal"]),recovered:money,fee:money,yoursBeforeVatAndTax:money}).strict())}).strict();
export const mappedValueReceiptV2=mappedValueReceiptV1.extend({version:z.literal("mapped-value-receipt.v2"),sources:valueJobSourcesV2,supplier:category,withheld:category});
export type MappedValueReceiptV2=z.infer<typeof mappedValueReceiptV2>;
export const mappedValueReceipt=z.union([mappedValueReceiptV1,mappedValueReceiptV2]);
export type MappedValueReceipt=z.infer<typeof mappedValueReceipt>;
const amount=(n:bigint)=>money.parse({pence:Number(n),currency:"GBP"});
function mapCategory(s:z.infer<typeof categorySources>,window:ValueWindowV1|null):z.infer<typeof category>{
 const movements:z.infer<typeof category>["movements"]=[];
 for(const [i,b] of s.balances.entries()){
  const prior=s.balances[i-1];
  const net=BigInt(b.recovered.pence)-BigInt(prior?.recovered.pence??0),fee=BigInt(b.fee.pence)-BigInt(prior?.fee.pence??0);
  if(window&&(compareServerInstants(b.at,window.from)<0||compareServerInstants(b.at,window.toExclusive)>=0))continue;
  movements.push({derivationId:b.derivationId,at:b.at,kind:net<0n||fee<0n?"reversal":prior?"reassessment":"assessment",recovered:amount(net),fee:amount(fee),yoursBeforeVatAndTax:amount(net-fee)});
 }
 const net=movements.reduce((n,m)=>n+BigInt(m.recovered.pence),0n),fee=movements.reduce((n,m)=>n+BigInt(m.fee.pence),0n);
 return {state:s.reason?"unavailable":"mapped",reason:s.reason,recovered:s.reason?null:amount(net),fee:s.reason?null:amount(fee),yoursBeforeVatAndTax:s.reason?null:amount(net-fee),movements};
}
/** Stored v3 balances determine fees; this projection never computes a new charge. */
export function mapValueReceiptV2(raw:unknown,window:ValueWindowV1|null=null):MappedValueReceiptV2{
 const sources=valueJobSourcesV2.parse(raw),base=mapValueReceipt(sources.base,window);
 return mappedValueReceiptV2.parse({...base,version:"mapped-value-receipt.v2",sources,supplier:mapCategory(sources.supplier,window),withheld:mapCategory(sources.withheld,window)});
}
export function mapCurrentValueReceipt(raw:unknown,window:ValueWindowV1|null=null):MappedValueReceipt{
 return typeof raw==="object"&&raw!==null&&"base" in raw?mapValueReceiptV2(raw,window):mapValueReceipt(raw,window);
}
export const receiptBaseSources=(r:MappedValueReceipt)=>r.version==="mapped-value-receipt.v2"?r.sources.base:r.sources;
const summaryCategory=category.omit({movements:true});
export const mappedBusinessSummaryV2=mappedBusinessSummaryV1.extend({supplier:summaryCategory,withheld:summaryCategory});
export const mappedBusinessSummary=z.union([mappedBusinessSummaryV2,mappedBusinessSummaryV1]);
export function mapCurrentBusinessValueSummary(receipts:readonly MappedValueReceipt[]){
 const base=mapBusinessValueSummary(receipts.map(r=>r.version==="mapped-value-receipt.v2"?mapValueReceipt(r.sources.base,r.window):r));
 if(receipts.every(r=>r.version==="mapped-value-receipt.v1"))return base;
 const summarize=(key:"supplier"|"withheld")=>{
  const sections=receipts.map(r=>r.version==="mapped-value-receipt.v2"?r[key]:null);
  const complete=sections.every(s=>s?.state==="mapped");
  const sum=(key:"recovered"|"fee"|"yoursBeforeVatAndTax")=>complete?amount(sections.reduce((n,s)=>n+BigInt(s![key]!.pence),0n)):null;
  return {state:complete?"mapped":"unavailable",reason:complete?null:"Some job sources are unavailable",recovered:sum("recovered"),fee:sum("fee"),yoursBeforeVatAndTax:sum("yoursBeforeVatAndTax")};
 };
 return mappedBusinessSummaryV2.parse({...base,supplier:summarize("supplier"),withheld:summarize("withheld")});
}
