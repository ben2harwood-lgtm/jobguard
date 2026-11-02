import type { InboxDashboard } from "../lib/inbox-metrics-server";

export function InboxMetricsDashboard({ view }: { view: InboxDashboard }) {
  return <main className="workspace-page">
    <h1>Signal-to-noise dashboard</h1>
    <p>Practice sandbox · synthetic metadata only. Nothing is sent or charged.</p>
    <p>Recorded outcomes by rule and version, as of <time>{view.asOf}</time>.</p>
    <section className="workspace-panel" aria-label="Mandatory blockers">
      <h2>Mandatory blockers</h2>
      <p>Current mandatory Decisions are counted separately. An advisory cap never hides them.</p>
      {view.mandatoryBlockers.length === 0 ? <p>No current mandatory blockers recorded.</p> :
        <ul>{view.mandatoryBlockers.map(row => <li key={JSON.stringify([row.ruleId, row.ruleVersion])}>
          {row.ruleId} · {row.ruleVersion}: {row.count}
        </li>)}</ul>}
    </section>
    <section className="workspace-panel" aria-label="Recorded outcome metrics">
      <h2>Recorded outcome metrics</h2>
      <p>Duplicate means a Decision dismissed as duplicate. Coalesced counts findings combined into an existing Decision.</p>
      <p>Time to decision is the mean from Decision creation to recorded confirmation or dismissal. Later outcomes are observations, not payment facts.</p>
      {view.byRule.length === 0 ? <p>No outcome metrics recorded for this job. Conversion, decision time and later outcomes are unknown.</p> :
        view.byRule.map(row => {
          const later = row.laterOutcomes.recorded;
          return <article key={JSON.stringify([row.ruleId, row.ruleVersion])} aria-label={`${row.ruleId} ${row.ruleVersion}`}>
            <h3>{row.ruleId} · {row.ruleVersion}</h3>
            <dl>
              <dt>Findings / Decisions</dt><dd>{row.findings} / {row.decisions}</dd>
              <dt>Finding-to-Decision conversion</dt><dd>{row.findingToDecisionRate === null ? "Unknown" : `${row.convertedFindings} of ${row.findings} (${(row.findingToDecisionRate * 100).toFixed(1)}%)`}</dd>
              <dt>Recorded confirmations / dismissals</dt><dd>{row.confirmed} / {row.dismissed}</dd>
              <dt>Duplicates / coalesced findings</dt><dd>{row.duplicateCount} / {row.coalescedCount}</dd>
              <dt>Mean time to decision</dt><dd>{row.meanTimeToDecisionMs === null ? "Unknown" : `${row.meanTimeToDecisionMs / 1000} seconds`}</dd>
              <dt>Later outcomes</dt><dd>{later === null ? "Unknown — no later outcomes recorded" :
                `Useful: ${later.useful}; no issue: ${later.no_issue}; cancelled: ${later.cancelled}; reversed: ${later.reversed}`}
                {row.laterOutcomes.unknown > 0 && <p>{row.laterOutcomes.unknown} Decisions have unknown later outcomes.</p>}</dd>
            </dl>
          </article>;
        })}
    </section>
  </main>;
}
