"use client";
import { useCallback, useEffect, useState } from "react";
import { practiceInvoiceResponseV1, type PracticeInvoiceResponse } from "@jobguard/api/customer-invoice-contracts";
import { CustomerCreditNotes } from "./customer-credit-notes";
import { CustomerReceipts } from "./customer-receipts";
import { notifyInvoiceChanged } from "./customer-payment-status";
import { CustomerInvoicePayNow } from "./pay-now-synthetic";
const pounds=(p:number)=>`GBP ${(p/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
type LockInvoiceGuard = { code: "FINAL_ACCOUNT_LOCK_REQUIRED" | "FINAL_CHECK_NOT_COMPLETE" | "FINAL_CHECK_FAILED" | null; kind: "final" | "supplementary"; lockedRevision?:{id:string;sourceHash:string;issueBlocked:boolean} };
export function CustomerInvoices({jobId,finalAccount,lockGuard}:{jobId:string;finalAccount:{id:string;sourceHash:string;issueBlocked:boolean};lockGuard?:LockInvoiceGuard}) {
 if(lockGuard)return <LockBoundCustomerInvoices jobId={jobId} finalAccount={finalAccount} guard={lockGuard}/>;
 return <PracticeCustomerInvoices jobId={jobId} finalAccount={finalAccount}/>;
}
function PracticeCustomerInvoices({jobId,finalAccount}:{jobId:string;finalAccount:{id:string;sourceHash:string;issueBlocked:boolean}}) {
 const [view,setView]=useState<PracticeInvoiceResponse|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const load=useCallback(async(refresh=false)=>{
  if(!refresh)setLoading(true);
  setError("");
  for(let i=0;i<5;i++){
   try{
    const r=await fetch(`/api/jobs/${jobId}/customer-invoices`,{cache:"no-store"});
    if(r.ok){
     const next=practiceInvoiceResponseV1.parse(await r.json());
     if(next.jobId!==jobId)throw new Error("WRONG_JOB_RESPONSE");
     setView(next);setLoading(false);notifyInvoiceChanged(jobId);return;
    }
   }catch{}
   await new Promise(resolve=>setTimeout(resolve,250));
  }
  setError("Customer invoices could not load. Check the saved records before issuing again.");setLoading(false);
 },[jobId]);
 useEffect(()=>{void load();},[load]);
 async function issue(){
  setBusy(true);setError("");
  try{
   const r=await fetch(`/api/jobs/${jobId}/customer-invoices`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({version:"practice-customer-invoice.issue.v1",commandId:crypto.randomUUID(),finalAccountRevisionId:finalAccount.id,expectedSourceHash:finalAccount.sourceHash,recipient:"practice-customer@example.invalid",issuedOn:new Date().toISOString().slice(0,10)})});
   if(r.ok){setView(practiceInvoiceResponseV1.parse(await r.json()));notifyInvoiceChanged(jobId);}
   else setError(r.status===409?"The final account changed. Rebuild it before issuing this invoice.":"The invoice result could not be confirmed. Reload the saved records before trying again.");
  }catch{setError("The invoice result could not be confirmed. Reload the saved records before trying again.");}
  finally{setBusy(false);}
 }
 if(loading)return <section aria-live="polite"><h3>Customer invoice</h3><p>Loading invoice history…</p></section>;
 if(error&&!view)return <section role="alert"><h3>Customer invoice unavailable</h3><p>{error}</p><button onClick={()=>void load()}>Try invoice history again</button></section>;
 const invoice=view?.invoices.at(-1);
 return <section className="customer-invoice"><h3>Customer invoice</h3><p>Reference VAT is illustrative. This is not a real tax invoice.</p>
  {!invoice?<button className="primary" disabled={busy||finalAccount.issueBlocked} onClick={()=>void issue()}>Issue and simulate this invoice</button>:<article id={`invoice-${invoice.id}`}>
   <p>Issued separately from delivery.</p><dl>
    <div><dt>Invoice number</dt><dd data-testid="customer-invoice-number">{invoice.number}</dd></div>
    <div><dt>Invoice gross</dt><dd data-testid="invoice-gross">{pounds(invoice.totalPence)}</dd></div>
    <div><dt>Balance due</dt><dd data-testid="invoice-balance">{pounds(invoice.balancePence)}</dd></div>
    <div><dt>Delivery</dt><dd data-testid="invoice-delivery">Simulated delivery — nothing sent</dd></div>
   </dl>
   <p>Issue date {invoice.issuedOn} · Fictional issuer/run identity <code>{view?.jobId}</code></p>
   <p>Artifact hash <code data-testid="invoice-artifact-hash">{invoice.pdfSha256}</code></p>
   <a href={`/api/jobs/${jobId}/customer-invoices/${invoice.id}`}>Download synthetic invoice PDF</a>
   <CustomerInvoicePayNow/>
   <p>Need to change it? Issue a correction; this snapshot and number cannot be edited.</p>
   <CustomerCreditNotes jobId={jobId} invoiceId={invoice.id} onChanged={()=>void load(true)}/>
   <CustomerReceipts key={invoice.id} jobId={jobId} invoiceId={invoice.id} onChanged={()=>void load(true)}/>
  </article>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}

/** The SV-4 path is guarded independently; the merged practice path above is unchanged. */
function LockBoundCustomerInvoices({jobId,finalAccount,guard}:{jobId:string;finalAccount:{id:string;sourceHash:string;issueBlocked:boolean};guard:LockInvoiceGuard}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [issued,setIssued]=useState<PracticeInvoiceResponse|null>(null);
 async function issue(kind:"final"|"supplementary") {
  if(busy||guard.code||finalAccount.issueBlocked)return;
  setBusy(true);setError("");
  const source=kind==="final"&&guard.lockedRevision?guard.lockedRevision:finalAccount;
  try {
   const response=await fetch(`/api/jobs/${jobId}/final-account/lock`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({version:"lock-bound-invoice.issue.v1",commandId:crypto.randomUUID(),finalAccountRevisionId:source.id,expectedSourceHash:source.sourceHash,invoiceKind:kind,recipient:"practice-customer@example.invalid",issuedOn:new Date().toISOString().slice(0,10)})});
   const body=await response.json();
   if(!response.ok)throw new Error(String(body.code));
   // Issue response is the same existing invoice projection; the side binding is private to the issue path.
   setIssued(practiceInvoiceResponseV1.parse(body));notifyInvoiceChanged(jobId);
  }catch(failure){setError(failure instanceof Error?failure.message:"DATABASE_UNAVAILABLE");}
  finally{setBusy(false);}
 }
 const latest=issued?.invoices.at(-1);
 return <section data-testid="lock-bound-invoices" aria-label="Lock-bound customer invoices">
  <button style={{minHeight:44,minWidth:44}} disabled={busy||!!guard.code||finalAccount.issueBlocked} onClick={()=>void issue("final")}>Issue final invoice</button>
  <button style={{minHeight:44,minWidth:44}} disabled={busy||!!guard.code||finalAccount.issueBlocked} onClick={()=>void issue("supplementary")}>Issue supplementary invoice</button>
  {guard.code&&<p role="alert">{guard.code}</p>}
  {error&&<p role="alert">{error}</p>}
  {latest&&<p data-testid="lock-bound-invoice-gross">{pounds(latest.totalPence)}</p>}
 </section>;
}
