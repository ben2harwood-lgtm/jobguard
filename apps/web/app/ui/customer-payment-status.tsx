"use client";
import { useEffect, useState } from "react";
import { practiceInvoiceResponseV1 } from "@jobguard/api/customer-invoice-contracts";
import { deriveJobPaymentState, type JobPaymentState } from "../lib/invoice-payment-state";

export const INVOICE_CHANGED_EVENT = "jobguard:invoice-changed";
export function notifyInvoiceChanged(jobId:string):void {
  window.dispatchEvent(new CustomEvent(INVOICE_CHANGED_EVENT,{detail:{jobId}}));
}
/** Recompute from authenticated server reads on mount, focus and invoice changes.
 * No DOM editing, local paid flag or frontend-only balance can mark a job paid.
 */
export function CustomerPaymentStatus({jobId}:{jobId:string}) {
  const [view,setView]=useState<JobPaymentState|null>(null);
  const [failed,setFailed]=useState(false);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let disposed=false;
    let generation=0;
    let controller:AbortController|undefined;
    async function load() {
      const current=++generation;
      controller?.abort();
      const request=new AbortController();controller=request;
      setView(null);setFailed(false);
      try {
        const response=await fetch(`/api/jobs/${encodeURIComponent(jobId)}/customer-invoices`,{cache:"no-store",signal:request.signal});
        if(!response.ok)throw new Error("PAYMENT_STATUS_UNAVAILABLE");
        const data=practiceInvoiceResponseV1.parse(await response.json());
        if(data.jobId!==jobId)throw new Error("WRONG_JOB_PAYMENT_RESPONSE");
        const result=deriveJobPaymentState(data.invoices);
        if(!disposed && current===generation)setView(result);
      } catch {
        if(!disposed && current===generation && !request.signal.aborted)setFailed(true);
      }
    }
    const changed=(event:Event)=>{
      if((event as CustomEvent<{jobId?:string}>).detail?.jobId===jobId)void load();
    };
    const focused=()=>{void load();};
    const visible=()=>{if(document.visibilityState==="visible")void load();};
    window.addEventListener(INVOICE_CHANGED_EVENT,changed);
    window.addEventListener("focus",focused);
    document.addEventListener("visibilitychange",visible);
    void load();
    return ()=>{
      disposed=true;controller?.abort();
      window.removeEventListener(INVOICE_CHANGED_EVENT,changed);
      window.removeEventListener("focus",focused);
      document.removeEventListener("visibilitychange",visible);
    };
  },[jobId,refresh]);
  return <div aria-live="polite">
    <p data-testid="job-status">{failed?"Payment status unavailable":view?.label??"Checking payment records…"}</p>
    {view?.state==="paid"&&<small>Based on recorded practice receipts — not bank-confirmed.</small>}
    {failed&&<button type="button" onClick={()=>setRefresh(n=>n+1)}>Refresh payment status</button>}
  </div>;
}
