import React from "react";
import { evaluateExposureCurve, type ExposureScheduleV1 } from "@jobguard/core";

export function ExposureCurvePreview({ schedule }: { schedule: ExposureScheduleV1 }) {
  const curve = evaluateExposureCurve(schedule);
  const pounds = (pence: number) => `£${Math.floor(pence / 100).toLocaleString("en-GB")}.${String(pence % 100).padStart(2, "0")}`;
  const maximum = Math.max(1, ...curve.points.map(point => point.atRisk?.pence ?? 0));
  const x = (i: number) => 20 + i * 560 / Math.max(1, curve.points.length - 1);
  const y = (pence: number) => 130 - pence / maximum * 110;
  return <section aria-label="Stage exposure curve" data-testid="exposure-curve">
    <h3>Money at risk by stage</h3>
    <p>Saved fictional forecasts for this practice job. Reference net exposure is cumulative work value less cumulative receipts, floored at zero. These are made-up forecasts, not settled cash or a guarantee.</p>
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
      <caption>Saved practice stage schedule · GBP net · advisory prevention check</caption>
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

