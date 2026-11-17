"use client";
import { useRef, useState } from "react";
import { recoverCapture } from "../journey-launch";
import { core1000Link, core1000Source, readCore1000Report, type Core1000Report } from "./journey-model";

export function Core1000Result({ runId, tenantId, archived, disabled, onBusyChange }: { runId: string; tenantId: string; archived: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [report, setReport] = useState<Core1000Report | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const active = useRef(false);
  async function recover(launch: boolean) {
    if (active.current || disabled || archived) return;
    active.current = true; setBusy(true); onBusyChange(true); setError(""); setReport(null);
    try {
      const jobId = await recoverCapture(runId, core1000Source);
      if (launch) location.assign(`${core1000Link(jobId)}&${new URLSearchParams({ runId, tenantId })}`);
      else setReport(await readCore1000Report(jobId));
    } catch (reason) { setError((reason as Error).message); }
    finally { active.current = false; setBusy(false); onBusyChange(false); }
  }
  return <section aria-label="Core-1000 results"><h3>Core £1,000 journey</h3>
    <p>Launch or resume reuses this selection’s saved capture. Reset selection starts a fresh fictional job.</p>
    <button disabled={disabled || busy || archived} onClick={() => void recover(true)}>Launch or resume core-1000</button>
    <button disabled={disabled || busy || archived} onClick={() => void recover(false)}>Read saved core-1000 results</button>
    {archived && <p>This selection is archived. Its business records are preserved; open the replacement selection to continue.</p>}
    {error && <p role="alert">{error}</p>}
    {report && <section aria-label="Saved core-1000 report"><p data-testid="core-1000-status">{report.complete ? "Every step has saved records." : "In progress: read each step below."}</p>
      <p>Current saved records for this fictional job; nothing here is a passed gate or real money.</p>
      <ul>{report.rows.map(row => <li key={row.id} data-testid={`core-1000-row-${row.id}`}>
        <a href={row.href}>{row.screen}</a>: {row.done ? "" : "Not done yet — "}{row.state}{row.record && <> · saved record {row.record}</>}
      </li>)}</ul></section>}
  </section>;
}
