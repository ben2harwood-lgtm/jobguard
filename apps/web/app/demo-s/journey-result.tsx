"use client";
import { useRef, useState } from "react";
import { recoverShadowCapture, readShadowResults } from "./journey-launch";
import { ShadowSavedReport } from "./shadow-30000/journey";
import type { ShadowReport } from "./shadow-30000/journey-model";
export function JourneyResult({ runId, tenantId, archived, disabled, onBusyChange }: { runId: string; tenantId: string; archived: boolean; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const [report, setReport] = useState<ShadowReport | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const active = useRef(false);
  async function recover(launch: boolean) {
    if (active.current || disabled || archived) return;
    active.current = true; setBusy(true); onBusyChange(true); setError(""); setReport(null);
    try {
      const jobId = await recoverShadowCapture(runId);
      if (launch) {
        // The chooser's URL remains in browser history for returning to its report.
        location.assign(`/demo-s/shadow-30000?${new URLSearchParams({ jobId, runId, tenantId })}`);
      } else setReport(await readShadowResults(jobId));
    } catch (reason) { setError((reason as Error).message); }
    finally { active.current = false; setBusy(false); onBusyChange(false); }
  }
  return <section aria-label="Journey results"><h3>Final Check journey</h3>
    <p>The guide, final-account lock and practice customer approval are available. Read saved results for actual progress; full end-to-end completion is not ready yet.</p>
    <p>Launch or resume reuses this selection’s saved capture. Reset selection starts a fresh fictional job.</p>
    <button disabled={disabled || busy || archived} onClick={() => void recover(true)}>Launch or resume shadow-30000</button>
    <button disabled={disabled || busy || archived} onClick={() => void recover(false)}>Create or resume and read saved results</button>
    {archived && <p>This selection is archived. Its business records are preserved; open the replacement selection to continue.</p>}
    {error && <p role="alert">{error}</p>}
    {report && <><p>Current persisted journey results, read from the saved job. These are separate from the selection snapshot.</p><ShadowSavedReport report={report} /></>}
  </section>;
}
