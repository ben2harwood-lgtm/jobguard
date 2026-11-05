"use client";
import React, { useEffect, useState, type FormEvent } from "react";
import type { RateSuggestionScreen } from "@jobguard/api/workspace";

export function RateSuggestionScreenView({ screen }: { screen: RateSuggestionScreen }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const key = `practice-rate-acceptance:${screen.jobId}`;
  useEffect(() => { setPending(sessionStorage.getItem(key)); }, [key]);
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget), suggestion = screen.suggestion;
    if (!pending && !suggestion?.rate) return;
    const body = pending ?? JSON.stringify({ version: "rate-suggestion-accept.v1", commandId: crypto.randomUUID(),
      jobId: screen.jobId, scopeItemId: fields.get("scopeItemId"), currentRevisionId: fields.get("currentRevisionId"),
      query: suggestion!.query, acceptedRatePence: suggestion!.rate!.pence, baselineHash: suggestion!.baselineHash });
    sessionStorage.setItem(key, body); setPending(body); setBusy(true); setReason("");
    try {
      const response = await fetch(`/api/jobs/${screen.jobId}/rate-suggestions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body, cache: "no-store",
      });
      if (!response.ok) {
        const failure = await response.json() as { reason: string };
        if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) { sessionStorage.removeItem(key); setPending(null); }
        setReason(failure.reason); return;
      }
      sessionStorage.removeItem(key); setPending(null); window.location.reload();
    } catch { setReason("The result is uncertain. Retry the same acceptance command."); }
    finally { setBusy(false); }
  }
  const suggestion = screen.suggestion;
  return <>
    <h1>Practice rate suggestions</h1>
    <p>Made-up data only. Accepting records a separate practice observation with provenance.
      Your quote, quote lines, rate book, agreed rates, invoices and cap stay unchanged.</p>
    <form method="get">
      <input type="hidden" name="version" value="rate-query.v1" />
      <label>Source cutoff (ISO time)<input name="asOf" required defaultValue={suggestion?.query.asOf ?? screen.asOf} /></label>
      <label>Unit<select name="unit" defaultValue={suggestion?.query.unit ?? "each"}>{["each", "m", "m2", "kg", "hour"].map(unit => <option key={unit}>{unit}</option>)}</select></label>
      <label>Tax basis<select name="taxBasis" defaultValue={suggestion?.query.taxBasis ?? "standard_rate_20"}>{["standard_rate_20", "zero_rate", "exempt", "outside_scope"].map(tax => <option key={tax}>{tax}</option>)}</select></label>
      <label>Category<input name="category" required defaultValue={suggestion?.query.category} maxLength={100} /></label>
      <label>Region<input name="region" required defaultValue={suggestion?.query.region} maxLength={100} /></label>
      <button>Show practice suggestion</button>
    </form>
    {suggestion && <section aria-label="Practice suggestion">
      <h2>{suggestion.status === "unknown" ? "Not enough to say" : `Suggested rate: ${suggestion.rate!.pence} GBP pence`}</h2>
      <p>Samples: {suggestion.sampleCount}. Policy: {suggestion.policyVersion}.</p>
      {suggestion.spread && <p>Observed spread: {suggestion.spread.min.pence}–{suggestion.spread.max.pence} GBP pence. This is not a confidence interval.</p>}
      <ul>{suggestion.sources.map(source => <li key={source.observationId}>Source revision {source.sourceScopeRevisionId}; observation {source.observationId}; {source.provenance}</li>)}</ul>
    </section>}
    {(suggestion?.rate || pending) && <form onSubmit={accept}>
      {!pending && <>
        <label>Target scope item ID<input name="scopeItemId" required /></label>
        <label>Current target revision ID<input name="currentRevisionId" required /></label>
      </>}
      <button disabled={busy}>{pending ? "Retry same practice acceptance" : "Accept practice suggestion"}</button>
    </form>}
    {reason && <p role="alert">{reason}</p>}
    <section aria-label="Stored practice acceptances"><h2>Stored practice acceptances</h2>
      {screen.acceptances.length === 0 && <p>No stored acceptances.</p>}
      {screen.acceptances.map(row => <article key={row.id} style={{ overflowWrap: "anywhere" }}>
        <h3>Accepted {row.acceptedRatePence} GBP pence</h3>
        <p>Accepted by membership {row.actorId} at {row.acceptedAt}. Target revision {row.previousRevisionId}.</p>
        <p>Record hash: {row.recordHash}. Policy: {row.policyVersion}. {row.provenance}. Practice only.</p>
        <ul>{row.sources.map(source => <li key={source.observationId}>Source revision {source.sourceScopeRevisionId}; observation {source.observationId}; {source.provenance}</li>)}</ul>
      </article>)}
    </section>
  </>;
}
