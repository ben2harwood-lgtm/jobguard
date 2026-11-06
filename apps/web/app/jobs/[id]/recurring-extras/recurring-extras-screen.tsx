import React from "react";
import type { RecurringExtras } from "@jobguard/core";
const amount = (pence: number) => `£${(pence / 100).toFixed(2)}`;
export function RecurringExtrasScreen({ result }: { result: RecurringExtras }) {
  return <main><h1>Recurring extras</h1><p>Practice only · Your company’s approved extras · Read only</p>
    <p>Observed rates, not a price recommendation. No quote or agreed rate changes here.</p>
    <p>Server cutoff: {result.asOf}</p>
    {result.status === "not_enough_to_say" ? <p>Not enough to say. No rate shown.</p> : result.suggestions.map(suggestion =>
      <section key={JSON.stringify([suggestion.description, suggestion.unit])}>
        <h2>{suggestion.description}</h2><p>{suggestion.jobCount} distinct jobs · per {suggestion.unit}</p>
        <p>Observed lowest {amount(suggestion.lowest.pence)} · highest {amount(suggestion.highest.pence)} · median {amount(suggestion.median.pence)}</p>
        <p>Observed range, not a confidence interval.</p>
        <ul>{suggestion.sources.map(source => <li key={source.variationId}>Variation {source.variationId} · Job {source.jobId} · Revision {source.revisionId} · Observation {source.observationId}</li>)}</ul>
      </section>)}
  </main>;
}
