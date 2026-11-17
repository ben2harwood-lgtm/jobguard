"use client";
import { useEffect, useState } from "react";
import { simulationFeeStatementViewV1, type IssuedSimulationFeeStatement } from "@jobguard/core";
import { SimulationFeeCollection } from "./simulation-fee-collection";
const pounds=(p:number)=>`${p<0?"−":""}£${(Math.abs(p)/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
// Finish bounded reads and their response bodies even when navigation replaces the panel.
export async function readSimulationFeeStatements(jobId:string){
 const access=await fetch(`/api/jobs/${jobId}/success-fees`,{cache:"no-store",keepalive:true});
 const accessBody=await access.json();
 const available=access.ok && accessBody.state==="catch_review_available";
 if(!available)return {available:false,statements:[]};
 const response=await fetch(`/api/jobs/${jobId}/success-fees/statements`,{cache:"no-store",keepalive:true});
 const body=await response.json();
 return {available,statements:response.ok?simulationFeeStatementViewV1.parse(body).statements:[]};
}
export function SimulationFeeStatements({jobId}:{jobId:string}) {
 const [available,setAvailable]=useState(false),[records,setRecords]=useState<{document:IssuedSimulationFeeStatement;documentHash:string}[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[approved,setApproved]=useState<string|null>(null);
 const url=`/api/jobs/${jobId}/success-fees/statements`;
 async function load(){const view=await readSimulationFeeStatements(jobId);setAvailable(view.available);setRecords(view.statements);}
 useEffect(()=>{setRecords([]);setApproved(null);setError("");void load().catch(()=>setError("Statements could not be loaded."));},[jobId]);
 async function command(action:"issue"|"approve",record?:typeof records[number]){
  setBusy(true);setError("");
  try{
   const response=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:"simulation-fee-statement-command.v1",commandId:crypto.randomUUID(),action,...(record?{statementId:record.document.statementId,statementHash:record.documentHash}:{})})});
   if(!response.ok){setError("This statement could not be saved or approved. Refresh the source review and try again.");return;}
   if(record)setApproved(record.document.statementId);else setApproved(null);
   await load();
  }catch{setError("Statements could not be loaded.");}finally{setBusy(false);}
 }
 if(!available)return null;
 return <section className="workspace-panel" aria-label="Simulation fee statements"><h2>Simulation fee statements</h2>
  <button disabled={busy} onClick={()=>void command("issue")}>Save current simulation statement or correction</button>
  {records.map((record,index)=>{const d=record.document;return <article key={d.statementId}>
   <h3 data-testid="fee-statement-number">{d.number}</h3><p>{d.warning}</p><p>{d.vatLabel}</p><p>{d.sandboxLabel}</p>
   <p>Policy: {d.policyVersion}</p><p data-testid="statement-success-fee-principal">{pounds(d.cumulativeFeePrincipal.pence)}</p>
   <p>Document principal: <span data-testid="statement-document-principal">{pounds(d.documentPrincipal.pence)}</span></p>
   <p>Q: <a href={`#sources-${d.statementId}`}>{d.qualifyingPrincipal.denominator==="1"?pounds(Number(d.qualifyingPrincipal.numerator)):`${d.qualifyingPrincipal.numerator}/${d.qualifyingPrincipal.denominator} pence (exact)`}</a></p>
   {d.original&&<a href={`#statement-${d.original.statementId}`}>Correction or supplement to {d.original.statementId}</a>}
   <p id={`statement-${d.statementId}`}>Hash: <code>{record.documentHash}</code></p>
   <details id={`sources-${d.statementId}`}><summary>Sources, allocations and approvals</summary>{d.sourceSnapshot.sources.map(s=><p key={s.assessmentId}><a href={`/api/jobs/${jobId}/success-fee-attribution`}>Assessment {s.assessmentId}</a>; source {s.sourceHash}; allocation links {s.allocationIds.join(", ")}; review approval {s.reviewAuthorizationId}</p>)}
    <p>Receipt reversals: {d.sourceSnapshot.adjustments.paymentReversalIds.join(", ")||"None"}; customer adjustments: {d.sourceSnapshot.adjustments.creditNoteIds.join(", ")||"None"}; evidence invalidations: {d.sourceSnapshot.adjustments.evidenceInvalidationIds.join(", ")||"None"}.</p>
    {d.sourceSnapshot.derivations.map(x=><p key={x.derivationId}>Derivation {x.derivationId}; posting approval {x.authorizationId}; review {x.reviewId}</p>)}</details>
   <details><summary>Prior postings and compensation history</summary>{d.postingHistory.map(h=><p key={h.journalId}>{h.journalId}: {pounds(h.principal.pence)}</p>)}<p>Corrections are documentary; they do not post compensation or collect money.</p></details>
   <a href={`${url}/${d.statementId}`} download={`${d.number}.v1.json`}>Download {d.number} (v1)</a>
   {index===records.length-1&&<button disabled={busy} onClick={()=>void command("approve",record)}>Approve this exact simulation statement</button>}
   {approved===d.statementId&&<p role="status">Exact statement approved; no money collected.</p>}
  </article>;})}{records.at(-1)&&<SimulationFeeCollection jobId={jobId} statementId={records.at(-1)!.document.statementId} statementHash={records.at(-1)!.documentHash}/>}
  {error&&<p role="alert" aria-label="Simulation statement error">{error}</p>}
 </section>;
}
