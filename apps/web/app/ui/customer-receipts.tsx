"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { isReceiptDate, parseReceiptPounds, practiceReceiptViewV1, type PracticeReceiptView } from "@jobguard/api/customer-invoice-contracts";
import { deriveJobPaymentState } from "../lib/invoice-payment-state";
import { notifyInvoiceChanged } from "./customer-payment-status";
const gbp=(p:number)=>`GBP ${(p/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export function CustomerReceipts({jobId,invoiceId,onChanged}:{jobId:string;invoiceId:string;onChanged:()=>void}) {
 const [view,setView]=useState<PracticeReceiptView|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false),[unconfirmed,setUnconfirmed]=useState(false);
 const [amount,setAmount]=useState("500.00"),[paidOn,setPaidOn]=useState(()=>new Date().toISOString().slice(0,10)),[method,setMethod]=useState("bank_transfer"),[reference,setReference]=useState("Practice customer receipt"),[reason,setReason]=useState("Practice receipt correction");
 const writing=useRef(false);
 const base=`/api/jobs/${jobId}/customer-invoices/${invoiceId}/receipts`;
 const parse=useCallback((raw:unknown)=>{
  const value=practiceReceiptViewV1.parse(raw);
  if(value.jobId!==jobId||value.invoice.id!==invoiceId)throw new Error("WRONG_RECEIPT_RESPONSE");
  return value;
 },[jobId,invoiceId]);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  for(let i=0;i<6;i++){
   try{const r=await fetch(base,{cache:"no-store"});if(r.ok){setView(parse(await r.json()));setLoading(false);notifyInvoiceChanged(jobId);return;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,300));
  }
  setLoading(false);setError("Receipt history could not load. No balance has been invented.");
 },[base,parse,jobId]);
 useEffect(()=>{void load();},[load]);
 async function submit(path:string,body:unknown){
  if(writing.current||unconfirmed||loading)return;
  writing.current=true;setBusy(true);setError("");
  try{
   const response=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
   if(!response.ok){
    if(response.status>=500){setUnconfirmed(true);setError("The result is unknown. Check saved receipt history; do not record the same payment again.");}
    else setError(response.status===409?"This receipt command conflicts with saved history. Refresh and review it.":"The receipt request was refused. Check the amount, date, reference and saved invoice.");
    return;
   }
   setView(parse(await response.json()));notifyInvoiceChanged(jobId);onChanged();
  }catch{
   setUnconfirmed(true);setError("The result is unknown. Check saved receipt history; do not record the same payment again.");
  }finally{writing.current=false;setBusy(false);}
 }
 async function record(){
  const amountPence=parseReceiptPounds(amount);
  if(amountPence===null||!isReceiptDate(paidOn)||reference.trim().length<1||reference.trim().length>120){setError("Enter a positive amount in pounds, a valid payment date and a reference of up to 120 characters.");return;}
  await submit(base,{version:"practice-customer-receipt.record.v1",commandId:crypto.randomUUID(),paidOn,amountPence,method,reference});
 }
 async function reverse(paymentId:string){
  if(reason.trim().length<3||reason.trim().length>240){setError("Give a correction reason of 3 to 240 characters.");return;}
  await submit(`${base}/reversals`,{version:"practice-customer-receipt.reverse.v1",commandId:crypto.randomUUID(),paymentId,reason});
 }
 if(loading&&!view)return <section aria-live="polite"><h4>Record a customer receipt</h4><p>Loading customer receipts…</p></section>;
 if(!view)return <section role="alert"><h4>Record a customer receipt</h4><p>{error}</p><button onClick={()=>void load()}>Try receipt history again</button></section>;
 const status=deriveJobPaymentState([view.invoice]);
 const disabled=busy||loading||unconfirmed;
 return <section className="customer-receipts" aria-label="Customer receipts and balance history" aria-busy={busy||loading}>
  <h4>Record a customer receipt</h4>
  <p>Recorded by you in the practice sandbox — not bank-confirmed</p>
  <p>Manual receipts never become bank landings or platform settlements.</p>
  <fieldset disabled={disabled} style={{border:0,padding:0,margin:0,minWidth:0}}>
   <legend>Fictional receipt details</legend>
   <label>Amount (GBP)<input data-testid="uiwire12-receipt-amount" inputMode="decimal" maxLength={14} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label>Payment date<input data-testid="uiwire12-receipt-date" type="date" min="0001-01-01" max="9999-12-31" value={paidOn} onChange={e=>setPaidOn(e.target.value)}/></label>
   <label>Method<select data-testid="uiwire12-receipt-method" value={method} onChange={e=>setMethod(e.target.value)}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card_elsewhere">Card elsewhere</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label>
   <label>Reference<input data-testid="uiwire12-receipt-reference" value={reference} maxLength={120} onChange={e=>setReference(e.target.value)}/></label>
   <button className="primary" disabled={disabled} onClick={()=>void record()}>Record practice receipt</button>
  </fieldset>
  <dl><div><dt>Customer payment status</dt><dd data-testid="customer-payment-status">{status.paymentStatus}</dd></div><div><dt>Customer credit</dt><dd data-testid="customer-credit">{gbp(view.invoice.customerCreditPence)}</dd></div><div><dt>Eligible recovery principal</dt><dd data-testid="eligible-recovery-principal">{gbp(view.eligibleRecoveryPrincipalPence)}</dd></div><div><dt>Base credit</dt><dd data-testid="uiwire12-base-credit">{gbp(view.baseCreditPence)}</dd></div></dl>
  <h5>Balance history</h5>
  {view.receipts.length===0&&<p>No customer receipts recorded.</p>}
  {view.receipts.some(p=>!p.reversal)&&<label>Correction reason<input data-testid="uiwire12-reversal-reason" maxLength={240} disabled={disabled} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
  {view.receipts.map(p=><article key={p.id} data-testid="uiwire12-receipt-history"><p>{p.paidOn} · {gbp(p.amountPence)} · {p.method} · {p.reference}</p><p>Receipt <code>{p.id}</code></p>{p.reversal?<p>Reversed: {p.reversal.reason} · {p.reversal.reversedAt} · <code>{p.reversal.id}</code></p>:<button disabled={disabled} onClick={()=>void reverse(p.id)}>Reverse this receipt</button>}</article>)}
  {unconfirmed&&<p role="alert">Further receipt changes are paused because the last result is unknown. Read the saved history before leaving this page.</p>}
  <button type="button" disabled={busy||loading} onClick={()=>void load()}>Refresh receipt history</button>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
