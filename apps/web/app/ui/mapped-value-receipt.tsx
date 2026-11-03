"use client";
import React, { useEffect, useState } from "react";
import { formatRecoveryMessagePounds, mappedValueReceipt, type MappedValueReceipt } from "@jobguard/core";
export const mappedMoney=(v:{pence:number;currency:"GBP"}|null)=>v===null?"Unavailable":`${v.pence<0?"−":""}£${formatRecoveryMessagePounds(Math.abs(v.pence))}`;
// Catch shares are exact tenths of a penny, not separately rounded charges.
export const mappedFeeShare=(v:{numerator:string;denominator:string})=>{
 const n=BigInt(v.numerator),den=BigInt(v.denominator),absolute=n<0n?-n:n;
 const tenths=absolute*10n/den;
 return `${n<0n?"−":""}£${formatRecoveryMessagePounds(Number(tenths/10n))}${tenths%10n===0n?"":String(tenths%10n)}`;
};
export function MappedReceipt({receipt:r}:{receipt:MappedValueReceipt}){
 return <article>
  <p>{r.label} · {r.notice}</p>
  {r.window&&<p>Movements recorded from {r.window.from} to {r.window.toExclusive} (exclusive).</p>}
  <section><h2>What we checked</h2><p>{r.checkedCount??"Unavailable"} sources</p></section>
  <section><h2>Tracked through to your bill</h2><p><span data-testid="tracked-captured-net">{mappedMoney(r.tracked)}</span> net · Fee <span data-testid="tracked-fee">{mappedMoney(r.trackedFee)}</span></p></section>
  <section><h2>Found by JobGuard after your bill was complete</h2>
   <p>Recovered <span data-testid="found-recovered-net">{mappedMoney(r.found.recovered)}</span> · Fee <span data-testid="found-success-fee">{mappedMoney(r.found.fee)}</span> · Yours before VAT and tax <span data-testid="found-yours-before-tax">{mappedMoney(r.found.yoursBeforeVatAndTax)}</span></p>
   {r.found.state==="unavailable"&&<p>The sources need a current assessment before figures can be shown.</p>}
   <ul>{r.found.movements.map(m=><li key={m.assessmentId}>{m.kind} · {m.at} · {mappedMoney(m.recovered)} recovered · {mappedFeeShare(m.fee)} fee share (unrounded) · Assessment {m.assessmentId}</li>)}</ul>
  </section>
  {(["supplier","withheld"] as const).map(key=><RecoveryValueSection key={key} name={key==="supplier"?"Supplier recoveries":"Withheld-payment recoveries"} id={key} value={r.version==="mapped-value-receipt.v2"?r[key]:null}/>)}
  <details><summary>Inspect receipt sources</summary><p>Policy {r.policyVersion} · Derivation {r.derivationVersion}</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(r.sources,null,2)}</pre></details>
 </article>;
}
export function JobMappedValue({jobId}:{jobId:string}){
 const [revision,refresh]=useState(0);
 const [receipt,setReceipt]=useState<MappedValueReceipt|null>(null),[state,setState]=useState("Loading…");
 useEffect(()=>{setReceipt(null);setState("Loading…");const abort=new AbortController();void(async()=>{try{
  const response=await fetch(`/api/jobs/${jobId}/value/v3${window.location.search}`,{cache:"no-store",signal:abort.signal});
  const raw=await response.json();const parsed=mappedValueReceipt.safeParse(raw.receipt);
  if(!response.ok||raw.jobId!==jobId||raw.status!=="mapped"||!parsed.success)throw new Error();
  if(!abort.signal.aborted)setReceipt(parsed.data);
 }catch{if(!abort.signal.aborted)setState("Value sources are unavailable until the bill is locked and its check is complete.");}})();return()=>abort.abort();},[jobId,revision]);
 return <section><h1>Value receipt</h1>{receipt&&(receipt.version==="mapped-value-receipt.v2"?receipt.sources.base.jobId:receipt.sources.jobId)===jobId?<MappedReceipt receipt={receipt}/>:<p role="status">{state}</p>}<button type="button" onClick={()=>refresh(n=>n+1)}>Refresh receipt</button><p>Subscription is shown per billing period on <a href="/value">Business value</a>.</p></section>;
}

export function RecoveryValueSection({name,id,value}:{name:string;id:string;value:{state:string;reason:string|null;recovered:{pence:number;currency:"GBP"}|null;fee:{pence:number;currency:"GBP"}|null;yoursBeforeVatAndTax:{pence:number;currency:"GBP"}|null;movements?:{derivationId:string;at:string;kind:string;recovered:{pence:number;currency:"GBP"};fee:{pence:number;currency:"GBP"}}[]}|null}){
 return <section aria-label={name}><h2>{name}</h2>
 <p>Recovered <span data-testid={`${id}-recovered`}>{mappedMoney(value?.recovered??null)}</span> · Fee <span data-testid={`${id}-fee`}>{mappedMoney(value?.fee??null)}</span> · Yours before VAT and tax <span data-testid={`${id}-yours-before-tax`}>{mappedMoney(value?.yoursBeforeVatAndTax??null)}</span></p>
 {(!value||value.state==="unavailable")&&<p>{value?.reason??"No mapped recovery figures are available yet."}</p>}
 <ul>{value?.movements?.map(m=><li key={m.derivationId} data-testid={`${id}-movement`}>{m.kind} · {m.at} · {mappedMoney(m.recovered)} recovered · {mappedMoney(m.fee)} fee · Derivation {m.derivationId}</li>)}</ul></section>;
}
