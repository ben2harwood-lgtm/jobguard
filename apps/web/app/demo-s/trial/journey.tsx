"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { TrialDemoReport } from "@jobguard/db";
import { parseTrialIntent,readTrialIntent,type TrialIntent } from "./journey-model";
import type { TrialDemoCommand } from "@jobguard/core";
const button={minHeight:44,padding:"10px 16px",margin:4};
type Auth={csrfToken:string;memberships:{tenantId:string;id:string;name:string}[]};
type Intent=TrialIntent;
/** Only original request intents live in browser storage. Every outcome comes from a producer read. */
export function TrialJourney(){
 const [auth,setAuth]=useState<Auth|null>(null),[tenant,setTenant]=useState(""),[run,setRun]=useState("");
 const [first,setFirst]=useState(""),[second,setSecond]=useState("");
 const [report,setReport]=useState<TrialDemoReport|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [pending,setPending]=useState<Intent|null>(null),[attempt,setAttempt]=useState<string|null>(null);
 const lock=useRef(false);
 const key=auth?`trial-demo.intent.v1:${tenant}:${auth.memberships.find(m=>m.tenantId===tenant)?.id}:${run}`:"";
 useEffect(()=>{let active=true;void fetch("/api/auth/session",{cache:"no-store"}).then(async response=>{
  if(!response.ok)throw new Error("Sign in to the fictional owning company.");
  const value:Auth=await response.json(),q=new URLSearchParams(location.search),company=q.get("tenantId")??"";
  if(!value.memberships.some(m=>m.tenantId===company))throw new Error("Choose your fictional company in the practice chooser.");
  if(active){setAuth(value);setTenant(company);setRun(q.get("runId")??"");}
 }).catch(reason=>{if(active)setError(reason.message);});return()=>{active=false;};},[]);
 const call=useCallback(async(intent:Intent)=>{
  if(!auth||!tenant)throw new Error("Sign in first.");
  intent=parseTrialIntent(intent);
  const response=await fetch(intent.path,{method:"POST",cache:"no-store",headers:{"content-type":"application/json","x-tenant-id":tenant,"x-csrf-token":auth.csrfToken},body:JSON.stringify(intent.body)});
  const result=await response.json();
  if(!response.ok){const failure=new Error(result.code==="TRIAL_COMPLETED_CARD_REQUIRED"?"Add a card before the second job goes live.":result.code==="CAPACITY_ADMISSION_UNAVAILABLE"?"Capacity producer incomplete: this job has not gone live.":result.code??"Trial unavailable");Object.assign(failure,{definitive:[400,401,403,404,409].includes(response.status)});throw failure;}
  return result;
 },[auth,tenant]);
 const demo=(body:TrialDemoCommand):Intent=>({path:"/api/small-builder-demo/trial",body});
 async function read(){const value:TrialDemoReport=await call(demo({version:"trial-demo-command.v1",action:"read",runId:run}));setReport(value);setFirst(value.first.jobId);setSecond(value.second.jobId);return value;}
 useEffect(()=>{
  if(!key||!run)return;
  let active=true;
  try{setPending(readTrialIntent(sessionStorage.getItem(key)));setAttempt(sessionStorage.getItem(`${key}:card`));}catch{setError("Browser request storage unavailable.");}
  const q=new URLSearchParams(location.search),snapshotId=q.get("snapshotId");
  void call(demo(snapshotId?{version:"trial-demo-command.v1",action:"report",runId:run,snapshotId}:{version:"trial-demo-command.v1",action:"read",runId:run})).then(value=>{if(active){setReport(value);setFirst(value.first.jobId);setSecond(value.second.jobId);}}).catch(()=>{if(active)setError("Bind two fictional company jobs below, or resume an existing bound run.");});
  return()=>{active=false;};
 },[key,run,call]);
 async function send(intent:Intent){
  if(lock.current||!auth)return;lock.current=true;setBusy(true);setError("");
  try{
   // Historical snapshot/replay output cannot revive actions in an archived run.
   if(intent.path!=="/api/small-builder-demo/trial"){
    const current=await call(demo({version:"trial-demo-command.v1",action:"read",runId:run}));
    if(current.archived){setReport(current);throw Object.assign(new Error("This run is archived. Open its replacement in the chooser."),{definitive:true});}
   }
   sessionStorage.setItem(key,JSON.stringify(intent));setPending(intent);
   const value=await call(intent);
   sessionStorage.removeItem(key);setPending(null);
   if(intent.path.endsWith("/trial")&&(intent.body as {kind?:string}).kind==="request_card"){
    const id=(intent.body as {commandId:string}).commandId;sessionStorage.setItem(`${key}:card`,id);setAttempt(id);
   }
   if(intent.path.endsWith("/trial")&&(intent.body as {kind?:string}).kind==="simulate_card"){sessionStorage.removeItem(`${key}:card`);setAttempt(null);}
   if(value.version==="trial-demo-report.v1"){
    setReport(value);setFirst(value.first.jobId);setSecond(value.second.jobId);
    if((intent.body as {action?:string}).action==="snapshot")history.replaceState(null,"",`?${new URLSearchParams({tenantId:tenant,runId:run,snapshotId:value.snapshotId})}`);
   }else await read();
  }catch(reason){
   if((reason as {definitive?:boolean}).definitive){sessionStorage.removeItem(key);setPending(null);}
   setError((reason as Error).message);
  }finally{lock.current=false;setBusy(false);}
 }
 function bind(event:FormEvent){event.preventDefault();void send(demo({version:"trial-demo-command.v1",action:"bind",commandId:crypto.randomUUID(),runId:run,firstJobId:first,secondJobId:second}));}
 function activate(which:"first"|"second"){
  const source=report?.[which];if(!source?.target)return;
  void send({path:`/api/jobs/${source.jobId}/quotes/activation`,body:{version:"trial-switch-live.v1",commandId:crypto.randomUUID(),...source.target}});
 }
 const disabled=busy||!!pending||!auth||!!report?.archived;
 return <main style={{maxWidth:760,margin:"auto",padding:24,overflowWrap:"anywhere"}}><a href="/demo-s">Practice chooser</a><h1>Guided first-job trial</h1>
  <p>Fictional company only · no live provider or money. Prices and customer-facing legal wording: [BEN TO SUPPLY].</p>
  <ol><li>Create and review your fictional first job, send its free quote and record exact acceptance in the existing job journey.</li>
   <li>Bind that job and a separate accepted second job below. Company identity must already have an approved reference fixture; this guide cannot invent verification.</li>
   <li>Try first-job Skip for now, then try the second job without a card. Add and complete the fictional card through the existing trial commands.</li>
   <li>Lock or close the first job through its normal commands, or activate the second. Compare saved sources with the day-90 preview.</li></ol>
  <p>Missing capacity admission, Final Check or billing producers remain incomplete. A refusal never records a successful trial.</p>
  {error&&<p role="alert">{error}</p>}
  {pending&&<button style={button} disabled={busy} onClick={()=>void send(pending)}>Retry exact saved request</button>}
  {auth&&<><p>Company: {auth.memberships.find(m=>m.tenantId===tenant)?.name}. Saved run: {run}</p>
   {!report&&<form onSubmit={bind}><label>First accepted job reference<input required value={first} onChange={e=>setFirst(e.target.value)}/></label><label>Second accepted job reference<input required value={second} onChange={e=>setSecond(e.target.value)}/></label><button style={button} disabled={disabled}>Bind fictional jobs</button></form>}
   <button style={button} disabled={busy||!!pending} onClick={()=>void read().catch(reason=>setError(reason.message))}>Resume saved run</button></>}
  {report&&<><p>{report.archived?"Archived run":"Incomplete journey"}. Trial eligibility and subscription history survive reset.</p>
   <p><a href={`/jobs/${report.first.jobId}`}>First job: quote, proof, lock and close</a> · <a href={`/jobs/${report.second.jobId}`}>Second job</a> · <a href="/plans">Accepted subscription terms and saved periods</a></p>
   <section aria-label="Trial actions"><h2>Try the trial commands</h2>
    {!report.first.start&&report.firstEligibility.offerSkip&&report.first.target&&<button style={button} disabled={disabled} onClick={()=>activate("first")}>Skip for now</button>}
    {!report.first.start&&report.first.target&&report.firstEligibility.cardGate==="completed"&&<button style={button} disabled={disabled} onClick={()=>activate("first")}>Switch first job live</button>}
    {report.first.start&&report.second.target&&<button style={button} disabled={disabled} onClick={()=>activate("second")}>{report.secondEligibility.cardGate==="completed"?"Switch second job live":"Try second job without a card"}</button>}
    {report.firstEligibility.cardGate!=="completed"&&<button style={button} disabled={disabled||!!attempt} onClick={()=>void send({path:`/api/jobs/${report.first.jobId}/trial`,body:{version:"trial-screen-command.v1",kind:"request_card",commandId:crypto.randomUUID()}})}>Add a card</button>}
    {attempt&&<button style={button} disabled={disabled} onClick={()=>void send({path:`/api/jobs/${report.first.jobId}/trial`,body:{version:"trial-screen-command.v1",kind:"simulate_card",commandId:attempt}})}>Complete fictional card setup</button>}
    {report.firstEligibility.cardGate==="completed"&&<p>Simulated card on file.</p>}
   </section>
   <section aria-label="Source report"><h2>Stored source report</h2><p>Current outcome: {report.first.timeline?(report.first.timeline.active?"Trial active":"Trial ended"):"No saved trial start"}. Source trial: {report.first.start?.trialId??"missing"}.</p>
    <p>Lock and close keep the end day free. Second activation starts subscription that day; day 90 ends at London midnight. Pro-ration uses accepted effective terms only.</p>
    <p>Controlled day-90 preview: {report.deadlinePreview?`${report.deadlinePreview.active?"active":"ended"} at ${report.deadlinePreview.endedAt}`:"unavailable until a trial start is stored"}. Preview only; production time and accepted terms stay unchanged.</p>
    <p>Stored subscription agreements: {report.subscription.agreements.length}; periods: {report.subscription.periods.length}; simulated results: {report.subscription.results.length}. No report number asserts settlement.</p>
    <details><summary>Exact trial, job, source-event and subscription record references</summary><pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(report,null,2)}</pre></details>
    <button style={button} disabled={disabled} onClick={()=>void send(demo({version:"trial-demo-command.v1",action:"snapshot",commandId:crypto.randomUUID(),runId:run}))}>Save source report</button>
   </section>
   <p><a href={`/demo-s?${new URLSearchParams({tenantId:tenant,runId:run})}`}>Archive and reset in chooser</a>. Bind the replacement to these same jobs; reset cannot restore a used trial identity.</p>
  </>}
 </main>;
}
