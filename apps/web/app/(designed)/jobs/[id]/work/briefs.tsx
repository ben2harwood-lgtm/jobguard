"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CrewBrief, CrewBriefCommand } from "./brief-types";
import { Card, Empty, Note, Tag } from "../../../designed-ui";
import { JOB_SAVED_EVENT } from "../../../../ui/job-page-fetch";
import { PLAN_SAVED_EVENT } from "./work-plan";

type Brief = CrewBrief & { current?: boolean };
type View = { trades: string[]; briefs: Brief[]; code?: "QUOTE_REVISION_NOT_FOUND" };
async function read<T>(path: string, command?: CrewBriefCommand): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...(command ? {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command),
  } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.code);
  return data;
}

function TradeBrief({ path, trade, brief, planned, saved }: {
  path: string; trade: string; brief: Brief | undefined; planned: boolean; saved: (brief: Brief) => void;
}) {
  const [accessWindow, setAccessWindow] = useState(brief?.content.accessWindow ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [stale, setStale] = useState(false);
  const inFlight = useRef(false);
  // Same payload after an uncertain response keeps its replay identity, like the plan editor.
  const editReplay = useRef<{ payload: string; command: CrewBriefCommand } | null>(null);
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setProblem(""); setNotice("");
    const input = { version: "v2-crew-brief-command.v1" as const, trade, expectedVersion: brief?.version ?? 0,
      accessWindow: accessWindow.trim(), photoIds: brief?.content.photos.map(photo => photo.evidenceId) ?? [] };
    const payload = JSON.stringify(input);
    if (editReplay.current?.payload !== payload) editReplay.current = { payload,
      command: { ...input, commandId: crypto.randomUUID() } };
    try {
      const result = await read<Brief>(path, editReplay.current.command);
      editReplay.current = null; saved(result);
      setNotice(brief?.version === result.version ? "Brief unchanged. Nothing was sent." : "Brief saved. Nothing was sent.");
    } catch (error) {
      const conflict = error instanceof Error && /CREW_BRIEF_(VERSION|COMMAND)_CONFLICT/u.test(error.message);
      setStale(conflict);
      setProblem(conflict ? "The brief changed since you opened it. Reload before making another version."
        : "Could not confirm the save. Try the same action again.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function download() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setProblem("");
    try {
      const response = await fetch(`${path}?${new URLSearchParams({ trade, export: "internal" })}`, { cache: "no-store" });
      if (!response.ok) throw new Error("EXPORT_UNAVAILABLE");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = "crew-brief-internal.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setProblem("The internal copy could not download. Try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const content = brief?.content;
  return <article aria-label={`${trade} brief`} className="card">
    <div className="card-head"><h3>{trade}</h3><Tag>{brief ? `Version ${brief.version}` : "No brief yet"}</Tag></div>
    {!planned && <p className="card-body">No longer in the plan</p>}
    {brief?.current === false && planned && <div className="card-body"><Note tone="warning">Out of date · The plan changed. Make a new version before using this brief.</Note></div>}
    {content && <div className="card-body form">
      <p><strong>Access</strong> · {content.accessWindow}</p>
      <ol>{content.tasks.map(task => <li key={`${task.scopeItemId}/${task.taskKey}`}>
        <h4>{task.title}</h4>
        <p><strong>What to do</strong> · {task.scope.description}
          {task.scope.quantity !== null && ` · ${task.scope.quantity} ${task.scope.unit ?? ""}`}</p>
        <p><strong>Duration</strong> · {task.durationMinutes} minutes</p>
        <p><strong>When</strong> · {task.visit ?? "To be agreed"}{task.owner && ` · ${task.owner}`}</p>
        <p><strong>Proof needed</strong> · {task.proofNeeded.join("; ") || "None recorded"}</p>
      </li>)}</ol>
      <p>Photos: {content.photos.length} attached</p>
      <p><strong>Proof needed</strong> · {content.proofNeeded.join("; ") || "None recorded"}</p>
    </div>}
    <div className="card-body form">
      {planned && <form className="form" onSubmit={event => void generate(event)}>
        <label>Access window<input required maxLength={200} value={accessWindow} disabled={busy || stale}
          onChange={event => setAccessWindow(event.target.value)}/></label>
        <div><button type="submit" className="btn primary" disabled={busy || stale || !accessWindow.trim()}>
          {busy ? "Working…" : brief ? "Make a new version" : "Make brief"}</button></div>
      </form>}
      {brief && <div><button type="button" className="btn" disabled={busy} onClick={() => void download()}>Internal copy</button></div>}
      {notice && <p role="status">{notice}</p>}
      {problem && <div role="alert"><Note tone="warning">{problem}</Note></div>}
      {stale && <div><button type="button" className="btn" onClick={() => window.location.reload()}>Reload briefs</button></div>}
    </div>
  </article>;
}

export function Briefs({ jobId }: { jobId: string }) {
  const path = `/api/v2-backend/jobs/${encodeURIComponent(jobId)}/crew-briefs`;
  const [view, setView] = useState<View>();
  const [problem, setProblem] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setView(undefined); setProblem(false);
    read<View>(path).then(data => { if (current) setView(data); }).catch(() => { if (current) setProblem(true); });
    return () => { current = false; };
  }, [path, reload]);
  // A plan edit, quote save or lifecycle change on this page can add, drop or outdate a trade's brief.
  // Reread in place, keeping the cards (and any half-filled form) mounted.
  useEffect(() => {
    let current = true;
    const changed = (event: Event) => {
      const detail: unknown = (event as CustomEvent).detail;
      const id = typeof detail === "string" ? detail : (detail as { jobId?: unknown } | null)?.jobId;
      if (id !== jobId) return;
      read<View>(path).then(data => { if (current) { setView(data); setProblem(false); } }).catch(() => { if (current) setProblem(true); });
    };
    const names = [PLAN_SAVED_EVENT, JOB_SAVED_EVENT, "job-lifecycle-changed"];
    names.forEach(name => window.addEventListener(name, changed));
    return () => { current = false; names.forEach(name => window.removeEventListener(name, changed)); };
  }, [jobId, path]);
  const trades = [...new Set([...(view?.trades ?? []), ...(view?.briefs.map(brief => brief.trade) ?? [])])];
  return <section aria-label="Crew briefs" id="work-briefs">
    <Card title="Briefs" sub="One brief per trade" action={<Tag tone="blue">Internal · Unsent</Tag>}>
      {problem ? <div className="card-body" role="alert"><Note tone="warning"><strong>Briefs could not open.</strong> The job is unchanged.</Note>
        <button type="button" className="btn" onClick={() => setReload(value => value + 1)}>Try again</button></div>
        : !view ? <p className="card-body" role="status">Loading briefs…</p>
        : !trades.length ? <Empty title="No briefs yet" text={view.code === "QUOTE_REVISION_NOT_FOUND"
          ? "Accept a quote to plan the work first" : "Assign a planned task to a trade first."}/>
        : <div className="card-body form">{trades.map(trade => <TradeBrief key={`${jobId}/${trade}`} path={path} trade={trade}
          planned={view.trades.includes(trade)} brief={view.briefs.find(brief => brief.trade === trade)}
          saved={brief => setView(previous => previous && { ...previous,
            briefs: [...previous.briefs.filter(row => row.trade !== trade), brief] })}/>)}</div>}
    </Card>
  </section>;
}
