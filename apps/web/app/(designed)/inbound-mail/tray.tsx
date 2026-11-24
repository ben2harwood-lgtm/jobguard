"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Screen, Shell } from "../designed-ui";

type Tray = { address: string | null; jobs: Array<{id:string;title:string}>; items: Array<{
 id:string; sender:string; subject:string; received_at:string; state:string; revision:number;
 job_id:string|null; document_id:string|null;
}> };
const labels: Record<string,string> = { needs_job:"Needs a job", needs_k6b:"Needs K6B — real files are not supported yet", filed:"Filed", dismissed:"Dismissed" };
export function InboundMailTray() {
 return <Screen title="Forwarded merchant mail" active="jobs">{workspace=><Shell workspace={workspace} title="Forwarded merchant mail" subtitle="Your merchant documents, kept with the right job." active="jobs"><TrayContents/></Shell>}</Screen>;
}
function TrayContents() {
 const [tray,setTray]=useState<Tray|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function reload() {
  const response=await fetch("/api/v2/inbound-mail",{cache:"no-store"});
  const data=await response.json(); if(!response.ok)throw new Error(data.code??"Cannot load forwarded mail"); setTray(data);
 }
 useEffect(()=>{void reload().catch(error=>setError(error.message));},[]);
 async function command(action:string,fields:Record<string,unknown>) {
  setBusy(true);setError("");
  try {
   const response=await fetch("/api/v2/inbound-mail",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,command:{version:"v2-inbound-mail.v1",commandId:crypto.randomUUID(),expectedVersion:0,...fields}})});
   const data=await response.json();if(!response.ok)throw new Error(data.code??"Could not save");await reload();
  }catch(error){setError(error instanceof Error?error.message:"Could not save");}finally{setBusy(false);}
 }
 return <div className="inbound-tray" style={{overflowWrap:"anywhere",minWidth:0}}>
  <Link href="/jobs">← Back to jobs</Link>
  <p>Practice only. This address uses the local catcher. Real files wait for the next stage.</p>
  {error&&<p role="alert">{error}</p>}
  {!tray?<p>Loading mail…</p>:<>
   <Card title="Your firm’s address"><div className="card-body">
    {tray.address?<p><strong>{tray.address}</strong></p>:<button className="btn" disabled={busy} onClick={()=>void command("address",{})}>Create inbound address</button>}
   </div></Card>
   <Card title="Mail tray"><div className="card-body">
    {!tray.items.length&&<p>No forwarded mail yet.</p>}
    {tray.items.map(item=><article key={item.id} style={{border:"1px solid #c9dce4",borderRadius:12,padding:16,marginBlock:16}}>
     <h3>{item.subject||"No subject"}</h3><p>From {item.sender} · {new Date(item.received_at).toLocaleString()}</p>
     <p>{labels[item.state]}</p>
     {item.state==="needs_job"&&<form onSubmit={event=>{event.preventDefault();const jobId=new FormData(event.currentTarget).get("jobId");void command("item",{action:"file",itemId:item.id,jobId,expectedVersion:item.revision});}}>
      <label>Choose a job <select name="jobId" required disabled={busy} style={{maxWidth:"100%"}}><option value="">Choose…</option>{tray.jobs.map(job=><option key={job.id} value={job.id}>{job.title}</option>)}</select></label>{" "}
      <button className="btn" disabled={busy||!tray.jobs.length}>File to job</button>
     </form>}
     {["needs_job","needs_k6b"].includes(item.state)&&<button className="btn" disabled={busy} onClick={()=>void command("item",{action:"dismiss",itemId:item.id,expectedVersion:item.revision})}>Dismiss</button>}
     {item.state==="filed"&&<Link href={`/jobs/${item.job_id}/work`}>Open supplier documents and three-way check</Link>}
    </article>)}
   </div></Card>
   <Card title="Try a practice forward"><div className="card-body">
    <p>Use a job reference from below in the subject, or let the fictional merchant match a single job. Unknown senders wait here.</p>
    <ul>{tray.jobs.map(job=><li key={job.id}>{job.title}: <code>{job.id}</code></li>)}</ul>
    <form onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);void command("receive",{recipient:tray.address,messageId:crypto.randomUUID(),sender:data.get("sender"),subject:data.get("subject"),body:"",fixtureId:"materials-B-invoice",attachments:data.get("attachment")?[{name:"practice.pdf"}]:[]});}}>
     <p><label>Sender <input name="sender" type="email" required defaultValue="merchant@jobguard-v2.invalid" style={{maxWidth:"100%"}}/></label></p>
     <p><label>Subject <input name="subject" required style={{maxWidth:"100%"}}/></label></p>
     <p><label><input name="attachment" type="checkbox"/> Simulate a real attachment (held for K6B)</label></p>
     <button className="btn" disabled={busy||!tray.address}>Catch practice invoice</button>
    </form>
   </div></Card>
  </>}
 </div>;
}
