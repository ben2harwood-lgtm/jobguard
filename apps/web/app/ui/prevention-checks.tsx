"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { preventionViewV1, type PreventionViewV1, type PreventionResultV1 } from "@jobguard/core";
import styles from "./prevention-checks.module.css";
import { EXPOSURE_CURVE_ENABLED, evaluateExposureCurve, exposureScheduleFixture, type ExposureScheduleV1 } from "@jobguard/core";

export function ExposureCurvePreview({ schedule }: { schedule: ExposureScheduleV1 }) {
  const curve = evaluateExposureCurve(schedule);
  const pounds = (pence: number) => `£${Math.floor(pence / 100).toLocaleString("en-GB")}.${String(pence % 100).padStart(2, "0")}`;
  const maximum = Math.max(1, ...curve.points.map(point => point.atRisk?.pence ?? 0));
  const x = (i: number) => 20 + i * 560 / Math.max(1, curve.points.length - 1);
  const y = (pence: number) => 130 - pence / maximum * 110;
  return <section aria-label="Stage exposure curve" data-testid="exposure-curve">
    <h3>Money at risk by stage</h3>
    <p>Fictional schedule preview, independent of this job. Reference net exposure is cumulative work value less cumulative receipts, floored at zero. These are made-up forecasts, not settled cash or a guarantee.</p>
    <p>Evaluated at scenario time: <time dateTime={curve.evaluatedAt}>{curve.evaluatedAt}</time>. Reference source maximum age: {curve.maximumAgeMinutes} minutes.</p>
    <svg viewBox="0 0 600 150" aria-hidden="true" style={{ width: "100%", maxWidth: 600 }}>
      <line x1="20" y1="130" x2="580" y2="130" stroke="currentColor"/>
      {curve.points.map((point, i) => {
        if (point.atRisk === null) return null;
        const previous = curve.points[i - 1];
        return <g key={point.id}>
          {previous?.atRisk && <line x1={x(i - 1)} y1={y(previous.atRisk.pence)} x2={x(i)} y2={y(point.atRisk.pence)} stroke="currentColor" strokeWidth="2" data-exposure-segment="true"/>}
          <circle cx={x(i)} cy={y(point.atRisk.pence)} r="4" fill="currentColor"/>
        </g>;
      })}
    </svg>
    <div style={{ overflowX: "auto" }}><table>
      <caption>Generated stage schedule · GBP net · advisory prevention check</caption>
      <thead><tr><th scope="col">Stage / date</th><th scope="col">Cumulative work</th><th scope="col">Cumulative receipts</th><th scope="col">Money at risk</th><th scope="col">Source / dates</th></tr></thead>
      <tbody>{curve.points.map(point => <tr key={point.id}>
        <th scope="row">{point.label}<br/><time dateTime={point.date}>{point.date}</time></th>
        <td>{point.cumulativeWorkValue ? pounds(point.cumulativeWorkValue.pence) : "unknown"}</td>
        <td>{point.cumulativeReceipts ? pounds(point.cumulativeReceipts.pence) : "unknown"}</td>
        <td>{point.atRisk ? pounds(point.atRisk.pence) : `unknown — ${point.reason}`}</td>
        <td>{point.source ? <>{point.source.name} · <code>{point.source.id}</code><br/>
          Retrieved: <time dateTime={point.source.retrievedAt}>{point.source.retrievedAt}</time><br/>
          Observed: {point.source.observedAt ? <time dateTime={point.source.observedAt}>{point.source.observedAt}</time> : "unknown"}</> : "Source unknown"}</td>
      </tr>)}</tbody>
    </table></div>
    <p>Advisory only. No fee, value-receipt amount or jobs-on-the-go change.</p>
  </section>;
}

const names: Record<PreventionResultV1["kind"],string> = { listed_building:"Listed building",conservation_area:"Conservation area",article_4:"Article 4",planning_history:"Planning history",flood:"Flood",company:"Free company register card",companies_house_feed:"Company register feed",gazette_feed:"Gazette feed" };
function Card({result}:{result:PreventionResultV1}) {
  const facts = { constraint:"Constraint recorded",no_record:"No record in this fixture",company_active:"Active company record",company_attention:"Company record needs review",feed_event:"Fictional public notice",no_event:"No event in this fixture" };
  const description = result.status === "unknown" ? `Source information is ${result.reason}. This check cannot establish a result.`
    : result.status === "advisory" ? "A generated register record needs your review. It does not establish liability or approval."
    : "No concern in this generated record. This is not a guarantee about the site or customer.";
  return <article className={`${styles.card} ${result.status === "unknown" ? styles.unknown : ""}`} data-testid={`prevention-${result.kind}`}>
    <h4>{names[result.kind]}</h4><strong data-testid={`prevention-${result.kind}-status`}>{result.status}</strong><p>{description}</p>
    {result.status!=="unknown"&&result.fact&&<p>Generated fact: {facts[result.fact]}</p>}
    <p>Source: {result.source.name}<br/><code>{result.source.id}</code></p>
    <p>Retrieved: <time dateTime={result.retrievedAt}>{result.retrievedAt}</time></p>
    <p>Evaluated at scenario time: <time dateTime={result.evaluatedAt}>{result.evaluatedAt}</time></p>
  </article>;
}
const errorLabels: Record<string,string> = { REVISION_CONFLICT:"The saved customer, site or watch changed. Review the refreshed facts and try again.", COMMAND_CONFLICT:"That command ID already describes different work. Nothing changed.", PARTIES_REQUIRED:"Save the customer and site first.", NOT_REGISTERED_COMPANY:"not run — not a registered company", WATCH_NOT_STARTED:"Start a watch before checking the feeds.", WATCH_ALREADY_STARTED:"This customer is already being watched." };
export function PreventionChecks({jobId}:{jobId:string}) {
  const [view,setView]=useState<PreventionViewV1|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [fixture,setFixture]=useState<"mixed"|"fresh"|"stale"|"missing">("mixed");
  const errorRef=useRef<HTMLParagraphElement>(null),inFlight=useRef(false),generation=useRef(0);
  const load=useCallback(async()=>{
    const requestGeneration=++generation.current;
    try { const response=await fetch(`/api/jobs/${jobId}/prevention-checks`,{cache:"no-store"});if(!response.ok)throw new Error("Prevention facts could not load. Try again.");
      const value=preventionViewV1.parse(await response.json());if(requestGeneration===generation.current)setView(value);
    } catch { if(requestGeneration===generation.current){setView(null);setError("Prevention facts could not load. Try again.");} }
  },[jobId]);
  useEffect(()=>{setView(null);setError("");void load();const changed=()=>{setView(null);void load();};window.addEventListener("job-parties-saved",changed);return()=>{generation.current++;window.removeEventListener("job-parties-saved",changed);};},[load]);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
  async function command(action:"property"|"company"|"start_watch"|"stop_watch"|"evaluate_watch") {
    if(inFlight.current||!view?.parties)return;
    inFlight.current=true;setBusy(true);setError("");
    try {
      const input={version:"prevention-command.v1",commandId:crypto.randomUUID(),action,expectedBindingId:view.parties.bindingId,scenarioNow:"2026-10-07T13:00:00.000Z",fixture,
        ...(["start_watch","stop_watch","evaluate_watch"].includes(action)?{expectedWatchRevision:view.watch.revision}:{})};
      const response=await fetch(`/api/jobs/${jobId}/prevention-checks/${action}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)});
      if(!response.ok){const body=await response.json();setError(errorLabels[body.code]??"This check could not be recorded. Review the saved state before trying again.");}
      await load();
    }catch{setError("The outcome could not be read. Refresh the saved state before trying again.");await load();}
    finally{inFlight.current=false;setBusy(false);}
  }
  const eligible=view?.companyEligibility==="eligible";
  return <section className={styles.panel} data-testid="prevention-panel" aria-busy={busy} aria-label="Prevention checks">
    <p className="eyebrow">Generated registers · reference only</p><h2>Prevention checks</h2>
    <p>Fictional register records only. Live sources need approval. Checks are advisory and fee-free.</p>
    {EXPOSURE_CURVE_ENABLED && <ExposureCurvePreview schedule={exposureScheduleFixture()}/>}
    {error&&<p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}
    {!view?<button onClick={()=>{setError("");void load();}}>Reload prevention facts</button>:<>
      <h3>Who actually pays?</h3><p data-testid="prevention-paying-party">{view.payingParty?.name??"unknown"}</p>
      <p>Source: Builder&apos;s saved paying-party record · Retrieved: {view.retrievedAt}</p>
      {view.payingParty&&<p>Binding recorded: {view.payingParty.recordedAt} · Paying-party revision <code>{view.payingParty.revisionId}</code></p>}
      <p>The paying party is your saved binding; no person is searched.</p>
      {!view.parties?<p>Save the customer and site to check this job.</p>:<>
        <label>Generated register scenario<select aria-label="Generated register scenario" value={fixture} disabled={busy} onChange={event=>setFixture(event.target.value as typeof fixture)}>
          <option value="mixed">Generated records with unknown cases</option><option value="fresh">Fresh generated records</option><option value="stale">Stale generated records</option><option value="missing">Missing generated records</option>
        </select></label>
        <h3>Property constraints at quote time</h3><p>For the saved job site: {view.parties.site.addressLines.join(", ")}, {view.parties.site.town}, {view.parties.site.postcode}</p>
        <p>Saved site revision <code data-testid="prevention-site-revision">{view.parties.siteRevisionId}</code></p>
        <button className="primary" disabled={busy} onClick={()=>void command("property")}>Check property registers</button>
        {!view.property.length&&<p>Not checked yet</p>}<div className={styles.cards}>{view.property.map(result=><Card key={result.kind} result={result}/>)}</div>
        <h3>Customer register</h3><p data-testid="prevention-company-eligibility">{view.companyEligibility}</p>
        {eligible&&<><p>{view.parties.customer.name} · Company number {view.parties.customer.companyNumber}</p>
          <button disabled={busy} onClick={()=>void command("company")}>Check company register</button>
          {view.company?<Card result={view.company}/>:<p>Not checked yet</p>}
          <h3>Watch this customer</h3><p>Free generated Companies House and Gazette feeds. Each evaluation runs only when requested.</p>
          <p data-testid="prevention-watch-state">{view.watch.enabled?"On — explicitly requested":"Off — not watching"}</p>
          {view.watch.enabled?<div className={styles.actions}><button disabled={busy} onClick={()=>void command("evaluate_watch")}>Check watched feeds</button><button disabled={busy} onClick={()=>void command("stop_watch")}>Stop watching this customer</button></div>
            :<button disabled={busy} onClick={()=>void command("start_watch")}>Watch this customer</button>}
          <div className={styles.cards}>{view.watch.results.map(result=><Card key={result.kind} result={result}/>)}</div>
        </>}
        <p data-testid="prevention-outbound">External actions: {view.realExternalActions}</p>
        <p>No Decision, notification, message or charge is created. Reference policy: {view.eligibilityPolicyVersion}; prevention-staleness-reference.v1.</p>
      </>}
    </>}
  </section>;
}
