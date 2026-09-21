"use client";
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
const stages=["Scope","Quote","Work","Final account","Payment"];

export function WorkspaceShell({jobId}:{jobId:string}){
 const[job,setJob]=useState<JobWorkspaceResponse["job"]|null>(null);
 const[capture,setCapture]=useState<CaptureWorkspaceResponse|null>(null);
 const[error,setError]=useState<"forbidden"|"unavailable"|null>(null);
 const[loading,setLoading]=useState(true),[fragment,setFragment]=useState("");
 const errorRef=useRef<HTMLHeadingElement>(null),generation=useRef(0),activeRequest=useRef<AbortController|null>(null);
 const currentJobId=useRef(jobId);currentJobId.current=jobId;
 const acceptSnapshot=useCallback((snapshot:CaptureWorkspaceResponse)=>{
  if(snapshot.jobId!==currentJobId.current)return;
  // A newer post-command read supersedes any pre-command navigation request.
  generation.current++;activeRequest.current?.abort();setCapture(snapshot);setJob(null);setError(null);setLoading(false);
 },[]);
 const load=useCallback(async()=>{
  const current=++generation.current;activeRequest.current?.abort();const controller=new AbortController();activeRequest.current=controller;
  setLoading(true);setError(null);setJob(null);setCapture(null);
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
   const parsed=jobWorkspaceResponseV1.parse(await response.json());if(current===generation.current)setJob(parsed.job);
  }catch{if(current===generation.current&&!controller.signal.aborted)setError("unavailable");}
  finally{if(current===generation.current)setLoading(false);}
 },[jobId]);
 useEffect(()=>{void load();return()=>{generation.current++;activeRequest.current?.abort();}},[load]);
 useEffect(()=>{setFragment(window.location.hash);const changed=()=>{setFragment(window.location.hash);void load();};window.addEventListener("hashchange",changed);return()=>window.removeEventListener("hashchange",changed);},[load]);
 useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
 const section=capture?requestedWorkspaceSection(capture.status,fragment):"scope";
 useEffect(()=>{
  if(loading||!capture||section==="scope")return;
  const root=document.getElementById("captured-job-workspace");if(!root)return;
  const selector=section==="work"?"#work-proof h2":section==="final-account"?"#final-account-title":".quote-editor h2";
  let observer:MutationObserver|undefined;
  const focus=()=>{const target=root.querySelector<HTMLElement>(selector);if(!target)return false;target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:"start"});observer?.disconnect();return true;};
  if(focus())return;
  observer=new MutationObserver(()=>{focus();});observer.observe(root,{childList:true,subtree:true});
  const timeout=window.setTimeout(()=>observer?.disconnect(),15000);
  return()=>{observer?.disconnect();window.clearTimeout(timeout);};
 },[capture,loading,section]);
 if(loading)return <main className="workspace-page" aria-live="polite"><p>Loading your job…</p></main>;
 if(error)return <main className="workspace-page"><section className="workspace-error" role="alert"><h1 ref={errorRef} tabIndex={-1}>{error==="forbidden"?"You cannot open this job":"Your job could not load"}</h1><p>{error==="forbidden"?"Use a job available to this practice session.":"Nothing was changed. Try loading the saved job again."}</p>{error==="unavailable"&&<button className="primary" onClick={()=>void load()}>Try again</button>}<Link href="/">Back to Jobs</Link></section></main>;
 if(capture)return <main className="workspace-page" id="captured-job-workspace" data-testid="workspace-job-id" data-job-id={jobId}><PracticeJourney jobId={jobId} status={capture.status}/><Materials jobId={jobId} scopeItemId={capture.proposal.lines[0]?.scopeItemId??""}/><PurchaseOrder jobId={jobId}/><SupplierDocuments jobId={jobId}/><nav className="workspace-stages" aria-label="Saved job sections"><a href="#scope">Scope</a>{mayOpenSavedQuote(capture.status)&&<a href="#quote">Quote</a>}{hasStartedWork(capture.status)&&<><a href="#work-proof">Work and proof</a><a href="#final-account-title">Final account and invoices</a></>}</nav><ReviewProposal key={`${jobId}:${section==="scope"?"scope":"editor"}`} result={capture} initialPricing={section!=="scope"} onSnapshot={acceptSnapshot} onScope={snapshot=>{if(snapshot.jobId!==currentJobId.current)return;acceptSnapshot(snapshot);setFragment("#scope");history.replaceState(null,"",`${location.pathname}${location.search}#scope`);}} back={()=>location.assign("/")}/></main>;
 if(!job)return null;
 return <main className="workspace-page"><Link href="/">← Jobs</Link><header><p className="eyebrow">Saved practice job</p><h1>{job.title}</h1><p className="status" data-testid="job-status">{jobStatusLabels[job.status]}</p><p>Server revision <strong data-testid="job-revision">{job.revision}</strong></p></header><nav className="workspace-stages" aria-label="Job stages">{stages.map((stage,index)=><a href={`#stage-${index}`} key={stage}>{stage}</a>)}</nav><section id="stage-0"><h2>Scope</h2><p>Persistent job ID <code data-testid="job-id">{job.id}</code></p><p>Practice sandbox — synthetic data; nothing is sent or charged</p></section>{stages.slice(1).map((stage,index)=><section id={`stage-${index+1}`} key={stage}><h2>{stage}</h2><p>Illustration — not yet connected to this job</p></section>)}</main>;
}
