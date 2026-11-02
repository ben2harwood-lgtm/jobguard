"use client";
import { useCallback, useEffect, useState } from "react";
type TrialView={version:"trial-screen.v1";start:{startedAt:string}|null;timeline:{active:boolean;endedAt:string|null;deadlineAt:string}|null;
 target:{acceptedDocumentId:string;acceptedDocumentVersion:number;acceptedDocumentHash:string;expectedJobRevision:number}|null;
 eligibility:{offerSkip:boolean;cardGate:string;cardAction:string|null}};
const button={minHeight:44,minWidth:44,maxWidth:"100%",padding:"10px 16px"};
export function FirstJobTrial({jobId}:{jobId:string}){
 const [auth,setAuth]=useState<{csrfToken:string;memberships:{tenantId:string;name:string;role:string}[]}|null>(null);
 const [tenant,setTenant]=useState("");const [view,setView]=useState<TrialView|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [attempt,setAttempt]=useState<string|null>(null);
 useEffect(()=>{let active=true;fetch("/api/auth/session",{cache:"no-store"}).then(async response=>{if(!response.ok)throw new Error("Sign in to your synthetic company first.");return response.json();}).then(value=>{if(active){setAuth(value);if(value.memberships.length===1)setTenant(value.memberships[0].tenantId);}}).catch(reason=>{if(active)setError(String(reason.message));});return()=>{active=false;};},[]);
 const call=useCallback(async(path:string,body?:unknown,signal?:AbortSignal)=>{
  if(!auth||!tenant)throw new Error("Choose your company first.");
  const response=await fetch(path,{method:body?"POST":"GET",cache:"no-store",signal:signal??null,headers:{"Content-Type":"application/json","x-csrf-token":auth.csrfToken,"x-tenant-id":tenant},...(body?{body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw new Error(result.code==="TRIAL_COMPLETED_CARD_REQUIRED"?"Add a card before a second job goes live.":result.code==="CAPACITY_ADMISSION_UNAVAILABLE"?"Switch-live is unavailable until the capacity check is connected. Your job has not gone live.":result.code??"Trial unavailable");return result;
 },[auth,tenant]);
 const reload=useCallback(async(signal?:AbortSignal)=>{const result=await call(`/api/jobs/${jobId}/trial`,undefined,signal);if(signal?.aborted)return;if(result.version!=="trial-screen.v1")throw new Error("Trial unavailable");setView(result);},[call,jobId]);
 useEffect(()=>{const controller=new AbortController();setView(null);setAttempt(null);setError("");if(tenant)reload(controller.signal).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});return()=>controller.abort();},[tenant,reload]);
 async function act(action:"request"|"simulate"|"activate"){
  setBusy(true);setError("");try{
   if(action==="request"){const commandId=crypto.randomUUID();await call(`/api/jobs/${jobId}/trial`,{version:"trial-screen-command.v1",kind:"request_card",commandId});setAttempt(commandId);}
   else if(action==="simulate"&&attempt){await call(`/api/jobs/${jobId}/trial`,{version:"trial-screen-command.v1",kind:"simulate_card",commandId:attempt});setAttempt(null);}
   else if(action==="activate"&&view?.target){await call(`/api/jobs/${jobId}/quotes/activation`,{version:"trial-switch-live.v1",commandId:crypto.randomUUID(),...view.target});}
   await reload();
  }catch(reason){setError(reason instanceof Error?reason.message:"Trial unavailable");}finally{setBusy(false);}
 }
 return <main style={{maxWidth:640,margin:"auto",padding:24,overflowWrap:"anywhere"}}>
  <p role="note">Synthetic demo · fictional card · no real charges</p><h1>Your free first job</h1>
  <p>Your first eligible job is subscription-free until lock, close, day 90 or another job goes live. Final Check continues normally.</p>
  {auth&&<label>Company <select disabled={busy} value={tenant} onChange={event=>setTenant(event.target.value)} style={button}><option value="">Choose company</option>{auth.memberships.map(company=><option key={company.tenantId} value={company.tenantId}>{company.name}</option>)}</select></label>}
  {error&&<p role="alert" tabIndex={-1}>{error}</p>}
  {view&&<section aria-label="Trial status">
   {view.timeline?<p>{view.timeline.active?`Trial active until ${view.timeline.deadlineAt}`:`Trial ended at ${view.timeline.endedAt}. Your data and Final Check remain available.`}</p>:<p>The server checks your trial and card again when you switch live.</p>}
   {view.eligibility.cardGate==="completed"?<p>Simulated card on file.</p>:<><button style={button} disabled={busy} onClick={()=>act("request")}>Add a card</button>{attempt&&<button style={button} disabled={busy} onClick={()=>act("simulate")}>Complete fictional card setup</button>}</>}
   {view.target&&view.eligibility.offerSkip&&<button style={button} disabled={busy} onClick={()=>act("activate")}>Skip for now</button>}
   {view.target&&view.eligibility.cardGate==="completed"&&<button style={button} disabled={busy} onClick={()=>act("activate")}>Switch this job live</button>}
  </section>}
  <a href={`/jobs/${jobId}`}>Back to job</a>
 </main>;
}
