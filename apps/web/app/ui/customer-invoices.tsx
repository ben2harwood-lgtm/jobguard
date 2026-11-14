"use client";
import { jobPageFetch as fetch } from "./job-page-fetch";
import { useCallback, useEffect, useRef, useState } from "react";
import { practiceInvoiceResponseV1, type PracticeInvoiceResponse } from "@jobguard/api/customer-invoice-contracts";
import { CustomerCreditNotes } from "./customer-credit-notes";
import { CustomerReceipts } from "./customer-receipts";
import { INVOICE_CHANGED_EVENT, notifyInvoiceChanged } from "./customer-payment-status";
import { FINAL_CHECK_CHANGED_EVENT } from "./final-check-reveal-view";
import { CustomerInvoicePayNow } from "./pay-now-synthetic";
// A saved-history refresh or account rebuild can remount an issuer. Neither
// authorises a second command after a lost response in this page session.
const uncertainIssues = new WeakMap<Window, Set<string>>();
function issueIsUncertain(jobId:string,mark=false):boolean {
 if(typeof window==="undefined")return false;
 let jobs=uncertainIssues.get(window);
 if(mark){if(!jobs){jobs=new Set();uncertainIssues.set(window,jobs);}jobs.add(jobId);}
 return jobs?.has(jobId)??false;
}
const INVOICE_ISSUE_UNCERTAIN_EVENT="jobguard:invoice-issue-uncertain";
const pounds=(p:number)=>`GBP ${(p/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export const invoiceGuardMessages = {
 FINAL_ACCOUNT_LOCK_REQUIRED: "Complete the final account first",
 FINAL_CHECK_NOT_COMPLETE: "JobGuard's final check is still running",
 FINAL_CHECK_FAILED: "JobGuard's final check could not finish, so this bill stays locked",
} as const;
function invoiceFailureMessage(code: string, unchangedLockedRevision = false): string {
 if (Object.hasOwn(invoiceGuardMessages, code)) return invoiceGuardMessages[code as keyof typeof invoiceGuardMessages];
 if (code === "STALE_REVISION") return "The final account changed. Please reload and rebuild the saved account before issuing this invoice.";
 if (["STALE_FINAL_ACCOUNT_AUTHORIZATION", "STALE_OR_BLOCKED_FINAL_ACCOUNT"].includes(code)) return "The final account changed. Rebuild it before issuing this invoice.";
 if (["SUPPLEMENTARY_INVOICE_NO_NEW_LINES", "SUPPLEMENTARY_INVOICE_ALREADY_ISSUED", "FINAL_ACCOUNT_ALREADY_INVOICED", "NO_NEW_INVOICE_LINES"].includes(code)) return "This revision has no new unbilled lines. Check the saved invoice history.";
 if (code === "FINAL_INVOICE_ALREADY_ISSUED") return "This final invoice has already been issued. Reload the saved invoice history.";
 if (code === "SUPPLEMENTARY_INVOICE_BASE_REQUIRED") return unchangedLockedRevision ? "This is still the locked account. Approve the extra, then press “Rebuild from approved sources” before issuing a supplementary invoice." : "Issue the final invoice before adding a supplementary invoice.";
 if (code === "INVOICE_SOURCE_CORRECTION_REQUIRED") return "Previously billed lines changed. Use an invoice correction before issuing another bill.";
 if (code === "INVOICE_AMOUNT_INVALID") return "There are no valid new billable lines in this revision. Check the saved account and invoice history.";
 if (code === "FINAL_INVOICE_REVISION_MISMATCH") return "This revision does not belong to the locked bill. Rebuild from approved sources.";
 if (code === "FORBIDDEN" || code === "REQUEST_BINDING_REFUSED") return "You no longer have access to issue this invoice. Check your practice session.";
 if (code === "INVOICE_REFUSED") return "The server refused this invoice. Check the saved account and invoice history.";
 return "The invoice result could not be confirmed. Reload the saved records before trying again.";
}
type LockInvoiceGuard = { code: "FINAL_ACCOUNT_LOCK_REQUIRED" | "FINAL_CHECK_NOT_COMPLETE" | "FINAL_CHECK_FAILED" | null; kind: "final" | "supplementary"; lockedRevision?:{id:string;sourceHash:string;issueBlocked:boolean} };
export function CustomerInvoices({jobId,finalAccount,lockGuard}:{jobId:string;finalAccount:{id:string;sourceHash:string;issueBlocked:boolean};lockGuard?:LockInvoiceGuard}) {
 if(lockGuard)return <LockBoundCustomerInvoices jobId={jobId} finalAccount={finalAccount} guard={lockGuard}/>;
 return <PracticeCustomerInvoices jobId={jobId} finalAccount={finalAccount}/>;
}
function PracticeCustomerInvoices({jobId,finalAccount}:{jobId:string;finalAccount:{id:string;sourceHash:string;issueBlocked:boolean}}) {
 const [savedView,setView]=useState<PracticeInvoiceResponse|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState(false),[errorCode,setErrorCode]=useState("");
 const view=savedView?.jobId===jobId?savedView:null;
 const active=useRef<AbortController|null>(null),writing=useRef(false),uncertain=useRef(false);
 const currentJob=useRef(jobId),lifetime=useRef(0);currentJob.current=jobId;
 const load=useCallback(async(refresh=false)=>{
  active.current?.abort();const controller=new AbortController();active.current=controller;
  if(!refresh)setLoading(true);
  try{
   const r=await fetch(`/api/jobs/${jobId}/customer-invoices`,{cache:"no-store",signal:controller.signal});
   if(!r.ok)throw new Error("UNAVAILABLE");
   const next=practiceInvoiceResponseV1.parse(await r.json());
   if(next.jobId!==jobId)throw new Error("WRONG_JOB_RESPONSE");
   if(!controller.signal.aborted){setView(next);setLoading(false);}
  }catch{if(!controller.signal.aborted){setView(null);setError("Customer invoices could not load. Check the saved records before issuing again.");setLoading(false);}}
 },[jobId]);
 useEffect(()=>{
  setView(null);uncertain.current=issueIsUncertain(jobId);writing.current=false;setError(uncertain.current?"The invoice result is unknown. Repeated issue is blocked; check the saved invoice history.":"");
  const changed=(event:Event)=>{if((event as CustomEvent<{jobId?:string}>).detail?.jobId===jobId)void load(true);};
  const focus=()=>{void load(true);};
  const visible=()=>{if(document.visibilityState==="visible")void load(true);};
  const unknown=(event:Event)=>{
   if((event as CustomEvent<{jobId?:string}>).detail?.jobId!==jobId)return;
   uncertain.current=issueIsUncertain(jobId,true);
   setError("The invoice result is unknown. Repeated issue is blocked; check the saved invoice history.");
   void load();
  };
  window.addEventListener(INVOICE_ISSUE_UNCERTAIN_EVENT,unknown);
  window.addEventListener(INVOICE_CHANGED_EVENT,changed);window.addEventListener(FINAL_CHECK_CHANGED_EVENT,changed);window.addEventListener("focus",focus);document.addEventListener("visibilitychange",visible);
  void load();return()=>{lifetime.current++;active.current?.abort();window.removeEventListener(INVOICE_ISSUE_UNCERTAIN_EVENT,unknown);window.removeEventListener(INVOICE_CHANGED_EVENT,changed);window.removeEventListener(FINAL_CHECK_CHANGED_EVENT,changed);window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",visible);};
 },[load,jobId]);
 async function issue(){
  if(writing.current||uncertain.current||!view||view.invoices.length||finalAccount.issueBlocked)return;
  writing.current=true;const generation=lifetime.current;
  setBusy(true);setError("");setErrorCode("");
  try{
   const r=await fetch(`/api/jobs/${jobId}/customer-invoices`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({version:"practice-customer-invoice.issue.v1",commandId:crypto.randomUUID(),finalAccountRevisionId:finalAccount.id,expectedSourceHash:finalAccount.sourceHash,recipient:"practice-customer@example.invalid",issuedOn:new Date().toISOString().slice(0,10)})});
   if(currentJob.current!==jobId||lifetime.current!==generation)return;
   if(r.ok){const next=practiceInvoiceResponseV1.parse(await r.json());if(next.jobId!==jobId)throw new Error("WRONG_JOB_RESPONSE");if(currentJob.current===jobId&&lifetime.current===generation){setView(next);notifyInvoiceChanged(jobId);}}
   else { if(r.status>=500)throw new Error("UNKNOWN"); const body = await r.json(); if(currentJob.current!==jobId||lifetime.current!==generation)return; const code = typeof body.code === "string" ? body.code : ""; setErrorCode(code); setError(invoiceFailureMessage(code)); }
  }catch{if(currentJob.current===jobId&&lifetime.current===generation){uncertain.current=issueIsUncertain(jobId,true);window.dispatchEvent(new CustomEvent(INVOICE_ISSUE_UNCERTAIN_EVENT,{detail:{jobId}}));setError("The invoice result is unknown. Repeated issue is blocked; reload the saved invoice history.");await load(true);}}
  finally{if(currentJob.current===jobId&&lifetime.current===generation){writing.current=false;setBusy(false);}}
 }
 if(loading)return <section aria-live="polite"><h3>Customer invoice</h3><p>Loading invoice history…</p></section>;
 if(error&&!view)return <section role="alert"><h3>Customer invoice unavailable</h3><p>{error}</p><button onClick={()=>void load()}>Try invoice history again</button></section>;
 const invoices=view?.invoices??[];
 const invoice=invoices.at(-1);
 return <section className="customer-invoice"><h3>Customer invoice</h3><p>Reference VAT is illustrative. This is not a real tax invoice.</p>
  {!invoice?<button className="primary" disabled={busy||uncertain.current||finalAccount.issueBlocked} onClick={()=>void issue()}>Issue and simulate this invoice</button>:invoices.map(invoice=><article key={invoice.id} id={`invoice-${invoice.id}`}>
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
  </article>)}
  {busy&&<p role="status">Issuing this invoice. Wait for the saved result before continuing.</p>}
  {finalAccount.issueBlocked&&!invoice&&<p>Complete the required proof, then press “Rebuild from approved sources” to include it before issuing this bill.</p>}
  {error&&<p role="alert" data-error-code={errorCode}>{error}</p>}
  {error&&<button type="button" disabled={busy} onClick={()=>void load(true)}>Refresh saved invoice history</button>}
 </section>;
}

/** Screen prerequisites only; the server retains ancestry, line-difference and approval authority. */
function LockBoundCustomerInvoices({jobId,finalAccount,guard}:{jobId:string;finalAccount:{id:string;sourceHash:string;issueBlocked:boolean};guard:LockInvoiceGuard}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [savedIssued,setIssued]=useState<PracticeInvoiceResponse|null>(null);
 const issued=savedIssued?.jobId===jobId?savedIssued:null;
 const active=useRef<AbortController|null>(null),writing=useRef(false),uncertain=useRef(false),currentJob=useRef(jobId),lifetime=useRef(0);
 currentJob.current=jobId;
 const load=useCallback(async()=>{
  active.current?.abort();const controller=new AbortController();active.current=controller;
  try{
   const response=await fetch(`/api/jobs/${jobId}/customer-invoices`,{cache:"no-store",signal:controller.signal});
   if(!response.ok)throw new Error("INVOICE_HISTORY_UNAVAILABLE");
   const saved=practiceInvoiceResponseV1.parse(await response.json());
   if(saved.jobId!==jobId)throw new Error("WRONG_JOB_RESPONSE");
   if(!controller.signal.aborted)setIssued(saved);
  }catch{if(!controller.signal.aborted){setIssued(null);setError("INVOICE_HISTORY_UNAVAILABLE");}}
 },[jobId]);
 useEffect(()=>{
  setIssued(null);uncertain.current=issueIsUncertain(jobId);setError(uncertain.current?"INVOICE_OUTCOME_UNKNOWN":"");writing.current=false;
  const changed=(event:Event)=>{if((event as CustomEvent<{jobId?:string}>).detail?.jobId===jobId)void load();};
  const focus=()=>{void load();};
  const visible=()=>{if(document.visibilityState==="visible")void load();};
  const unknown=(event:Event)=>{
   if((event as CustomEvent<{jobId?:string}>).detail?.jobId!==jobId)return;
   uncertain.current=issueIsUncertain(jobId,true);
   setError("INVOICE_OUTCOME_UNKNOWN");
   void load();
  };
  window.addEventListener(INVOICE_ISSUE_UNCERTAIN_EVENT,unknown);
  window.addEventListener(INVOICE_CHANGED_EVENT,changed);window.addEventListener(FINAL_CHECK_CHANGED_EVENT,changed);window.addEventListener("focus",focus);document.addEventListener("visibilitychange",visible);
  void load();return()=>{lifetime.current++;active.current?.abort();window.removeEventListener(INVOICE_ISSUE_UNCERTAIN_EVENT,unknown);window.removeEventListener(INVOICE_CHANGED_EVENT,changed);window.removeEventListener(FINAL_CHECK_CHANGED_EVENT,changed);window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",visible);};
 },[jobId,load]);
 // This saved endpoint lists the final bill and its supplements; no kind/eligibility flag exists.
 const hasFinal=!!issued?.invoices.length;
 const unbilled=!!issued && !issued.invoices.some(invoice=>invoice.finalAccountRevisionId===finalAccount.id || invoice.sourceHash===finalAccount.sourceHash);
 const blocked=busy||uncertain.current||!issued||!!guard.code||!guard.lockedRevision||finalAccount.issueBlocked;
 const finalDisabled=blocked||hasFinal||!!issued?.invoices.length;
 const supplementaryDisabled=blocked||!hasFinal||!unbilled||finalAccount.id===guard.lockedRevision?.id;
 async function issue(kind:"final"|"supplementary") {
  if(writing.current||(kind==="final"?finalDisabled:supplementaryDisabled))return;
  writing.current=true;const generation=lifetime.current;setBusy(true);setError("");
  const source=kind==="final"?guard.lockedRevision!:finalAccount;
  try {
   const response=await fetch(`/api/jobs/${jobId}/final-account/lock`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({version:"lock-bound-invoice.issue.v1",commandId:crypto.randomUUID(),finalAccountRevisionId:source.id,expectedSourceHash:source.sourceHash,invoiceKind:kind,recipient:"practice-customer@example.invalid",issuedOn:new Date().toISOString().slice(0,10)})});
   if(currentJob.current!==jobId||lifetime.current!==generation)return;
   if(!response.ok){
    if(response.status>=500)throw new Error("UNKNOWN");
    const body=await response.json();if(currentJob.current!==jobId||lifetime.current!==generation)return;setError(typeof body.code==="string"?body.code:"INVOICE_REFUSED");window.dispatchEvent(new CustomEvent(FINAL_CHECK_CHANGED_EVENT,{detail:{jobId}}));await load();return;
   }
   const saved=practiceInvoiceResponseV1.parse(await response.json());
   if(saved.jobId!==jobId)throw new Error("WRONG_JOB_RESPONSE");
   if(currentJob.current===jobId&&lifetime.current===generation){setIssued(saved);notifyInvoiceChanged(jobId);}
  }catch{
   if(currentJob.current===jobId&&lifetime.current===generation){uncertain.current=issueIsUncertain(jobId,true);window.dispatchEvent(new CustomEvent(INVOICE_ISSUE_UNCERTAIN_EVENT,{detail:{jobId}}));setError("INVOICE_OUTCOME_UNKNOWN");window.dispatchEvent(new CustomEvent(FINAL_CHECK_CHANGED_EVENT,{detail:{jobId}}));await load();}
  }finally{if(currentJob.current===jobId&&lifetime.current===generation){writing.current=false;setBusy(false);}}
 }
 const latest=issued?.invoices.at(-1);
 return <section data-testid="lock-bound-invoices" aria-label="Lock-bound customer invoices">
  <button style={{minHeight:44,minWidth:44}} disabled={finalDisabled} onClick={()=>void issue("final")}>Issue final invoice</button>
  <button style={{minHeight:44,minWidth:44}} disabled={supplementaryDisabled} onClick={()=>void issue("supplementary")}>Issue supplementary invoice</button>
  {busy&&<p role="status">Issuing this invoice. Wait for the saved result before continuing.</p>}
  {issued&&!hasFinal&&<p>Issue the final invoice before adding a supplementary invoice.</p>}
  {hasFinal&&finalAccount.id===guard.lockedRevision?.id&&<p>This is still the locked account. Approve the extra, then press “Rebuild from approved sources” to create a later account for its supplementary invoice.</p>}
  {hasFinal&&!unbilled&&finalAccount.id!==guard.lockedRevision?.id&&<p>This account has already been billed. There are no new unbilled sources in this revision.</p>}
  {guard.code&&<p role="alert" data-error-code={guard.code}>{invoiceGuardMessages[guard.code]}</p>}
  {finalAccount.issueBlocked&&<p>Complete the required proof, then press “Rebuild from approved sources” before issuing this bill.</p>}
  {error&&<p role="alert" data-error-code={error}>{error==="INVOICE_OUTCOME_UNKNOWN"?"The invoice result is unknown. Repeated issue is blocked. Check the saved invoice history before continuing.":invoiceFailureMessage(error,hasFinal&&finalAccount.id===guard.lockedRevision?.id)}</p>}
  {error&&<button type="button" disabled={busy} onClick={()=>void load()}>Refresh saved invoice history</button>}
  {latest&&<dl>
   <div><dt>Saved invoice number</dt><dd data-testid="lock-bound-invoice-number">{latest.number}</dd></div>
   <div><dt>Saved invoice gross</dt><dd data-testid="lock-bound-invoice-gross">{pounds(latest.totalPence)}</dd></div>
   <div><dt>Saved balance</dt><dd data-testid="lock-bound-invoice-balance">{pounds(latest.balancePence)}</dd></div>
  </dl>}
 </section>;
}
