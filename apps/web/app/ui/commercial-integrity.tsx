"use client";
import * as React from "react";
import { useState } from "react";
import { pounds } from "../lib/pounds";
import { IntegrityV3Results, useIntegrityJourney, type LegacyIntegrityView, type ReviewTarget } from "./commercial-integrity-v3";

/** The saved family is read before either family's facts are requested or shown. */
export function CommercialIntegrity({ jobId }: { jobId: string }) {
 return <IntegrityPanel key={jobId.toLowerCase()} jobId={jobId.toLowerCase()} />;
}
function IntegrityPanel({ jobId }: { jobId: string }) {
 const journey = useIntegrityJourney(jobId);
 return <section className="materials-panel" id="commercial-integrity" aria-label="Recorded advisory checks">
  <p className="eyebrow">Things to check · D11 advisory demo</p><h2>Check the recorded job values and activity</h2>
  <p>These are source-linked prompts, not evidence of cheating or proof of fraud. They cannot reprice, change the jobs-on-the-go meter, charge, penalise, suspend or change eligibility or authority.</p>
  {journey.state.status === "loading" ? <p role="status">Loading recorded sources…</p>
   : journey.state.status === "error" ? <><p role="alert">{journey.state.message}</p><button onClick={journey.reload}>Reload recorded checks</button></>
   : journey.state.status === "v3" ? <IntegrityV3Results view={journey.state.view} open={journey.open} />
   : <LegacyIntegrityResults view={journey.state.view} open={journey.open} />}
  {journey.error && <p role="alert">{journey.error}</p>}{journey.dialog}
 </section>;
}
export function LegacyIntegrityResults({ view, open }: { view: LegacyIntegrityView; open: (target: ReviewTarget, button: HTMLButtonElement) => Promise<void> }) {
 const [filter, setFilter] = useState<"open" | "dismissed" | "all">("open");
 const findings = view.findings.filter(f => filter === "all" || f.dismissed === (filter === "dismissed"));
 return <><p className="pilot-badge">{view.profile.label}</p>
  <p>Decision record <strong>D11</strong>: <strong>{view.decisionRecord.status}</strong> · no approver evidence. Demo profile <code>{view.profile.version}</code>.</p>
  <div className="filter-row" aria-label="Things-to-check filter">{(["open", "dismissed", "all"] as const).map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "open" ? "Things to check" : f === "dismissed" ? "Dismissed" : "All"}</button>)}</div>
  <details open><summary>Earlier proposed pricing (v1)</summary><p>Cap-basis signals are v1-only.</p><dl><dt>Frozen accepted-value cap</dt><dd data-testid="integrity-frozen-accepted-cap">{pounds(view.acceptedCapPence ?? 0)}</dd><dt>Cap basis</dt><dd>{pounds(view.capBasisPence ?? 0)} accepted (quoted/final signals do not alter it)</dd></dl></details>
  {findings.length === 0 ? <p>No checks in this filter.</p> : findings.map(f => <article className="inbox-card" key={f.key}><h3>{f.reason}</h3>
   {f.kind === "accepted_value_variance" && <dl><dt>Quoted</dt><dd data-testid="integrity-quoted-value">{f.citedNumbers.quotedNetPence === 0 ? "Cannot compare" : pounds(f.citedNumbers.quotedNetPence!)}</dd><dt>Accepted</dt><dd data-testid="integrity-accepted-value">{pounds(f.citedNumbers.acceptedNetPence!)}</dd><dt>Final</dt><dd data-testid="integrity-final-value">{f.citedNumbers.finalNetPence === 0 ? "Cannot compare" : pounds(f.citedNumbers.finalNetPence!)}</dd><dt>Difference to check</dt><dd data-testid="integrity-value-difference">{pounds(f.citedNumbers.differencePence!)}</dd></dl>}
   <p>Rule/version: <code>{f.kind}</code> · <code>{f.policyVersion}</code></p>{f.timeWindow && <p>Time window: {f.timeWindow}</p>}
   <details><summary>Inspect source links and plain reason</summary><p>Plain reason: {f.reason}</p><ul>{f.sourceReferences.map(source => <li key={source}><code>{source}</code></li>)}</ul></details>
   {f.dismissed ? <p>Dismissed as a possible false positive; the feedback event remains append-only.</p> : <button onClick={e => void open({ key: f.key, reason: f.reason }, e.currentTarget)}>Review or dismiss</button>}
  </article>)}
 </>;
}
