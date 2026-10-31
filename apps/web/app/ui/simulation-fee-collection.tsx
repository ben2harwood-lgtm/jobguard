"use client";
import { useEffect,useState } from "react";
import { simulationFeeCollectionViewV1,type SimulationFeeCollectionView } from "@jobguard/core";
const pounds=(p:number)=>`£${(p/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
// Navigation must not abandon the bounded request or its response body, including refusals.
export async function readSimulationFeeCollection(jobId:string){
 const response=await fetch(`/api/jobs/${jobId}/success-fees/collection`,{cache:"no-store",keepalive:true});
 const body=await response.json();
 if(!response.ok)throw new Error("Collection records could not be loaded.");
 return simulationFeeCollectionViewV1.parse(body);
}
export async function writeSimulationFeeCollection(jobId:string,command:unknown){
 const response=await fetch(`/api/jobs/${jobId}/success-fees/collection`,{method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});
 await response.json();
 return response;
}
export function SimulationFeeCollection({jobId,statementId,statementHash}:{jobId:string;statementId:string;statementHash:string}){
 const [view,setView]=useState<SimulationFeeCollectionView|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function load(){setView(await readSimulationFeeCollection(jobId));}
 useEffect(()=>{setView(null);setError("");void load().catch(()=>setError("Collection records could not be loaded."));},[jobId,statementId,statementHash]);
 async function command(action:"collect"|"refund"|"redirect"|"unknown",attemptId?:string){
  setBusy(true);setError("");
  try{
   const r=await writeSimulationFeeCollection(jobId,{version:"simulation-fee-collection-command.v1",commandId:crypto.randomUUID(),action,...(attemptId?{attemptId}:{statementId,statementHash,amountPence:action==="collect"?view?.outstandingPrincipal:view?.refundDue})});
   if(!r.ok)setError("This attempt could not proceed. Refresh the statement and reconcile any pending or unknown attempt.");
   await load();
  }catch{setError("Collection outcome could not be loaded. Refresh before making another attempt.");}finally{setBusy(false);}
 }
 return <section aria-label="Simulated fee collection"><h3>Simulated fee collection and refund</h3><p>Fake rails only — nothing is charged or refunded outside this practice sandbox.</p>
  {view&&<>
   <p>Settled principal: <span data-testid="fee-settled-principal">{pounds(view.settledPrincipal)}</span></p>
   <p>Outstanding principal: <span data-testid="fee-outstanding-principal">{pounds(view.outstandingPrincipal)}</span></p>
   <p>Refund due: <span data-testid="fee-refund-due">{pounds(view.refundDue)}</span></p>
   <p>Refunded principal: <span data-testid="fee-refunded-principal">{pounds(view.refundedPrincipal)}</span></p>
   <p>Retained principal: <span data-testid="fee-retained-principal">{pounds(view.retainedPrincipal)}</span></p>
   {view.unknownOutcome&&<p role="status">Unknown outcome — reconcile this attempt before any further collection or refund.</p>}
   <button disabled={busy||view.unknownOutcome||view.collectionReserved>0||view.refundReserved>0||view.outstandingPrincipal===0} onClick={()=>void command("collect")}>Approve simulated collection of {pounds(view.outstandingPrincipal)} principal</button>
   <button disabled={busy||view.unknownOutcome||view.collectionReserved>0||view.refundReserved>0||view.refundDue===0} onClick={()=>void command("refund")}>Approve simulated refund of {pounds(view.refundDue)} principal</button>
   {view.attempts.map(a=><article key={a.id}><p>{a.kind}: {pounds(a.amountPence)} — <span role="status">{a.state}</span></p>
    {(a.state==="pending"||a.state==="outcome_unknown")&&<>
     <button disabled={busy} onClick={()=>void command("redirect",a.id)}>Simulate redirect (no settlement)</button>
     <button disabled={busy} onClick={()=>void command("unknown",a.id)}>Simulate unknown outcome</button>
    </>}
   </article>)}
  </>}
  <button disabled={busy} onClick={()=>void load().catch(()=>setError("Collection records could not be loaded."))}>Refresh collection records</button>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
