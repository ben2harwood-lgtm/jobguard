"use client";
import { useEffect, useState } from "react";
import type { QuoteDocument } from "@jobguard/core";
type View = { jobId: string; jobRevision: number; status: string; quote: { id: string; revision: number; hash: string; document: QuoteDocument } | null };
export default function CustomerQuote() {
  const [view,setView]=useState<View>(), [message,setMessage]=useState("Loading your quote…"), [busy,setBusy]=useState(false);
  const [commandId,setCommandId]=useState<string>();
  useEffect(()=>{
    const jobId=new URLSearchParams(window.location.search).get("job");
    void fetch("/api/customer-portal/quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:"customer-quote-read.v1",jobId}),cache:"no-store"})
      .then(async response=>{if(!response.ok)throw new Error();const data=await response.json() as View;setView(data);setMessage(data.quote ? "Review this exact quote before accepting." : "There is no current quote available.");})
      .catch(()=>setMessage("This quote is unavailable. Ask your builder for a new sign-in link."));
  },[]);
  async function accept() {
    if(!view?.quote||busy)return;
    setBusy(true);
    const id=commandId??crypto.randomUUID();setCommandId(id);
    try {
      const response=await fetch("/api/customer-portal/quote-accept",{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify({version:"customer-quote-acceptance.v1",commandId:id,jobId:view.jobId,expectedJobRevision:view.jobRevision,target:{kind:"quote",id:view.quote.id,revision:view.quote.revision,hash:view.quote.hash}})});
      if(response.ok){setView({...view,status:"accepted"});setMessage("You accepted this quote.");}
      else setMessage("Acceptance could not be confirmed. Reload to review the current quote, or ask your builder for a new link.");
    } catch {setMessage("Acceptance could not be confirmed. Try again to check the same acceptance.");}
    finally {setBusy(false);}
  }
  const quote=view?.quote, d=quote?.document;
  const gbp=(pence:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(pence/100);
  return <main><h1>Your quote</h1><p>Synthetic practice only</p><p role="status">{message}</p>{quote&&d&&<>
    <h2>{d.reference} · revision {quote.revision}</h2><p>From {d.issuer.name} · {d.issuer.email}</p><p>{d.issuer.address.join(", ")}</p><p>To {d.customer.name} · {d.customer.email}</p><p>{d.customer.address.join(", ")}</p>
    {d.jobParties&&<><p>Paying party: {d.jobParties.payingParty.name}</p><p>Site: {[d.jobParties.site.unit,...d.jobParties.site.addressLines,d.jobParties.site.town,d.jobParties.site.postcode].filter(Boolean).join(", ")}</p></>}
    <ul>{d.lines.map(line=><li key={line.scopeItemId}>{line.description}: {line.quantity} {line.unit} — {gbp(line.netPence)}</li>)}</ul>
    <h3>Exclusions</h3><ul>{d.exclusions.map((text,i)=><li key={i}>{text}</li>)}</ul>
    <h3>Qualifications</h3><ul>{d.qualifications.map((text,i)=><li key={i}>{text}</li>)}</ul>
    <p>Subtotal {gbp(d.subtotalPence)} · Discount {gbp(d.discountPence)}</p><p>Net {gbp(d.netPence)} · VAT {gbp(d.taxPence)} · Total {gbp(d.totalPence)}</p>
    {view?.status==="quoting"&&<button disabled={busy} onClick={()=>void accept()}>{busy?"Confirming…":"Accept this quote"}</button>}
    {view?.status==="accepted"&&<p>This quote is accepted.</p>}
  </>}</main>;
}
