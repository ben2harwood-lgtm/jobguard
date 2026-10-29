"use client";
import { useEffect, useState } from "react";
import { mappedValueReceiptV1, mappedBusinessSummaryV1 } from "@jobguard/core";
import { MappedReceipt, mappedMoney } from "./mapped-value-receipt";
import { z } from "zod";

const job=z.object({jobId:z.string().uuid(),status:z.string(),receipt:mappedValueReceiptV1.nullable()});
const resultV1=z.union([z.object({state:z.literal("mapped"),summary:mappedBusinessSummaryV1.optional(),jobs:z.array(job),subscription:z.array(z.object({periodId:z.string().uuid(),from:z.string(),toExclusive:z.string(),policyVersion:z.string(),amount:z.object({pence:z.number().int(),currency:z.literal("GBP")})}).passthrough())}),z.object({state:z.literal("unavailable"),code:z.string()})]);

export function BusinessValueV3() {
 const [value,setValue] = useState<Extract<z.infer<typeof resultV1>,{state:"mapped"}>|null>(null);
 const [state, setState] = useState("Loading current availability…");
 const [revision, refresh] = useState(0);
 useEffect(() => {
  const abort = new AbortController();
  setValue(null);
  setState("Loading current availability…");
  void (async () => {
   try {
    // Selection is checked by the server; never turn browser values into amounts.
    const response = await fetch(`/api/value${window.location.search}`, { cache: "no-store", signal: abort.signal });
    const parsed = resultV1.safeParse(await response.json());
    if (abort.signal.aborted) return;
    if (!parsed.success) { setState("Value is unavailable. Refresh to try again."); return; }
    if(!response.ok&&parsed.data.state==="mapped"){setState("Value is unavailable. Refresh to try again.");return;}
    if(parsed.data.state==="mapped"){setValue(parsed.data);setState("mapped, inspectable");return;}
    setValue(null);
    switch (parsed.data.code) {
     case "UNAUTHENTICATED": setState("Sign in to your practice session to view availability."); break;
     case "SYNTHETIC_MODE_REQUIRED": setState("This page is available in synthetic practice only."); break;
     case "INVALID_BUSINESS_VALUE_SELECTION": setState("This value selection is unsupported."); break;
     case "BUSINESS_VALUE_SELECTION_HELD": setState("The selected period or value window is unavailable."); break;
     case "BUSINESS_VALUE_BINDING_HELD": setState("Business value is unavailable while source and billing-period access are being connected."); break;
     default: setState("Value is unavailable. Refresh to try again.");
    }
   } catch { if (!abort.signal.aborted) setState("Value is unavailable. Refresh to try again."); }
  })();
  return () => abort.abort();
 }, [revision]);
 return <main style={{ maxWidth: 760, margin: "0 auto", padding: 20, overflowWrap: "anywhere" }}>
  <h1>Business value</h1>
  <p role="status" aria-live="polite" data-testid="business-value-status">{state}</p>
  {value&&<>
   {value.summary&&<section aria-label="Business totals"><h2>Business totals — mapped, inspectable</h2>
    <p>What we checked: {value.summary.checkedCount??"Unavailable"} sources</p>
    <p>Tracked through to your bill: {mappedMoney(value.summary.tracked)} net · Fee £0.00</p>
    <p>Found by JobGuard after your bill was complete: {mappedMoney(value.summary.recovered)} recovered · Fee {mappedMoney(value.summary.fee)} · Yours before VAT and tax {mappedMoney(value.summary.yoursBeforeVatAndTax)}</p>
    <p>Illustration — proposed policy; principal only. Inspect each job below.</p>
   </section>}
   {value.jobs.map(job=><section key={job.jobId}><h2><a href={`/jobs/${job.jobId}/value${job.receipt?.window?`?${new URLSearchParams(job.receipt.window).toString()}`:""}`}>Job {job.jobId}</a></h2>{job.status==="mapped"&&job.receipt?<MappedReceipt receipt={job.receipt}/>:<p>Bill not locked; value unavailable.</p>}</section>)}
   <section><h2>Subscription by billing period</h2>{value.subscription.length?value.subscription.map(p=><article key={p.periodId}><h3>{p.from} to {p.toExclusive} (exclusive)</h3><p>{mappedMoney(p.amount)} · Hypothetical · {p.policyVersion}</p><details><summary>Inspect period and statement sources</summary><pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(p,null,2)}</pre></details></article>):<p>No issued billing periods.</p>}</section>
  </>}
  {!value&&<><section aria-labelledby="business-sources-title">
   <h2 id="business-sources-title">Job sources</h2>
   <p>Source-linked totals and original or reversal movements are unavailable.</p>
   <p>Existing job receipts and exports remain available from each job.</p>
  </section>
  <section aria-labelledby="business-subscription-title">
   <h2 id="business-subscription-title">Subscription by billing period</h2>
   <p>Unavailable. Subscription periods are separate from job amounts and success fees.</p>
  </section>
  <section aria-labelledby="business-receipt-title">
   <h2 id="business-receipt-title">As-of value receipt</h2>
   <p>Unavailable until an authorised source snapshot can be read. No receipt has been created by this page.</p>
  </section>
  </>}
  <button type="button" onClick={() => refresh(n => n + 1)} style={{ minHeight: 44, minWidth: 44 }}>Refresh availability</button>
  <p><a href="/" style={{ display: "inline-block", minHeight: 44, paddingTop: 12 }}>Back to jobs</a></p>
 </main>;
}
