"use client";
import { JobFactsGeneration } from "./job-facts-refresh";
import { SimulationFeeStatements } from "./simulation-fee-statements";
import { PracticeFacts } from "./practice-facts";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { jobWorkspaceResponseV1, type JobWorkspaceResponse } from "@jobguard/api/workspace-contracts";
import { captureWorkspaceResponseV1, type CaptureWorkspaceResponse } from "@jobguard/api/capture-contracts";
import { ReviewProposal } from "./review-proposal";
import { hasStartedWork, jobStatusLabels, mayOpenSavedQuote, requestedWorkspaceSection } from "./workspace-lifecycle";
import { PracticeJourney } from "./practice-journey";
import { Materials } from "./materials";
import { PurchaseOrder } from "./purchase-order";
import { SupplierDocuments } from "./supplier-documents";
import { SupplierMatch } from "./supplier-match";
import { ThingsToCheck } from "./things-to-check";
import { PreventionChecks } from "./prevention-checks";
import { Readiness } from "./readiness";
import { RelevanceInbox } from "./relevance-inbox";
import { CommercialIntegrity } from "./commercial-integrity";
import { ProofStage } from "./proof-stage";
import { WatchdogPanel, WatchdogStatusProvider } from "./watchdog-panel";
import { RecoveryCases } from "./recovery-cases";
import { JobParties } from "./job-parties";
import { RecoveryAllocations } from "./recovery-allocations";
import { PracticeReceipts } from "./practice-receipts";
import { PaymentFeeStatements } from "./payment-fee-statements";
import { CustomerMessages, JobDiary } from "./job-sources";
import { JobWorkState } from "./job-work-state";
import { JobFinalAccount } from "./job-final-account";
import { FinalCheckReveal } from "./final-check-reveal";
const stages=["Scope","Quote","Work","Final account","Payment"];

export function WorkspaceShell({jobId}:{jobId:string}){
 const[job,setJob]=useState<JobWorkspaceResponse["job"]|null>(null);
 const[capture,setCapture]=useState<CaptureWorkspaceResponse|null>(null);
 const[error,setError]=useState<"forbidden"|"unavailable"|null>(null);
 const[loading,setLoading]=useState(true),[fragment,setFragment]=useState("");
 const[factsGeneration,setFactsGeneration]=useState(0);
 const errorRef=useRef<HTMLHeadingElement>(null),generation=useRef(0),activeRequest=useRef<AbortController|null>(null);
 const currentJobId=useRef(jobId);currentJobId.current=jobId;
 // The job whose captured review is mounted in this render, if any.
 const shownJobId=useRef<string|null>(null);shownJobId.current=!loading&&!error&&(capture?.jobId===jobId||job?.id===jobId)?jobId:null;
 const acceptSnapshot=useCallback((snapshot:CaptureWorkspaceResponse)=>{
  if(snapshot.jobId!==currentJobId.current)return;
  // A newer post-command read supersedes any pre-command navigation request.
  generation.current++;activeRequest.current?.abort();setCapture(snapshot);setJob(null);setError(null);setLoading(false);
 },[]);
 const load=useCallback(async()=>{
  const current=++generation.current;activeRequest.current?.abort();const controller=new AbortController();activeRequest.current=controller;
  // A re-read of the job already on screen keeps it mounted, so unsaved review
  // choices and an open editor survive while the server copy reloads.
  const keep=shownJobId.current===jobId;
  if(!keep){setLoading(true);setJob(null);setCapture(null);}setError(null);
  try{
   const proposalResponse=await fetch(`/api/jobs/${encodeURIComponent(jobId)}/proposal`,{cache:"no-store",signal:controller.signal});
   if(current!==generation.current)return;
   if(proposalResponse.ok){const parsed=captureWorkspaceResponseV1.parse(await proposalResponse.json());if(current===generation.current)setCapture(parsed);return;}
   // Only an absent capture permits the non-capture workspace. A failed capture
   // service must not be disguised as an apparently healthy partial workspace.
   if(proposalResponse.status!==404){setError(proposalResponse.status===401||proposalResponse.status===403?"forbidden":"unavailable");return;}
   const response=await fetch(`/api/jobs/${encodeURIComponent(jobId)}`,{cache:"no-store",signal:controller.signal});
   if(current!==generation.current)return;
   if(!response.ok){setError([401,403,404].includes(response.status)?"forbidden":"unavailable");return;}
   const parsed=jobWorkspaceResponseV1.parse(await response.json());if(current===generation.current){setCapture(null);setJob(parsed.job);}
  }catch{if(current===generation.current&&!controller.signal.aborted)setError("unavailable");}
  finally{if(current===generation.current)setLoading(false);}
 },[jobId]);
 useEffect(()=>{void load();return()=>{generation.current++;activeRequest.current?.abort();}},[load]);
 useEffect(()=>{setFragment(window.location.hash);const changed=()=>{setFragment(window.location.hash);void load();setFactsGeneration(value=>value+1);};window.addEventListener("hashchange",changed);return()=>window.removeEventListener("hashchange",changed);},[load]);
 useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
 const section=capture?requestedWorkspaceSection(capture.status,fragment==="#variations-title"?"#work-proof":fragment):"scope";
 // Plain saved-job URLs retain the confirmed-scope step. Explicit job anchors
 // open the editor, including diary/customer panels nested inside the live journey.
 const pricing=section!=="scope"||Boolean(capture&&hasStartedWork(capture.status)&&fragment&&fragment!=="#scope");
 useEffect(()=>{
  if(loading||!capture||!fragment)return;
  const root=document.getElementById("captured-job-workspace");if(!root)return;
  const selector=fragment==="#quote"?"#quote":fragment==="#scope"?"#scope":fragment==="#work-proof"?"#work-proof h2":fragment==="#variations-title"?"#variations-title":fragment==="#practice-tools"?"#practice-tools":section==="final-account"?"#final-account-title":".quote-editor h2";
  let observer:MutationObserver|undefined;
  const source=/^#(?:variation|invoice)-[a-f0-9-]{36}$/iu.test(fragment)?fragment.slice(1):null;
  const focus=()=>{const target=source?document.getElementById(source):root.querySelector<HTMLElement>(selector);if(!target||!root.contains(target))return false;target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:"start"});observer?.disconnect();return true;};
  if(focus())return;
  observer=new MutationObserver(()=>{focus();});observer.observe(root,{childList:true,subtree:true});
  const timeout=window.setTimeout(()=>observer?.disconnect(),15000);
  return()=>{observer?.disconnect();window.clearTimeout(timeout);};
 // A fresh snapshot of the same destination must not steal control focus.
 },[capture?.jobId,loading,section,fragment]);
 // These independent reads can expand above pricing after its own quote read.
 const[settledJourney,setSettledJourney]=useState("");
 const[settledParties,setSettledParties]=useState("");
 // Once this job's layout has settled, status refreshes must not disable the
 // focused editor control. A different job still waits for its own first read.
 const journeySettled=useCallback((id:string)=>setSettledJourney(id),[]);
 if(loading)return <main className="workspace-page" aria-live="polite"><p>Loading your job…</p></main>;
 if(error)return <main className="workspace-page"><section className="workspace-error" role="alert"><h1 ref={errorRef} tabIndex={-1}>{error==="forbidden"?"You cannot open this job":"Your job could not load"}</h1><p>{error==="forbidden"?"Use a job available to this practice session.":"Nothing was changed. Try loading the saved job again."}</p>{error==="unavailable"&&<button className="primary" onClick={()=>void load()}>Try again</button>}<Link href="/classic">Back to Jobs</Link></section></main>;
 if(capture)return <JobFactsGeneration.Provider value={factsGeneration}><WatchdogStatusProvider jobId={jobId} initialStatus={capture.status}>
  <main className="workspace-page" id="captured-job-workspace" data-testid="workspace-job-id" data-job-id={jobId}>
   <header><h1>{capture.proposal.title}</h1><p className="status">{jobStatusLabels[capture.status]}</p></header>
   {/* The section links come first and never change identity, so the first control
       on the job page stays put while the journey card and customer form load. */}
   <nav className="workspace-stages" aria-label="Saved job sections"><a href="#scope">Scope</a>{mayOpenSavedQuote(capture.status)&&<a href="#quote">Quote</a>}{hasStartedWork(capture.status)&&<><a href="#work-proof">Work and proof</a><a href="#final-account-title">Final account and invoices</a></>}</nav>
   <PracticeJourney jobId={jobId} status={capture.status} onSettled={journeySettled}/>
   <JobParties jobId={jobId} onSettled={setSettledParties}/>
   <section id="scope" tabIndex={-1}><div id="quote" tabIndex={-1}><ReviewProposal layoutReady={settledJourney===jobId&&settledParties===jobId} key={jobId} result={capture} initialPricing={pricing} fragment={fragment} beforeProof={<><JobWorkState jobId={jobId}/><JobDiary key={`diary:${jobId}`} jobId={jobId}/><CustomerMessages key={`messages:${jobId}`} jobId={jobId}/></>} finalAccount={null} practiceTools={null} onSnapshot={acceptSnapshot} onScope={snapshot=>{if(snapshot.jobId!==currentJobId.current)return;acceptSnapshot(snapshot);setFragment("#scope");history.replaceState(null,"",`${location.pathname}${location.search}#scope`);}} back={()=>location.assign("/classic")}/></div></section>
   {/* Keep the lock mounted through scope/pricing navigation, including phone taps. */}
   {hasStartedWork(capture.status)&&<JobFinalAccount jobId={jobId} beforeInvoices={<FinalCheckReveal jobId={jobId}/>}/>}
   {!hasStartedWork(capture.status)&&<WatchdogPanel disableControls={false}><ProofStage jobId={jobId}/></WatchdogPanel>}
   <hr/>
   <h2 id="practice-tools">Practice tools — demo only, not part of your job</h2>
   <p>These tools use fictional examples to explore JobGuard; they are separate from your job’s next steps.</p>
   <Materials jobId={jobId} scopeItemId={capture.proposal.lines[0]?.scopeItemId??""}/>
   <WatchdogPanel><PurchaseOrder jobId={jobId}/></WatchdogPanel>
   <WatchdogPanel><SupplierDocuments jobId={jobId}/></WatchdogPanel>
   <WatchdogPanel><SupplierMatch jobId={jobId}/></WatchdogPanel>
   <WatchdogPanel><ThingsToCheck jobId={jobId}/></WatchdogPanel>
   <WatchdogPanel><Readiness jobId={jobId}/></WatchdogPanel>
   <WatchdogPanel disableControls={false}><RelevanceInbox jobId={jobId}/></WatchdogPanel>
   <CommercialIntegrity jobId={jobId}/>
   {mayOpenSavedQuote(capture.status)&&<PreventionChecks jobId={jobId}/>}
   <RecoveryCases jobId={jobId}/>
   <PracticeReceipts jobId={jobId}/>
   <PracticeFacts jobId={jobId}/>
   <RecoveryAllocations jobId={jobId}/>
   <PaymentFeeStatements key={jobId} jobId={jobId}/>
   {hasStartedWork(capture.status)&&<SimulationFeeStatements key={`statements-${jobId}`} jobId={jobId}/>}
   <Link href={`/jobs/${jobId}/trial`} prefetch={false}>First job trial and card</Link>{" "}
   <Link href={`/jobs/${jobId}/recovery-journey`} prefetch={false}>Recovery practice guide</Link>
  </main>
 </WatchdogStatusProvider></JobFactsGeneration.Provider>;
 if(!job)return null;
 return <JobFactsGeneration.Provider value={factsGeneration}><WatchdogStatusProvider jobId={jobId} initialStatus={job.status}><main className="workspace-page"><Link href="/classic">← Jobs</Link><Link href={`/jobs/${jobId}/trial`} prefetch={false}>First job trial and card</Link><JobParties jobId={jobId}/><header><p className="eyebrow">Saved practice job</p><h1>{job.title}</h1><p className="status" data-testid="job-status">{jobStatusLabels[job.status]}</p><p>Server revision <strong data-testid="job-revision">{job.revision}</strong></p></header><nav className="workspace-stages" aria-label="Job stages">{stages.map((stage,index)=><a href={`#stage-${index}`} key={stage}>{stage}</a>)}</nav><PreventionChecks jobId={jobId}/><section id="stage-0"><h2>Scope</h2><p>Persistent job ID <code data-testid="job-id">{job.id}</code></p><p>Practice sandbox — synthetic data; nothing is sent or charged</p></section><WatchdogPanel><PurchaseOrder jobId={jobId}/></WatchdogPanel><WatchdogPanel><SupplierDocuments jobId={jobId}/></WatchdogPanel><WatchdogPanel><SupplierMatch jobId={jobId}/></WatchdogPanel><WatchdogPanel><ThingsToCheck jobId={jobId}/></WatchdogPanel><WatchdogPanel><Readiness jobId={jobId}/></WatchdogPanel><WatchdogPanel disableControls={false}><RelevanceInbox jobId={jobId}/></WatchdogPanel><WatchdogPanel disableControls={false}><ProofStage jobId={jobId}/></WatchdogPanel>{stages.slice(1).map((stage,index)=><section id={`stage-${index+1}`} key={stage}><h2>{stage}</h2><p>Illustration — not yet connected to this job</p></section>)}<RecoveryCases jobId={jobId}/><PaymentFeeStatements key={jobId} jobId={jobId}/>{hasStartedWork(job.status)&&<SimulationFeeStatements key={`statements-${jobId}`} jobId={jobId}/>}</main></WatchdogStatusProvider></JobFactsGeneration.Provider>;
}
