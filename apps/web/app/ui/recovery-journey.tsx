"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { readRecoveryJourney, recoveryJourneyDependencies, recoveryJourneyMarkers, recoveryJourneySteps, recoveryJourneyUnavailable, type RecoveryJourneySnapshot } from "../lib/recovery-journey";
import { pounds } from "../lib/pounds";

export function RecoveryJourney({ jobId }: { jobId: string }) {
  const [snapshot, setSnapshot] = useState<RecoveryJourneySnapshot | null>(null);
  const [error, setError] = useState(false), [revision, refresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null); setError(false);
    void readRecoveryJourney(jobId, fetch, controller.signal).then(value => {
      if (!controller.signal.aborted) setSnapshot(value);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [jobId, revision]);
  // Clear on identity change before effects run, too.
  const saved = snapshot?.jobId === jobId ? snapshot : null;
  return <main className="workspace-page" style={{ overflowWrap: "anywhere" }}>
    <Link href={`/jobs/${encodeURIComponent(jobId)}`}>Back to job</Link>
    <h1>recovery-18800 practice journey</h1>
    <p>Made-up data only. Follow this guide on a fresh job; returning here reads saved progress. Opening a step never completes it.</p>
    <p>To start again, <Link href="/">create another fresh capture from Jobs</Link>. The previous job and its history stay available.</p>
    {error ? <p role="alert">The saved journey could not load. No result is available.</p> : !saved ? <p role="status">Loading saved recovery sources…</p> : <>
      <p role="status" data-testid="recovery-journey-state">Not ready yet — the complete recovery money chain is unavailable on this base.</p>
      <ol>{recoveryJourneySteps(jobId).map(step => <li key={step.title} style={{ marginBottom: 16 }}>
        {step.href ? <Link style={{ display: "inline-block", minHeight: 44 }} href={step.href}>{step.title}</Link> : <>{step.title}: <strong>{recoveryJourneyUnavailable}</strong></>}
      </li>)}</ol>
      <section aria-label="Incomplete money steps">
        <h2>Incomplete money steps</h2>
        <ul>{recoveryJourneyDependencies.map(dependency => <li key={dependency.piece}>
          <strong>{dependency.piece}</strong>: {dependency.reason}
        </li>)}</ul>
        <p>Collection requires an approved SV-6 review and a current approved issued statement. A repeated collect must have only one durable effect. The installed reference helpers cannot prove these controls.</p>
      </section>
      <section aria-label="Saved recovery sources">
        <h2>Saved source report</h2>
        <p>This is an incomplete source report, not a completed money check.</p>
        <p>Allocated eligible net: <strong data-testid="journey-eligible-net">{pounds(saved.allocations.eligibleNetPence)}</strong></p>
        <p>Customer invoice balance: <strong data-testid="journey-invoice-balance">{pounds(saved.allocations.invoiceBalancePence)}</strong></p>
        {saved.allocations.paused && <p>Recovery changed — fee execution is paused.</p>}
        <Link href={`/api/jobs/${jobId}/recovery-allocations`}>Inspect persisted allocations, evidence versions, receipt identities and reversals</Link>
        <ul>{saved.allocations.cases.map(source => <li key={source.caseId}>
          <Link href={`/api/recovery-cases/${source.caseId}/evidence-packs`}>CH-8 evidence pack sources for case {source.caseId}</Link>
        </li>)}</ul>
        <p><Link href={`/jobs/${jobId}/value`}>CH-9 available customer invoice and receipt sources</Link></p>
        <p><Link href={`/api/jobs/${jobId}/success-fees`}>M4-9-S source availability</Link></p>
      </section>
      <section aria-label="Journey outcomes">
        <h2>Journey outcomes</h2>
        <dl>{recoveryJourneyMarkers.map(([id, label]) => <div key={id}><dt>{label}</dt><dd data-testid={id}>{recoveryJourneyUnavailable}</dd></div>)}
          <div><dt>Real external actions</dt><dd data-testid="real-external-actions">{saved.realExternalActions}</dd></div>
        </dl>
        <p>No fixture totals, fee illustration or reference reconciliation can supply these missing results.</p>
      </section>
    </>}
    <button style={{ minHeight: 44 }} onClick={() => refresh(value => value + 1)}>Read saved journey again</button>
  </main>;
}
