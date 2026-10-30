"use client";
import { useEffect,useState } from "react";
import { paymentFeeViewV1,parseExactPence,divideRounded,type PaymentFeeCommand } from "@jobguard/core";
import type { z } from "zod";
type View=z.infer<typeof paymentFeeViewV1>;
const pounds=(p:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(p/100);
export const paymentFeeDisplayPence=(p:{numerator:string;denominator:string},subtractPence=0)=>{const v=parseExactPence(p);return Number(divideRounded(v.numerator-BigInt(subtractPence)*v.denominator,v.denominator,"half_even"));};
const stateText={awaiting_approval:"Awaiting your approval",approved:"Approved for simulation",disputed:"Paused during dispute",source_changed:"Paused: receipt or evidence changed",approval_expired:"Approval expired",approval_revoked:"Approval revoked"};
// Finish receipt reads even when a workspace navigation unmounts this panel.
// Consume refusal bodies too; an HTTP response alone is not a completed read.
export async function readPaymentFeeView(jobId:string):Promise<View>{
 const response=await fetch(`/api/jobs/${jobId}/payment-fees`,{cache:"no-store",keepalive:true});
 const body=await response.json();
 if(!response.ok)throw new Error("Receipt statements could not be loaded.");
 const data=paymentFeeViewV1.parse(body);
 if(data.jobId!==jobId)throw new Error("Receipt statements belong to another job.");
 return data;
}
export function PaymentFeeStatements({jobId}:{jobId:string}){
 const [reload,setReload]=useState(0);
 const [view,setView]=useState<View|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setView(null);setError("");
  void readPaymentFeeView(jobId).then(data=>{if(active)setView(data);}).catch(()=>{if(active)setError("Receipt statements could not be loaded.");});
  return ()=>{active=false;};
 },[jobId,reload]);
 async function command(intent:Omit<Extract<PaymentFeeCommand,{action:"prepare"}>,"version"|"commandId">|Omit<Extract<PaymentFeeCommand,{action:"approve"}>,"version"|"commandId">|Omit<Extract<PaymentFeeCommand,{action:"dispute"}>,"version"|"commandId">){
  if(busy)return;setBusy(true);setError("");
  try{
   const response=await fetch(`/api/jobs/${jobId}/payment-fees`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:"payment-fee-command.v1",commandId:crypto.randomUUID(),...intent})});
   if(!response.ok){setError("The statement could not be changed. Check the receipt, evidence and any dispute before trying again.");return;}
   const data=await readPaymentFeeView(jobId);setView(data);
  }catch{setError("The result could not be confirmed. Reload the statements before trying again.");}finally{setBusy(false);}
 }
 if(!view)return <section className="workspace-panel" aria-label="Receipt fee statements"><h2>Success fee on your payment</h2><p>Fee statements appear after the Final Check and a checked qualifying receipt.</p>{error&&<p role="alert">{error}</p>}<button onClick={()=>setReload(value=>value+1)}>Refresh fee statements</button></section>;
 return <section className="workspace-panel" aria-label="Receipt fee statements">
  <h2>Success fee on your payment</h2>
  <p>Simulation — proposed policy; principal only. Nothing is collected. Your customer’s payment is never reduced.</p>
  <p>VAT not calculated in this simulation</p>
  {view.receipts.filter(id=>!view.statements.some(s=>s.statement.paymentId===id)).map(id=><p key={id}>Allocated qualifying receipt <code>{id}</code> <button disabled={busy} onClick={()=>void command({action:"prepare",paymentId:id})}>Prepare fee statement</button></p>)}
  {view.statements.map(({statement:s,state})=><article key={s.statementId}>
   <h3>Receipt {s.paymentId}</h3>
   <dl>
    <dt>Payment received</dt><dd data-testid="payment-received">{pounds(s.paymentReceivedPence)}</dd>
    <dt>Qualifying net principal</dt><dd data-testid="payment-qualifying-net">{pounds(paymentFeeDisplayPence(s.qualifyingNet))}</dd>
    <dt>JobGuard success fee</dt><dd data-testid="payment-fee">{pounds(s.feePence)}</dd>
    <dt>Yours before VAT and tax</dt><dd data-testid="payment-yours-before-tax">{pounds(paymentFeeDisplayPence(s.qualifyingNet,s.feePence))}</dd>
   </dl>
   <p role="status">{stateText[state]}</p>
   {state==="awaiting_approval"&&<button disabled={busy} onClick={()=>void command({action:"approve",statementId:s.statementId,statementHash:s.statementHash})}>Approve this exact fee statement</button>}
   {state!=="disputed"&&<button disabled={busy} onClick={()=>void command({action:"dispute",statementId:s.statementId})}>Dispute and pause</button>}
  </article>)}
  {!view.receipts.length&&<p>No checked qualifying receipts yet.</p>}
  <button disabled={busy} onClick={()=>setReload(value=>value+1)}>Refresh fee statements</button>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
