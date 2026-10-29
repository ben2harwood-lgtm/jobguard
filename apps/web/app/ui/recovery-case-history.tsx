import type { RecoveryCaseResponse } from "@jobguard/api/recovery-case-contracts";
type Case = RecoveryCaseResponse["cases"][number];
const pounds=(pence:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(pence/100);

export function RecoveryCaseHistory({current}:{current:Case}) {
 const eligible=current.eligibility?.status==="approved"&&current.eligibility.caseRevision===current.revision
  ?current.eligibility.eligibleNetPence:null;
 return <section aria-label="Case facts and history" style={{overflowWrap:"anywhere"}}>
  <h4>Case facts</h4>
  <dl>
   <dt>Claim revision</dt><dd>{current.claimRevision??"Unavailable"}</dd>
   <dt>Last recorded disputed net</dt><dd>{current.lastDisputedNetPence==null?"Unknown":pounds(current.lastDisputedNetPence)}</dd>
   <dt>Approved eligible net at this revision</dt><dd>{eligible===null?"Not approved":pounds(eligible)}</dd>
   <dt>Manual reversals (cumulative)</dt><dd>{current.manualReversedNetPence===undefined?"Unavailable":pounds(current.manualReversedNetPence)}</dd>
   <dt>Approved reversals (cumulative)</dt><dd>{current.approvedReversedNetPence===undefined?"Unavailable":pounds(current.approvedReversedNetPence)}</dd>
   <dt>Evidence assembly</dt><dd>{current.evidenceStatus==="assembled"?"Recorded as assembled; check the evidence pack for completeness":current.evidenceStatus==="sources_unresolved"?"Incomplete source references":"Not recorded as assembled"}</dd>
  </dl>
  <p>Manual records and approved allocations can describe the same money. Their reversal totals are separate and must not be added. A dispute changes no cash.</p>
  <h4>Unresolved ambiguity</h4>
  {current.ambiguity?.length?<ul>{current.ambiguity.map(note=><li key={note}>{note}</li>)}</ul>:<p>No source ambiguity recorded. Eligibility and attribution still require their own review.</p>}
  <h4>Next authorised action</h4>
  <p>{current.canCommand===false?"An owner must approve case changes.":current.state==="prevented"?"None. Prevention is terminal and cannot earn a recovery fee.":current.state==="identified"?"Check the sources, then record evidence assembly.":current.state==="landed"?"Review the full received claim before closing as recovered.":current.state.startsWith("closed_")?"Record a dispute or evidenced reversal if the outcome changes.":"Choose an available case action below. Pursuit and every external send require separate exact approval."}</p>
  <h4>Append-only history</h4>
  {current.history===undefined?<p>History unavailable. Reload before relying on this case.</p>:<ol>{current.history.map(entry=><li key={`${entry.kind}:${entry.id}`}>
   <time dateTime={entry.recordedAt}>{entry.recordedAt}</time> · {entry.kind.replaceAll("_"," ")}
   {entry.revision!==null&&<> · revision {entry.revision}</>}
   {entry.amountPence!==null&&<> · {pounds(entry.amountPence)}</>}
   {entry.toState&&<> · {entry.fromState??"new"} → {entry.toState}</>}
   {entry.reviewerRef&&<> · {entry.reviewerRef}</>}
  </li>)}</ol>}
 </section>;
}
