"use client";
import { useState } from "react";
import { simulationMoneyRunResultV1,type SimulationMoneyReport } from "@jobguard/core";
type Saved={runId:string;sourceHash:string;paused:true;report:SimulationMoneyReport};
const exactPounds=(p:{numerator:string;denominator:string})=>BigInt(p.numerator)%BigInt(p.denominator)===0n?pounds(Number(BigInt(p.numerator)/BigInt(p.denominator))):`${p.numerator}/${p.denominator} pence`;
const pounds=(p:number)=>`£${(p/100).toLocaleString("en-GB",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
export function SimulationMoneyCheck({jobId}:{jobId:string}){
 const [saved,setSaved]=useState<Saved|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function command(action:"run"|"review"|"restore"){
  setBusy(true);setError("");
  try{
   const r=await fetch(`/api/jobs/${jobId}/success-fees/money-check`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:"simulation-money-command.v1",commandId:crypto.randomUUID(),action,...(action!=="run"?{runId:saved?.runId,sourceHash:saved?.sourceHash}:{})})});
   if(!r.ok)throw new Error();const result=simulationMoneyRunResultV1.parse(await r.json());if(result.jobId!==jobId)throw new Error();setSaved(result);
  }catch{setError("Money check unavailable or sources changed. Complete the approved source steps and run again.");}finally{setBusy(false);}
 }
 const report=saved?.report,eligible=report?.successFee.eligibleNet;
 return <section aria-label="Simulation money check"><h3>Check the simulation money trail</h3><p>Saved source rows only. Review records an acknowledgement; differences require their original approved correction path.</p>
  <button disabled={busy} onClick={()=>void command("run")}>Run money check</button>
  {report&&<>
   <p data-testid="money-check-state">{report.label}</p><p>Unresolved differences: <span data-testid="unresolved-money-differences">{report.unresolvedDifferenceCount}</span></p>
   <h4>{report.customer.label}</h4><p>Invoice balance: <span data-testid="customer-invoice-balance">{pounds(report.customer.invoiceBalancePence)}</span></p>
   <h4>{report.successFee.label}</h4><p>Eligible net: <span data-testid="eligible-net">{eligible&&BigInt(eligible.numerator)%BigInt(eligible.denominator)===0n?pounds(Number(BigInt(eligible.numerator)/BigInt(eligible.denominator))):eligible?`${eligible.numerator}/${eligible.denominator} pence`:"Unavailable"}</span></p>
   <p>Yours before VAT and tax: <span data-testid="value-found-yours-before-tax">{report.successFee.yoursBeforeTax?exactPounds(report.successFee.yoursBeforeTax):"Unavailable"}</span></p>
   <p>Net posted: <span data-testid="success-fee-net-posted">{pounds(report.successFee.postedPence)}</span></p><p>Refunded principal: {pounds(report.successFee.refundedPence)}</p>
   <h4>{report.subscription.label}</h4><p>Principal: {pounds(report.subscription.principalPence)}. Settled: {pounds(report.subscription.settledPence)}.</p>
   <ul>{report.differences.map((d,i)=><li key={`${d.differenceHash}-${i}`}>{d.book}: {d.code} — {d.sourceRefs.join(", ")}</li>)}</ul>
   <p>Checkpoint {saved.sourceHash}; report {report.reportHash}. Execution paused. External actions: {report.realExternalActions}.</p>
   <button disabled={busy} onClick={()=>void command("review")}>Record review of these source rows</button>
   <button disabled={busy} onClick={()=>void command("restore")}>Verify checkpoint and restore paused run</button>
  </>}{error&&<p role="alert">{error}</p>}
 </section>;
}
