"use client";
import React, { useEffect, useRef, useState } from "react";
import type { PaymentScheduleView } from "@jobguard/db";

type StageDraft = { label: string; kind: "percentage" | "fixed"; value: string;
  trigger: "acceptance" | "date" | "task"; date: string; task: string };
const blank = (index: number): StageDraft => ({ label: ["Deposit", "Stage", "Completion"][index] ?? "Stage",
  kind: "percentage", value: ["30", "40", "30"][index] ?? "0", trigger: index ? "date" : "acceptance", date: "", task: "" });
export function V2PaymentSchedule({ jobId }: { jobId: string }) {
  const [view, setView] = useState<PaymentScheduleView | null>(null);
  const [stages, setStages] = useState(() => [blank(0), blank(1), blank(2)]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ fingerprint: string; commandId: string } | null>(null);
  const path = `/api/jobs/${jobId}/payment-schedule`;
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(path, { cache: "no-store" });
        const data = await response.json();
        if (!active) return;
        if (!response.ok) { setError(data.code === "SCHEDULE_ACCEPTANCE_REQUIRED" ? "Accept the quote before setting a payment schedule." : "Payment schedule unavailable. Try again."); return; }
        setView(data); setError("");
      } catch { if (active) setError("Payment schedule unavailable. Try again."); }
    };
    void load();
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, [path]);
  const change = (index: number, patch: Partial<StageDraft>) => setStages(current => current.map((stage, i) => i === index ? { ...stage, ...patch } : stage));
  const save = async () => {
    if (!view) return;
    const fingerprint = JSON.stringify(stages);
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, commandId: crypto.randomUUID() };
    const commandId = pending.current.commandId;
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        version: "payment-schedule-set.v1", commandId, jobId,
        quoteRevisionId: view.quoteRevisionId, expectedVersion: 0,
        stages: stages.map(stage => ({ label: stage.label, split: { kind: stage.kind, value: stage.value },
          trigger: stage.trigger === "acceptance" ? { kind: "acceptance" } : stage.trigger === "date" ?
            { kind: "date", date: stage.date } : { kind: "task", scopeItemId: stage.task.split("/")[0], taskKey: stage.task.split("/")[1] } })),
      }) });
      if (!response.ok) { setError("Could not save. Check the split and triggers, then reload if another person saved it."); return; }
      const reload = await fetch(path, { cache: "no-store" });
      if (!reload.ok) throw new Error("reload");
      setView(await reload.json());
    } catch { setError("Could not load the saved schedule. Reload to check before trying again."); }
    finally { setBusy(false); }
  };
  const confirmTask = async (scopeItemId: string, taskKey: string) => {
    if (!view?.schedule) return;
    const fingerprint = `${scopeItemId}/${taskKey}/${view.schedule.version}`;
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, commandId: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        version: "payment-schedule-task-done.v1", commandId: pending.current.commandId, jobId,
        quoteRevisionId: view.quoteRevisionId, expectedVersion: view.schedule.version, scopeItemId, taskKey,
      }) });
      if (!response.ok) { setError("Could not confirm the task. Reload the schedule and check its current state."); return; }
      const reload = await fetch(path, { cache: "no-store" });
      if (!reload.ok) throw new Error("reload");
      setView(await reload.json());
    } catch { setError("Could not load the saved task confirmation. Reload to check before trying again."); }
    finally { setBusy(false); }
  };
  return <section aria-labelledby="payment-schedule-heading" className="card">
    <h2 id="payment-schedule-heading">Payment schedule</h2>
    <p>Practice sandbox — synthetic data; nothing is sent or charged.</p>
    <p>Plan only. No invoice is drafted or issued. Amounts exclude VAT.</p>
    {error && <p role="alert">{error}</p>}
    {!view && !error && <p>Loading payment schedule…</p>}
    {view && <p>Accepted quote total, before VAT: £{view.acceptedTotal}</p>}
    {view?.schedule ? <>
      <ol>{view.schedule.stages.map((stage, index) => <li key={index}>
        <strong>{stage.label} — £{stage.amount}</strong><p>{stage.status === "due" ? "Due now" : "Planned"} · {
          stage.trigger.kind === "acceptance" ? "On acceptance" : stage.trigger.kind === "date" ? stage.trigger.date : `On task done: ${stage.trigger.taskKey}`}</p>
        {stage.status === "planned" && stage.trigger.kind === "task" && <button type="button" disabled={busy}
          onClick={() => { if (stage.trigger.kind === "task") void confirmTask(stage.trigger.scopeItemId, stage.trigger.taskKey); }}>
          Confirm task done for this schedule
        </button>}
      </li>)}</ol>
      <p>Extras since the schedule was set: £{view.schedule.extrasSinceSchedule}</p>
      <p>Extras outside the stages: £{view.schedule.unscheduledExtras} — for a later invoice or the final account.</p>
      <p>Stages already due stay fixed. Extras are shared across planned stages in proportion to their amounts; the last takes the remainder.</p>
    </> : view && <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <p>Set this schedule once for the accepted quote. The last stage takes the remainder. Percentage-only splits must total 100%.</p>
      {stages.map((stage, index) => <fieldset key={index} style={{ minWidth: 0, marginBottom: 16 }}>
        <legend>Stage {index + 1}</legend>
        <label>Label <input required maxLength={100} value={stage.label} onChange={event => change(index, { label: event.target.value })}/></label>
        <label>Split <select value={stage.kind} onChange={event => change(index, { kind: event.target.value as StageDraft["kind"] })}>
          <option value="percentage">Percentage</option><option value="fixed">Fixed amount (£)</option>
        </select></label>
        <label>Value <input required inputMode="decimal" value={stage.value} onChange={event => change(index, { value: event.target.value })}/></label>
        <label>Due when <select value={stage.trigger} onChange={event => change(index, { trigger: event.target.value as StageDraft["trigger"] })}>
          <option value="acceptance">Quote accepted</option><option value="date">On a date</option><option value="task">Plan task done</option>
        </select></label>
        {stage.trigger === "date" && <label>Date <input required type="date" value={stage.date} onChange={event => change(index, { date: event.target.value })}/></label>}
        {stage.trigger === "task" && <label>Plan task <select required value={stage.task} onChange={event => change(index, { task: event.target.value })}>
          <option value="">Choose a task</option>{view.tasks.map(task => <option key={`${task.scopeItemId}/${task.taskKey}`} value={`${task.scopeItemId}/${task.taskKey}`}>{task.taskKey}</option>)}
        </select></label>}
      </fieldset>)}
      <button type="button" disabled={stages.length >= 20 || busy} onClick={() => setStages(current => [...current, blank(current.length)])}>Add stage</button>{" "}
      <button type="button" disabled={stages.length <= 1 || busy} onClick={() => setStages(current => current.slice(0, -1))}>Remove last stage</button>{" "}
      <button type="submit" disabled={busy}>{busy ? "Saving…" : "Set payment schedule"}</button>
    </form>}
  </section>;
}
