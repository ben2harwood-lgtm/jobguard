"use client";
import React, { useEffect, useState } from "react";
import { formatRecoveryMessagePounds, mappedValueReceiptV1, type MappedValueReceiptV1 } from "@jobguard/core";
export const mappedMoney=(v:{pence:number;currency:"GBP"}|null)=>v===null?"Unavailable":`${v.pence<0?"−":""}£${formatRecoveryMessagePounds(Math.abs(v.pence))}`;
export function MappedReceipt({receipt:r}:{receipt:MappedValueReceiptV1}){
 return <article>
  <p>{r.label} · {r.notice}</p>
  {r.window&&<p>Movements recorded from {r.window.from} to {r.window.toExclusive} (exclusive).</p>}
  <section><h2>What we checked</h2><p>{r.checkedCount??"Unavailable"} sources</p></section>
  <section><h2>Tracked through to your bill</h2><p><span data-testid="tracked-captured-net">{mappedMoney(r.tracked)}</span> net · Fee <span data-testid="tracked-fee">{mappedMoney(r.trackedFee)}</span></p></section>
  <section><h2>Found by JobGuard after your bill was complete</h2>
   <p>Recovered <span data-testid="found-recovered-net">{mappedMoney(r.found.recovered)}</span> · Fee <span data-testid="found-success-fee">{mappedMoney(r.found.fee)}</span> · Yours before VAT and tax <span data-testid="found-yours-before-tax">{mappedMoney(r.found.yoursBeforeVatAndTax)}</span></p>
   {r.found.state==="unavailable"&&<p>The sources need a current assessment before figures can be shown.</p>}
   <ul>{r.found.movements.map(m=><li key={m.assessmentId}>{m.kind} · {m.at} · {mappedMoney(m.recovered)} recovered · {mappedMoney(m.fee)} fee · Assessment {m.assessmentId}</li>)}</ul>
  </section>
  <section><h2>Supplier recoveries</h2><p>No mapped recovery figures are available yet.</p></section>
  <section><h2>Withheld-payment recoveries</h2><p>No mapped recovery figures are available yet.</p></section>
  <details><summary>Inspect receipt sources</summary><p>Policy {r.policyVersion} · Derivation {r.derivationVersion}</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(r.sources,null,2)}</pre></details>
 </article>;
}
export function JobMappedValue({jobId}:{jobId:string}){
 const [revision,refresh]=useState(0);
 const [receipt,setReceipt]=useState<MappedValueReceiptV1|null>(null),[state,setState]=useState("Loading…");
 useEffect(()=>{setReceipt(null);setState("Loading…");const abort=new AbortController();void(async()=>{try{
  const response=await fetch(`/api/jobs/${jobId}/value/v3${window.location.search}`,{cache:"no-store",signal:abort.signal});
  const raw=await response.json();const parsed=mappedValueReceiptV1.safeParse(raw.receipt);
  if(!response.ok||raw.jobId!==jobId||raw.status!=="mapped"||!parsed.success)throw new Error();
  if(!abort.signal.aborted)setReceipt(parsed.data);
 }catch{if(!abort.signal.aborted)setState("Value sources are unavailable until the bill is locked and its check is complete.");}})();return()=>abort.abort();},[jobId,revision]);
 return <section><h1>Value receipt</h1>{receipt&&receipt.sources.jobId===jobId?<MappedReceipt receipt={receipt}/>:<p role="status">{state}</p>}<button type="button" onClick={()=>refresh(n=>n+1)}>Refresh receipt</button><p>Subscription is shown per billing period on <a href="/value">Business value</a>.</p></section>;
}
