"use client";
import Link from "next/link";
import { Card, Note } from "../(designed)/designed-ui";
import { useEffect, useRef, useState } from "react";
import type { BriefProgress, BriefProgressCommand, BriefTaskStatus, CrewBrief } from "@jobguard/api/workspace";

import { needsNewProofPhoto, progressPhotoLabel, taskStatusLabel } from "./brief-progress-photo";

type View = { briefs: (CrewBrief & { current: boolean })[]; progress: BriefProgress[]; tasks: BriefTaskStatus[] };
const messages: Record<string, string> = {
  BRIEF_PROGRESS_REGENERATE: "This brief needs regenerating",
  BRIEF_PROGRESS_STALE_BRIEF: "This brief has changed. Reload before recording progress.",
  BRIEF_PROGRESS_VERSION_CONFLICT: "Someone recorded progress on this task. Reload before trying again.",
  JOB_WORK_CLOSED: "This job is closed. Reopen it before recording site progress.",
  POST_LOCK_WORK_REQUIRES_LINKED_JOB: "Start a linked job for this customer and site",
  JOB_NOT_LIVE: "Switch this job live to record brief progress.",
};
export function BriefProgressView({ jobId }: { jobId: string }) {
  const [view, setView] = useState<View | null>(null), [error, setError] = useState("");
  const [loads, setLoads] = useState(0);
  const path = `/api/jobs/${encodeURIComponent(jobId)}/brief-progress`;
  useEffect(() => {
    let active = true;
    fetch(path, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Could not load brief progress. Sign in and try again.");
      const result = await response.json() as View;
      if (active) setView(result);
    }).catch(cause => { if (active) setError(String(cause.message)); });
    return () => { active = false; };
  }, [path, loads]);
  return <main style={{ maxWidth: 760, padding: 16, margin: "0 auto", overflowWrap: "anywhere" }}>
    <Link href={`/jobs/${encodeURIComponent(jobId)}/work`}>Back to work</Link>
    <h1>Brief progress</h1>
    <p>Practice sandbox — synthetic data; nothing is sent or charged</p>
    <Note>Record on the trade’s behalf. Done is your observation; it does not verify completion or replace required proof.</Note>
    <p>Notes are for your records. To bill for extra work, use Log an extra. JobGuard checks your records against your final bill after you complete it.</p>
    {error && <p role="alert">{error}</p>}
    {!view && !error && <p>Loading brief progress…</p>}
    {view && !view.briefs.length && <p>No trade briefs yet. Make a brief on the Briefs card first.</p>}
    {view?.briefs.map(brief => <section key={brief.trade} aria-label={`${brief.trade} brief`}>
      <Card title={brief.trade} sub={`Brief revision ${brief.version} · ${brief.content.accessWindow}`}>
      {!brief.current && <p>This brief needs regenerating</p>}
      {brief.content.tasks.map(task => <TaskProgress key={`${task.scopeItemId}:${task.taskKey}`} brief={brief} task={task}
        progress={view.progress.filter(row => row.trade === brief.trade && row.scopeItemId === task.scopeItemId && row.taskKey === task.taskKey)}
        status={view.tasks?.find(item => item.trade === brief.trade && item.scopeItemId === task.scopeItemId && item.taskKey === task.taskKey)?.status}
        path={path} onSaved={row => { setView(current => current && ({ ...current, progress: [...current.progress, row] })); setLoads(count => count + 1); }}/>)}
      {view.progress.filter(row => row.trade === brief.trade && !brief.content.tasks.some(task =>
        task.scopeItemId === row.scopeItemId && task.taskKey === row.taskKey)).map(row =>
        <div key={row.commandId}>Earlier brief revision {row.briefVersion}: {row.kind} · {row.note} · Recorded by you<ProgressPhoto row={row}/></div>)}
    </Card></section>)}
  </main>;
}
function TaskProgress({ brief, task, progress, status, path, onSaved }: {
  brief: CrewBrief & { current: boolean }; task: CrewBrief["content"]["tasks"][number];
  progress: BriefProgress[]; status: BriefTaskStatus["status"] | undefined; path: string; onSaved: (row: BriefProgress) => void;
}) {
  const [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  // Keep the exact command for an uncertain network outcome; retries cannot duplicate a press.
  const [attachPhoto, setAttachPhoto] = useState(false);
  const pending = useRef<BriefProgressCommand | null>(null);
  const revision = Math.max(0, ...progress.map(row => row.version));
  async function record(kind: BriefProgressCommand["kind"], withPhoto = attachPhoto) {
    if (busy) return;
    setBusy(true); setError("");
    const command = pending.current ?? { version: "v2-brief-progress-command.v2" as const, ...(withPhoto && { photoId: crypto.randomUUID() }), commandId: crypto.randomUUID(),
      trade: brief.trade, briefVersion: brief.version, scopeItemId: task.scopeItemId, taskKey: task.taskKey,
      expectedVersion: revision, kind, note };
    pending.current = command;
    try {
      if (command.version === "v2-brief-progress-command.v2" && command.photoId) {
        const upload = await fetch(path, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ version: "v2-brief-progress-photo-command.v1", commandId: command.photoId,
            scopeItemId: command.scopeItemId, fixture: "completion-photo" }) });
        if (!upload.ok) throw new Error("Could not attach the practice photo. Retry the same update.");
      }
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
      const result = await response.json();
      if (!response.ok) {
        pending.current = null;
        throw new Error(messages[result.code] ?? "Could not record progress. Reload and try again.");
      }
      onSaved(result); pending.current = null; setNote(""); setAttachPhoto(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record progress. Retry the same update."); }
    finally { setBusy(false); }
  }
  const disabled = busy || !brief.current || !task.taskKey;
  return <section className="card-body form" aria-label={task.title}>
    <h3>{task.title}</h3><p>{task.scope.description}</p>
    <p>Proof needed: {task.proofNeeded.join(", ") || "See the work plan"}</p>
    {taskStatusLabel(status) && <p role="status" aria-label={`Status: ${task.title}`}><strong>{taskStatusLabel(status)}</strong>
      {needsNewProofPhoto(status) && " · This task stays open until its proof photo is verified."}</p>}
    {!task.taskKey && <p>This brief needs regenerating</p>}
    <label>Reason or what changed<textarea aria-label={`Reason or what changed: ${task.title}`} value={note}
      maxLength={2000} disabled={busy || pending.current !== null} onChange={event => setNote(event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", minHeight: 80 }}/></label>
    <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44 }}><input type="checkbox" checked={attachPhoto} disabled={disabled || pending.current !== null}
      onChange={event => setAttachPhoto(event.target.checked)}/> Attach generated practice photo</label>
    <p>Uses a fictional fixture image. Real camera photos come later.</p>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {(["done", "blocked", "changed"] as const).map(kind => <button key={kind} type="button" className="btn"
        disabled={disabled || (pending.current !== null && pending.current.kind !== kind) || (kind !== "done" && !note.trim())}
        onClick={() => void record(kind)} style={{ minHeight: 44, minWidth: 80 }}>{kind.charAt(0).toUpperCase() + kind.slice(1)}</button>)}
      {needsNewProofPhoto(status) && <button type="button" className="btn" disabled={disabled || (pending.current !== null && pending.current.kind !== "done")}
        onClick={() => void record("done", true)} style={{ minHeight: 44 }}>Done with a new photo</button>}
    </div>
    {busy && <p role="status">Recording…</p>}{error && <p role="alert">{error}</p>}
    <ul>{progress.map(row => <li key={row.commandId}>{row.kind.charAt(0).toUpperCase() + row.kind.slice(1)}{row.note ? `: ${row.note}` : ""}
      {` · Recorded by you · Brief revision ${row.briefVersion} · ${new Date(row.recordedAt).toLocaleString("en-GB")}`}<ProgressPhoto row={row}/></li>)}</ul>
  </section>;
}

function ProgressPhoto({ row }: { row: BriefProgress }) {
  if (!row.photoReference) return null;
  return <figure style={{ margin: "8px 0" }}>
    {row.thumbnail && <img src={row.thumbnail} width={80} height={80} alt="Generated practice progress photo"/>}
    <figcaption>{progressPhotoLabel(row)}</figcaption>
  </figure>;
}
