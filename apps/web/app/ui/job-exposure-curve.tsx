"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { exposureScheduleCommandV1, exposureScheduleViewV1, parsePoundsToPence, type ExposureScheduleV1 } from "@jobguard/core";
import { ExposureCurvePreview } from "./exposure-curve-preview";

type Draft = { id: string; label: string; date: string; work: string; receipts: string };
const blank = (id: string): Draft => ({ id, label: "", date: "", work: "", receipts: "" });
const poundsToPence = (value: string) => { try { return parsePoundsToPence(value); } catch { return null; } };
const decimal = (pence: number | undefined) => pence === undefined ? "" : `${Math.floor(pence / 100)}.${String(pence % 100).padStart(2, "0")}`;

/** Mounted only after an authenticated practice prevention response for this exact job. */
export function JobExposureCurve({ jobId }: { jobId: string }) {
  const [schedule, setSchedule] = useState<ExposureScheduleV1 | null>(null), [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Draft[]>([blank("stage-1")]), [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [unknown, setUnknown] = useState(false);
  const epoch = useRef(0), currentJob = useRef(jobId), inFlight = useRef(false);
  currentJob.current = jobId;
  const accept = useCallback((raw: unknown) => {
    const saved = exposureScheduleViewV1.parse(raw);
    if (saved.jobId !== jobId) throw new Error("Unexpected job");
    setSchedule(saved.schedule); setRevision(saved.revision);
    setRows(saved.schedule?.stages.map(stage => ({ id: stage.id, label: stage.label, date: stage.date,
      work: decimal(stage.cumulativeWorkValue?.pence), receipts: decimal(stage.cumulativeReceipts?.pence) })) ?? [blank("stage-1")]);
  }, [jobId]);
  const load = useCallback(async () => {
    const requestEpoch = ++epoch.current; setBusy(true); setSchedule(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}/exposure-schedule`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unavailable");
      const raw: unknown = await response.json();
      if (currentJob.current === jobId && epoch.current === requestEpoch) { accept(raw); setError(""); setUnknown(false); }
    } catch { if (currentJob.current === jobId && epoch.current === requestEpoch) { setUnknown(true); setError("Stage schedule unknown. Load the saved schedule to try again."); } }
    finally { if (epoch.current === requestEpoch) setBusy(false); }
  }, [jobId, accept]);
  useEffect(() => { void load(); return () => { epoch.current++; }; }, [load]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (inFlight.current || busy || unknown) return;
    const stages = rows.map(row => ({ id: row.id, label: row.label, date: row.date,
      cumulativeWorkValue: row.work.trim() === "" ? null : { pence: poundsToPence(row.work), currency: "GBP" },
      cumulativeReceipts: row.receipts.trim() === "" ? null : { pence: poundsToPence(row.receipts), currency: "GBP" } }));
    const parsed = exposureScheduleCommandV1.safeParse({ version: "exposure-schedule-command.v1", commandId: crypto.randomUUID(), expectedRevision: revision, stages });
    if (!parsed.success) { setError("Give each stage a name and an increasing date. Enter valid non-negative pounds or leave an unknown amount blank."); return; }
    const requestEpoch = ++epoch.current; inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/exposure-schedule`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed.data) });
      if (!response.ok) throw new Error("Unavailable");
      const raw: unknown = await response.json();
      if (currentJob.current === jobId && epoch.current === requestEpoch) accept(raw);
    } catch { if (currentJob.current === jobId && epoch.current === requestEpoch) { setSchedule(null); setUnknown(true); setError("The saved outcome is unknown. Load the saved schedule before editing again."); } }
    finally { inFlight.current = false; if (epoch.current === requestEpoch) setBusy(false); }
  }
  function update(index: number, field: keyof Draft, value: string) { setRows(all => all.map((row, i) => i === index ? { ...row, [field]: value } : row)); }
  return <section aria-label="Practice stage schedule" aria-busy={busy} data-testid="job-exposure-schedule">
    <h3>This job&apos;s stage schedule</h3>
    <p>Enter fictional net work and receipt forecasts for this practice job only. These are cumulative forecasts, not payments or invoices. Leave unavailable amounts blank.</p>
    <button type="button" disabled={busy} onClick={() => void load()}>Load saved stage schedule</button>
    {error && <p role="alert">{error}</p>}
    <form onSubmit={event => void save(event)}>
      <fieldset disabled={busy || unknown} style={{ minWidth: 0 }}><legend>Fictional stage forecasts</legend>
        {rows.map((row, i) => <div key={row.id}>
          <label>Stage {i + 1} name<input aria-label={`Stage ${i + 1} name`} maxLength={100} value={row.label} onChange={e => update(i, "label", e.target.value)}/></label>
          <label>Stage {i + 1} date<input aria-label={`Stage ${i + 1} date`} type="date" value={row.date} onChange={e => update(i, "date", e.target.value)}/></label>
          <label>Stage {i + 1} cumulative work (£ net)<input aria-label={`Stage ${i + 1} cumulative work (£ net)`} inputMode="decimal" value={row.work} onChange={e => update(i, "work", e.target.value)}/></label>
          <label>Stage {i + 1} cumulative receipts (£ net)<input aria-label={`Stage ${i + 1} cumulative receipts (£ net)`} inputMode="decimal" value={row.receipts} onChange={e => update(i, "receipts", e.target.value)}/></label>
        </div>)}
        <button type="button" disabled={rows.length >= 1000} onClick={() => setRows(all => [...all, blank(crypto.randomUUID())])}>Add forecast stage</button>
        <button type="submit">Save practice stage schedule</button>
      </fieldset>
    </form>
    {schedule ? <ExposureCurvePreview schedule={schedule}/> : <p data-testid="exposure-unknown">Money at risk: unknown — no saved stage schedule available.</p>}
  </section>;
}
