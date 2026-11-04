"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { TrialDemoReport } from "./report-type";
import { parseTrialIntent,readTrialIntent,type TrialIntent } from "./journey-model";
import type { TrialDemoCommand } from "@jobguard/core";
const button={minHeight:44,padding:"10px 16px",margin:4};
const refusals:Record<string,string>={TRIAL_COMPLETED_CARD_REQUIRED:"Add a card before the second job goes live.",TRIAL_SUBSCRIPTION_TERMS_REQUIRED:"Accept monthly terms on Plans before the second job goes live. This job has not gone live.",CAPACITY_ADMISSION_UNAVAILABLE:"The capacity check is unavailable: this job has not gone live.",METER_UPGRADE_REQUIRED:"Your Solo plan and grace place are full: this job has not gone live.",TRIAL_IDENTITY_REQUIRED:"This fictional company has no approved identity: this job has not gone live.",WORK_STATE_STALE_REVISION:"This job has newer work saved, so it was not closed."};
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
  if(!response.ok){const failure=new Error(refusals[result.code]??result.code??"Trial unavailable");Object.assign(failure,{definitive:[400,401,403,404,409].includes(response.status)});throw failure;}
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
  <ol><li>This guide needs two accepted jobs and an approved reference identity for your company. Company job capture and identity approval have no public screen yet, so they are prepared beforehand and never invented here.</li>
   <li>Bind the two jobs below, then try Skip for now on the first job. That job goes live and the free trial starts.</li>
   <li>Try the second job without a card, add and complete the fictional card, and accept monthly terms on Plans.</li>
   <li>End the trial by closing the first job or by switching the second job live. Compare the saved sources with the day-90 preview.</li></ol>
  <p>Anything not done is listed in the stored report. A refusal never records a successful trial.</p>
  {error&&<p role="alert">{error}</p>}
  {pending&&<button style={button} disabled={busy} onClick={()=>void send(pending)}>Retry exact saved request</button>}
  {auth&&<><p>Company: {auth.memberships.find(m=>m.tenantId===tenant)?.name}. Saved run: {run}</p>
   {!report&&<form onSubmit={bind}><label>First accepted job reference<input required value={first} onChange={e=>setFirst(e.target.value)}/></label><label>Second accepted job reference<input required value={second} onChange={e=>setSecond(e.target.value)}/></label><button style={button} disabled={disabled}>Bind fictional jobs</button></form>}
   <button style={button} disabled={busy||!!pending} onClick={()=>void read().catch(reason=>setError(reason.message))}>Resume saved run</button></>}
  {report&&<><p>{report.archived?"Archived run":report.status==="complete"?"Every step has saved records":"In progress"}. Trial eligibility and subscription history survive reset.</p>
   <p><a href="/plans">Accepted subscription terms and saved periods</a> · <a href="/meter">Jobs on the go</a></p>
   <section aria-label="Trial actions"><h2>Try the trial commands</h2>
    {!report.first.start&&report.firstEligibility.offerSkip&&report.first.target&&<button style={button} disabled={disabled} onClick={()=>activate("first")}>Skip for now</button>}
    {!report.first.start&&report.first.target&&report.firstEligibility.cardGate==="completed"&&<button style={button} disabled={disabled} onClick={()=>activate("first")}>Switch first job live</button>}
    {report.first.start&&report.second.target&&<button style={button} disabled={disabled} onClick={()=>activate("second")}>{report.secondEligibility.cardGate==="completed"?"Switch second job live":"Try second job without a card"}</button>}
    {report.firstEligibility.cardGate!=="completed"&&<button style={button} disabled={disabled||!!attempt} onClick={()=>void send({path:`/api/jobs/${report.first.jobId}/trial`,body:{version:"trial-screen-command.v1",kind:"request_card",commandId:crypto.randomUUID()}})}>Add a card</button>}
    {attempt&&<button style={button} disabled={disabled} onClick={()=>void send({path:`/api/jobs/${report.first.jobId}/trial`,body:{version:"trial-screen-command.v1",kind:"simulate_card",commandId:attempt}})}>Complete fictional card setup</button>}
    {report.firstEligibility.cardGate==="completed"&&<p>Simulated card on file.</p>}
    {report.first.timeline?.active&&<button style={button} disabled={disabled} onClick={()=>void send({path:`/api/meter/jobs/${report.first.jobId}/work-state`,body:{version:"job-work-state-command.v1",commandId:crypto.randomUUID(),expectedRevision:0,action:"close",reason:"completed_outside_jobguard",note:"Fictional trial job closed"}})}>Close first job</button>}
   </section>
   <section aria-label="Source report"><h2>Stored source report</h2><p data-testid="trial-outcome">Current outcome: {report.first.timeline?(report.first.timeline.active?"Trial active":`Trial ended by ${report.first.events.map(event=>event.kind.replace("_"," ")).join(", ")}`):"No saved trial start"}. Source trial: {report.first.start?.trialId??"missing"}.</p>
    <p>First job {report.first.jobId}: {report.first.start?"live":"not live"}. Second job {report.second.jobId}: {report.first.events.some(event=>event.kind==="second_activation")?"live":"not live"}.</p>
    {report.missing.length>0&&<><h3>Not done yet</h3><ul data-testid="trial-missing">{report.missing.map(item=><li key={item}>{item}</li>)}</ul></>}
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
