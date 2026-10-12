"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { practiceFactsCommandV1, practiceFactsCatalogueV1, type PracticeFactKey, type PracticeFeedStep } from "@jobguard/core";
import { practiceFactsResponseV1, type PracticeFactsResponse } from "../../../api/src/practice-facts.contracts";
import { pounds } from "../lib/pounds";
import { movementStateLabels, receiptHintLabels, receiptStatusLabels, stepLabels } from "./practice-receipts-state";
import styles from "./practice-receipts.module.css";
const invoiceLabels = {unpaid:"Unpaid",part_paid:"Part paid",paid_in_full:"Paid in full"} as const;
export function PracticeFacts({jobId}:{jobId:string}) {
  const [view,setView]=useState<PracticeFactsResponse|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(""),[unknown,setUnknown]=useState(false);
  const [movement,setMovement]=useState<PracticeFactKey>("receipt-12000"),[step,setStep]=useState<PracticeFeedStep>("pending");
  const currentJob=useRef(jobId),inFlight=useRef(false),epoch=useRef(0);
  currentJob.current=jobId;
  const read=useCallback(async()=>{
    if(inFlight.current)return;
    const requestEpoch=++epoch.current;inFlight.current=true;setBusy(true);
    try {
      const result=await fetch(`/api/jobs/${jobId}/practice-facts?limit=50`,{cache:"no-store"});
      if(!result.ok)throw new Error("Extra practice movements could not load. Try loading the saved state again.");
      const saved=practiceFactsResponseV1.parse(await result.json());
      if(saved.jobId!==jobId)throw new Error("Unexpected job response.");
      if(currentJob.current===jobId&&epoch.current===requestEpoch){setView(saved);setUnknown(false);setError("");}
    }catch(e){if(currentJob.current===jobId&&epoch.current===requestEpoch)setError(e instanceof Error?e.message:"Could not load extra movements.");}
    finally{if(epoch.current===requestEpoch){inFlight.current=false;setBusy(false);}}
  },[jobId]);
  useEffect(()=>{inFlight.current=false;setView(null);setError("");setUnknown(false);void read();return()=>{epoch.current++;};},[read]);
  const send=async(extra:Record<string,unknown>)=>{
    if(!view||inFlight.current||unknown||view.feedState!=="connected")return;
    const requestEpoch=++epoch.current;
    const command=practiceFactsCommandV1.parse({version:"practice-facts-command.v1",commandId:crypto.randomUUID(),expectedRevision:view.revision,...extra});
    inFlight.current=true;setBusy(true);setError("");
    try {
      const response=await fetch(`/api/jobs/${jobId}/practice-facts`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(command)});
      if(response.status>=400&&response.status<500){
        if(currentJob.current===jobId&&epoch.current===requestEpoch){setError("The command was refused. Load the saved movements before trying again.");setUnknown(true);}
        return;
      }
      if(!response.ok)throw new Error("Unknown outcome");
      const saved=practiceFactsResponseV1.parse(await response.json());if(saved.jobId!==jobId)throw new Error("Unexpected job response");
      if(currentJob.current===jobId&&epoch.current===requestEpoch)setView(saved);
    }catch{if(currentJob.current===jobId&&epoch.current===requestEpoch){setUnknown(true);setError("The result is unknown. Load the saved movements before doing anything else.");}}
    finally{if(epoch.current===requestEpoch){inFlight.current=false;setBusy(false);}}
  };
  const disabled=busy||unknown||view?.feedState!=="connected";
  return <section id="practice-facts" className={styles.panel} aria-labelledby="practice-facts-title" aria-busy={busy}>
    <h2 id="practice-facts-title">Extra practice movements</h2>
    <p>Synthetic fixtures only. Nothing is allocated, sent or charged.</p>
    <p>Supplier invoice amounts are interim synthetic fixtures. F18 interest and compensation are outside-VAT synthetic fixtures; VAT treatment is held.</p>
    <button type="button" disabled={busy} onClick={()=>void read()}>Load extra practice movements</button>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {view?.feedState==="not_connected"&&<p>Connect the practice feed in Practice receipts first, then load the extra movements.</p>}
    <div className={styles.actions}>
      <div className={styles.field}><label htmlFor="extra-movement">Extra generated movement</label><select id="extra-movement" value={movement} disabled={disabled} onChange={e=>setMovement(e.target.value as PracticeFactKey)}>{practiceFactsCatalogueV1.map(e=><option key={e.movement} value={e.movement}>{e.label}</option>)}</select></div>
      <div className={styles.field}><label htmlFor="extra-event">Extra generated event</label><select id="extra-event" value={step} disabled={disabled} onChange={e=>setStep(e.target.value as PracticeFeedStep)}>{stepLabels.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
      <button type="button" disabled={disabled} onClick={()=>void send({action:"advance",movement,step})}>Advance extra movement</button>
    </div>
    {view&&<>
      <p>Supplier invoice cash due: {pounds(view.laterInvoice.cashDuePence)}. Settled: {pounds(view.laterInvoice.settledPence)}. <strong data-testid="later-invoice-state">{invoiceLabels[view.laterInvoice.state]}</strong></p>
      <p>Saved revision <span data-testid="practice-facts-revision">{view.revision}</span></p>
      {view.movements.map(m=><article className={styles.movement} key={m.id} data-testid="practice-fact" data-movement-key={m.movementKey}>
        <h3>{m.label}</h3><p>{pounds(m.grossPence)} · <span data-testid="practice-fact-state">{movementStateLabels[m.state]}</span></p>
        <p>{m.eligibleForAllocation?"Ready for a separate allocation review — nothing allocated":"Cannot qualify while pending or held"}</p>
        {m.state==="possible_duplicate"&&<button type="button" disabled={disabled} onClick={()=>void send({action:"reconcile_duplicate",movement:m.movementKey})}>Reconcile extra duplicate</button>}
        <details><summary>Extra movement sources</summary><p><code>{m.id}</code></p>{m.eventIds.map((id,i)=><p key={id}><code>{id}</code> <code>{m.sourceHashes[i]}</code></p>)}</details>
      </article>)}
      {view.receipts.map(r=><article key={r.paymentId} className={styles.movement} data-testid="extra-attested-receipt">
        <p>{pounds(r.amountPence)} receipt paid {r.paidOn}: {receiptStatusLabels[r.assessment.status]}</p><p>{receiptHintLabels[r.assessment.reason]}</p>
        {r.assessment.status==="attested_only"&&!r.assessment.matchedMovementKey&&<button type="button" disabled={disabled||!r.assessment.canMatch} onClick={()=>void send({action:"match_receipt",movement:r.assessment.candidateMovementKey,paymentId:r.paymentId})}>Match {pounds(r.amountPence)} extra receipt</button>}
      </article>)}
      {view.feedState==="disconnected"&&<p>Practice feed disconnected. Saved extra facts are kept.</p>}
    </>}
  </section>;
}
