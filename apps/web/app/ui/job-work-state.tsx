"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LINKED_JOB_COPY, jobWorkStateCommandV1, jobWorkStateReadV1, type JobWorkStateEvent } from "@jobguard/core";
import { closeReasonLabels, workEventLabels, workStateView, type CloseReason } from "./job-work-state-view";
import styles from "./practice-receipts.module.css";

type View = ReturnType<typeof workStateView>;
const when = (value: string) => new Date(value).toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });

/** Work-state controls over the persisted CH-4 commands. The server picks actor, tenant and time. */
export function JobWorkState({ jobId }: { jobId: string }) {
 const [view, setView] = useState<View | null>(null), [busy, setBusy] = useState(true), [error, setError] = useState(""), [offer, setOffer] = useState(false);
 const [reason, setReason] = useState<CloseReason>("cancelled_by_customer"), [note, setNote] = useState("");
 const currentJob = useRef(jobId), inFlight = useRef(false), epoch = useRef(0), pending = useRef<Record<string, unknown> | null>(null);
 currentJob.current = jobId;
 const current = (requestEpoch: number) => currentJob.current === jobId && epoch.current === requestEpoch;
 const read = useCallback(async () => {
  const requestEpoch = ++epoch.current; inFlight.current = true; setBusy(true);
  try {
   const response = await fetch(`/api/jobs/${jobId}/work-state`, { cache: "no-store" });
   if (!response.ok) throw new Error("Site work could not load. Try loading it again.");
   const saved = jobWorkStateReadV1.parse(await response.json());
   if (saved.jobId !== jobId) throw new Error("Unexpected job response.");
   if (current(requestEpoch)) setView(workStateView(saved));
  } catch (e) { if (current(requestEpoch)) setError(e instanceof Error ? e.message : "Site work could not load."); }
  finally { if (epoch.current === requestEpoch) { inFlight.current = false; setBusy(false); } }
 }, [jobId]);
 useEffect(() => { pending.current = null; setView(null); setError(""); setOffer(false); void read(); return () => { epoch.current++; }; }, [read]);
 // A retry after an unknown outcome resends the exact pending command, never a new identity.
 const send = async (command: Record<string, unknown>) => {
  if (inFlight.current) return;
  const requestEpoch = ++epoch.current; inFlight.current = true; pending.current = command; setBusy(true); setError("");
  try {
   const response = await fetch(`/api/jobs/${jobId}/work-state`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
   if (response.status >= 400 && response.status < 500) {
    const body = await response.json().catch(() => ({})) as { code?: string };
    if (!current(requestEpoch)) return;
    pending.current = null;
    if (body.code === "POST_LOCK_WORK_REQUIRES_LINKED_JOB") setOffer(true);
    else if (body.code === "METER_PROJECTION_MISMATCH") setError("The jobs-on-the-go meter could not be verified. Nothing was changed.");
    else if (body.code === "METER_UPGRADE_REQUIRED") setError("Your Solo plan and grace place are full. Move to Builder before starting this site work.");
    else if (body.code === "CAPACITY_ADMISSION_UNAVAILABLE") setError("Resuming site work waits for the jobs-on-the-go meter. Nothing was changed.");
    else if (response.status === 409) setError("This job changed or the action is not available now. The saved state has been reloaded; check it before trying again.");
    else setError("The action was refused. Nothing was changed.");
    inFlight.current = false; await read(); return;
   }
   if (!response.ok) throw new Error("Unknown outcome");
   const saved = jobWorkStateReadV1.parse(await response.json());
   if (saved.jobId !== jobId) throw new Error("Unexpected job response");
   if (current(requestEpoch)) { pending.current = null; setNote(""); setView(workStateView(saved)); }
  } catch { if (current(requestEpoch)) setError("The result is unknown. Retry the same action, or load the saved state first."); }
  finally { if (epoch.current === requestEpoch) { inFlight.current = false; setBusy(false); } }
 };
 const act = (action: "finish" | "cancel_finish" | "close" | "reopen", extra: Record<string, unknown> = {}) => {
  if (!view) return;
  void send(jobWorkStateCommandV1.parse({ version: "job-work-state-command.v1", commandId: crypto.randomUUID(), expectedRevision: view.revision, action, ...extra }));
 };
 const closed = view?.closedEventId != null, noteMissing = note.trim() === "";
 return <section id="site-work" className={styles.panel} aria-labelledby="site-work-title" aria-busy={busy} data-testid="job-work-state">
  <h2 id="site-work-title">Site work</h2>
  {error && <p role="alert">{error}</p>}
  {(offer || view?.locked) && <p role="status" data-testid="linked-job-offer"><strong>{LINKED_JOB_COPY}</strong>. This job's final account is locked, so new site work belongs on a new job. <a href="/">Start a new job</a></p>}
  {view && <>
   <p>State: <strong data-testid="work-state">{closed ? "Closed" : view.finishedMarkerId ? "Finished on site" : "Work under way"}</strong> · revision <span data-testid="work-state-revision">{view.revision}</span></p>
   <div className={styles.actions}>
    {!closed && !view.finishedMarkerId && <button type="button" disabled={busy} onClick={() => act("finish")}>Finished on site</button>}
    {!closed && view.finishedMarkerId && <button type="button" disabled={busy} onClick={() => act("cancel_finish", { markerId: view.finishedMarkerId })}>Cancel finished on site</button>}
    {closed && <button type="button" disabled={busy || !view.locked} onClick={() => act("reopen", { closeEventId: view.closedEventId })}>Reopen job</button>}
    <button type="button" disabled>Resume site work</button>
   </div>
   <p>Resume site work is not available yet: it waits for the jobs-on-the-go meter.{closed && !view.locked ? " Reopening a closed job waits for it too." : ""}</p>
   {!closed && <fieldset className={styles.actions}>
    <legend>Close job</legend>
    <div className={styles.field}><label htmlFor="close-reason">Reason</label><select id="close-reason" value={reason} disabled={busy} onChange={e => setReason(e.target.value as CloseReason)}>{(Object.keys(closeReasonLabels) as CloseReason[]).map(key => <option key={key} value={key}>{closeReasonLabels[key]}</option>)}</select></div>
    <div className={styles.field}><label htmlFor="close-note">Note (required)</label><textarea id="close-note" value={note} maxLength={2000} disabled={busy} onChange={e => setNote(e.target.value)}/></div>
    <button type="button" disabled={busy || noteMissing} onClick={() => act("close", { reason, note: note.trim() })}>Close job</button>
   </fieldset>}
   <ol data-testid="work-state-history">{view.events.map((event: JobWorkStateEvent) => <li key={event.id} data-testid="work-state-event" data-event-id={event.id} data-kind={event.kind}>
    {workEventLabels[event.kind]} · {when(event.factAt)}{event.closeReason && <> · {closeReasonLabels[event.closeReason]}: {event.closeNote}</>}
   </li>)}</ol>
   {view.events.length === 0 && <p>No site work recorded yet.</p>}
  </>}
  <div className={styles.actions}>
   <button type="button" disabled={busy} onClick={() => { pending.current = null; setError(""); void read(); }}>Load saved site work</button>
   {pending.current && !busy && <button type="button" onClick={() => void send(pending.current!)}>Retry the same action</button>}
  </div>
 </section>;
}
