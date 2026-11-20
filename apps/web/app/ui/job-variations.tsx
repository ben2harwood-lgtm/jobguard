"use client";
import { JOB_SAVED_EVENT, jobPageFetch as fetch } from "./job-page-fetch";
import {useCallback,useEffect,useRef,useState} from "react";
import {variationWorkspaceResponseV1,type VariationWorkspaceResponse} from "@jobguard/api/variation-contracts";
import { catchPriceProposals, finalCheckReadV1 } from "./final-check-reveal-view";
const ATT="Builder-recorded practice acceptance — not an authenticated customer signature";
const pounds=(p:number)=>`${p<0?"−":""}£${(Math.abs(p)/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const toPence=(value:string)=>{const m=/^(\d{1,11})(?:\.(\d{0,2}))?$/u.exec(value.trim());if(!m)return null;const result=BigInt(m[1]!)*100n+BigInt((m[2]??"").padEnd(2,"0"));return result<=1_000_000_000_000n?Number(result):null;};
export function JobVariations({jobId,legacyPricing=true}:{jobId:string;legacyPricing?:boolean}) {
 const [view,setView]=useState<VariationWorkspaceResponse|null>(null),[description,setDescription]=useState(""),[amount,setAmount]=useState(""),[direction,setDirection]=useState<"addition"|"omission">("addition"),[link,setLink]=useState<"new"|"existing">("new"),[notice,setNotice]=useState(""),[editing,setEditing]=useState<string|null>(null),[editAmount,setEditAmount]=useState("");
 const [busy,setBusy]=useState(false),[loadFailed,setLoadFailed]=useState(false);
 const writing=useRef(false),currentJob=useRef(jobId),epoch=useRef(0);
 currentJob.current=jobId;
 const [proposals,setProposals]=useState<Map<string,number|null>>(new Map());
 const offered=useRef(new Set<string>());

 const [editRevisionId,setEditRevisionId]=useState<string|null>(null);
 const load=useCallback(async()=>{
  const request=++epoch.current;
  setLoadFailed(false);
  for(let attempt=0;attempt<10;attempt++){
   try{
    const response=await fetch(`/api/jobs/${jobId}/variations`,{cache:"no-store"});
    if(response.ok){
     const saved=variationWorkspaceResponseV1.parse(await response.json());
     if(saved.jobId!==jobId)throw new Error("WRONG_JOB_RESPONSE");
     let prices=new Map<string,number|null>();
     try{
      const reveal=await fetch(`/api/jobs/${jobId}/final-check`,{cache:"no-store"});
      if(reveal.ok)prices=catchPriceProposals(finalCheckReadV1.parse(await reveal.json()));
     }catch{ /* A refused or malformed reveal never supplies a price. */ }
     if(currentJob.current!==jobId||epoch.current!==request)return;
     setProposals(prices);setView(saved);return;
    }
   }catch{}
   if(currentJob.current!==jobId||epoch.current!==request)return;
   await new Promise(resolve=>setTimeout(resolve,300));
  }
  if(currentJob.current===jobId&&epoch.current===request){setView(null);setProposals(new Map());setLoadFailed(true);}
 },[jobId]);
 useEffect(()=>{
  setView(null);setProposals(new Map());offered.current.clear();setEditing(null);setEditAmount("");
  setDescription("");setAmount("");setNotice("");writing.current=false;setBusy(false);
  const changed=(event:Event)=>{if((event as CustomEvent<{jobId?:string}>).detail?.jobId===jobId&&!writing.current)void load();};
  window.addEventListener(JOB_SAVED_EVENT,changed);void load();
  return()=>{epoch.current++;window.removeEventListener(JOB_SAVED_EVENT,changed);};
 },[jobId,load]);
 useEffect(()=>{
  if(editing!==null||view?.jobId!==jobId)return;
  const draft=view.variations.find(v=>v.currentRevisionId===null&&v.revisions.length===0&&proposals.has(v.id)&&!offered.current.has(v.id));
  if(!draft)return;
  offered.current.add(draft.id);setEditing(draft.id);setEditRevisionId(null);
  const price=proposals.get(draft.id);setEditAmount(price==null?"":(price/100).toFixed(2));
 },[editing,view,proposals,jobId]);
 async function command(body:unknown,afterSave?:()=>void){
  if(writing.current)return false;
  const request=++epoch.current;
  writing.current=true;setBusy(true);setNotice("");
  try{
   const response=await fetch(`/api/jobs/${jobId}/variations`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
   if(currentJob.current!==jobId||epoch.current!==request)return false;
   if(!response.ok){setNotice("This variation could not be changed. Reload and review the current revision.");return false;}
   const saved=variationWorkspaceResponseV1.parse(await response.json());
   if(currentJob.current!==jobId||epoch.current!==request)return false;
   if(saved.jobId!==jobId)throw new Error("WRONG_JOB_RESPONSE");
   setView(saved);
   // Clear only the submitted draft, before reopening the editor. A second
   // entry can no longer be overwritten by the first request finishing late.
   afterSave?.();return true;
  }catch{if(currentJob.current!==jobId||epoch.current!==request)return false;setNotice("The variation result is unknown. Read the saved history before submitting it again.");return false;}
  finally{if(currentJob.current===jobId&&epoch.current===request){writing.current=false;setBusy(false);}}
 }
 async function propose(){
  if(!view||writing.current)return;
  const price=amount===""?null:toPence(amount);
  if(amount!==""&&price===null){setNotice("Enter pounds and pence, for example 125.00");return;}
  const proposalId=crypto.randomUUID(),scopeItemId=link==="existing"?view.parentScopeItemId:crypto.randomUUID();
  await command({version:"variation-command.v1",action:"propose",proposalId,scopeItemId,existingScopeItemId:link==="existing"?scopeItemId:null,lineageParentScopeItemId:link==="new"?view.parentScopeItemId:null,description,captureText:description,price:price===null?null:{quantity:"1",unit:"item",unitRatePence:price,direction}},()=>{setDescription("");setAmount("");});
 }
 async function approve(variationId:string,revisionId:string){await command({version:"variation-command.v1",action:"approve",variationId,revisionId,approvalId:crypto.randomUUID(),attestation:ATT});}
 async function revise(variationId:string,changeDirection:"addition"|"omission"){
  const price=toPence(editAmount);
  if(price===null){setNotice("Enter pounds and pence, for example 150.00");return;}
  await command({version:"variation-command.v1",action:"revise",variationId,revisionId:crypto.randomUUID(),expectedRevisionId:editRevisionId,description:view!.variations.find(v=>v.id===variationId)!.description,price:{quantity:"1",unit:"item",unitRatePence:price,direction:changeDirection}},()=>{setEditing(null);setNotice("Changed price needs new approval");});
 }
 async function reject(variationId:string,revisionId:string){await command({version:"variation-command.v1",action:"reject",variationId,revisionId,rejectionId:crypto.randomUUID()});}
 if(!view||view.jobId!==jobId)return <section className="variation-workspace"><h2>Extra work and omissions</h2>{loadFailed?<><p role="alert">Variations could not load.</p><button onClick={()=>void load()}>Try variations again</button></>:<p>Loading variations…</p>}</section>;
 return <section className="variation-workspace" aria-labelledby="variations-title" aria-busy={busy}>
  <h2 id="variations-title">Extra work and omissions</h2><p>{ATT}</p><p>After approving an exact price revision, press “Rebuild from approved sources” in Final account to include it in a new bill. The completed account stays locked.</p>
  <div className="variation-summary"><div><span>Approved additions</span><strong data-testid="approved-additions">{pounds(view.approvedAdditionsPence)}</strong></div><div><span>Approved omissions</span><strong data-testid="approved-omissions">{pounds(view.approvedOmissionsPence)}</strong></div><div><span>Pending extras</span><strong data-testid="pending-extras">{pounds(view.pendingExtrasPence)}</strong></div><div><span>Accepted baseline</span><strong data-testid="variation-baseline">{pounds(view.baselinePence)}</strong></div>{legacyPricing&&<div><span>Recovery cap</span><strong data-testid="variation-cap">{pounds(view.capPence)}</strong></div>}</div>
  <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
   <section className="variation-entry"><h3>Record changed work</h3>
    <label>Description<input value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <label>Change type<select value={direction} onChange={e=>setDirection(e.target.value as typeof direction)}><option value="addition">Extra work</option><option value="omission">Omission</option></select></label>
    <label>Scope lineage<select aria-label="Scope lineage" value={link} onChange={e=>setLink(e.target.value as typeof link)}><option value="new">New work — create linked ID</option><option value="existing">Change accepted scope — retain ID</option></select></label>
    <label>Price (£, optional)<input aria-label="Variation price (£, optional)" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <button className="primary" disabled={busy||!description.trim()} onClick={()=>void propose()}>Add proposed variation</button>{amount===""&&<p>Missing price — approval unavailable</p>}
   </section>
   <div className="variation-list">{view.variations.map(v=>{const current=v.revisions.find(r=>r.id===v.currentRevisionId);return <article id={`variation-${v.id}`} key={v.id} data-testid={`variation-${v.id}`}><h3>{v.description}</h3><p>{v.existingScopeItemId?"Existing scope ID retained":"New linked scope ID"}: <code>{v.scopeItemId}</code></p>{!current&&<p>Needs a price</p>}{!current&&proposals.get(v.id)!=null&&<p>Proposed price from the evidence: {pounds(proposals.get(v.id)!)}. Check the net price and VAT treatment, then save and approve the exact revision.</p>}{v.revisions.map(r=><section key={r.id} className="variation-revision"><strong>Price revision {r.revision} · {pounds(r.signedDeltaPence)}</strong><p>{r.approved?"Approved immutable commercial fact":r.rejected?"Rejected — retained in history":r.id===v.currentRevisionId?"Proposed — not billable":"Superseded revision"}</p><p>Source: {r.source} · Actor: {r.actor}</p>{r.approved&&<p>{r.approvalMethod==="customer_authenticated"?"Authenticated customer approval for this exact revision":r.approvalMethod==="customer_evidence"?"Recorded customer approval evidence":ATT}</p>}</section>)}{current&&!current.approved&&!current.rejected&&<div className="variation-actions"><button onClick={()=>void approve(v.id,current.id)}>Approve exact revision</button><button onClick={()=>void reject(v.id,current.id)}>Reject revision</button></div>}{editing===v.id?<div><label>New price (£)<input aria-label={`New price ${v.description}`} value={editAmount} onChange={e=>setEditAmount(e.target.value)}/></label><button onClick={()=>void revise(v.id,current&&current.signedDeltaPence<0?"omission":"addition")}>Save new proposed revision</button></div>:null}<button onClick={()=>{if(editing===v.id)return;setEditing(v.id);setEditRevisionId(v.currentRevisionId);setEditAmount(current?(Math.abs(current.signedDeltaPence)/100).toFixed(2):proposals.get(v.id)!=null?(proposals.get(v.id)!/100).toFixed(2):"");}}>Change price</button></article>;})}</div>
  </fieldset>
  {busy&&<p role="status">Saving variation…</p>}{notice&&<p className="quote-notice" aria-live="polite">{notice}</p>}
 </section>;
}
