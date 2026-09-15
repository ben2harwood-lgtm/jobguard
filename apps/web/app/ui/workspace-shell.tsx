"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { jobWorkspaceResponseV1, type JobWorkspaceResponse } from "@jobguard/api/workspace-contracts";

const labels: Record<JobWorkspaceResponse["job"]["status"], string> = { draft:"Being drafted", quoting:"Quote being prepared", accepted:"Customer said yes", live:"Work under way", invoiced:"Invoice sent", paid:"Customer paid", lost:"Did not go ahead" };
const stages = ["Scope", "Quote", "Work", "Final account", "Payment"];
export function WorkspaceShell({ jobId }: { jobId: string }) {
  const [job,setJob]=useState<JobWorkspaceResponse["job"]|null>(null),[error,setError]=useState<"forbidden"|"unavailable"|null>(null),[loading,setLoading]=useState(true); const errorRef=useRef<HTMLHeadingElement>(null);
  const load=useCallback(async()=>{setLoading(true);setError(null);try{const response=await fetch(`/api/jobs/${encodeURIComponent(jobId)}`,{cache:"no-store"});if(!response.ok){setError(response.status===403||response.status===404?"forbidden":"unavailable");return;}const parsed=jobWorkspaceResponseV1.safeParse(await response.json());if(!parsed.success)throw new Error("INVALID_RESPONSE");setJob(parsed.data.job);}catch{setError("unavailable");}finally{setLoading(false);}},[jobId]);
  useEffect(()=>{void load();},[load]); useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
  if(loading)return <main className="workspace-page" aria-live="polite"><p>Loading your job…</p></main>;
  if(error)return <main className="workspace-page"><section className="workspace-error" role="alert"><h1 ref={errorRef} tabIndex={-1}>{error==="forbidden"?"You cannot open this job":"Your job could not load"}</h1><p>{error==="forbidden"?"It belongs to another practice workspace or is unavailable.":"The database is temporarily unavailable. No example status has been substituted."}</p>{error==="unavailable"&&<button className="primary" onClick={()=>void load()}>Try again</button>}<Link href="/">Back to Jobs</Link></section></main>;
  if(!job)return null;
  return <main className="workspace-page"><Link className="workspace-back" href="/">← Jobs</Link><header className="workspace-title"><p className="eyebrow">Synthetic practice job</p><h1>{job.title}</h1><p data-testid="job-status" className={`status ${job.status}`}>{labels[job.status]}</p><p>Server revision <strong data-testid="job-revision">{job.revision}</strong></p></header><nav className="stage-nav" aria-label="Job stages">{stages.map((stage,index)=><a href={`#stage-${index}`} key={stage}>{stage}</a>)}</nav><section className="workspace-panel" id="stage-0"><h2>Job workspace</h2><dl><div><dt>Persistent job ID</dt><dd data-testid="job-id">{job.id}</dd></div><div><dt>Source</dt><dd>PostgreSQL job revision {job.revision}</dd></div></dl></section>{stages.slice(1).map((stage,index)=><section className="workspace-panel disconnected" id={`stage-${index+1}`} key={stage}><h2>{stage}</h2><p>Illustration — not yet connected to this job</p></section>)}</main>;
}
