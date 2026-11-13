"use client";
import { jobPageFetch as fetch } from "./job-page-fetch";
import { useEffect,useState } from "react";
import { readPaymentFeeView } from "./payment-fee-statements";
import { simulationFeeCollectionViewV1,type SimulationFeeCollectionView } from "@jobguard/core";
const pounds=(p:number)=>`£${(p/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const authorityRefusals:Record<string,string>={
 PAYMENT_FEE_AUTHORITY_REVOKED:"Standing authority was revoked. Approve the statement individually or opt in again.",
 PAYMENT_FEE_AUTHORITY_STALE:"Standing authority or receipt is stale. Refresh and review it before trying again.",
 PAYMENT_FEE_AUTHORITY_DISPUTED:"Standing collection is paused by a dispute on the receipt, case or attribution.",
 PAYMENT_FEE_AUTHORITY_CAP_EXCEEDED:"This collection would exceed the fee cap for this verified receipt.",
 PAYMENT_FEE_SOURCE_REQUIRED:"A verified receipt fee statement is required before standing collection.",
};
class StandingCollectionRefusal extends Error {}
// Navigation must not abandon the bounded request or its response body, including refusals.
export async function readSimulationFeeCollection(jobId:string){
 const response=await fetch(`/api/jobs/${jobId}/success-fees/collection`,{cache:"no-store",keepalive:true});
 const body=await response.json();
 if(!response.ok)throw new Error("Collection records could not be loaded.");
 return simulationFeeCollectionViewV1.parse(body);
}
export async function writeSimulationFeeCollection(jobId:string,command:unknown){
 const response=await fetch(`/api/jobs/${jobId}/success-fees/collection`,{method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify(command)});
 const body:unknown=await response.json();
 if(!response.ok&&body&&typeof body==="object"&&"code" in body&&typeof body.code==="string"&&authorityRefusals[body.code])throw new StandingCollectionRefusal(authorityRefusals[body.code]);
 return response;
}
export function SimulationFeeCollection({jobId,statementId,statementHash}:{jobId:string;statementId:string;statementHash:string}){
 const [view,setView]=useState<SimulationFeeCollectionView|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [receiptFees,setReceiptFees]=useState<Awaited<ReturnType<typeof readPaymentFeeView>>|null>(null),[receiptStatementId,setReceiptStatementId]=useState("");
 async function load(){
  const [collection,fees]=await Promise.all([readSimulationFeeCollection(jobId),readPaymentFeeView(jobId).catch(()=>null)]);
  setView(collection);setReceiptFees(fees);
  setReceiptStatementId(current=>fees?.statements.some(s=>s.statement.statementId===current)?current:fees?.statements[0]?.statement.statementId??"");
 }
 useEffect(()=>{setView(null);setReceiptFees(null);setReceiptStatementId("");setError("");void load().catch(()=>setError("Collection records could not be loaded."));},[jobId,statementId,statementHash]);
 async function command(action:"collect"|"refund"|"redirect"|"unknown",attemptId?:string,standing=false){
  if(busy)return;
  setBusy(true);setError("");
  try{
   let authorityBinding:{authorityId?:string;receiptStatementId?:string;amountPence?:number}={};
   if(standing){
    const fees=await readPaymentFeeView(jobId);
    const receipt=fees.statements.find(s=>s.statement.statementId===receiptStatementId&&s.state!=="disputed"&&s.state!=="source_changed"&&s.statement.feePence>0);
    if(fees.standingAuthority?.state!=="active"||!receipt){setError("A current standing authority and an undisputed verified receipt statement are required.");return;}
    authorityBinding={authorityId:fees.standingAuthority.authorityId,receiptStatementId:receipt.statement.statementId,amountPence:receipt.statement.feePence};
   }
   const r=await writeSimulationFeeCollection(jobId,{version:"simulation-fee-collection-command.v1",commandId:crypto.randomUUID(),action,...(attemptId?{attemptId}:{statementId,statementHash,amountPence:action==="collect"?view?.outstandingPrincipal:view?.refundDue}),...authorityBinding});
   if(!r.ok)setError("This attempt could not proceed. Refresh the statement and reconcile any pending or unknown attempt.");
   await load();
  }catch(error){setError(error instanceof StandingCollectionRefusal?error.message:"Collection outcome could not be loaded. Refresh before making another attempt.");}finally{setBusy(false);}
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
   {receiptFees?.standingAuthority?.state==="active"&&<>
    <label>Verified receipt for standing collection <select disabled={busy} value={receiptStatementId} onChange={event=>setReceiptStatementId(event.target.value)}>
     {receiptFees.statements.map(({statement:s})=><option key={s.statementId} value={s.statementId}>{s.paymentId} — capped at {pounds(s.feePence)}</option>)}
    </select></label>
    <button disabled={busy||!receiptStatementId||view.unknownOutcome||view.refundReserved>0||view.outstandingPrincipal===0} onClick={()=>void command("collect",undefined,true)}>Simulate collection under standing authority</button>
   </>}
   <button disabled={busy||view.unknownOutcome||view.collectionReserved>0||view.refundReserved>0||view.refundDue===0} onClick={()=>void command("refund")}>Approve simulated refund of {pounds(view.refundDue)} principal</button>
   {view.attempts.map(a=><article key={a.id}><p>{a.kind}: {pounds(a.amountPence)} — <span role="status">{a.state}</span></p>
    {(a.state==="pending"||a.state==="outcome_unknown")&&<>
     <button disabled={busy} onClick={()=>void command("redirect",a.id)}>Simulate redirect (no settlement)</button>
     <button disabled={busy} onClick={()=>void command("unknown",a.id)}>Simulate unknown outcome</button>
    </>}
   </article>)}
  </>}
  <button disabled={busy} onClick={()=>void load().catch(()=>setError("Collection records could not be loaded."))}>Refresh collection records</button>
  {error&&<p role="alert" aria-label="Simulation collection error">{error}</p>}
 </section>;
}
