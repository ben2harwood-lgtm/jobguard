import type { DemoMeterPreview } from "@jobguard/core";
const pounds = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
export function MeterPreview({ preview }: { preview: DemoMeterPreview }) {
 return <section aria-labelledby="meter-preview-title"><h2 id="meter-preview-title">Meter reference profiles</h2>
  <p>Hypothetical producer calculations for saved run {preview.runId}. These figures are previews, not issued statements or settled payments.</p>
  <p>Reference clock: Europe/London, {preview.clock}. Twelve-month profiles use monthly billing, with annual prepayment off.</p>
  {preview.profiles.map(profile => <details key={profile.id}><summary>{profile.id}: {pounds(profile.principalPence)}</summary>
   <ul>{profile.periods.map(period => <li key={period.startDate}>{period.startDate} to {period.endDateExclusive} (end excluded): {pounds(period.principalPence)}
    <p>Counted places by London date: {period.countedPlaces.join(", ")}</p>
    <details><summary>Reference job identities</summary><ul>{period.sourceJobIds.map(id => <li key={id}>{id}</li>)}</ul></details>
   </li>)}</ul></details>)}
  <h3>Builder grace crossing</h3><ul>{preview.crossings.map(item => <li key={item.date}>
   {item.date}: {item.committedPlaces} places — {item.immediate ? "track_review_due immediately" : "Within grace"}. No track change.
  </li>)}</ul>
  <h3>Not ready yet</h3><ul>{preview.unavailable.map(item => <li key={item.step}>{item.step}: {item.reason}</li>)}</ul>
 </section>;
}
