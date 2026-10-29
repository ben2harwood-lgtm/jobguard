import { exactPence,parseExactPence,serializeExactPence,sumExactPence,compareExactPence,type ExactPence } from "@jobguard/core";
import type { BillingProjection } from "./contractor-billing-repository.js";
export type ReconciliationInput={
 approved:{extra_id:string;net_pence:string}[];
 exports:{id:string;approved_net_pence:string;alert_days:number;overdue:boolean}[];
 matches:{export_line_id:string;source:string;invoice_number:string;external_invoice_line_id:string}[];
 invoices:{source:string;invoiceNumber:string;projection:BillingProjection}[];
};
const minus=(a:ExactPence,b:ExactPence)=>sumExactPence([a,exactPence(-b.numerator,b.denominator)]);
/** Display-only exact drill-down; never changes facts, extra states or fee entitlement. */
export function contractorBillingReconciliation(input:ReconciliationInput){
 const approvedNotExported=input.approved.map(r=>({extraId:r.extra_id,net:serializeExactPence(exactPence(BigInt(r.net_pence)))}));
 const unbilledExports:{exportLineId:string;net:ReturnType<typeof serializeExactPence>;alertDays:number;overdue:boolean}[]=[];
 const billedDifferences:{exportLineId:string;approvedNet:ReturnType<typeof serializeExactPence>;billedNet:ReturnType<typeof serializeExactPence>;difference:ReturnType<typeof serializeExactPence>}[]=[];
 for(const e of input.exports){
  const seen=new Set<string>(),values:ExactPence[]=[];
  for(const match of input.matches.filter(m=>m.export_line_id===e.id)){
   const identity=JSON.stringify([match.source,match.invoice_number,match.external_invoice_line_id]);if(seen.has(identity))continue;seen.add(identity);
   const line=input.invoices.find(i=>i.source===match.source&&i.invoiceNumber===match.invoice_number)?.projection.lines.find(l=>l.lineId===match.external_invoice_line_id);
   if(line)values.push(minus(parseExactPence(line.billedNet),parseExactPence(line.creditedNet)));
  }
  const billed=sumExactPence(values),approved=exactPence(BigInt(e.approved_net_pence));
  if(billed.numerator===0n)unbilledExports.push({exportLineId:e.id,net:serializeExactPence(approved),alertDays:e.alert_days,overdue:e.overdue});
  if(compareExactPence(billed,approved)!==0)billedDifferences.push({exportLineId:e.id,approvedNet:serializeExactPence(approved),billedNet:serializeExactPence(billed),difference:serializeExactPence(minus(billed,approved))});
 }
 const credits=input.invoices.flatMap(i=>i.projection.lines.filter(l=>parseExactPence(l.creditedNet).numerator>0n).map(l=>({source:i.source,invoiceNumber:i.invoiceNumber,lineId:l.lineId,net:l.creditedNet})));
 const rejections=input.invoices.flatMap(i=>i.projection.lines.filter(l=>l.rejected).map(l=>({source:i.source,invoiceNumber:i.invoiceNumber,lineId:l.lineId,net:l.billedNet})));
 const excessPayment=input.invoices.flatMap(i=>i.projection.lines.flatMap(l=>{const excess=minus(parseExactPence(l.paidNet),minus(parseExactPence(l.billedNet),parseExactPence(l.creditedNet)));return excess.numerator>0n?[{source:i.source,invoiceNumber:i.invoiceNumber,lineId:l.lineId,net:serializeExactPence(excess)}]:[];}));
 const unmatchedFacts=input.invoices.flatMap(i=>i.projection.held.map(h=>({source:i.source,invoiceNumber:i.invoiceNumber,...h})));
 const total=(rows:{net:ReturnType<typeof serializeExactPence>}[])=>serializeExactPence(sumExactPence(rows.map(r=>parseExactPence(r.net))));
 return {approvedNotExported,unbilledExports,billedDifferences,credits,rejections,excessPayment,unmatchedFacts,totals:{approvedNotExported:total(approvedNotExported),unbilledExports:total(unbilledExports),billedDifference:serializeExactPence(sumExactPence(billedDifferences.map(r=>parseExactPence(r.difference)))),credits:total(credits),rejections:total(rejections),excessPayment:total(excessPayment)}};
}
